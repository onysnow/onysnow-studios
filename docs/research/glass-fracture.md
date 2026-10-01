# Research: a thorough broken-glass system

Web research, 2026-10-01, for item 10 (broken glass). It builds on
`docs/broken-glass-cracks.md` (the crack generator: radials, staggered
concentric chords, forks, T-junctions, crushed spot, tempered dice) and
`docs/broken-glass-light.md` (per-shard tilt from the dent, cracks as TIR
faces, side faces, light under the pane, holes, pieces on the floor). This
file doesn't repeat their physics. It adds prior art, licences, appearance
references, shader techniques, physics libraries, and a recommended build
order.

Every claim links to its source. Where a page couldn't be read, it says so.

---

## 1. Prior art

### 1a. Web libraries and demos

| What | Technique | Licence | Use to us |
|---|---|---|---|
| **three-pinata** (Dan Greenheck), [repo](https://github.com/dgreenheck/three-pinata), [demo](https://three-pinata-demo.vercel.app/) | Real-time Voronoi fracture of three.js meshes in **3D and 2.5D modes**. Impact-concentrated seeds (`impactPoint`, `impactRadius`), **custom seed points**, refracture, plane slicing, a **separate material for interior fracture faces** with auto UVs, and a Rapier integration example ([README](https://raw.githubusercontent.com/dgreenheck/three-pinata/main/README.md)). Needs three >= 0.158. | MIT | The 2.5D mode plus custom seeds is the closest match to a pane. We can feed it **our own crack-graph faces**, or borrow its extrude-and-cap code, to turn 2D shards into slabs with side and fracture faces for the falling and floor pieces. |
| **three.js `ConvexObjectBreaker`** ([docs](https://threejs.org/docs/pages/ConvexObjectBreaker.html), [example](https://threejs.org/examples/physics_ammo_break.html)) | `subdivideByImpact(object, point, normal, radialIters, randomIters)` makes recursive radial and random plane cuts of a **convex** mesh. `cutByPlane` is also available. | MIT ([three.js LICENSE](https://github.com/mrdoob/three.js/blob/dev/LICENSE)) | A reference for cutting a convex shard again, for example when a piece hits the floor and breaks. Only works on convex input. |
| **Ksenia Kondrashova, "Broken Glass Effect"** ([CodePen](https://codepen.io/ksenia-k/pen/abegNPO)) | A pure fragment-shader effect. Angular sectors around the click, noise, and three layered edge systems. A per-sector UV disturbance gives each sector its own refraction offset. | MIT (public Pens are MIT by default: [CodePen licensing](https://blog.codepen.io/documentation/licensing/)) | Shows that "each sector distorts the photo differently" reads well in one shader pass. Our map-based approach is more physical, but this is a good visual benchmark. |
| **Codrops, "Exploding 3D Objects with Three.js"** (Yuri Artiukh) ([article](https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/)) | Pre-fractured Voronoi models (glTF + Draco). All fragments animate **in the vertex shader** from per-fragment attributes (direction, rotation, progress). | Codrops demo, check the repo licence | Good pattern for many falling shards: one draw call, per-vertex shard id, and the GPU does the tumble. |
| **Babylon.js, "Mesh shattering with baked physics"** ([article](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743)) | Voronoi fracture offline, then rigid-body simulation **baked to a vertex-animation texture**: quaternions as RGBA8, positions as ratios in the bounding box (2 MB down to 40 KB). It plays back in one draw call. | Article | The cheapest fully deterministic "pieces fall and settle". |
| **nayrrod/voronoi-fracture** ([repo](https://github.com/nayrrod/voronoi-fracture)) | 2D Voronoi cells extruded into 3D, in one merged BufferGeometry with custom GLSL. | MIT | A minimal extrude-cells-to-slabs reference. |
| **shatter.js** ([repo](https://github.com/Biratus/shatter.js)) | Splits an **image** into Voronoi pieces and gives each piece's image and offset. | MIT | 2D/CSS fallback: shards as clipped image pieces. |
| **d3-delaunay** ([repo](https://github.com/d3/d3-delaunay)) | Fast 2D Voronoi built on Delaunator. Cell polygons are clipped to bounds. | ISC | Only needed if we ever want Voronoi tempered dice instead of a grid. Our radial crack graph is already more faithful. |
| **4rknova, "Voronoi Fragmentation of a Mesh"** ([post](https://www.4rknova.com/blog/2026/07/27/voronoi-fracture)) | Sutherland-Hodgman clipping by bisector half-spaces, cap generation, and **tagging new faces as "fracture"** so they get their own material. Works on convex solids only. | No licence stated | A clear explanation of the cap-face and tagging step we need for shard side faces. |
| **Godot "Impact Glass Shader"** ([godotshaders](https://godotshaders.com/shader/impact-glass-shader/)) | Radially placed Voronoi seeds, with ring radius `r = R*pow(t,1.2)`. Per-shard refraction direction `shard_dir` and a strength that falls with distance. | MIT (code) | A shader-only "per-shard refraction offset" reference. |
| **Godot-Glass-Break-Effect** ([repo](https://github.com/Lord0Sanz/Godot-Glass-Break-Effect)) | Voronoi crack edges, refraction boosted near cracks, blur oriented per shard. Going from 75 to 30 seeds is about 4x faster on mobile. | MIT | A useful note on mobile cost. |
| **Shadertoy** ("cracked", [ls2XR1](https://www.shadertoy.com/view/ls2XR1)), Inigo Quilez's Voronoi edge distance ([article](https://iquilezles.org/articles/voronoilines/), [shader](https://www.shadertoy.com/view/ldl3W8)) | Exact distance to a Voronoi cell border needs a **second pass** over the neighbours. Naive F2-F1 is not a true distance, which is why naive crack lines vary in width. | Shadertoy pages returned 403 to my fetcher, so the terms ([shadertoy.com/terms](https://www.shadertoy.com/terms)) are unverified. Shadertoy code commonly carries CC BY-NC-SA 3.0 (example dispute: [vispy #1672](https://github.com/vispy/vispy/issues/1672)), so **don't copy Shadertoy code; reimplement from the articles.** | Only relevant if we move cracks into a procedural shader. We draw them from the graph instead. |

### 1b. Game engines

- **Unreal Chaos.** Geometry Collections are fractured offline by
  Uniform/Cluster/**Radial** (Voronoi sites radiating from a centre, "ideal
  for glass")/Planar/Slice/Brick/Mesh/Custom tools, with noise on the cut
  surfaces ([Fracturing Geometry Collections](https://dev.epicgames.com/documentation/en-us/unreal-engine/fracturing-geometry-collections-user-guide)).
  Pieces separate at runtime when strain fields break the connection graph
  ([Destruction Quick Start](https://dev.epicgames.com/documentation/unreal-engine/destruction-quick-start?lang=en-US),
  [Chaos Fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-fields-user-guide-in-unreal-engine)).
  **Borrow:** the clustered connection graph. A piece falls only once its
  links to the frame and to its neighbours are broken.
- **Unity "WindowFracture / GlassSystem"** ([repo](https://github.com/Tiitan/GlassSystem)).
  It "projects and clips a 2D fracture pattern on the panel surface,
  converted into shard polygons, then extruded into runtime shard meshes".
  **Shards connected to the frame stay anchored, and disconnected islands
  fall.** UVs carry over from the panel. Patterns are deterministic
  (`patternIndex`, `rotation`) and shards can break again. This is
  architecturally the closest match to ours (2D pattern, then extrude, then
  anchor by frame connectivity). Licence: see the repo (it bundles MathNet
  third-party binaries).
- **Smash Hit** (Mediocre / Dennis Gustafsson) ([Voxagon blog, "Cracking destruction"](https://blog.voxagon.se/2014/05/13/cracking-destruction.html),
  [GDC talk](https://www.gdcvault.com/play/1022200/Physics-for-Game-Programmers-Destruction)).
  Real-time glass on mobile:
  - It carves a small volume around the impact and splits it with
    randomised planes.
  - It keeps **vertex normals through splits** so the glass keeps its soft
    gradients.
  - It checks connectivity after a break to find islands that fall.
  - It breaks pieces inside the solver step, so they keep their momentum.

### 1c. Papers

- **O'Brien & Hodgins 1999, "Graphical Modeling and Animation of Brittle
  Fracture"** ([project page](http://graphics.berkeley.edu/papers/Obrien-GMA-1999-08/),
  [PDF](https://www.ri.cmu.edu/pub_files/pub4/o_brien_james_f_1999_1/o_brien_james_f_1999_1.pdf),
  [ACM](https://dl.acm.org/doi/10.1145/311535.311550)). An FEM stress
  tensor decides where cracks start and which way they run, with remeshing
  as they go. It won the SIGGRAPH Impact award. Too heavy to run live. It is
  the physical basis for "crack runs perpendicular to max principal
  stress", which our random walks imitate.
- **Müller, Chentanez & Kim 2013, "Real Time Dynamic Fracture with
  Volumetric Approximate Convex Decompositions"** ([PDF](https://matthias-research.github.io/pages/publications/fractureSG2013.pdf),
  [ACM](https://dl.acm.org/doi/10.1145/2461912.2461934)).
  - A **pre-computed fracture pattern is aligned to the impact point** and
    intersected with convex pieces.
  - For glass windows they use a **procedural spider-web pattern**, or
    Voronoi cells denser at the centre.
  - Fracture is local: only cells inside an impact sphere are cut, and the
    rest stays one piece.
  - It runs in under 10 ms for small and medium objects.
  - **Borrow:** "pattern centred on the hit, applied locally". This is
    exactly our generator applied to the pane.
- **Iben & O'Brien, "Generating Surface Crack Patterns"** (SCA 2006 best
  paper; Graphical Models 71(6) 2009) ([eScholarship](https://escholarship.org/uc/item/7j62s1nd),
  [PDF](http://graphics.berkeley.edu/papers/Iben-GSC-2009-11/Iben-GSC-2009-11.pdf)).
  A heuristic stress field on a triangle mesh is evolved over time to grow
  cracks, with parameters for mud, glaze and glass. The time evolution gives
  **animated crack growth**, a good model for a "crack spreading" animation.
- **Desbenoit, Galin & Akkouche 2005, "Modeling cracks and fractures"**
  ([ResearchGate](https://www.researchgate.net/publication/226590041_Modeling_cracks_and_fractures),
  [HAL](https://hal.science/hal-01303573v1), which blocked my fetcher). It
  maps 2D crack-pattern atlases onto surfaces and carves them into the
  volume. It supports our approach of authoring the crack graph in 2D and
  then giving it depth.
- **Sellán et al. 2022, "Breaking Good: Fracture Modes for Realtime
  Destruction"** ([arXiv](https://arxiv.org/html/2111.05249v5),
  [code](https://github.com/sgsellan/fracture-modes)). Fracture modes are
  precomputed and the impact is projected onto them at runtime. The licence
  is **academic/non-commercial only**, and it depends on tetgen and mosek.
  **Not usable for us.** Listed so nobody wastes time on it.
- **Wyman 2005, "An Approximate Image-Space Approach for Interactive
  Refraction"** ([ACM](https://dl.acm.org/doi/10.1145/1073204.1073310)),
  also "Interactive refractions with total internal reflection"
  ([ACM](https://dl.acm.org/doi/10.1145/1268517.1268548)). These are the
  standard screen-space refraction methods: refract at the front face, then
  approximate the exit using back-face depth and normals. Relevant for the
  floor pieces, which are thick wedges where TIR matters.

---

## 2. How real broken glass looks under light

**The fracture face has zones.**
- Near the origin the face is a smooth **mirror**. Next comes **mist**
  (hazy), then **hackle** (rough, stepped ridges). The zones grow
  concentrically from the origin as crack speed rises ([Bradt 2011, J. Fail.
  Anal. Prev.](https://link.springer.com/article/10.1007/s11668-011-9432-5);
  [ASTM C1256](https://elitesafetyglass.com/wp-content/uploads/2021/04/ASTM-C1256-Standard-Practice-for-Interpreting-Glass-Fracture-Surface-Features.pdf)).
- **Wallner lines** (rib marks) are curved ripples, concave towards where
  the crack came from.
- **Twist hackle** looks like "a staircase as seen from above" or a river
  with tributaries (ASTM C1256).
- The whole face is **conchoidal**, with curved shell-like lines
  ([CAMEO](https://cameo.mfa.org/wiki/Conchoidal_fracture),
  [Britannica](https://www.britannica.com/science/conchoidal-fracture)).
- **For rendering:**
  - Near the impact the faces are rough. They scatter, so they look whiter
    and less mirror-like.
  - Far from the impact a crack face is a near-perfect mirror that flashes
    only at the right angle.
  - Twist hackle makes the face's normal step along its length, so the flash
    breaks into **segments** rather than one continuous line.

**Why a crack is silver, dark or invisible.**
- A crack is an air gap. Light inside the glass that meets it beyond the
  critical angle (about 41.8 deg for n ≈ 1.5) is **totally reflected**, so
  the crack shines silver. Otherwise the light passes and the crack is
  nearly invisible ([TIR](https://en.wikipedia.org/wiki/Total_internal_reflection),
  [CK-12](https://www.ck12.org/flexi/physical-science/refraction/why-does-a-crack-in-glass-appear-to-be-silvery/),
  [ScienceABC](https://www.scienceabc.com/eyeopeners/if-glass-is-transparent-then-why-are-its-cracks-opaque)).
- It looks **dark** when the mirror reflects a dark part of the room.
- Where the two faces are **within a few wavelengths** of each other (at
  crack tips, and in tight cracks held in a frame), the evanescent wave
  crosses the gap. TIR is **frustrated**, light passes, and the crack goes
  **invisible** ([TIR, frustrated TIR section](https://en.wikipedia.org/wiki/Total_internal_reflection)).
- Gaps about a wavelength wide show thin-film interference colours, like
  [Newton's rings](https://en.wikipedia.org/wiki/Newton%27s_rings) (the
  faint rainbow at a tight crack).
- **Rendering consequence:** fade each crack's mirror strength towards its
  tip, and toward segments flagged "tight". Add an optional faint
  iridescence where it is tight.

**Why a crack looks green.**
- Float glass has about 0.1% iron oxide, which absorbs red. Looking along a
  long path through the glass (an edge, or a steep fracture face seen
  through the thickness) shows a **dark green edge**. Low-iron glass shows
  pale blue ([KJM, low-iron glass](https://www.kjmgroup.co.uk/blog/low-iron-glass-optiwhite-explained)).
- Light that TIR bounces along a shard also travels a long path, so the
  edges glow **green**.

**The double image along a crack.**
- The two pieces either side of a crack tilt differently. Each reflects the
  room rotated by 2x its own tilt ([law of reflection](https://en.wikipedia.org/wiki/Specular_reflection)).
- So a straight reflected edge (a window frame) **jumps** at the crack.
- Seen through the pane, the line of sight crosses a leaning fracture face,
  a wedge of glass, so the photo behind is **offset** across the crack band
  ([Snell's law](https://en.wikipedia.org/wiki/Snell%27s_law);
  [Fresnel equations](https://en.wikipedia.org/wiki/Fresnel_equations)).
- The result is the "doubled" look of real cracked panes: reflection
  discontinuities at every crack, plus a thin band of displaced photo.

**Annealed, tempered and laminated.**
- **Annealed:** long dagger shards with mirror-smooth faces. Their
  reflections differ strongly piece to piece (`broken-glass-light.md`
  covers the dish tilt).
- **Tempered:** breaks into "small granular chunks of similar size and
  shape" ([Safety glass](https://en.wikipedia.org/wiki/Safety_glass),
  [Tempered glass](https://en.wikipedia.org/wiki/Tempered_glass)), because
  the surface is in compression and the core in tension.
  - EN 12150 requires at least **40 particles in a 50x50 mm square**
    (30 for 15 mm glass). The count rises with surface stress, at least
    about 90 MPa for glass 10 mm or thinner ([glassonweb](https://www.glassonweb.com/article/thermally-toughened-safety-glass-correlation-between-flexural-strength-fragmentation-and)).
  - That is about 7-8 mm cubes, each with its own tiny tilt. The pane reads
    as **glittering sugar**: thousands of small mirrors, each lit or not.
- **Laminated:** a spider web of radial and concentric cracks, with pieces
  "bonded even when broken" by a PVB/EVA/TPU interlayer ([Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)).
  - There are two plies (for example 2.5 + 0.38 + 2.5 mm), so **two crack
    networks**, slightly offset, give a doubled crack look.
  - Nothing falls out. The pane sags as a cone (already modelled).
- **The impact on thick glass:** a **Hertzian cone** is ejected from the
  far side ([Britannica](https://www.britannica.com/science/Hertzian-cone-fracture)).
  The exit hole is larger than the entry hole
  ([SWGMAT, Glass Fractures](https://www.asteetrace.org/static/images/pdf/02%20Glass%20Fractures.pdf)).
  SWGMAT also states the **4R rule**: "Ridges on Radial cracks are at Right
  angles to the Rear". This corrects the "3R" in `broken-glass-light.md`.

**The edges of shards glow.**
- A shard is a light guide. Light entering the broad faces is trapped by TIR
  and comes out at the cut or broken edges. Edge-lit acrylic and glass signs
  work this way ([FGD glass, edge-lit](https://www.fgdglass.com/blog/led-edgelit-signs-a-designers-guide-to-architectural-glass-illumination/),
  [ACRYLITE light-guiding sheet](https://www.acrylite.co/products/brands/acrylite-led/light-guiding-edge-lit-sheet)).
- On a lit floor, a shard's perimeter is brighter and greener than its
  middle.

**Photo references (CC-licensed, for side-by-side checks):**
- [Commons: Broken glass](https://commons.wikimedia.org/wiki/Category:Broken_glass)
- [Commons: Broken safety glass](https://commons.wikimedia.org/wiki/Category:Broken_safety_glass)
  (tempered dice and laminated webs)
- [Broken_glass_001.JPG](https://commons.wikimedia.org/wiki/File:Broken_glass_001.JPG)
- [Broken Glass (18434524128)](https://commons.wikimedia.org/wiki/File:Broken_Glass_(18434524128).jpg)

What to look for in these photos:
- cracks mostly clear, with bright segments only where the light lines up
- reflections that jump at each crack
- green, bright fracture faces at the shard edges
- whitened crush near the impact

---

## 3. Rendering it in a fragment shader

**The data: a shard map plus a shard table** (this extends the existing
`shard-map.ts`).
- **Shard map texture** at pane resolution, with four channels:
  - R,G: 16-bit shard id
  - B: signed distance to the nearest crack, in px
  - A: the id of the nearest crack segment, or its packed lean and
    roughness
- The map comes from our crack graph (planar faces), **not** from a shader
  Voronoi. Ours obeys T-junctions and staggered chords. A shader Voronoi
  can't (see the IQ note in 1a on why naive Voronoi edges are wrong).
- **Shard table texture**, one texel row per shard:
  - tilt normal (dish plus knock)
  - a piston offset out of the plane
  - flags: missing, falling, tight, crushed
  - roughness
- Animating a shard (tilting or removing it) then rewrites one texel, not
  the whole map. The same "per-fragment attributes, GPU does the rest" idea
  appears in the [Codrops exploding objects](https://tympanus.net/codrops/2019/03/26/exploding-3d-objects-with-three-js/)
  and [Babylon baked shatter](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743)
  articles.

**Per-shard reflection.**
- `N = shardNormal[id]`, `R = reflect(V, N)`, then sample the room
  environment along R.
- Weight by Schlick Fresnel, `F0 = ((n-1)/(n+1))^2 ≈ 0.04` ([Schlick's approximation](https://en.wikipedia.org/wiki/Schlick%27s_approximation)).
- A tilt of t moves the reflection by 2t, so 1-4 deg tilts are needed for
  visible contrast (as computed in `broken-glass-light.md`).
- Add a per-shard **piston offset** to the reflection parallax so the
  room's edges also *shift* between pieces, not just rotate.

**Per-shard refraction.**
- A tilted parallel slab shifts the photo by only `t*theta*(1-1/n)`, which
  is sub-pixel (see the existing doc).
- So the big refraction effect belongs in the **crack band** (wedge or
  prism deviation, [Snell](https://en.wikipedia.org/wiki/Snell%27s_law)),
  plus a small per-shard offset for flavour. The Godot shaders above use a
  per-shard `shard_dir` offset.
- Inside the band, offset the photo lookup across the crack by about
  `t*tan(lean)/n`, and mirror the sample on the far side of the gap.

**Cracks as thin TIR mirrors.**
1. Inside the band (|B| < half-width), build the fracture-face normal from
   the crack's in-plane direction and its lean.
2. Refract the view ray into the glass (n = 1.52).
3. Test it against the face. Beyond the critical angle the face is a
   perfect mirror (full TIR). Below it, use Fresnel.
4. Reflect, then sample the environment, the lamp, or the photo along the
   reflected in-glass ray.
5. Tint the result by Beer-Lambert green with path length = band width / cos.
6. Multiply by a tightness fade, which goes to 0 at crack tips (frustrated
   TIR).
7. Roughness (mist and hackle) blurs the sample and lifts it toward white,
   only near the crush.
8. A one-pixel dark seam marks the air gap.

The result is a crack that is mostly clear, flashes silver or green where
the geometry lines up, and is never a white line. Wyman's refraction work
([2005](https://dl.acm.org/doi/10.1145/1073204.1073310),
[TIR 2007](https://dl.acm.org/doi/10.1145/1268517.1268548)) is the
reference for doing this with depth and normals in screen space.

**Light leaking and shadows through cracks** (the floor light under the
pane).
- Render a **light-space copy of the shard map**: the pane seen from the
  lamp.
- For each receiver pixel, refract the lamp ray through the shard's normal,
  and through the crack face where it crosses one.
- Get intensity from the **area ratio of the beam before and after**, using
  `dFdx`/`dFdy` (oldArea/newArea: above 1 is bright, below 1 is dark). This
  is Evan Wallace's WebGL water caustics method ([article](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c),
  [demo](https://madebyevan.com/webgl-water/)), adapted to R3F by Maxime
  Heckel ([blog](https://blog.maximeheckel.com/posts/caustics-in-webgl/)).
- Each crack then throws a **dark line with a bright seam** beside it, offset
  by the slab thickness along the light, and each tilted shard shifts its
  own patch of light.
- A cheaper equivalent: draw the crack graph into the light map as two
  offset strokes (dark, then bright), and blur by distance to the receiver.

**Side faces.**
- Where a crack meets the pane boundary, draw it on the edge face as a line
  at its lean.
- Sample the same green edge shader as the intact edge, but break it there,
  since each piece's edge glow ends at its fracture face.

**Pieces on the floor.**
- Draw each as an extruded prism (top face plus side faces) using the same
  per-shard reflection shader.
- Its own refraction is near zero across the middle and strong at the
  wedge-shaped rim.
- Edge glow is stronger at the perimeter (the light-guide effect).
- Its shadow is the caustic above with a dark rim and bright inner line.
- Use the screen-space refraction from Wyman for thick pieces, or just the
  rim approximation.

**Tempered.**
- Don't draw thousands of crack bands. Use the shard map with about
  7 mm cells and per-cell random tilt.
- Each cell is a tiny mirror, so the pane glitters as the camera or lamp
  moves.
- Draw cracks as hairline seams only, with TIR flashes from the rim of each
  cell.

---

## 4. Physics for falling shards

| Library | Dim | Licence | Notes |
|---|---|---|---|
| **Rapier** (`@dimforge/rapier2d`/`3d`, `-compat` builds) ([repo](https://github.com/dimforge/rapier), [JS guide](https://rapier.rs/docs/user_guides/javascript/getting_started_js/), [npm](https://www.npmjs.com/package/@dimforge/rapier3d-compat)) | 2D and 3D | Apache-2.0 | WASM, fast. The three-pinata examples use it. Convex-hull colliders. Its weight is a WASM chunk of a few MB: one project dropped it partly for its 2.15 MB chunk ([pachinball #412](https://github.com/ford442/pachinball/issues/412)), so lazy-load it only when something falls. |
| **cannon-es** ([repo](https://github.com/pmndrs/cannon-es), [LICENSE](https://github.com/pmndrs/cannon-es/blob/master/LICENSE)) | 3D | MIT | Pure JS, light, `ConvexPolyhedron`. Maintained fork of cannon.js. |
| **matter.js** ([repo](https://github.com/liabru/matter-js), [Bodies docs](https://brm.io/matter-js/docs/classes/Bodies.html)) | 2D | MIT | `Bodies.fromVertices` takes concave shards only if [poly-decomp](https://www.npmjs.com/package/poly-decomp) is registered. Otherwise it uses the convex hull. |
| **planck.js** ([repo](https://github.com/piqnt/planck.js)) | 2D | MIT | A JS/TS rewrite of Box2D, very stable stacking. Box2D polygons are convex with a small vertex cap, so decompose shards first. |
| **ammo.js** (Bullet), used by the [three.js convex-break example](https://threejs.org/examples/physics_ammo_break.html) | 3D | zlib (Bullet) | Heavy and old API. Not recommended. |
| **No engine: baked or analytic** | n/a | n/a | [Babylon baked VAT](https://babylonjs.medium.com/mesh-shattering-with-baked-physics-5b3f8f381743) or a hand-written ballistic tumble with a single floor contact. |

**When to break off a piece.**
- Copy the Unity GlassSystem and Chaos rule: a shard falls when it is **no
  longer connected to the frame** through intact links in the shard
  adjacency graph ([GlassSystem](https://github.com/Tiitan/GlassSystem),
  [Chaos Fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/chaos-fields-user-guide-in-unreal-engine)).
- A hammer click cuts that shard's links.
- Small central shards at a hard hit fall immediately.
- Laminated shards never fall.

---

## 5. Recommended architecture for onysnow-vision

Keep the **crack generator we have**. It is more faithful than Voronoi:
- staggered chords
- T-junctions
- forks per Quinn and Bradt
- a pattern centred on the hit, exactly as Müller et al. recommend for
  windows

Borrow the **rendering data layout** from the shader demos, the **extrude
and anchor logic** from Unity GlassSystem and three-pinata, and the
**caustic method** from Wallace.

1. **Shard graph plus adjacency** (in `fracture.ts`). Faces already exist.
   Add:
   - an adjacency list (shared crack segments)
   - a frame-anchored flag
   - per-segment lean, roughness (from distance to the crush) and tightness
     (fades to 0 at dangling tips)

   Fix the 3R/4R wording in the docs.
2. **Shard map v2** (in `shard-map.ts`). RGBA as in section 3: id, signed
   crack distance, segment id. Add a **shard table** texture for tilt,
   piston, flags and roughness. Upload once per break, then patch texels
   when a shard changes.
3. **Glass shader pass** (`?try=broken`):
   - per-shard Fresnel reflection of the room, with tilt and piston
   - crack band as a TIR mirror, tinted green, with frustrated fade and
     hackle roughness
   - refraction offset only inside the band
   - one-pixel air seam
   - tempered uses the same path with small cells and no band
4. **Side faces.** Intersect the crack segments with the pane boundary and
   draw them on the edge faces at their lean.
5. **Light under the pane.** Make a light-space shard map. Compute the
   Wallace area-ratio caustic per shard and across crack bands, giving dark
   and bright pairs. Start with the cheap two-stroke version, and upgrade
   if it reads flat.
6. **Removal.** When a shard is clicked or disconnected, set its flag to
   missing. The hole shows the sharp photo, rimmed by exposed fracture
   faces drawn with the step-3 shader.
7. **Falling and floor pieces.**
   - Extrude the shard polygon to thickness t (earcut caps plus side
     quads). For three.js, three-pinata's 2.5D mode or nayrrod's extruder
     can do it, MIT.
   - Tag side faces as "fracture" for the green edge material.
   - **Phase A:** an analytic tumble (gravity, spin, one bounce, settle
     flat at a slight random tilt). No dependency, deterministic, fine for
     a few pieces.
   - **Phase B,** only if pieces must pile up: lazy-load Rapier
     (Apache-2.0) and use convex-hull colliders (pieces are mostly convex;
     if not, decompose them).
   - Draw resting pieces with the floor-piece shader from section 3: rim
     refraction, edge glow, caustic shadow.
8. **Mobile budget.** Cap the number of crack segments in the band pass,
   since seed and segment count dominate cost, as the Godot repo notes.
   Fall back to a static bake (shards as clipped images, as in
   [shatter.js](https://github.com/Biratus/shatter.js)) under
   `prefers-reduced-motion` or on weak GPUs.

**Licence guardrails.**
- Fine to borrow from: three-pinata (MIT), three.js (MIT), CodePen pens
  (MIT), godotshaders snippets (MIT), d3-delaunay (ISC), matter, cannon-es
  and planck (MIT), Rapier (Apache-2.0, keep its NOTICE).
- Don't copy code from: Shadertoy (default licence unverified, commonly
  NC-SA), Breaking Good (non-commercial).
- Codrops demos: check each repo's licence first.

---

### Pages I could not read

- shadertoy.com: 403, so its licence is unverified.
- HAL: bot wall.
- iquilezles.org: robots.txt blocked the fetch.
- graphics.berkeley.edu PDF: robots.txt.
- Springer "Star crack formation via low-velocity impact" ([link](https://link.springer.com/article/10.1007/s40870-022-00351-w)):
  the proxy rate-limited the request. Worth reading for radial count
  against impact speed.
