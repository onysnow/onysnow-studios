# One simulated break of a glass pane (broken glass B0, docs/broken-glass-system.md §3.1).
#
# Peridynamics.jl (MIT), ordinary state-based model, so glass's Poisson ratio (0.22)
# is honoured. The points are jittered (a regular grid breaks in kaleidoscope
# patterns) and each point's strength is drawn from a Weibull distribution, as real
# glass's strength is set by random flaws. A dense steel sphere carrying the
# impactor's whole mass strikes the pane.
#
# The default is the NIJ 241445 Series A test, so the result can be checked against
# the 60 panes measured there: a 203 x 203 x 3.2 mm pane lying on foam (free during
# the event) hit by a 965 g drop weight with a round tip at 4.9 m/s (a 4 ft drop).
#
# Usage (from this folder):
#   julia -t 2 --project=. break.jl name=nij-round-4ft speed=4.9 seed=1
# Every setting below can be given as key=value. Results go to out/<name>/.

using Peridynamics, Random, Printf

const DEFAULTS = Dict{String,Any}(
    "name" => "nij-round-4ft",
    # pane, m
    "lx" => 0.2032, "ly" => 0.2032, "t" => 0.0032, "dx" => 0.0008, "jitter" => 0.15,
    # soda-lime glass
    "E" => 72e9, "nu" => 0.22, "rho" => 2500.0,
    "Gc" => 8.0,            # J/m^2, from K_IC 0.75 MPa sqrt(m)
    "weibull_m" => 8.0,     # spread of point strengths (glass: 5-15)
    "classes" => 8,         # strength classes the Weibull spread is binned into
    # support: "free" (on foam, as NIJ Series A) or "frame": the outer frame_w held
    # in z (a glazing rebate), and the glass under and just inside the bead
    # (gasket_w) unbreakable, standing in for the rubber gasket that spreads the
    # clamp's load (a hard clamp on breakable glass cracks along its own line)
    "support" => "free", "frame_w" => 0.0127, "gasket_w" => 0.006,
    # impactor: a sphere carrying the whole mass
    "hammer_r" => 0.006, "hammer_mass" => 0.965, "speed" => 4.9,
    "hit_x" => 0.007, "hit_y" => -0.004,
    # "sphere": the impactor as a body in contact; "pulse": its contact force as a
    # Hertz-shaped pressure on the struck face, a half sine in time
    "impactor" => "sphere", "pulse_peak" => 5000.0, "pulse_time" => 150e-6, "pulse_r" => 0.0015,
    # contact: the penalty (Peridynamics.jl's default, 1e12, is ten times too soft
    # for a kilogram at 5 m/s: the impactor ploughed through the pane unslowed)
    "penalty" => 1e14,
    # time, s
    "time" => 450e-6, "freq" => 96,
    "seed" => 1,
)

function settings(args)
    s = copy(DEFAULTS)
    for a in args
        k, v = split(a, "="; limit=2)
        haskey(s, k) || error("unknown setting $k")
        d = s[k]
        s[k] = d isa String ? String(v) : d isa Int ? parse(Int, v) : parse(Float64, v)
    end
    return s
end

# Weibull quantiles at the middle of K equal-probability bins, scaled to mean 1.
function weibull_classes(m, K)
    q = [(-log(1 - (k - 0.5) / K))^(1 / m) for k in 1:K]
    return q ./ (sum(q) / K)
end

