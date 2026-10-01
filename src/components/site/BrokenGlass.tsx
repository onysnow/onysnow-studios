import { useEffect, useRef } from "react";
import {
  fracture,
  type Crack,
  type GlassKind,
  type Pt,
  type Shard,
} from "@/effects/optics/fracture";
import { photoBreak, placementFor, type Placement } from "@/effects/optics/crack-photo";
import { loadCrackPhoto, type LoadedCrackPhoto } from "@/effects/optics/crack-photo-loader";
import { crackPhotoFor } from "@/lib/crack-photos";
import { loadShard, shardOutline, shardsFor } from "@/lib/glass-shards";
import { cursorLamp, onLightChange, pointLights } from "@/effects/light/lights";
// Glass's index: a crack face seen through the pane lies at 1/n of its depth.
import { N_GLASS, crackGlow, type CrackLightSource } from "@/effects/optics/crack-light";
import { viewState } from "@/effects/scene/scene";
import { camera } from "@/effects/camera/camera";
import { previewing } from "@/effects/engine/preview";
import { adoptLayer } from "@/effects/engine/compositor";
import { clearShardMap, paintShardMap, setShardMap } from "@/effects/optics/shard-map";

/** The frost the panes' backdrop is blurred by, px (styles.css .glass: blur(30px)). */
const FROST_BLUR = 30;
/** How far past the pane the frosted copy reaches, px: room for the shards' slip. */
const MARGIN = 24;
/** The pane's thickness, px: a crack face is this tall. */
const THICKNESS = 18;

/** The sharpest image under a point of the page. */
function photoUnder(el: HTMLElement, x: number, y: number): HTMLImageElement | null {
  for (let node: HTMLElement | null = el.parentElement; node; node = node.parentElement) {
    let best: HTMLImageElement | null = null;
    for (const img of node.querySelectorAll("img")) {
      const r = img.getBoundingClientRect();
      const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (over && img.naturalWidth > (best?.naturalWidth ?? 0)) best = img;
    }
    if (best) return best;
  }
  return null;
}

