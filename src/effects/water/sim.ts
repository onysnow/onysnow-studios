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
/**
 * How far a running drop goes between trail beads, mm, and a bead's size
 * against its runner (by volume, cubed). Ony (2026-10-02): "raindrops in sort
 * of a dotted line ... when a stream runs down the glass and leaves that
 * dotted trail behind it". The film a runner draws behind it is a thin
 * thread that breaks into beads (Rayleigh-Plateau: a thread of width w
 * pinches into beads about 4.5 w apart), so the beads are small and close --
 * a dotted line -- not raindrop-fx's sparse 0.3-0.5 drops 6-8 mm apart. How
 * dense, per runner: some shed a dotted line (TRAIL_DENSE), some a sparse one.
 */
export const TRAIL_EVERY: readonly [number, number] = [1.4, 3.6];
export const TRAIL_SIZE: readonly [number, number] = [0.14, 0.26];
/** The share of runners that leave a sparse trail instead (every TRAIL_SPARSE x farther, bigger beads). */
export const TRAIL_SPARSE_SHARE = 0.35;
export const TRAIL_SPARSE = 3;
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
/**
 * The glass's fine dirt, mm, and how hard it steers (estimate). Ony
 * (2026-10-02): streams are "never in a straight line"; they "zig zag as
 * they can tend to form where raindrops already are when the surface
 * tension pulls them one way or another". A runner's front meets clean and
 * dirty spots a couple of millimetres across and is deflected by each, and
 * it bends toward any drop just ahead of it (CAPTURE_REACH), which its
 * front touches and pulls it into before it merges.
 */
export const FINE_CELL = 2.2;
export const MEANDER_FINE = 1.4;
/** How far ahead and to the side a runner feels a drop, in its radii plus mm. */
export const CAPTURE_REACH = 2.5;
export const CAPTURE_PULL = 0.9;
/** How long a merged drop takes to pull round again, s (estimate: pinned contact lines creep; the reference photographs show merged drops still lumpy minutes after -- most dry before they round up). */
export const SKEW_RELAX = 300;
/**
 * The most lobes a drop keeps (Ony, 2026-10-02: "rain drops aren't always
 * round when they bunch together ... weird shapes that aren't even circles
 * at all"). Two resting drops that touch do not pull into one circle: their
 * contact lines stay pinned where each was, so the merged drop is the two
 * footprints joined by a neck -- a peanut, a clover, a lumpy blob after
 * three or four -- and only creeps round over tens of seconds. A drop is
 * kept as up to this many parts, each a cap at its own place with its share
 * of the volume; past it, the two closest parts are joined.
 */
export const MAX_PARTS = 7;
/** Drops landing at least this big (uL) splash into an uneven footprint. */
export const SPLASH_MIN = 0.15;

