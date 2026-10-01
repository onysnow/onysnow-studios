import { experimentsAllowed } from "@/lib/admin-gate";
import { useEffect, useRef } from "react";
import { glassGeometry } from "@/effects/scene/scene";
import { traceBeam, type BeamHit, type BeamPane, type Vec } from "@/effects/optics/beam";
import { indexAt, wavelengthRgb } from "@/effects/optics/dispersion";
import { beamSolids } from "@/effects/scene/beam-solids";
import {
  LASER_COLOURS,
  LASER_WAVELENGTH,
  addEmitter,
  emitterChanged,
  makeEmitter,
  onLightChange,
  pointer,
  type LaserColour,
} from "@/effects/light/lights";

/**
 * How many CSS px one unit of the material's absorption path is. The
 * absorption was measured looking along a pane's side (effects/optics/
 * edge-side), a path of about one unit through a pane of a band's size, so
 * a unit is taken as 1000 px. It is what makes a red beam fade inside a long
 * pane and a green one carry: float glass's iron takes red most.
 */
const PATH_UNIT = 1000;

/**
 * How strongly a spot the beam strikes lights what is round it, as a share
 * of the lamp. A laser pointer's whole output is a few milliwatts -- a
 * thousandth of a lamp's -- so though its spot is dazzling to look at, the
 * light it throws on its surroundings is small: only the glass right by it
 * catches it, on its rims.
 */
const SPOT_SHARE = 0.05;
/**
 * Where the spot's light stands, px above the glass: the struck edge is the
 * pane's own thickness tall, and its scattered light leaves the whole of it.
 */
const SPOT_HEIGHT = 18;

/** How visible the beam is along its path: faint haze in the air; glass scatters, frost far more. */
const AIR_SCATTER = 0.35;
const GLASS_SCATTER = 0.7;
const FROST_SCATTER = 1.4;

/** The laser's colour from the address (?laser=green), red if none or unknown. */
function laserColourFromUrl(): LaserColour {
  if (typeof window === "undefined" || !experimentsAllowed()) return "red";
  const asked = new URLSearchParams(window.location.search).get("laser");
  return asked && asked in LASER_COLOURS ? (asked as LaserColour) : "red";
}

/**
 * A laser pointer's beam crossing the page (item 24, redone as 25d,
 * ?try=laser&laser=red|green|violet).
 *
 * The beam runs in the plane of the glass, so it meets the panes at their
 * edges -- their side faces -- and everything after that is the beam tracer's
 * physics (effects/optics/beam): it bends going in by Snell at the index for
 * its own wavelength, sends a weaker reflection off every surface, is guided
 * along a pane by total internal reflection when it meets an edge steeply
 * from inside, is absorbed along its path at the glass's measured absorption
 * for its colour, and leaves displaced. Where it strikes a surface the spot
 * glows, and the two brightest spots are lights in the scene, so the glass
 * there catches them on its rims.
 *
 * Held in the hand: the laser is where the pointer is, keeping its aim. Press
 * and drag to aim it -- it stays where you pressed and points toward the
 * pointer while you drag.
 */
