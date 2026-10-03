# Fracture simulation (broken glass, offline)

The offline half of the broken-glass system (`docs/broken-glass-system.md` §3.1–3.3):
real breaks are simulated here with physics, measured the same way real broken
panes were measured, and only then turned into the library the site plays back.
Nothing in this folder runs in the browser.

## Tools

| File | What it does |
|---|---|
| `break.jl` | One break: a pane struck by an impactor, simulated with [Peridynamics.jl](https://github.com/kaipartmann/Peridynamics.jl) (MIT), ordinary state-based model (glass's Poisson ratio 0.22), jittered points, Weibull-distributed point strength. Every setting is a `key=value` argument; the default is the NIJ 241445 Series A test. |
| `export.jl` | Compacts a run's exports into `points.f32` (reference position, final damage, the time each point cracked, final displacement). |
| `break.jl prestress=<m> impactor=none` | The pane starts bent, as a pane pressed slowly to failure is (the stored bending energy, Kirchhoff in-plane strain and all), and cracks on that energy; with `impactor=pulse` a sustained ram force on top. The NIJ pressed-in-frame density needs the load kept on while the cracks run: a long pulse (ms) over a pre-stressed pane. |
| `analyze.py` | Crack lines on the struck face, the back face and through the thickness; tracings; how the cracks grew; and the statistics: cracks crossed on circles round the impact, pieces, T- and Y-junctions, corners per piece, ring share, and the fragment-size law (Kadono & Arakawa: piece area as a power of the distance from the impact; the NIJ pressed-in-frame panes give an exponent of about 3.7, range 1.4-4.8). `nij` runs the same measurements on the 60 hand traced NIJ panes. |
| `nij-stats.json` | Those measurements for the six NIJ test series (numbers only; the tracings themselves are third-party and are not in the repo). |
| `Project.toml`, `Manifest.toml` | The Julia environment, pinned. |

## Running

```
cd tools/fracture-sim
julia -t 2 --project=. -e 'using Pkg; Pkg.instantiate()'     # once
julia -t 2 --project=. break.jl name=nij-round-4ft speed=4.9 seed=1
julia --project=. export.jl nij-round-4ft
python3 analyze.py sim nij-round-4ft                           # numpy, scipy, scikit-image, Pillow
python3 analyze.py nij <folder of NIJ tracings p-000.png ... p-059.png>
python3 analyze.py sheet nij-round-4ft <same folder> sheet.jpg
```

Results go to `out/<name>/` (ignored by git: a run's exports are hundreds of
megabytes). `stats.json`, `tracing.png`, `tracing-hi.png`, `faces.png` (struck
face red, back face blue, both black), `arrival.png` (early cracks yellow, late
purple) and `growth.png` are the files to look at.

## What the measurements mean

- **Crossings**: how many cracks a circle round the impact crosses at 10, 20, 30,
  50 and 70 mm, the radial count used in the NIJ study.
- **Pieces**: regions closed off by cracks and the pane's edge, counted from
  1.5 mm² up, with their areas, the largest one's share of the pane, and their
  elongation (principal axes).
- **Junctions**: where three cracks meet. A **T** is a crack that stopped
  against another (one angle near 180°); a **Y** is three at about 120°. Real
  crack networks are mostly T; Voronoi-cell patterns (what the game tools make)
  are all Y.
- **Corners per piece**: the angles under 160° round each piece. Real crack
  mosaics average about 4, Voronoi cells 6 (Domokos et al. 2020).
- **Ring share**: the share of crack ink running round the impact rather than
  away from it, by distance.

The NIJ panes, measured with exactly this code (median and range of 10 panes
per series), are in `nij-stats.json`.

## Licences

Peridynamics.jl is MIT; Julia is MIT; the Python libraries are BSD, MIT and
HPND. Only the measurements and our own simulation outputs are kept.