/** A spherical cap's contact radius and height from its volume and contact angle (water-drops 2.1). */
const halfTan = new Map<number, number>();
export function capOf(volume: number, thetaDeg: number): { a: number; h: number } {
  let t = halfTan.get(thetaDeg);
  if (t === undefined) {
    t = Math.tan((thetaDeg * Math.PI) / 360);
    halfTan.set(thetaDeg, t);
  }
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
  /**
   * The parts a merge leaves (MAX_PARTS): drop i's part k is at
   * (x + partX, y + partY) mm with partF of its volume, k < partN[i]; slot
   * i * MAX_PARTS + k. The offsets creep in over SKEW_RELAX; a running drop
   * pulls round at once.
   */
  readonly partX: Float64Array;
  readonly partY: Float64Array;
  readonly partF: Float64Array;
  readonly partN: Uint8Array;
  /** Moved, grew or is new since the last merge test: only these can have come to touch another. */
  private readonly dirty: Uint8Array;
  /** Wind across the glass: how far a running drop is pushed sideways, as a fraction of its speed (rain type "wind-driven"). */
  wind = 0;

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
    this.partX = new Float64Array(n * MAX_PARTS);
    this.partY = new Float64Array(n * MAX_PARTS);
    this.partF = new Float64Array(n * MAX_PARTS);
    this.partN = new Uint8Array(n);
    this.dirty = new Uint8Array(n);
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
    this.vol[i] = volume;
    this.liquid[i] = liquid;
    this.partN[i] = 1;
    this.partX[i * MAX_PARTS] = 0;
    this.partY[i * MAX_PARTS] = 0;
    this.partF[i * MAX_PARTS] = 1;
    this.keepOn(i);
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vol[i] = volume;
    this.liquid[i] = liquid;
    this.serial[i] = this.nextSerial++;
    this.parent[i] = parent;
    this.run[i] = 0;
    this.shed[i] = 0;
    this.dirty[i] = 1;
    this.partN[i] = 1;
    this.partX[i * MAX_PARTS] = 0;
    this.partY[i * MAX_PARTS] = 0;
    this.partF[i * MAX_PARTS] = 1;
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
        this.grow(i, x, y, volume);
        return i;
      }
    }
    const j = this.add(x, y, volume, liquid);
    if (j >= 0) this.splash(j);
    return j;
  }

  /**
   * Liquid landing on drop i at a point: a resting drop keeps it where it
   * landed, a new lobe (its contact line spreads out there and pins); a
   * running one takes it in and stays round.
   */
  private grow(i: number, x: number, y: number, volume: number) {
    const v0 = this.vol[i]!;
    const v = v0 + volume;
    const still = Math.hypot(this.vx[i]!, this.vy[i]!) < 0.5;
    const list = still ? [...this.parts(i), [x, y, volume] as [number, number, number]] : [];
    this.x[i] = (this.x[i]! * v0 + x * volume) / v;
    this.y[i] = (this.y[i]! * v0 + y * volume) / v;
    this.vol[i] = v;
    this.dirty[i] = 1;
    this.partsOf(i, still ? list : [[this.x[i]!, this.y[i]!, v]]);
  }

  liquidOf(i: number): Liquid {
    return LIQUIDS[this.liquid[i]!] ?? LIQUIDS[0]!;
  }

  /** Contact radius, mm. */
  radius(i: number): number {
    const id = this.liquid[i]!;
    let k = this.radK[id];
    if (k === undefined) {
      k = capOf(1, restAngle(this.liquidOf(i))).a;
      this.radK[id] = k;
    }
    // a goes as the cube root of the volume at a fixed contact angle.
    return k * Math.cbrt(Math.max(this.vol[i]!, 0));
  }

  /** Each liquid's contact radius for 1 uL, and the volume below which a drop cannot slide on the slipperiest glass here. */
  private readonly radK: number[] = [];
  private readonly holdBelow: number[] = [];
  private holdPinning = NaN;

  /** Below this volume a resting drop of liquid `id` stays put wherever it is (the least pinned, wettest glass). */
  private heldBelow(id: number): number {
    if (this.holdPinning !== this.pinning) {
      this.holdBelow.length = 0;
      this.holdPinning = this.pinning;
    }
    let v = this.holdBelow[id];
    if (v === undefined) {
      const l = LIQUIDS[id] ?? LIQUIDS[0]!;
      v = slideThreshold(l, Math.max(0.05, (1 - this.pinning) * 0.5)) * 0.98;
      this.holdBelow[id] = v;
    }
    return v;
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

  /** The fine dirt's slope across the pane at a point (value noise, FINE_CELL), per mm times the cell. */
  private fineSlopeX(x: number, y: number): number {
    const e = 0.3;
    return ((this.fineAt(x + e, y) - this.fineAt(x - e, y)) / (2 * e)) * FINE_CELL;
  }

  private fineAt(x: number, y: number): number {
    const gx = x / FINE_CELL;
    const gy = y / FINE_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const s = this.seed * 104729 + 71;
    const v = (p: number, q: number) => hash01(s + p * 7919, q) * 2 - 1;
    const top = v(i, j) * (1 - sx) + v(i + 1, j) * sx;
    const bot = v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx;
    return top * (1 - sy) + bot * sy;
  }

  /**
   * How hard a runner is drawn sideways toward the drops just below it, as a
   * share of its speed: each drop within reach pulls by its size and nearness.
   */
  private pullToward(i: number, a: number): number {
    const x = this.x[i]!;
    const y = this.y[i]!;
    let pull = 0;
    for (let j = 0; j < this.count; j++) {
      if (j === i || this.liquid[j] !== this.liquid[i] || this.related(i, j)) continue;
      const dy = this.y[j]! - y;
      const aj = this.radius(j);
      const reachY = a * CAPTURE_REACH + aj + 1;
      if (dy <= 0 || dy > reachY) continue;
      const dx = this.x[j]! - x;
      const reachX = a * 1.5 + aj + 1;
      if (Math.abs(dx) > reachX) continue;
      const near = (1 - dy / reachY) * (1 - Math.abs(dx) / reachX);
      pull += Math.sign(dx) * near * Math.min(1, aj / a);
    }
    return CAPTURE_PULL * pull;
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
    this.partN[i] = this.partN[last]!;
    this.dirty[i] = this.dirty[last]!;
    for (let k = 0; k < MAX_PARTS; k++) {
      this.partX[i * MAX_PARTS + k] = this.partX[last * MAX_PARTS + k]!;
      this.partY[i * MAX_PARTS + k] = this.partY[last * MAX_PARTS + k]!;
      this.partF[i * MAX_PARTS + k] = this.partF[last * MAX_PARTS + k]!;
    }
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

  /**
   * Run on by `dt` seconds in coarse steps of MAX_SUBSTEP * 2 (1/30 s): the
   * rain that fell before you arrived, where a few minutes must be simulated
   * at once. Resting drops do not care about the step; runners cover four
   * times as far a step, which the merge test still catches.
   */
  fastForward(dt: number): void {
    const coarse = MAX_SUBSTEP * 2;
    for (let t = 0; t < dt - 1e-9; t += coarse) this.substep(coarse);
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
    const relax = Math.exp(-dt / SKEW_RELAX);
    for (let i = 0; i < this.count; i++) {
      const l = this.liquidOf(i);
      // Evaporation, as the contact radius (diffusion-limited).
      const a = this.radius(i);
      if (this.evaporate) this.vol[i] = this.vol[i]! - l.evaporation * a * dt;
      // Too small to slide even on the slipperiest glass, and at rest: nothing else to do.
      if (this.vy[i] === 0 && this.vx[i] === 0 && this.vol[i]! < this.heldBelow(this.liquid[i]!)) {
        this.creep(i, relax);
        continue;
      }
      const x = this.x[i]!;
      const y = this.y[i]!;
      // Held at its front, the advancing edge: the film it lays behind it helps the next drop, not itself.
      const pin = this.pinAt(x, y + a);
      const u = slideSpeed(this.vol[i]!, l, pin);
      // Down, steered sideways toward the cleaner glass (the field's slope), its fine dirt, and the drops just ahead.
      let side = -MEANDER * this.pinSlopeX(x, y) + MEANDER_FINE * this.fineSlopeX(x, y + a);
      if (u > 0) side += this.pullToward(i, a);
      side = Math.max(-0.8, Math.min(0.8, side));
      this.vy[i] = this.vy[i]! + (u - this.vy[i]!) * ease;
      this.vx[i] = this.vx[i]! + (u * (side + this.wind) - this.vx[i]!) * ease;
      this.creep(i, relax);
      if (this.vy[i]! < 1e-3 && u === 0) {
        this.vy[i] = 0;
        this.vx[i] = 0;
        continue;
      }
      // A running drop's shape is its run's (stretched along it, the renderer's): what a merge left pulls in.
      this.creep(i, 0.9);
      moving = true;
      this.dirty[i] = 1;
      const dx = this.vx[i]! * dt;
      const dy = this.vy[i]! * dt;
      this.x[i] = x + dx;
      this.y[i] = y + dy;
      this.keepOn(i);
      // The film it leaves where it was (Kaneda 1993: water remains behind the flow).
      this.wet(x, y - a * 0.5);
      this.run[i] = this.run[i]! + Math.hypot(dx, dy);
      if (this.trails && l.trails) this.shedTrail(i, a);
    }
    // Gone: evaporated, or run off the bottom.
    for (let i = this.count - 1; i >= 0; i--) {
      const v = this.vol[i]!;
      // A runner whose front reaches the bottom edge drains off round it.
      if (!(v >= V_MIN) || this.y[i]! + this.radius(i) > this.height) this.remove(i);
    }
    if (this.mergeAll()) moving = true;
    return moving;
  }

  /** Shed a trail drop once it has run far enough (raindrop-fx raindrop.ts L88-L108). */
  private shedTrail(i: number, a: number) {
    const s = this.serial[i]!;
    const k = this.shed[i]!;
    const sparse = hash01(s, 999) < TRAIL_SPARSE_SHARE ? TRAIL_SPARSE : 1;
    const every =
      (TRAIL_EVERY[0] + (TRAIL_EVERY[1] - TRAIL_EVERY[0]) * hash01(s, k * 3 + 1)) * sparse;
    if (this.run[i]! < every) return;
    // Shed where it crossed the mark, and carry what it ran past it.
    const past = this.run[i]! - every;
    this.run[i] = past;
    this.shed[i] = k + 1;
    const speed = Math.hypot(this.vx[i]!, this.vy[i]!) || 1;
    const backX = (this.vx[i]! / speed) * past;
    const backY = (this.vy[i]! / speed) * past;
    const size =
      (TRAIL_SIZE[0] + (TRAIL_SIZE[1] - TRAIL_SIZE[0]) * hash01(s, k * 3 + 2)) * Math.cbrt(sparse);
    const v = this.vol[i]! * size * size * size;
    if (v < V_MIN || this.count >= this.max) return;
    // On the thread's line: a little either side of where the runner's centre passed.
    const side = (hash01(s, k * 3 + 3) - 0.5) * 0.25 * a;
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
    let some = false;
    for (let i = 0; i < this.count; i++) if (this.dirty[i]) some = true;
    if (!some) return false;
    for (let pass = 0; pass < 8; pass++) {
      if (!this.mergePass()) break;
      any = true;
    }
    this.dirty.fill(0, 0, this.count);
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
      if (dead[i] || !this.dirty[i]) continue;
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
            // Two that both moved are tested once, from the lower index.
            if (j === i || dead[j] || dead[i] || (this.dirty[j] && j < i)) continue;
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
            this.dirty[keep] = 1;
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

  /** Pull a drop's parts toward its centre by `keep` of their offsets; parts that have closed up join. */
  private creep(i: number, keep: number) {
    const n = this.partN[i]!;
    if (n <= 1) return;
    const o = i * MAX_PARTS;
    for (let k = 0; k < n; k++) {
      this.partX[o + k] = this.partX[o + k]! * keep;
      this.partY[o + k] = this.partY[o + k]! * keep;
    }
    // Parts closer than a tenth of the drop's radius are one.
    const a = this.radius(i);
    if (n === 2) {
      const d = Math.hypot(
        this.partX[o]! - this.partX[o + 1]!,
        this.partY[o]! - this.partY[o + 1]!,
      );
      if (d < 0.1 * a) this.partsOf(i, [[this.x[i]!, this.y[i]!, this.vol[i]!]]);
    } else {
      let spread = 0;
      for (let k = 0; k < n; k++)
        spread = Math.max(spread, Math.hypot(this.partX[o + k]!, this.partY[o + k]!));
      if (spread < 0.05 * a) this.partsOf(i, [[this.x[i]!, this.y[i]!, this.vol[i]!]]);
    }
  }

  /**
   * Keep drop i wholly on the glass (Ony, 2026-10-03: "the rain gets cut at
   * the edges. That's not how rain would react to an edge"): a drop cannot
   * hang past the pane's edge, its contact line stops there, so one that
   * lands or slides against a side or the top sits against it.
   */
  private keepOn(i: number) {
    const a = this.radius(i);
    let lo = a;
    let hi = this.width - a;
    // Its lobes reach further than its own radius.
    const o = i * MAX_PARTS;
    for (let k = 0; k < this.partN[i]!; k++) {
      const pa = capOf(this.vol[i]! * this.partF[o + k]!, restAngle(this.liquidOf(i))).a;
      lo = Math.max(lo, pa - this.partX[o + k]!);
      hi = Math.min(hi, this.width - pa - this.partX[o + k]!);
    }
    if (lo <= hi) this.x[i] = Math.min(hi, Math.max(lo, this.x[i]!));
    else this.x[i] = this.width / 2;
    if (this.y[i]! < a) this.y[i] = a;
  }

  /**
   * A drop landing does not settle round: it spreads on impact and pulls
   * back, and its contact line catches on the glass's specks as it does, so
   * it rests in an uneven footprint (Ony, 2026-10-03: "keep adding more
   * misshapen raindrops"). Two to four lobes round its centre, most of the
   * water in one.
   */
  private splash(i: number) {
    const v = this.vol[i]!;
    if (v < SPLASH_MIN) return;
    const s = this.serial[i]!;
    const lobes = 1 + Math.floor(hash01(s, 501) * 3.2);
    const a = this.radius(i);
    const list: [number, number, number][] = [];
    let left = v;
    for (let k = 0; k < lobes; k++) {
      const ang = hash01(s, 510 + k) * Math.PI * 2;
      const d = a * (0.35 + 0.45 * hash01(s, 520 + k));
      const share = left * (0.15 + 0.3 * hash01(s, 530 + k));
      list.push([this.x[i]! + Math.cos(ang) * d, this.y[i]! + Math.sin(ang) * d, share]);
      left -= share;
    }
    list.push([this.x[i]!, this.y[i]!, left]);
    // The centre of the water, kept.
    let cx = 0;
    let cy = 0;
    for (const p of list) {
      cx += p[0] * p[2];
      cy += p[1] * p[2];
    }
    this.x[i] = cx / v;
    this.y[i] = cy / v;
    this.partsOf(i, list);
    this.keepOn(i);
  }

  /** Drop i's parts, page mm and uL. */
  parts(i: number): [number, number, number][] {
    const o = i * MAX_PARTS;
    const out: [number, number, number][] = [];
    for (let k = 0; k < this.partN[i]!; k++)
      out.push([
        this.x[i]! + this.partX[o + k]!,
        this.y[i]! + this.partY[o + k]!,
        this.vol[i]! * this.partF[o + k]!,
      ]);
    return out;
  }

  /** Set drop i's parts from page positions and volumes (its centre and volume must already be theirs). */
  private partsOf(i: number, list: [number, number, number][]) {
    // Too many: join the two closest, volume-weighted, until they fit.
    while (list.length > MAX_PARTS) {
      let bi = 0;
      let bj = 1;
      let bd = Infinity;
      for (let p = 0; p < list.length; p++)
        for (let q = p + 1; q < list.length; q++) {
          const d = Math.hypot(list[p]![0] - list[q]![0], list[p]![1] - list[q]![1]);
          if (d < bd) {
            bd = d;
            bi = p;
            bj = q;
          }
        }
      const [x1, y1, v1] = list[bi]!;
      const [x2, y2, v2] = list[bj]!;
      const v = v1 + v2;
      list[bi] = [(x1 * v1 + x2 * v2) / v, (y1 * v1 + y2 * v2) / v, v];
      list.splice(bj, 1);
    }
    let total = 0;
    for (const p of list) total += p[2];
    const o = i * MAX_PARTS;
    this.partN[i] = list.length;
    for (let k = 0; k < list.length; k++) {
      this.partX[o + k] = list[k]![0] - this.x[i]!;
      this.partY[o + k] = list[k]![1] - this.y[i]!;
      this.partF[o + k] = total > 0 ? list[k]![2] / total : 1 / list.length;
    }
  }

  /** Put drop `gone` into drop `keep`: volume, momentum and centre of volume kept exactly. */
  private absorb(keep: number, gone: number) {
    const va = this.vol[keep]!;
    const vb = this.vol[gone]!;
    const v = va + vb;
    // Resting drops keep each other's footprints (pinned contact lines); a running one swallows and goes on round.
    const still =
      Math.hypot(this.vx[keep]!, this.vy[keep]!) < 0.5 &&
      Math.hypot(this.vx[gone]!, this.vy[gone]!) < 0.5;
    const list = still ? [...this.parts(keep), ...this.parts(gone)] : [];
    this.x[keep] = (this.x[keep]! * va + this.x[gone]! * vb) / v;
    this.y[keep] = (this.y[keep]! * va + this.y[gone]! * vb) / v;
    this.vx[keep] = (this.vx[keep]! * va + this.vx[gone]! * vb) / v;
    this.vy[keep] = (this.vy[keep]! * va + this.vy[gone]! * vb) / v;
    this.vol[keep] = v;
    this.partsOf(keep, still ? list : [[this.x[keep]!, this.y[keep]!, v]]);
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