/** A repeatable number in [0, 1) for a crack and a use. */
function hash(k: number, n: number): number {
  const x = Math.sin(k * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How far the fracture face leans off square to the pane along a crack,
 * radians, at arc length `s`: twist hackle turns it in and out as it runs,
 * most near the impact, where the face is mist and hackle.
 */
function leanAt(k: number, s: number, rough: number): number {
  const a = 0.12 + 0.14 * rough;
  return (
    a *
    (0.65 * Math.sin(s / (31 + 20 * hash(k, 1)) + 6.3 * hash(k, 2)) +
      0.35 * Math.sin(s / (9 + 6 * hash(k, 3)) + 6.3 * hash(k, 4)))
  );
}

/**
 * One stroke that adds `tint` at `amount` and the lights' `glow` at
 * `share`, as a colour for the "lighter" blend (which adds colour times
 * alpha); null if it adds nothing.
 */
function additive(
  tint: readonly [number, number, number],
  amount: number,
  glow: readonly [number, number, number],
  share: number,
): string | null {
  const add = [0, 1, 2].map((i) => tint[i]! * amount + glow[i]! * share);
  const peak = Math.max(add[0]!, add[1]!, add[2]!);
  if (peak < 0.004) return null;
  const alpha = Math.min(1, peak);
  const [r, g, b] = add.map((v) => Math.round(Math.min(255, (v / peak) * 255)));
  return `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;
}

/** The glass's own green, seen through the depth of a crack face (sRGB). */
const FACE_TINT = [168, 228, 214] as const;

type Props = {
  kind?: GlassKind;
  /** How hard it was struck, 0 to 1. */
  energy?: number;
  /** Where, as a fraction of the pane. */
  at?: { x: number; y: number };
  seed?: number;
};

/**
 * A broken pane (item 10, ?try=broken on Lab samples), laid over the pane
 * it breaks. From the fracture research (claude/tools-research.md §2):
 *
 *   the pattern is the glass's (effects/optics/fracture): annealed into long
 *     radial shards with rings near the impact, tempered into dice,
 *     laminated into a spider web;
 *   each shard has knocked a little out of the pane's plane, so what is seen
 *     through it -- the photograph behind, frosted as the pane frosts it --
 *     steps at every crack;
 *   a crack is a thin air gap with two new glass faces standing across the
 *     pane. Light inside the glass meets them past the critical angle, so
 *     they are mirrors: a crack flashes silver where the lamp, the face and
 *     your eye line up, and reads as a dark line where they do not;
 *   the lamp's light piped along the pane escapes at the cracks, so they
 *     glow near the lamp -- and every other light's too, the flash, a
 *     flare, the flashlight's beam where it points, each in its colour
 *     (effects/optics/crack-light);
 *   near the impact the fracture face turns from mirror to frosted mist and
 *     rough hackle -- whiter, wider cracks and a crushed star -- and the
 *     chipped edges split light into colour.
 */
export function BrokenGlass({
  kind = "annealed",
  energy = 0.7,
  at = { x: 0.38, y: 0.42 },
  seed = 1,
}: Props) {
  const view = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = view.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    /*
     * The break: from a photograph of broken glass of this kind when there is
     * one (lib/crack-photos) -- its cracks ARE the cracks, and the shards are
     * the pieces they cut -- otherwise generated (effects/optics/fracture).
     */
    type Piece = Shard & {
      holes?: Pt[][];
      /** A knocked-out piece that is one of the photographed pieces: it, turned, this size. */
      photo?: { img: HTMLImageElement; turn: number; size: number; at: Pt };
    };
    type Break = {
      shards: Piece[];
      cracks: Crack[];
      impact: Pt;
      crush: number;
      photo?: { loaded: LoadedCrackPhoto; placement: Placement };
    };
    let broken: Break | null = null;
    let brokeFor = "";
    let photo: LoadedCrackPhoto | null = null;
    let disposed = false;
    /*
     * Ony's photographed pieces: every piece of this break wears a different
     * one, and the pieces knocked out fall as them (lib/glass-shards).
     */
    const shardPhotos: HTMLImageElement[] = [];
    for (const url of shardsFor(seed, 12)) {
      void loadShard(url).then((img) => {
        if (disposed || !img) return;
        shardPhotos.push(img);
        wake();
      });
    }
    const struckAt = performance.now();
    /** How long the knocked-out pieces take to fall out of sight, ms. */
    const FALL_MS = 1100;
    /** A piece's box, for laying a photograph over it. */
    const boxOf = (poly: readonly Pt[]) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of poly) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    /**
     * A shard photograph's glass laid over a piece: its middle (its dust,
     * chips and inner cracks -- not its own outline), turned and scaled to
     * cover the piece. Drawn "screen", so only its light adds.
     */
    const wearGlass = (
      img: HTMLImageElement,
      box: ReturnType<typeof boxOf>,
      k: number,
      alpha: number,
    ) => {
      const side = Math.max(box.w, box.h) * 1.5 + 8;
      const sw = img.naturalWidth * 0.55;
      const sh = img.naturalHeight * 0.55;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "screen";
      ctx.translate(box.cx, box.cy);
      ctx.rotate(hash(seed, 900 + k) * Math.PI * 2);
      ctx.drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        -side / 2,
        -side / 2,
        side,
        side,
      );
      ctx.restore();
    };
    const photoUrl = crackPhotoFor(kind, seed);
    if (photoUrl) {
      void loadCrackPhoto(photoUrl).then((loaded) => {
        if (disposed || !loaded) return;
        photo = loaded;
        brokeFor = "";
        wake();
      });
    }
    let frame = 0;
    // The pane this break is laid over, and its pieces for the glass shader (step 3b).
    const pane = canvas.parentElement?.closest<HTMLElement>(".glass") ?? null;
    /*
     * With step 3b the break is the glass, so it goes in the pane's own slot
     * for it, under the light on the glass -- the room it reflects, the lamp,
     * the grime -- which it used to cover (effects/engine/compositor).
     */
    if (pane && previewing("shardlight")) adoptLayer(pane, "pane:broken", canvas);
    const shardMap = document.createElement("canvas");
    // The frosted photograph, cached: blurring is the costly part.
    const frost = document.createElement("canvas");
    let frostFor = "";

    const draw = () => {
      frame = 0;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 2 || h < 2) return;
      const key = `${Math.round(w)}x${Math.round(h)}`;
      const breakKey = `${key}|${photo ? "photo" : "made"}|${shardPhotos.length ? "glass" : ""}`;
      if (breakKey !== brokeFor) {
        const struck = { x: at.x * w, y: at.y * h };
        if (photo) {
          // Turned a different way strike by strike, so one photograph never repeats exactly.
          const placement = placementFor(
            photo.map,
            { w, h, at: struck },
            energy,
            hash(seed, 77) * Math.PI * 2,
          );
          const pb = photoBreak(
            photo.map,
            photo.regions,
            placement,
            seed,
            kind === "annealed" ? energy : 0,
            { kind, energy },
          );
          const shards: Piece[] = [...pb.shards];
          /*
           * A full swing knocks a piece clean out. The photographed star
           * breaks have few closed pieces to lose, so the piece that goes is
           * one of Ony's photographed pieces itself: its outline is the hole,
           * and it is what falls.
           */
          const piece = shardPhotos[0];
          if (kind === "annealed" && energy > 0.8 && piece) {
            const outline = shardOutline(piece);
            if (outline.length >= 3) {
              const size = Math.min(w, h) * (0.12 + 0.5 * (energy - 0.8));
              const turn = hash(seed, 55) * Math.PI * 2;
              const c = Math.cos(turn);
              const sn = Math.sin(turn);
              shards.push({
                poly: outline.map((q) => ({
                  x: struck.x + (c * q.x - sn * q.y) * size,
                  y: struck.y + (sn * q.x + c * q.y) * size,
                })),
                tiltX: 0,
                tiltY: 0,
                slip: { x: 0, y: 0 },
                reach: 0,
                missing: true,
                photo: { img: piece, turn, size, at: struck },
              });
            }
          }
          broken = {
            shards,
            cracks: pb.cracks,
            impact: struck,
            crush: 0,
            photo: { loaded: photo, placement },
          };
        } else {
          broken = fracture({ w, h, at: struck, energy, kind, seed });
        }
        brokeFor = breakKey;
        /*
         * Step 3b (?try=shardlight): the pieces go to the glass shader, which
         * draws the room each one reflects at its own slope.
         */
        if (pane && previewing("shardlight")) {
          shardMap.width = Math.round(w);
          shardMap.height = Math.round(h);
          const mc = shardMap.getContext("2d");
          if (mc && broken) {
            paintShardMap(mc, broken.shards, shardMap.width, shardMap.height);
            setShardMap(pane, shardMap);
          }
        }
      }
      if (!broken) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // ---- The stepped view: each shard shows the frosted photograph from where it now lies. ----
      const img = photoUnder(canvas, rect.left + w / 2, rect.top + h / 2);
      if (img && img.complete && img.naturalWidth > 0) {
        const r = img.getBoundingClientRect();
        // object-fit: cover, centred: which part of the file is drawn where.
        const ia = img.naturalWidth / Math.max(img.naturalHeight, 1);
        const ea = r.width / Math.max(r.height, 1);
        const sw = ia > ea ? img.naturalHeight * ea : img.naturalWidth;
        const sh = ia > ea ? img.naturalHeight : img.naturalWidth / ea;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        const ox = r.left - rect.left;
        const oy = r.top - rect.top;
        // The frosted photograph, blurred once per place and size, not once per shard.
        const fkey = `${img.currentSrc}|${Math.round(ox)}|${Math.round(oy)}|${key}|${dpr}`;
        if (fkey !== frostFor) {
          frost.width = Math.round((w + 2 * MARGIN) * dpr);
          frost.height = Math.round((h + 2 * MARGIN) * dpr);
          const fc = frost.getContext("2d")!;
          fc.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr);
          fc.filter = `blur(${FROST_BLUR * 0.6}px)`;
          fc.drawImage(img, sx, sy, sw, sh, ox, oy, r.width, r.height);
          fc.filter = "none";
          frostFor = fkey;
        }
        const path = (s: { poly: readonly Pt[]; holes?: readonly (readonly Pt[])[] }) => {
          ctx.beginPath();
          for (const loop of [s.poly, ...(s.holes ?? [])]) {
            loop.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
          }
        };
        /*
         * The glass that did not break (past a photographed break's reach)
         * seen the same way as the pieces, unmoved, so the break has no edge
         * of its own where the pieces stop.
         */
        ctx.drawImage(frost, -MARGIN, -MARGIN, w + 2 * MARGIN, h + 2 * MARGIN);
        ctx.fillStyle = "rgb(255 255 255 / 0.06)";
        ctx.fillRect(0, 0, w, h);
        for (const s of broken.shards) {
          ctx.save();
          path(s);
          // A photographed piece can wrap round a smaller one: its holes are not its glass.
          ctx.clip("evenodd");
          if (s.missing) {
            // A hole: the photograph behind, seen with no glass in the way.
            ctx.drawImage(img, sx, sy, sw, sh, ox, oy, r.width, r.height);
          } else {
            /*
             * Tilted, the shard sees the photograph behind shifted by the gap
             * times the slope (about the pane's own gap to the photograph, a
             * few dozen px), and slipped by its slip.
             */
            const gap = 70;
            const dx = s.slip.x + Math.tan(s.tiltY) * gap;
            const dy = s.slip.y + Math.tan(s.tiltX) * gap;
            ctx.drawImage(frost, -MARGIN + dx, -MARGIN + dy, w + 2 * MARGIN, h + 2 * MARGIN);
            // The pane's own frosting over it, as the pane has.
            ctx.fillStyle = "rgb(255 255 255 / 0.06)";
            ctx.fillRect(0, 0, w, h);
            // And its own glass: one of the photographed pieces, a different one each.
            if (shardPhotos.length) {
              const k = broken.shards.indexOf(s);
              wearGlass(shardPhotos[k % shardPhotos.length]!, boxOf(s.poly), k, 0.55);
            }
          }
          ctx.restore();
        }
      }

      // ---- The crushed spot: pulverised glass, white, crazed with tiny cracks. ----
      const ix = broken.impact.x;
      const iy = broken.impact.y;
      const crushed = broken.shards.find((s) => s.crushed);
      if (broken.photo) {
        /*
         * ---- The photographed cracks: the photograph itself, where it is crack ----
         *
         * Laid with its strike on the struck point, turned and scaled as the
         * shards were; not inside a hole, where the glass has gone.
         */
        const { loaded, placement } = broken.photo;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        for (const s of broken.shards) {
          if (!s.missing) continue;
          s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
        }
        ctx.clip("evenodd");
        ctx.translate(placement.at.x, placement.at.y);
        ctx.rotate(placement.turn);
        const k = placement.scale / loaded.layerScale;
        ctx.scale(k, k);
        ctx.translate(
          -loaded.map.strike.x * loaded.layerScale,
          -loaded.map.strike.y * loaded.layerScale,
        );
        ctx.drawImage(loaded.layer, 0, 0);
        ctx.restore();
      } else if (crushed && !crushed.missing) {
        ctx.save();
        ctx.beginPath();
        crushed.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();
        const cr = broken.crush * 1.3;
        const spot = ctx.createRadialGradient(ix, iy, 0, ix, iy, cr);
        spot.addColorStop(0, "rgb(236 244 242 / 0.85)");
        spot.addColorStop(1, "rgb(214 232 228 / 0.5)");
        ctx.fillStyle = spot;
        ctx.fillRect(ix - cr, iy - cr, cr * 2, cr * 2);
        // Crazing: short cracks every way, and little arcs where flakes spalled.
        ctx.lineWidth = 0.5;
        for (let k = 0; k < 90; k++) {
          const a = hash(seed, 1000 + k) * Math.PI * 2;
          const r0 = broken.crush * hash(seed, 2000 + k);
          const len = 1.5 + 5 * hash(seed, 3000 + k);
          const x0 = ix + r0 * Math.cos(a);
          const y0 = iy + r0 * Math.sin(a);
          const b2 = a + (hash(seed, 4000 + k) - 0.5) * 2.4;
          ctx.strokeStyle = k % 3 ? "rgb(255 255 255 / 0.55)" : "rgb(40 60 60 / 0.35)";
          ctx.beginPath();
          if (k % 5 === 0) {
            ctx.arc(x0, y0, len, b2, b2 + 1.6);
          } else {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + len * Math.cos(b2), y0 + len * Math.sin(b2));
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      /*
       * Round the crushed spot, the hackle: dozens of fine radial cracks too
       * short to cut anything off, fading as they run out (the white burst at
       * the heart of every impact photograph).
       */
      if (!broken.photo && !crushed?.missing && broken.crush > 0) {
        ctx.globalCompositeOperation = "lighter";
        const n = Math.round(30 + 50 * energy);
        for (let k = 0; k < n; k++) {
          const a = hash(seed, 5000 + k) * Math.PI * 2;
          const r0 = broken.crush * (0.7 + 0.3 * hash(seed, 6000 + k));
          const r1 = broken.crush * (1.4 + 2.2 * hash(seed, 7000 + k) ** 2);
          const bend = (hash(seed, 8000 + k) - 0.5) * 0.12;
          const g = ctx.createLinearGradient(
            ix + r0 * Math.cos(a),
            iy + r0 * Math.sin(a),
            ix + r1 * Math.cos(a + bend),
            iy + r1 * Math.sin(a + bend),
          );
          g.addColorStop(0, "rgb(230 246 242 / 0.55)");
          g.addColorStop(1, "rgb(168 228 214 / 0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(ix + r0 * Math.cos(a), iy + r0 * Math.sin(a));
          ctx.lineTo(ix + r1 * Math.cos(a + bend), iy + r1 * Math.sin(a + bend));
          ctx.stroke();
        }
        // The burst's glow: light scattered by the crazed glass, soft past the rim.
        const halo = ctx.createRadialGradient(ix, iy, broken.crush * 0.6, ix, iy, broken.crush * 3);
        halo.addColorStop(0, "rgb(220 240 236 / 0.28)");
        halo.addColorStop(1, "rgb(220 240 236 / 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(
          ix - broken.crush * 3,
          iy - broken.crush * 3,
          broken.crush * 6,
          broken.crush * 6,
        );
        ctx.globalCompositeOperation = "source-over";
      }

      // ---- The cracks: each a fracture face seen through the glass. ----
      // Every light in the scene, as the crack sees it: in the pane's pixels, against the lamp.
      const reference = Math.max(cursorLamp.gain, 1e-6);
      const sources: CrackLightSource[] = pointLights().map((l) => ({
        at: { x: l.x - rect.left, y: l.y - rect.top, z: l.height },
        colour: l.colour,
        strength: l.gain / reference,
        radiance: l.gain,
        charge: l.charge,
        aim: l.aim,
      }));
      const eye = {
        x: document.documentElement.clientWidth / 2 + viewState.eyeX - rect.left,
        y: document.documentElement.clientHeight / 2 + viewState.eyeY - rect.top,
        z: camera.distance(document.documentElement.clientWidth),
      };
      const depth = THICKNESS / N_GLASS;
      const roughReach = broken.crush * 4 + 10;
      const photoCracks = !!broken.photo;
      broken.cracks.forEach((c: Crack, ck) => {
        if (c.kind === "crush" && crushed?.missing) return;
        let run = 0;
        for (let i = 0; i + 1 < c.pts.length; i++) {
          const a = c.pts[i]!;
          const b = c.pts[i + 1]!;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len < 0.05) continue;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          // Across the crack, in the pane's plane.
          const nx = -(b.y - a.y) / len;
          const ny = (b.x - a.x) / len;
          // Near the impact the face is mist and hackle: rough, whiter.
          const fromImpact = Math.hypot(mx - ix, my - iy);
          const rough = c.kind === "crush" ? 1 : Math.exp(-fromImpact / roughReach);
          const lean = leanAt(ck, run + len / 2, rough);
          run += len;
          /*
           * The face runs through the pane's depth leaning by `lean`; from
           * your eye, looking across the crack at a slant, its far edge is
           * displaced by the depth (seen through the glass, 1/n of it) times
           * the lean plus the slant. That is the ribbon's width and side.
           */
          const slant = ((mx - eye.x) * nx + (my - eye.y) * ny) / Math.max(eye.z, 1);
          const wide = depth * (Math.tan(lean) + 0.5 * slant);
          const ox = nx * wide;
          const oy = ny * wide;

          // The face's normal, leaning with it: (n cos lean, sin lean).
          const fn = { x: nx * Math.cos(lean), y: ny * Math.cos(lean), z: Math.sin(lean) };
          // What every light sends to the eye from this face: its mirror flash and the piped light.
          const { rgb: glow, flash } = crackGlow(sources, { x: mx, y: my }, fn, eye, rough);
          /*
           * The room: a fracture face is a new, clean mirror, and seen at a
           * slant it shows the lit room and the light through the pane --
           * which is why a crack reads as a bright line in daylight. The
           * wider the ribbon, the more of it you see; mist and hackle
           * scatter it white.
           */
          const room = 0.32 + 0.08 * Math.min(1, Math.abs(wide) / 3) + 0.3 * rough;
          if (photoCracks) {
            /*
             * Photographed: the photograph already shows the crack as the room
             * lights it. What it cannot show is this lamp, so only the lamp's
             * flash and its piped light are added -- along the pieces' edges,
             * each crack being two pieces' edge, so at half each time.
             */
            const extra = additive([0, 0, 0], 0, glow, 0.5);
            if (extra) {
              ctx.globalCompositeOperation = "lighter";
              ctx.strokeStyle = extra;
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
            continue;
          }

          // The air gap: light from behind it is turned away, a hairline of shade.
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = `rgb(10 16 16 / ${(0.3 + 0.15 * rough).toFixed(3)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          // The face: a ribbon from the crack to its far edge, glass-green, lit.
          ctx.globalCompositeOperation = "lighter";
          const [fr, fg, fb] = FACE_TINT;
          const white = rough * 0.7;
          const tint = [
            (fr + (255 - fr) * white) / 255,
            (fg + (255 - fg) * white) / 255,
            (fb + (255 - fb) * white) / 255,
          ] as const;
          if (Math.abs(wide) > 0.6) {
            ctx.fillStyle = additive(tint, room * 0.22, glow, 0.22) ?? "transparent";
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.lineTo(a.x + ox, a.y + oy);
            ctx.closePath();
            ctx.fill();
          }
          // Its far edge, where the face meets the pane's surface, catches the most.
          ctx.strokeStyle = additive(tint, room, glow, 1) ?? "transparent";
          ctx.lineWidth = 0.55 + 0.6 * rough;
          ctx.beginPath();
          ctx.moveTo(a.x + ox, a.y + oy);
          ctx.lineTo(b.x + ox, b.y + oy);
          ctx.stroke();
          if (rough > 0.3 && flash > 0.05) {
            // A chipped, rough face splits the lamp's light into colour, a hair apart.
            for (const [cc, o] of [
              ["255 80 60", -0.7],
              ["60 120 255", 0.7],
            ] as const) {
              ctx.strokeStyle = `rgb(${cc} / ${(flash * 0.35 * rough).toFixed(3)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x + nx * o, a.y + ny * o);
              ctx.lineTo(b.x + nx * o, b.y + ny * o);
              ctx.stroke();
            }
          }
        }
      });
      // A hole's rim: its faces seen whole, standing edge-on round it.
      ctx.globalCompositeOperation = "lighter";
      for (const s of broken.shards) {
        if (!s.missing) continue;
        ctx.strokeStyle = "rgb(206 236 226 / 0.5)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      /*
       * ---- The pieces knocked out, falling ----
       *
       * Each drops from where it was, as its own photographed piece of glass:
       * pushed back and aside by the blow, turning, falling away from you
       * (a little smaller as it goes) and out of sight.
       */
      const t = (performance.now() - struckAt) / 1000;
      if (t * 1000 < FALL_MS && shardPhotos.length) {
        let k = 0;
        for (const s of broken.shards) {
          if (!s.missing) continue;
          const box = boxOf(s.poly);
          const vx = (hash(seed, 1200 + k) - 0.5) * 120;
          const vy = -30 + hash(seed, 1300 + k) * 50;
          const spin = (hash(seed, 1400 + k) - 0.5) * 6;
          const dx = vx * t;
          const dy = vy * t + 0.5 * 1800 * t * t;
          const shrink = 1 - 0.15 * Math.min(1, t / 1.1);
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - (t * 1000) / FALL_MS);
          ctx.translate(box.cx + dx, box.cy + dy);
          ctx.rotate(spin * t);
          ctx.scale(shrink, shrink);
          ctx.translate(-box.cx, -box.cy);
          ctx.beginPath();
          s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          if (s.photo) {
            // It is a photographed piece: drawn whole, as it was photographed.
            const { img, turn, size, at: c0 } = s.photo;
            const k2 = size / Math.max(img.naturalWidth, img.naturalHeight, 1);
            ctx.save();
            ctx.translate(c0.x, c0.y);
            ctx.rotate(turn);
            ctx.drawImage(
              img,
              (-img.naturalWidth * k2) / 2,
              (-img.naturalHeight * k2) / 2,
              img.naturalWidth * k2,
              img.naturalHeight * k2,
            );
            ctx.restore();
          } else {
            ctx.save();
            ctx.clip();
            // The glass of it: frosted as the pane was, and its own photographed glass.
            ctx.fillStyle = "rgb(214 232 228 / 0.18)";
            ctx.fillRect(box.x, box.y, box.w, box.h);
            wearGlass(shardPhotos[(k + 5) % shardPhotos.length]!, box, 1500 + k, 0.9);
            ctx.restore();
            ctx.strokeStyle = "rgb(206 236 226 / 0.7)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
          ctx.restore();
          k++;
        }
        frame = requestAnimationFrame(draw);
      }
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const stop = onLightChange(wake);
    const observer = new ResizeObserver(wake);
    observer.observe(canvas);
    window.addEventListener("scroll", wake, { passive: true });
    wake();
    // The photograph may arrive after the first draw.
    const late = window.setTimeout(wake, 1500);
    return () => {
      disposed = true;
      if (pane) clearShardMap(pane);
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      stop();
      observer.disconnect();
      window.removeEventListener("scroll", wake);
    };
  }, [kind, energy, at.x, at.y, seed]);

  return (
    <canvas
      ref={view}
      aria-hidden="true"
      data-broken-glass={kind}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        pointerEvents: "none",
        // Over the pane's own glass, under what stands on it.
        zIndex: -1,
      }}
    />
  );
}
