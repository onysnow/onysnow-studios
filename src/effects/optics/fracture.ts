/**
 * How a pane breaks (item 10, claude/tools-research.md §2 "Broken glass",
 * §3.5): the crack pattern an impact leaves, as the shards it cuts the pane
 * into.
 *
 * From the fracture research (NIST/SWGMAT glass fracture guide; Structure
 * magazine, "Crack patterns tell the story of glass breakage"):
 *
 *   ANNEALED glass (ordinary float, the panes here) breaks into long
 *     jagged shards: radial cracks run out from the impact first, to the
 *     frame, then concentric cracks form between them, near the impact,
 *     when the pane is held round its edge. More energy, more radials.
 *   TEMPERED glass releases its locked-in stress all at once and dices into
 *     small, blunt, roughly equal cubes -- about a centimetre -- over the
 *     whole pane.
 *   LAMINATED glass is held together by its interlayer, so the pieces stay
 *     put and the cracks make a spider web: many radials, many close rings.
 *
 * Each shard is a polygon of the pane, with the small tilt and slip it
 * takes on as it breaks free (it is no longer quite in the pane's plane, so
 * what is seen through it steps at every crack), and how far it is from the
 * impact (the fracture surface is a smooth mirror near it, a frosted mist,
 * then rough hackle further out).
 *
 * Pure and deterministic: the same impact gives the same break.
 */

export type GlassKind = "annealed" | "tempered" | "laminated";

export type Pt = { x: number; y: number };

export type Shard = {
  /** Its outline, pane px, corners in order. */
  poly: Pt[];
  /** The slope it has taken on, radians about x and y: a few tenths of a degree. */
  tiltX: number;
  tiltY: number;
  /** How far it has slipped in the pane's plane, px. */
  slip: Pt;
  /** Its centre's distance from the impact, over the pane's diagonal. */
  reach: number;
};

export type Fracture = {
  kind: GlassKind;
  impact: Pt;
  shards: Shard[];
};

export type Impact = {
  /** The pane's size, px. */
  w: number;
  h: number;
  /** Where it was struck, pane px. */
  at: Pt;
  /** How hard, 0 (a crack) to 1 (a hammer). */
  energy: number;
  kind: GlassKind;
  seed?: number;
};