function main(args)
    s = settings(args)
    Random.seed!(s["seed"])
    dx = s["dx"]
    root = joinpath(@__DIR__, "out", s["name"])
    mkpath(root)

    # The pane, centred on the origin; the struck face is z = +t/2.
    pos, vol = uniform_box(s["lx"], s["ly"], s["t"], dx)
    pos .+= (rand(size(pos)...) .- 0.5) .* (2 * s["jitter"] * dx)
    pane = Body(OSBMaterial(), pos, vol)
    δ = 3.015dx
    base = (horizon=δ, rho=s["rho"], E=s["E"], nu=s["nu"])
    material!(pane; base..., Gc=s["Gc"])

    # Strength from random flaws: point strength w ~ Weibull(m), and strength goes as
    # sqrt(Gc), so each class gets Gc * w^2.
    w = weibull_classes(s["weibull_m"], s["classes"])
    cls = rand(1:s["classes"], size(pos, 2))
    for k in 1:s["classes"]
        set = Symbol("w$k")
        point_set!(pane, set, findall(==(k), cls))
        material!(pane, set; base..., Gc=s["Gc"] * w[k]^2)
    end

    if s["support"] == "frame"
        hx = s["lx"] / 2 - s["frame_w"]
        hy = s["ly"] / 2 - s["frame_w"]
        point_set!(p -> abs(p[1]) > hx || abs(p[2]) > hy, pane, :frame)
        velocity_bc!(t -> 0.0, pane, :frame, :z)
        gx = hx - s["gasket_w"]
        gy = hy - s["gasket_w"]
        point_set!(p -> abs(p[1]) > gx || abs(p[2]) > gy, pane, :gasket)
        no_failure!(pane, :gasket)
    end

    if s["impactor"] == "pulse"
        # The blow as the force the impactor's tip puts on the struck face: a
        # Hertz pressure, p(r) ~ sqrt(1 - r^2/a^2), over the contact circle on the
        # top layer of points, rising and falling as a half sine over pulse_time.
        a = s["pulse_r"]
        hx, hy = s["hit_x"], s["hit_y"]
        top = maximum(pos[3, :])
        point_set!(p -> (p[1] - hx)^2 + (p[2] - hy)^2 < a^2 && p[3] > top - 0.6dx, pane, :tip)
        idx = pane.point_sets[:tip]
        # Force density b over the set: total F = sum b V; the Hertz profile's mean is 2/3 of its peak.
        bpeak = s["pulse_peak"] / (sum(vol[idx]) * 2 / 3)
        τ = s["pulse_time"]
        forcedensity_bc!((p, t) -> t < τ ? -bpeak * sin(pi * t / τ) *
                         sqrt(max(1 - ((p[1] - hx)^2 + (p[2] - hy)^2) / a^2, 0.0)) : 0.0,
                         pane, :tip, :z)
        vv = VelocityVerlet(time=s["time"])
        job = Job(pane, vv; path=root, freq=s["freq"], fields=(:displacement, :damage))
        bpos = zeros(3, 0)
    else
        # The impactor: a steel sphere carrying the whole mass, arriving: its lowest
        # points just inside contact range of the struck face's points (no idle approach).
        r = s["hammer_r"]
        bpos, bvol = uniform_sphere(2r, dx)
        bpos[1, :] .+= s["hit_x"]
        bpos[2, :] .+= s["hit_y"]
        top = maximum(pos[3, :])
        bpos[3, :] .+= top + 0.9dx - minimum(bpos[3, :])
        hammer = Body(BBMaterial(), bpos, bvol)
        rho_h = s["hammer_mass"] / (4 / 3 * pi * r^3)
        material!(hammer; horizon=δ, rho=rho_h, E=200e9)   # no Gc: it does not break
        velocity_ic!(hammer, :all_points, :z, -s["speed"])

        ms = MultibodySetup(:pane => pane, :hammer => hammer)
        contact!(ms, :pane, :hammer; radius=dx, penalty_factor=s["penalty"])
        vv = VelocityVerlet(time=s["time"])
        fields = Dict(:pane => (:displacement, :damage), :hammer => (:displacement,))
        job = Job(ms, vv; path=root, freq=s["freq"], fields=fields)
    end

    open(joinpath(root, "settings.txt"), "w") do io
        for k in sort(collect(keys(s)))
            println(io, k, "=", s[k])
        end
        @printf(io, "points_pane=%d\npoints_hammer=%d\nweibull_w=%s\n",
                size(pos, 2), size(bpos, 2), join(round.(w; digits=4), ","))
    end
    wall = @elapsed submit(job)
    open(joinpath(root, "settings.txt"), "a") do io
        @printf(io, "wall_s=%.1f\n", wall)
    end
    @printf("done %s: %d pane points, %.1f s\n", s["name"], size(pos, 2), wall)
end

main(ARGS)
