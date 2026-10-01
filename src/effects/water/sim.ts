/**
 * Drops on a pane of glass (task 77; docs/research/water-drops.md 6.1, 7).
 *
 * The structure -- a drop list, trail drops split off a running drop,
 * momentum-conserving merges that skip a drop's own trail, a uniform grid
 * for finding neighbours -- is ported from raindrop-fx (MIT):
 *
 *   raindrop-fx, Copyright (c) 2021 SardineFish, MIT License
 *   https://github.com/SardineFish/raindrop-fx/tree/bae4081
 *   (src/raindrop.ts, src/simulator.ts, src/spawner.ts)
 *
 * with what water-drops.md 7.2 says to change:
 *   - real units (mm, uL = mm^3) and real time, sub-stepped, so the result
 *     does not depend on the frame rate (raindrop-fx stepped a fixed 0.03 s
 *     whatever the frame time);
 *   - when a drop slides is the Furmidge retention force, not a random
 *     resistance re-rolled every 0.1-0.4 s: it slides when
 *     rho g V > k w gamma (cos thetaR - cos thetaA) (water-drops 2.2-2.3);
 *   - how fast is the friction law, U = (rho g V - F0) / (beta w eta)
 *     (Li et al. 2023; water-drops 2.4), approached over about 0.1 s,
 *     not an unbounded acceleration;
 *   - a pinning field (coarse noise over the pane) scales the hysteresis,
 *     so drops stick and slip and meander where the glass is dirtier, and a
 *     wet film left by earlier drops lowers it so later drops follow old
 *     tracks (water-drops 6.1);
 *   - a drop is removed when it has evaporated (raindrop-fx let the volume go
 *     negative and relied on the NaN), and the grid is rebuilt each pass
 *     with cells at least twice the largest reach, so no pair is missed
 *     (raindrop-fx's 30 px cells missed reaches up to 61.6 px).
 *
 * Pure TypeScript, no DOM or GL, so it can be tested on its own. x runs
 * right and y down the pane (gravity is +y), in millimetres.
 */

import { FRICTION_BETA, FURMIDGE_K, GRAVITY, LIQUIDS, type Liquid } from "./liquids";

/** The smallest drop kept; below it, gone (evaporated, or too small to see). */
export const V_MIN = 0.01;
/** The longest sub-step, s (water-drops 7.6: at most 1/60 s). */
export const MAX_SUBSTEP = 1 / 60;
/** The step the sim always takes, s: a fixed step, so the result is the same at any frame rate. */
export const SUBSTEP = 1 / 120;
/** How quickly a drop reaches its friction-law speed, s (water-drops 6.1: about 100 ms). */
export const SPEED_TAU = 0.1;
/** How far a running drop goes between trail drops, mm: raindrop-fx's 20-30 px at 3.6 px/mm. */
export const TRAIL_EVERY: readonly [number, number] = [5.5, 8.3];
/** A trail drop's size against its parent's: raindrop-fx's 0.3-0.5 (by volume, cubed). */
export const TRAIL_SIZE: readonly [number, number] = [0.3, 0.5];
/** The film grid's cell, mm, and how fast a film dries, 1/s (estimate: about 20 s). */
export const FILM_CELL = 2;
export const FILM_DRY = 1 / 20;
/**
 * Spray too fine to see as drops lands as mist: volume per FILM_CELL cell,
 * which condenses into a drop once a cell holds MIST_CONDENSE uL
 * (liquids-spray.md 5.3: "condense into a drop at >= 0.5 uL in a 2 mm
 * cell", estimate), and dries meanwhile at MIST_DRY of itself a second
 * (estimate: a fine mist on glass is gone in under a minute).
 */
export const MIST_CONDENSE = 0.5;
export const MIST_DRY = 1 / 30;
/** The pinning field's cell, mm, and how far it moves the hysteresis either way (estimate). */
export const PIN_CELL = 6;
/** How strongly a drop is steered sideways by the field's gradient, mm (estimate). */
export const MEANDER = 8;

