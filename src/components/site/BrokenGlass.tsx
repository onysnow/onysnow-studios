import { useEffect, useRef } from "react";
import { fracture, type GlassKind, type Pt, type Shard } from "@/effects/optics/fracture";
import { cursorLamp, onLightChange } from "@/effects/light/lights";
import { viewState } from "@/effects/scene/scene";
import { camera } from "@/effects/camera/camera";

/** The frost the panes' backdrop is blurred by, px (styles.css .glass: blur(30px)). */
const FROST_BLUR = 30;
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

/** The inner cracks: every shard edge that is not on the pane's own border. */
function crackEdges(shards: readonly Shard[], w: number, h: number) {
  const edges: { a: Pt; b: Pt; reach: number }[] = [];
  const onBorder = (p: Pt, q: Pt) =>
    (Math.abs(p.x) < 0.5 && Math.abs(q.x) < 0.5) ||
    (Math.abs(p.y) < 0.5 && Math.abs(q.y) < 0.5) ||
    (Math.abs(p.x - w) < 0.5 && Math.abs(q.x - w) < 0.5) ||
    (Math.abs(p.y - h) < 0.5 && Math.abs(q.y - h) < 0.5);
  for (const s of shards) {
    for (let i = 0; i < s.poly.length; i++) {
      const a = s.poly[i]!;
      const b = s.poly[(i + 1) % s.poly.length]!;
      if (onBorder(a, b) || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
      edges.push({ a, b, reach: s.reach });
    }
  }
  return edges;
}

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
      if (img) {
        const r = img.getBoundingClientRect();
        // object-fit: cover, centred: which part of the file is drawn where.
        const ia = img.naturalWidth / Math.max(img.naturalHeight, 1);
        const ea = r.width / Math.max(r.height, 1);
        const sw = ia > ea ? img.naturalHeight * ea : img.naturalWidth;
        const sh = ia > ea ? img.naturalHeight : img.naturalWidth / ea;
        const sx = (img.naturalWidth - sw) / 2;
        const sy = (img.naturalHeight - sh) / 2;
        ctx.filter = `blur(${FROST_BLUR * 0.6}px)`;
        for (const s of broken.shards) {
          ctx.save();
          ctx.beginPath();
          s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
          ctx.clip();
          /*
           * Tilted, the shard sees the photograph behind shifted by the gap
           * times the slope (about the pane's own gap to the photograph, a
           * few dozen px), and slipped by its slip.
           */
          const gap = 70;
          ctx.translate(s.slip.x + Math.tan(s.tiltY) * gap, s.slip.y + Math.tan(s.tiltX) * gap);
          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            r.left - rect.left,
            r.top - rect.top,
            r.width,
            r.height,
          );
          ctx.restore();
        }
        ctx.filter = "none";
        // The pane's own frosting over it, as the pane has.
        ctx.fillStyle = "rgb(255 255 255 / 0.06)";
        ctx.fillRect(0, 0, w, h);
      }

      // ---- The cracks: mirrors across the pane, lit as the lamp and your eye line up. ----
      const lamp = cursorLamp;
      const lampOn = lamp.charge;
      const eye = {
        x: document.documentElement.clientWidth / 2 + viewState.eyeX - rect.left,
        y: document.documentElement.clientHeight / 2 + viewState.eyeY - rect.top,
        z: camera.distance(document.documentElement.clientWidth),
      };
      const L = { x: lamp.x - rect.left, y: lamp.y - rect.top, z: lamp.height };
      ctx.lineCap = "round";
      for (const e of crackEdges(broken.shards, w, h)) {
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2;
        const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        // The crack face stands across the pane; its normal lies in the pane's plane.
        const nx = -(e.b.y - e.a.y) / len;
        const ny = (e.b.x - e.a.x) / len;
        // Light from the lamp to the face, refracted into the glass (it steepens, n = 1.518).
        const tl = { x: mx - L.x, y: my - L.y, z: -L.z };
        const tll = Math.hypot(tl.x, tl.y, tl.z) || 1;
        const sinIn = Math.hypot(tl.x, tl.y) / tll / 1.518;
        const horiz = Math.hypot(tl.x, tl.y) || 1;
        const inGlass = {
          x: (tl.x / horiz) * sinIn,
          y: (tl.y / horiz) * sinIn,
          z: -Math.sqrt(1 - sinIn * sinIn),
        };
        // Angle it meets the face at, from the face's normal.
        const cosFace = Math.abs(inGlass.x * nx + inGlass.y * ny);
        const incidence = Math.acos(Math.min(1, cosFace));
        // Past the critical angle the gap is a perfect mirror; short of it, only the Fresnel share.
        const mirror = incidence > CRITICAL ? 1 : 0.08 + 0.3 * Math.pow(incidence / CRITICAL, 6);
        // Reflected off the face: the across-face part flips.
        const d = inGlass.x * nx + inGlass.y * ny;
        const out = { x: inGlass.x - 2 * d * nx, y: inGlass.y - 2 * d * ny, z: -inGlass.z };
        // Leaving the front face it bends back out; toward the eye?
        const te = { x: eye.x - mx, y: eye.y - my, z: eye.z };
        const tel = Math.hypot(te.x, te.y, te.z) || 1;
        const outH = Math.hypot(out.x, out.y) || 1;
        const sinOut = Math.min(1, outH * 1.518);
        const leave = {
          x: (out.x / outH) * sinOut,
          y: (out.y / outH) * sinOut,
          z: Math.sqrt(1 - sinOut * sinOut),
        };
        // Near the impact the face is mist and hackle: rough, so its reflection spreads wide.
        const rough = Math.exp(-e.reach * 8);
        const lobe = 60 - 50 * rough;
        const aligned = Math.max(0, (leave.x * te.x + leave.y * te.y + leave.z * te.z) / tel);
        const flash = mirror * Math.pow(aligned, lobe) * lampOn;
        // Light piped along the pane escapes here, brighter near the lamp.
        const piped = lampOn * Math.exp(-Math.hypot(mx - L.x, my - L.y) / PIPED_REACH) * 0.12;

        // The crack itself: the gap scatters light out of your view, a thin dark line...
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgb(0 0 0 / ${(0.35 + 0.2 * rough).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 1.4 * rough;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
        // ...and the face catching light: the silver flash, the piped glow, the mist's white.
        const lit = Math.min(1, flash * 1.4 + piped + 0.18 * rough);
        if (lit > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          const offset = THICKNESS * 0.04;
          if (rough > 0.3) {
            // A chipped, rough face splits the light into colour, a hair apart.
            for (const [c, o] of [
              ["255 80 60", -offset],
              ["60 120 255", offset],
            ] as const) {
              ctx.strokeStyle = `rgb(${c} / ${(lit * 0.35 * rough).toFixed(3)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(e.a.x + nx * o, e.a.y + ny * o);
              ctx.lineTo(e.b.x + nx * o, e.b.y + ny * o);
              ctx.stroke();
            }
          }
          ctx.strokeStyle = `rgb(245 248 255 / ${lit.toFixed(3)})`;
          ctx.lineWidth = 0.6 + rough;
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y);
          ctx.lineTo(e.b.x, e.b.y);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // ---- The impact: a crushed star of tiny cracks in a frosted spot. ----
      const ix = at.x * w;
      const iy = at.y * h;
      const crush = 10 + 18 * energy;
      const frostSpot = ctx.createRadialGradient(ix, iy, 0, ix, iy, crush);
      frostSpot.addColorStop(0, "rgb(255 255 255 / 0.55)");
      frostSpot.addColorStop(1, "rgb(255 255 255 / 0)");
      ctx.fillStyle = frostSpot;
      ctx.fillRect(ix - crush, iy - crush, crush * 2, crush * 2);
      ctx.strokeStyle = "rgb(255 255 255 / 0.5)";
      ctx.lineWidth = 0.6;
      for (let k = 0; k < 60; k++) {
        const a = (k * 2.39996) % (Math.PI * 2);
        const r0 = (crush * 0.2 * ((k * 7) % 5)) / 5;
        const r1 = r0 + crush * (0.3 + ((k * 13) % 7) / 10);
        ctx.beginPath();
        ctx.moveTo(ix + r0 * Math.cos(a), iy + r0 * Math.sin(a));
        ctx.lineTo(ix + r1 * Math.cos(a + 0.2), iy + r1 * Math.sin(a + 0.2));
        ctx.stroke();
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
