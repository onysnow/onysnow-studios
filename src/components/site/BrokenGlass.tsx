import { useEffect, useRef } from "react";
import { fracture, type Crack, type GlassKind, type Pt } from "@/effects/optics/fracture";
import { cursorLamp, onLightChange } from "@/effects/light/lights";
import { viewState } from "@/effects/scene/scene";
import { camera } from "@/effects/camera/camera";

/** The frost the panes' backdrop is blurred by, px (styles.css .glass: blur(30px)). */
const FROST_BLUR = 30;
/** How far past the pane the frosted copy reaches, px: room for the shards' slip. */
const MARGIN = 24;
/** The pane's thickness, px: a crack face is this tall. */
const THICKNESS = 18;
/** How far the light piped along the pane reaches before it is spent (glass shader: exp(-d/780)). */
const PIPED_REACH = 780;
/** Glass's critical angle, n = 1.518: past this from a crack face's normal, the face is a mirror. */
const CRITICAL = Math.asin(1 / 1.518);

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

/** Glass's index: a crack face seen through the pane lies at 1/n of its depth. */
const N_GLASS = 1.518;

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
 *     glow near the lamp;
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
    let broken: ReturnType<typeof fracture> | null = null;
    let brokeFor = "";
    let frame = 0;
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
      if (key !== brokeFor) {
        broken = fracture({ w, h, at: { x: at.x * w, y: at.y * h }, energy, kind, seed });
        brokeFor = key;
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
        const path = (poly: readonly Pt[]) => {
          ctx.beginPath();
          poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
        };
        for (const s of broken.shards) {
          ctx.save();
          path(s.poly);
          ctx.clip();
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
          }
          ctx.restore();
        }
      }

      // ---- The crushed spot: pulverised glass, white, crazed with tiny cracks. ----
      const ix = broken.impact.x;
      const iy = broken.impact.y;
      const crushed = broken.shards.find((s) => s.crushed);
      if (crushed && !crushed.missing) {
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
      if (!crushed?.missing && broken.crush > 0) {
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
      const lamp = cursorLamp;
      const lampOn = lamp.charge;
      const eye = {
        x: document.documentElement.clientWidth / 2 + viewState.eyeX - rect.left,
        y: document.documentElement.clientHeight / 2 + viewState.eyeY - rect.top,
        z: camera.distance(document.documentElement.clientWidth),
      };
      const L = { x: lamp.x - rect.left, y: lamp.y - rect.top, z: lamp.height };
      const depth = THICKNESS / N_GLASS;
      const roughReach = broken.crush * 4 + 10;
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
          // Light from the lamp into the glass (it steepens, n = 1.518).
          const tl = { x: mx - L.x, y: my - L.y, z: -L.z };
          const tll = Math.hypot(tl.x, tl.y, tl.z) || 1;
          const horiz = Math.hypot(tl.x, tl.y) || 1;
          const sinIn = horiz / tll / N_GLASS;
          const inGlass = {
            x: (tl.x / horiz) * sinIn,
            y: (tl.y / horiz) * sinIn,
            z: -Math.sqrt(1 - sinIn * sinIn),
          };
          const d = inGlass.x * fn.x + inGlass.y * fn.y + inGlass.z * fn.z;
          const incidence = Math.acos(Math.min(1, Math.abs(d)));
          // Past the critical angle the air gap is a perfect mirror; short of it, the Fresnel share.
          const mirror = incidence > CRITICAL ? 1 : 0.08 + 0.3 * Math.pow(incidence / CRITICAL, 6);
          const out = {
            x: inGlass.x - 2 * d * fn.x,
            y: inGlass.y - 2 * d * fn.y,
            z: inGlass.z - 2 * d * fn.z,
          };
          const te = { x: eye.x - mx, y: eye.y - my, z: eye.z };
          const tel = Math.hypot(te.x, te.y, te.z) || 1;
          let flash = 0;
          if (out.z > 0) {
            const outH = Math.hypot(out.x, out.y) || 1;
            const sinOut = Math.min(1, (outH / Math.hypot(out.x, out.y, out.z)) * N_GLASS);
            const leave = {
              x: (out.x / outH) * sinOut,
              y: (out.y / outH) * sinOut,
              z: Math.sqrt(1 - sinOut * sinOut),
            };
            const aligned = Math.max(0, (leave.x * te.x + leave.y * te.y + leave.z * te.z) / tel);
            flash = mirror * Math.pow(aligned, 60 - 50 * rough) * lampOn;
          }
          // Light piped along the pane escapes at the crack, brighter near the lamp.
          const piped = lampOn * Math.exp(-Math.hypot(mx - L.x, my - L.y) / PIPED_REACH) * 0.12;
          /*
           * The room: a fracture face is a new, clean mirror, and seen at a
           * slant it shows the lit room and the light through the pane --
           * which is why a crack reads as a bright line in daylight. The
           * wider the ribbon, the more of it you see; mist and hackle
           * scatter it white.
           */
          const room = 0.32 + 0.08 * Math.min(1, Math.abs(wide) / 3) + 0.3 * rough;
          const lit = Math.min(1, room + flash * 1.4 + piped);

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
          const col = `${Math.round(fr + (255 - fr) * white)} ${Math.round(fg + (255 - fg) * white)} ${Math.round(fb + (255 - fb) * white)}`;
          if (Math.abs(wide) > 0.6) {
            ctx.fillStyle = `rgb(${col} / ${(lit * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.lineTo(a.x + ox, a.y + oy);
            ctx.closePath();
            ctx.fill();
          }
          // Its far edge, where the face meets the pane's surface, catches the most.
          ctx.strokeStyle = `rgb(${col} / ${lit.toFixed(3)})`;
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