/** A spherical cap's contact radius and height from its volume and contact angle (water-drops 2.1). */
export function capOf(volume: number, thetaDeg: number): { a: number; h: number } {
  const t = Math.tan((thetaDeg * Math.PI) / 360);
  // V = pi a^3 t (3 + t^2) / 6, with h = a t.
  const a = Math.cbrt((6 * Math.max(volume, 0)) / (Math.PI * t * (3 + t * t)));
  return { a, h: a * t };
}

/** The equilibrium contact angle, between the advancing and receding ones. */
export const restAngle = (l: Liquid) => (l.thetaA + l.thetaR) / 2;

/** The weight of a drop of `volume` uL, N. */
export function weight(volume: number, l: Liquid): number {
  return l.rho * GRAVITY * volume * 1e-9;
}

/** The Furmidge retention force on a drop of contact radius `a` mm, N, with the hysteresis scaled by `pin`. */
export function retention(a: number, l: Liquid, pin = 1): number {
  const dc = Math.cos((l.thetaR * Math.PI) / 180) - Math.cos((l.thetaA * Math.PI) / 180);
  return FURMIDGE_K * 2 * a * 1e-3 * l.gamma * dc * pin;
}

/** The friction-law speed of a drop, mm/s (0 if it is held). */
export function slideSpeed(volume: number, l: Liquid, pin = 1): number {
  const { a } = capOf(volume, restAngle(l));
  const excess = weight(volume, l) - retention(a, l, pin);
  if (excess <= 0) return 0;
  return (excess / (FRICTION_BETA * 2 * a * 1e-3 * l.eta)) * 1e3;
}