export function LaserBeam() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const view = canvas.current;
    const ctx = view?.getContext("2d");
    if (!view || !ctx) return;
    const colour = laserColourFromUrl();
    const rgb = LASER_COLOURS[colour];
    /*
     * The lines the beam carries. A laser is one wavelength. A white
     * (supercontinuum) laser is all of them: traced as seven across the
     * spectrum, each bent by the glass's index at its own wavelength, so
     * where they part -- in a prism -- the spectrum shows.
     */
    const lines =
      colour === "white"
        ? [410, 450, 490, 530, 570, 610, 650].map((nm) => ({
            nm,
            rgb: wavelengthRgb(nm),
            share: 2.2 / 7,
          }))
        : [{ nm: LASER_WAVELENGTH[colour], rgb: [...rgb] as [number, number, number], share: 1 }];
    const cssOf = (c: readonly number[], a: number) =>
      `rgb(${Math.round(c[0]! * 255)} ${Math.round(c[1]! * 255)} ${Math.round(c[2]! * 255)} / ${Math.max(0, a).toFixed(3)})`;
    const css = (a: number) => cssOf(rgb, a);

    let aimFrom: Vec | null = null;
    let direction: Vec = { x: 1, y: 0.18 };
    const spots = [0, 1].map((i) =>
      makeEmitter(`laser-spot-${i}`, rgb, SPOT_HEIGHT, () => 2, SPOT_SHARE),
    );
    const removers = spots.map((s) => addEmitter(s));

    let frame = 0;
    const draw = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      const w = document.documentElement.clientWidth;
      const h = document.documentElement.clientHeight;
      if (view.width !== Math.round(w * dpr) || view.height !== Math.round(h * dpr)) {
        view.width = Math.round(w * dpr);
        view.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const held = pointer.x > -9999;
      if (!held) {
        for (const s of spots) s.charge = 0;
        emitterChanged();
        return;
      }
      const origin = aimFrom ?? { x: pointer.x, y: pointer.y };
      const geometry = glassGeometry();
      const solids = beamSolids();
      const frosts = [
        ...geometry.map((g) => g.causes.material.frost),
        ...solids.map((s) => s.material.frost),
      ];
      const hits: BeamHit[] = [];
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const line of lines) {
        // What absorbs this wavelength: the glass's measured absorption, weighted by its colour.
        const weight = line.rgb[0] + line.rgb[1] + line.rgb[2] || 1;
        const absorbOf = (a: readonly [number, number, number]) =>
          (a[0] * line.rgb[0] + a[1] * line.rgb[1] + a[2] * line.rgb[2]) / weight / PATH_UNIT;
        const panes: BeamPane[] = [
          ...geometry.map((g) => ({
            x: g.x,
            y: g.y,
            w: g.w,
            h: g.h,
            r: g.r,
            n: indexAt(line.nm, g.causes.material.ior, g.causes.material.abbe),
            absorb: absorbOf(g.causes.material.absorb),
          })),
          ...solids.map((s) => {
            const poly = s.outline();
            const xs = poly.map((p) => p.x);
            const ys = poly.map((p) => p.y);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            return {
              x,
              y,
              w: Math.max(...xs) - x,
              h: Math.max(...ys) - y,
              r: 0,
              n: indexAt(line.nm, s.material.ior, s.material.abbe),
              absorb: absorbOf(s.material.absorb),
              poly,
            };
          }),
        ];
        const traced = traceBeam(origin, direction, panes, { maxLength: 3000 });
        for (const hit of traced.hits) hits.push({ ...hit, energy: hit.energy * line.share });
        for (const s of traced.segments) {
          const vis =
            s.inside >= 0 ? GLASS_SCATTER + FROST_SCATTER * (frosts[s.inside] ?? 0) : AIR_SCATTER;
          const grad = ctx.createLinearGradient(s.a.x, s.a.y, s.b.x, s.b.y);
          grad.addColorStop(0, cssOf(line.rgb, Math.min(1, s.energy * vis * line.share)));
          grad.addColorStop(1, cssOf(line.rgb, Math.min(1, s.energyEnd * vis * line.share)));
          // The glow the scattered light makes round the beam...
          ctx.strokeStyle = grad;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = s.inside >= 0 ? 9 : 5;
          ctx.beginPath();
          ctx.moveTo(s.a.x, s.a.y);
          ctx.lineTo(s.b.x, s.b.y);
          ctx.stroke();
          // ...and the beam itself, a thread.
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      // Where it strikes a surface, the surface lights up.
      for (const hit of hits) {
        const r = 4 + 16 * hit.energy;
        const g = ctx.createRadialGradient(hit.at.x, hit.at.y, 0, hit.at.x, hit.at.y, r);
        g.addColorStop(0, `rgb(255 255 255 / ${Math.min(1, hit.energy * 0.9).toFixed(3)})`);
        g.addColorStop(0.25, css(Math.min(1, hit.energy)));
        g.addColorStop(1, css(0));
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.fillRect(hit.at.x - r, hit.at.y - r, r * 2, r * 2);
      }
      // The laser's aperture.
      const ap = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 7);
      ap.addColorStop(0, "rgb(255 255 255 / 0.95)");
      ap.addColorStop(0.35, css(0.9));
      ap.addColorStop(1, css(0));
      ctx.fillStyle = ap;
      ctx.fillRect(origin.x - 7, origin.y - 7, 14, 14);
      ctx.globalCompositeOperation = "source-over";

      // The two brightest spots light the scene.
      const brightest = [...hits].sort((a, b) => b.energy - a.energy).slice(0, spots.length);
      spots.forEach((s, i) => {
        const hit = brightest[i];
        s.charge = hit ? 1 : 0;
        if (hit) {
          s.x = hit.at.x;
          s.y = hit.at.y;
          s.level = hit.energy;
        }
      });
      emitterChanged();
    };
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const down = (e: PointerEvent) => {
      // Picking another tool from the tray is not aiming this one.
      if (e.target instanceof Element && e.target.closest("[data-tool-tray]")) return;
      aimFrom = { x: e.clientX, y: e.clientY };
      redraw();
    };
    const move = (e: PointerEvent) => {
      if (aimFrom) {
        const dx = e.clientX - aimFrom.x;
        const dy = e.clientY - aimFrom.y;
        if (Math.hypot(dx, dy) > 8) direction = { x: dx, y: dy };
      }
      redraw();
    };
    const up = () => {
      aimFrom = null;
      redraw();
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", redraw);
    const stop = onLightChange(redraw);
    redraw();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("scroll", redraw);
      window.removeEventListener("resize", redraw);
      stop();
      for (const remove of removers) remove();
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" className="laser-beam" />;
}