/** A repeatable pseudo-random number in [0, 1). */
function rand(seed: number, n: number): number {
  const x = Math.sin(seed * 91.345 + n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Clip a polygon to the half-plane where dot(p - a, nrm) <= 0 (Sutherland-Hodgman). */
function clipHalf(poly: Pt[], a: Pt, nrm: Pt): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => (p.x - a.x) * nrm.x + (p.y - a.y) * nrm.y;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/** Clip a polygon to the pane's rectangle. */
function clipRect(poly: Pt[], w: number, h: number): Pt[] {
  let p = clipHalf(poly, { x: 0, y: 0 }, { x: -1, y: 0 });
  p = clipHalf(p, { x: w, y: 0 }, { x: 1, y: 0 });
  p = clipHalf(p, { x: 0, y: 0 }, { x: 0, y: -1 });
  p = clipHalf(p, { x: 0, y: h }, { x: 0, y: 1 });
  return p;
}

/** A polygon's area (positive either way round). */
export function polygonArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function centroid(poly: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/**
 * The radial-and-ring break of annealed and laminated glass: radial cracks
 * at jittered angles, wandering as they run out; rings at jittered radii,
 * wavy. Each cell between two radials and two rings is a shard. The last
 * ring lies past the pane's far corner, so the cells cover it whole.
 */
function webBreak(im: Impact, seed: number): Pt[][] {
  const { w, h, at, energy, kind } = im;
  const far = Math.max(
    Math.hypot(at.x, at.y),
    Math.hypot(w - at.x, at.y),
    Math.hypot(at.x, h - at.y),
    Math.hypot(w - at.x, h - at.y),
  );
  const radials = kind === "laminated" ? 14 + Math.round(10 * energy) : 5 + Math.round(9 * energy);
  const ringCount = kind === "laminated" ? 5 + Math.round(5 * energy) : 1 + Math.round(2 * energy);
  // Radial angles: evenly spread, jittered by up to half a gap.
  const angles: number[] = [];
  const turn = rand(seed, 1) * Math.PI * 2;
  for (let i = 0; i < radials; i++) {
    angles.push(turn + ((i + (rand(seed, 10 + i) - 0.5) * 0.7) / radials) * Math.PI * 2);
  }
  // Ring radii: close to the impact for annealed (the concentric cracks form near it), spread for laminated.
  const reach = kind === "laminated" ? far * 0.8 : far * (0.15 + 0.25 * energy);
  const rings: number[] = [];
  for (let j = 1; j <= ringCount; j++) {
    const t = j / (ringCount + 0.5);
    rings.push(
      reach * Math.pow(t, kind === "laminated" ? 1.2 : 1) * (0.85 + 0.3 * rand(seed, 50 + j)),
    );
  }
  rings.sort((a, b) => a - b);
  rings.push(far * 1.5);
  const radii = [0, ...rings];
  // A radial crack wanders: its angle drifts a little with distance.
  const wander = (i: number, r: number) =>
    angles[i]! +
    0.06 * Math.sin(r / 40 + rand(seed, 100 + i) * 6) * (kind === "laminated" ? 0.5 : 1);
  // A ring is wavy: its radius shifts a little with angle.
  const wavy = (j: number, a: number) =>
    j === 0 ? 0 : radii[j]! * (1 + 0.07 * Math.sin(a * 3 + rand(seed, 200 + j) * 6));
  const cells: Pt[][] = [];
  const STEPS = 6;
  for (let i = 0; i < radials; i++) {
    const i2 = (i + 1) % radials;
    for (let j = 0; j < radii.length - 1; j++) {
      const poly: Pt[] = [];
      const a0 = (r: number) => wander(i, r);
      let a1 = (r: number) => wander(i2, r);
      if (i2 === 0) a1 = (r: number) => wander(0, r) + Math.PI * 2;
      // Inner ring, from radial i to i+1.
      for (let s = 0; s <= STEPS; s++) {
        const a = a0(radii[j]!) + ((a1(radii[j]!) - a0(radii[j]!)) * s) / STEPS;
        const r = wavy(j, a);
        poly.push({ x: at.x + r * Math.cos(a), y: at.y + r * Math.sin(a) });
      }
      // Outer ring, back from i+1 to i.
      for (let s = STEPS; s >= 0; s--) {
        const rr = radii[j + 1]!;
        const a = a0(rr) + ((a1(rr) - a0(rr)) * s) / STEPS;
        const r = wavy(j + 1, a);
        poly.push({ x: at.x + r * Math.cos(a), y: at.y + r * Math.sin(a) });
      }
      const clipped = clipRect(poly, w, h);
      if (clipped.length >= 3 && polygonArea(clipped) > 0.5) cells.push(clipped);
    }
  }
  return cells;
}

/**
 * Tempered glass dicing: a Voronoi tiling of jittered points about a
 * centimetre apart (38 px at 96 dpi), each cell the region nearer its point
 * than any other -- the rectangle clipped by the half-planes to its
 * neighbours.
 */
function diceBreak(im: Impact, seed: number): Pt[][] {
  const { w, h } = im;
  const pitch = 38 * (1.15 - 0.3 * im.energy);
  const cols = Math.max(1, Math.round(w / pitch));
  const rows = Math.max(1, Math.round(h / pitch));
  const cw = w / cols;
  const ch = h / rows;
  const sites: Pt[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      sites.push({
        x: (i + 0.15 + 0.7 * rand(seed, 300 + k * 2)) * cw,
        y: (j + 0.15 + 0.7 * rand(seed, 301 + k * 2)) * ch,
      });
    }
  }
  const cells: Pt[][] = [];
  for (let k = 0; k < sites.length; k++) {
    const s = sites[k]!;
    const ci = k % cols;
    const cj = Math.floor(k / cols);
    let poly: Pt[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    // Neighbours within two cells are the only ones that can bound it.
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const o = sites[nj * cols + ni]!;
        const mid = { x: (s.x + o.x) / 2, y: (s.y + o.y) / 2 };
        poly = clipHalf(poly, mid, { x: o.x - s.x, y: o.y - s.y });
        if (poly.length < 3) break;
      }
    }
    if (poly.length >= 3) cells.push(poly);
  }
  return cells;
}

/** Break a pane. */
export function fracture(im: Impact): Fracture {
  const seed = im.seed ?? 1;
  const cells = im.kind === "tempered" ? diceBreak(im, seed) : webBreak(im, seed);
  const diag = Math.hypot(im.w, im.h);
  // Laminated pieces are held by the interlayer: they barely move.
  const loose = im.kind === "laminated" ? 0.25 : im.kind === "tempered" ? 0.6 : 1;
  const shards = cells.map((poly, k) => {
    const c = centroid(poly);
    const reach = Math.hypot(c.x - im.at.x, c.y - im.at.y) / diag;
    // Near the impact the pieces are knocked about most.
    const knock = loose * (0.3 + 0.7 * Math.exp(-reach * 4)) * (0.4 + 0.6 * im.energy);
    const deg = Math.PI / 180;
    return {
      poly,
      tiltX: (rand(seed, 500 + k) - 0.5) * 0.8 * deg * knock,
      tiltY: (rand(seed, 600 + k) - 0.5) * 0.8 * deg * knock,
      slip: {
        x: (rand(seed, 700 + k) - 0.5) * 1.6 * knock,
        y: (rand(seed, 800 + k) - 0.5) * 1.6 * knock,
      },
      reach,
    };
  });
  return { kind: im.kind, impact: im.at, shards };
}