/** The volume at which a drop starts to slide, uL (bisection on the Furmidge balance). */
export function slideThreshold(l: Liquid, pin = 1): number {
  let lo = 1e-4;
  let hi = 1e4;
  for (let k = 0; k < 80; k++) {
    const mid = Math.sqrt(lo * hi);
    if (slideSpeed(mid, l, pin) > 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** A hash of two integers to [0, 1): what raindrop-fx re-rolled, fixed per drop and event so it doesn't hang on the frame rate. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export type SimOptions = {
  /** The pane, mm. */
  width: number;
  height: number;
  seed?: number;
  /** At most this many drops (water-drops 7.6: 400 a page). */
  maxDrops?: number;
  /** How far the pinning field moves the hysteresis either way (0: clean, uniform glass). */
  pinning?: number;
  /** Whether running drops leave trail drops. */
  trails?: boolean;
  /** Whether drops evaporate (off only for tests that count volume). */
  evaporate?: boolean;
};

/**
 * The drops on one pane: a struct of arrays, swap-removed. A drop's id
 * (`serial`) is stable; its index is not.
 */
export class DropSim {
  readonly width: number;
  readonly height: number;
  readonly max: number;
  readonly seed: number;
  pinning: number;
  trails: boolean;
  evaporate: boolean;
  count = 0;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  /** Volume, uL (mm^3). */
  readonly vol: Float64Array;
  readonly liquid: Uint8Array;
  readonly serial: Int32Array;
  /** The drop it was shed from (-1: none): not merged with it, nor with its siblings. */
  readonly parent: Int32Array;
  /** How far it has run since it last shed a trail drop, mm; and how many it has shed. */
  readonly run: Float64Array;
  readonly shed: Int32Array;
  /** The wet film earlier drops left, 0-1, in FILM_CELL cells. */
  readonly film: Float32Array;
  readonly filmCols: number;
  readonly filmRows: number;
  /** Mist: spray volume not yet a drop, uL per FILM_CELL cell, and which liquid. */
  readonly mist: Float32Array;
  readonly mistLiquid: Uint8Array;
  /** Bumped whenever the mist changes, for a renderer that uploads it. */
  mistVersion = 0;
  private nextSerial = 1;
  private readonly pinField: Float32Array;
  private readonly pinCols: number;
  private readonly pinRows: number;
  /** Merges in the last step (volume-weighted, for the renderer's splat). */
  merges = 0;

  constructor(o: SimOptions) {
    this.width = o.width;
    this.height = o.height;
    this.max = o.maxDrops ?? 400;
    this.seed = o.seed ?? 1;
    this.pinning = o.pinning ?? 0.35;
    this.trails = o.trails ?? true;
    this.evaporate = o.evaporate ?? true;
    const n = this.max;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.vol = new Float64Array(n);
    this.liquid = new Uint8Array(n);
    this.serial = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.run = new Float64Array(n);
    this.shed = new Int32Array(n);
    this.filmCols = Math.max(1, Math.ceil(o.width / FILM_CELL));
    this.filmRows = Math.max(1, Math.ceil(o.height / FILM_CELL));
    this.film = new Float32Array(this.filmCols * this.filmRows);
    this.mist = new Float32Array(this.filmCols * this.filmRows);
    this.mistLiquid = new Uint8Array(this.filmCols * this.filmRows);
    this.pinCols = Math.max(2, Math.ceil(o.width / PIN_CELL) + 1);
    this.pinRows = Math.max(2, Math.ceil(o.height / PIN_CELL) + 1);
    this.pinField = new Float32Array(this.pinCols * this.pinRows);
    for (let i = 0; i < this.pinField.length; i++) {
      this.pinField[i] = hash01(this.seed * 7919 + 13, i) * 2 - 1;
    }
  }

  /** Add a drop (returns its index, or -1 if full or too small). */
  add(x: number, y: number, volume: number, liquid = 0, parent = -1): number {
    if (this.count >= this.max || !(volume >= V_MIN)) return -1;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vol[i] = volume;
    this.liquid[i] = liquid;
    this.serial[i] = this.nextSerial++;
    this.parent[i] = parent;
    this.run[i] = 0;
    this.shed[i] = 0;
    return i;
  }

  /**
   * Add liquid at a point (a spray droplet landing): into the drop it lands
   * on if there is one, else a new drop. Returns the index it went to.
   */
  addVolume(x: number, y: number, volume: number, liquid = 0): number {
    for (let i = 0; i < this.count; i++) {
      if (this.liquid[i] !== liquid) continue;
      const a = this.radius(i);
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      if (dx * dx + dy * dy < a * a) {
        this.vol[i] = this.vol[i]! + volume;
        return i;
      }
    }
    return this.add(x, y, volume, liquid);
  }

  liquidOf(i: number): Liquid {
    return LIQUIDS[this.liquid[i]!] ?? LIQUIDS[0]!;
  }

  /** Contact radius, mm. */
  radius(i: number): number {
    return capOf(this.vol[i]!, restAngle(this.liquidOf(i))).a;
  }

  /** Cap height, mm. */
  capHeight(i: number): number {
    return capOf(this.vol[i]!, restAngle(this.liquidOf(i))).h;
  }

  /** The pinning field at a point: the hysteresis's multiplier there, lowered where the glass is wet. */
  pinAt(x: number, y: number): number {
    return (1 + this.pinning * this.fieldAt(x, y)) * (1 - 0.5 * this.filmAt(x, y));
  }

  /** The field's slope across the pane at a point, per mm. */
  private pinSlopeX(x: number, y: number): number {
    const e = 0.5;
    return (this.pinning * (this.fieldAt(x + e, y) - this.fieldAt(x - e, y))) / (2 * e);
  }

  private fieldAt(x: number, y: number): number {
    const gx = Math.max(0, Math.min(this.pinCols - 1.001, x / PIN_CELL));
    const gy = Math.max(0, Math.min(this.pinRows - 1.001, y / PIN_CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    // Smoothstep between the cell corners: value noise.
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const c = this.pinCols;
    const f = this.pinField;
    const top = f[j * c + i]! * (1 - sx) + f[j * c + i + 1]! * sx;
    const bot = f[(j + 1) * c + i]! * (1 - sx) + f[(j + 1) * c + i + 1]! * sx;
    return top * (1 - sy) + bot * sy;
  }

  filmAt(x: number, y: number): number {
    const i = Math.floor(x / FILM_CELL);
    const j = Math.floor(y / FILM_CELL);
    if (i < 0 || j < 0 || i >= this.filmCols || j >= this.filmRows) return 0;
    return this.film[j * this.filmCols + i]!;
  }

  private wet(x: number, y: number) {
    const i = Math.floor(x / FILM_CELL);
    const j = Math.floor(y / FILM_CELL);
    if (i < 0 || j < 0 || i >= this.filmCols || j >= this.filmRows) return;
    this.film[j * this.filmCols + i] = 1;
  }

  /**
   * Spray landing (task 76): `volume` uL of `liquid` at a point. Into a drop
   * it lands on; otherwise into the mist, which becomes a drop where enough
   * gathers. Returns whether it went into a drop.
   */
  deposit(x: number, y: number, volume: number, liquid = 0): boolean {
    if (!(volume > 0) || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    for (let i = 0; i < this.count; i++) {
      if (this.liquid[i] !== liquid) continue;
      const a = this.radius(i);
      const dx = this.x[i]! - x;
      const dy = this.y[i]! - y;
      if (dx * dx + dy * dy < a * a) {
        this.vol[i] = this.vol[i]! + volume;
        return true;
      }
    }
    const c = Math.floor(y / FILM_CELL) * this.filmCols + Math.floor(x / FILM_CELL);
    if (this.mistLiquid[c] !== liquid && this.mist[c]! > 0) {
      // Another liquid's mist here: the newer one takes the cell (they do not mix in this model).
      this.mist[c] = 0;
    }
    this.mistLiquid[c] = liquid;
    this.mist[c] = this.mist[c]! + volume;
    this.mistVersion++;
    if (this.mist[c]! >= MIST_CONDENSE) {
      const cx = (c % this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const cy = Math.floor(c / this.filmCols) * FILM_CELL + FILM_CELL / 2;
      const v = this.mist[c]!;
      this.mist[c] = 0;
      this.addVolume(cx, cy, v, liquid);
    }
    return false;
  }

  /** The total volume in the mist, uL. */
  mistVolume(): number {
    let s = 0;
    for (let i = 0; i < this.mist.length; i++) s += this.mist[i]!;
    return s;
  }

  /** Remove a drop by index (swap with the last). */
  remove(i: number) {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.vol[i] = this.vol[last]!;
    this.liquid[i] = this.liquid[last]!;
    this.serial[i] = this.serial[last]!;
    this.parent[i] = this.parent[last]!;
    this.run[i] = this.run[last]!;
    this.shed[i] = this.shed[last]!;
  }

  /** Time not yet stepped, s: the sim always steps exactly SUBSTEP, so any frame rate gives the same drops. */
  private pending = 0;

  /**
   * Advance by dt seconds, in fixed steps of SUBSTEP (at most MAX_SUBSTEP);
   * what is left over waits for the next call. Returns whether anything
   * moved or merged (false: the sim can sleep; only evaporation and the
   * film's drying are left, which can tick slowly). A long gap (a hidden
   * tab) is capped at a quarter of a second, as the scheduler caps it.
   */
  step(dt: number): boolean {
    if (!(dt > 0)) return false;
    this.pending = Math.min(this.pending + dt, 0.25);
    let active = false;
    this.merges = 0;
    while (this.pending >= SUBSTEP - 1e-9) {
      this.pending -= SUBSTEP;
      active = this.substep(SUBSTEP) || active;
    }
    return active;
  }

  private substep(dt: number): boolean {
    let moving = false;
    // The film dries.
    const dry = Math.exp(-FILM_DRY * dt);
    for (let i = 0; i < this.film.length; i++) this.film[i] = this.film[i]! * dry;
    if (this.evaporate) {
      const mistDry = Math.exp(-MIST_DRY * dt);
      let any = false;
      for (let i = 0; i < this.mist.length; i++) {
        const m = this.mist[i]!;
        if (m <= 0) continue;
        const next = m * mistDry;
        this.mist[i] = next < 1e-4 ? 0 : next;
        any = true;
      }
      if (any) this.mistVersion++;
    }
    // Toward the friction-law speed, the same whatever the step (exact for a first-order lag).
    const ease = 1 - Math.exp(-dt / SPEED_TAU);
    for (let i = 0; i < this.count; i++) {
      const l = this.liquidOf(i);
      // Evaporation, as the contact radius (diffusion-limited).
      const { a } = capOf(this.vol[i]!, restAngle(l));
      if (this.evaporate) this.vol[i] = this.vol[i]! - l.evaporation * a * dt;
      const x = this.x[i]!;
      const y = this.y[i]!;
      // Held at its front, the advancing edge: the film it lays behind it helps the next drop, not itself.
      const pin = this.pinAt(x, y + a);
      const u = slideSpeed(this.vol[i]!, l, pin);
      // Down, steered sideways toward the cleaner glass (the field's slope).
      const side = Math.max(-0.3, Math.min(0.3, -MEANDER * this.pinSlopeX(x, y)));
      this.vy[i] = this.vy[i]! + (u - this.vy[i]!) * ease;
      this.vx[i] = this.vx[i]! + (u * side - this.vx[i]!) * ease;
      if (this.vy[i]! < 1e-3 && u === 0) {
        this.vy[i] = 0;
        this.vx[i] = 0;
        continue;
      }
      moving = true;
      const dx = this.vx[i]! * dt;
      const dy = this.vy[i]! * dt;
      this.x[i] = x + dx;
      this.y[i] = y + dy;
      // The film it leaves where it was (Kaneda 1993: water remains behind the flow).
      this.wet(x, y - a * 0.5);
      this.run[i] = this.run[i]! + Math.hypot(dx, dy);
      if (this.trails && l.trails) this.shedTrail(i, a);
    }
    // Gone: evaporated, or run off the bottom.
    for (let i = this.count - 1; i >= 0; i--) {
      const v = this.vol[i]!;
      if (!(v >= V_MIN) || this.y[i]! - this.radius(i) > this.height) this.remove(i);
    }
    if (this.mergeAll()) moving = true;
    return moving;
  }

  /** Shed a trail drop once it has run far enough (raindrop-fx raindrop.ts L88-L108). */
  private shedTrail(i: number, a: number) {
    const s = this.serial[i]!;
    const k = this.shed[i]!;
    const every = TRAIL_EVERY[0] + (TRAIL_EVERY[1] - TRAIL_EVERY[0]) * hash01(s, k * 3 + 1);
    if (this.run[i]! < every) return;
    // Shed where it crossed the mark, and carry what it ran past it.
    const past = this.run[i]! - every;
    this.run[i] = past;
    this.shed[i] = k + 1;
    const speed = Math.hypot(this.vx[i]!, this.vy[i]!) || 1;
    const backX = (this.vx[i]! / speed) * past;
    const backY = (this.vy[i]! / speed) * past;
    const size = TRAIL_SIZE[0] + (TRAIL_SIZE[1] - TRAIL_SIZE[0]) * hash01(s, k * 3 + 2);
    const v = this.vol[i]! * size * size * size;
    if (v < V_MIN || this.count >= this.max) return;
    const side = (hash01(s, k * 3 + 3) - 0.5) * 0.6 * a;
    // Behind it (above), where its tail was.
    const j = this.add(
      this.x[i]! - backX + side,
      this.y[i]! - backY - a * 0.8,
      v,
      this.liquid[i]!,
      s,
    );
    if (j >= 0) this.vol[i] = this.vol[i]! - v;
  }

  /** Whether i and j may merge: not a drop and its own trail, nor two of one drop's trail. */
  private related(i: number, j: number): boolean {
    const pi = this.parent[i]!;
    const pj = this.parent[j]!;
    return pi === this.serial[j] || pj === this.serial[i] || (pi >= 0 && pi === pj);
  }

  /**
   * Merge every overlapping pair (contact circles touching): volume adds,
   * momentum is kept, the centre goes to the volume-weighted mean. The grid
   * is rebuilt each pass with cells at least twice the largest radius, so
   * any two drops that touch are in the same or neighbouring cells.
   * Passes repeat until nothing merges (a grown drop can reach new ones).
   */
  private mergeAll(): boolean {
    let any = false;
    for (let pass = 0; pass < 8; pass++) {
      if (!this.mergePass()) break;
      any = true;
    }
    return any;
  }

  private cellStart = new Int32Array(1);
  private order = new Int32Array(1);
  private radii = new Float64Array(1);

  private mergePass(): boolean {
    const n = this.count;
    if (n < 2) return false;
    if (this.radii.length < n) {
      this.radii = new Float64Array(this.max);
      this.order = new Int32Array(this.max);
    }
    let maxA = 0;
    for (let i = 0; i < n; i++) {
      const a = this.radius(i);
      this.radii[i] = a;
      if (a > maxA) maxA = a;
    }
    const cell = Math.max(2 * maxA, 1);
    // Drops may hang a little off the pane: pad by a cell either side.
    const cols = Math.ceil(this.width / cell) + 3;
    const rows = Math.ceil(this.height / cell) + 3;
    const cellOf = (i: number) => {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(this.x[i]! / cell) + 1));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(this.y[i]! / cell) + 1));
      return cy * cols + cx;
    };
    // Counting sort by cell.
    const cells = cols * rows;
    if (this.cellStart.length < cells + 1) this.cellStart = new Int32Array(cells + 1);
    const start = this.cellStart;
    start.fill(0, 0, cells + 1);
    for (let i = 0; i < n; i++) start[cellOf(i) + 1]!++;
    for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
    const fill = start.slice(0, cells);
    for (let i = 0; i < n; i++) this.order[fill[cellOf(i)]!++] = i;

    const dead = new Uint8Array(n);
    let merged = false;
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const c = cellOf(i);
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        const ry = cy + oy;
        if (ry < 0 || ry >= rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const rx = cx + ox;
          if (rx < 0 || rx >= cols) continue;
          const cc = ry * cols + rx;
          for (let q = start[cc]!; q < start[cc + 1]!; q++) {
            const j = this.order[q]!;
            if (j <= i || dead[j] || dead[i]) continue;
            if (this.liquid[i] !== this.liquid[j]) continue;
            if (this.related(i, j)) continue;
            const dx = this.x[j]! - this.x[i]!;
            const dy = this.y[j]! - this.y[i]!;
            const reach = this.radii[i]! + this.radii[j]!;
            if (dx * dx + dy * dy >= reach * reach) continue;
            // The larger keeps its identity; the smaller is absorbed.
            const [keep, gone] = this.vol[i]! >= this.vol[j]! ? [i, j] : [j, i];
            this.absorb(keep, gone);
            dead[gone] = 1;
            this.radii[keep] = this.radius(keep);
            merged = true;
            this.merges++;
          }
        }
      }
    }
    if (merged) {
      for (let i = n - 1; i >= 0; i--) if (dead[i]) this.remove(i);
    }
    return merged;
  }

  /** Put drop `gone` into drop `keep`: volume, momentum and centre of volume kept exactly. */
  private absorb(keep: number, gone: number) {
    const va = this.vol[keep]!;
    const vb = this.vol[gone]!;
    const v = va + vb;
    this.x[keep] = (this.x[keep]! * va + this.x[gone]! * vb) / v;
    this.y[keep] = (this.y[keep]! * va + this.y[gone]! * vb) / v;
    this.vx[keep] = (this.vx[keep]! * va + this.vx[gone]! * vb) / v;
    this.vy[keep] = (this.vy[keep]! * va + this.vy[gone]! * vb) / v;
    this.vol[keep] = v;
    // It is no longer anyone's trail.
    this.parent[keep] = -1;
  }

  /** The total volume on the pane, uL. */
  totalVolume(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.vol[i]!;
    return s;
  }
}
