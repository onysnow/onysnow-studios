import { useEffect, useRef } from "react";
import { lightState } from "@/lib/edge-glow";
import { t } from "@/lib/tuning";

/**
 * What the glass and the things on it block.
 *
 * The content rides ON the pane and the photograph is BEHIND it, so light
 * reaching the picture has to get past both — past the cards and headings
 * first, then through whatever grime is on the glass. Neither is transparent,
 * so both throw something onto the photograph.
 *
 * This has to live between the photograph and the glass, not inside the pane.
 * `.glass` carries a backdrop-filter and therefore forms its own stacking
 * context, so a `multiply` layer inside it would blend against the pane's own
 * tint and never touch the picture. Sitting underneath instead means the glass
 * blurs the shadow on its way to your eye, which is what should happen to a
 * shadow seen through frosted glass.
 *
 * The geometry is a point light, which is the whole reason it reads as light
 * rather than as a drop-shadow preset:
 *
 *   offset   = gap * lateral / height      the projection
 *   penumbra = lightRadius * gap / dist    the umbra's soft border
 *
 * So the shadow stretches as the light moves off to one side, and SHARPENS as
 * the light retreats — a distant source casts crisp shadows, a close one casts
 * big soft ones. Getting that backwards is the single tell of a faked shadow,
 * and most of the recipes going around do get it backwards: they grow the blur
 * with distance from the light, when penumbra width is the light's size times
 * the gap DIVIDED by its distance.
 */

/** Depth from the content down to the photograph, in CSS pixels. */
const _GAP_DEFAULT = 22;
/** Grime sits on the glass, so it is nearer the picture than the content is. */
const GRIME_GAP = 13;
/** How far the light floats above the page. Smaller = more dramatic throw. */
const _HEIGHT_DEFAULT = 300;
/** The emitter's radius. This is what gives the penumbra its width. */
const _LIGHT_RADIUS_DEFAULT = 46;
/** Beyond this the light contributes nothing and the canvas stays clear. */
const REACH = 900;

export function CastShadows() {
  const hostRef = useRef<HTMLCanvasElement>(null);
  const causticRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = hostRef.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const ctx = canvas.getContext("2d");
    const caustic = causticRef.current;
    const cctx = caustic?.getContext("2d");
    if (!ctx || !caustic || !cctx) return;
    const section = canvas.parentElement;
    if (!section) return;

    // The grime map, fetched only once anything is actually lit.
    const grime = new Image();
    let grimeReady = false;
    let grimeAsked = false;
    grime.onload = () => {
      grimeReady = true;
    };

    let frame = 0;
    let wasLit = false;

    const render = () => {
      frame = requestAnimationFrame(render);
      const { x: lx, y: ly, charge } = lightState;

      if (charge <= 0.02) {
        if (wasLit) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          cctx.clearRect(0, 0, caustic.width, caustic.height);
          canvas.style.opacity = "0";
          caustic.style.opacity = "0";
          wasLit = false;
        }
        return;
      }

      const GAP = t("shadowGap");
      const HEIGHT = t("shadowHeight");
      const LIGHT_RADIUS = t("shadowSoftness");
      const box = section.getBoundingClientRect();
      // Nothing to do for a section that is not on screen.
      if (box.bottom < -REACH || box.top > window.innerHeight + REACH) return;

      if (!wasLit) {
        if (!grimeAsked) {
          grimeAsked = true;
          grime.src = "/glass-surface.jpg";
        }
        canvas.style.opacity = "1";
        caustic.style.opacity = "1";
        wasLit = true;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(box.width * dpr));
      const h = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (caustic.width !== w || caustic.height !== h) {
        caustic.width = w;
        caustic.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.clearRect(0, 0, box.width, box.height);

      // Light position in the section's own coordinates.
      const lightX = lx - box.left;
      const lightY = ly - box.top;

      /* ---- Grime on the glass, printed onto the picture ---- */
      if (grimeReady) {
        const gOffX = ((box.width / 2 - lightX) * GRIME_GAP) / HEIGHT;
        const gOffY = ((box.height / 2 - lightY) * GRIME_GAP) / HEIGHT;
        const gDist = Math.hypot(box.width / 2 - lightX, box.height / 2 - lightY, HEIGHT);
        ctx.save();
        // Only where light is actually getting through: a dirty pane prints its
        // dirt on what is behind it, but only in the beam.
        const beam = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, REACH * 0.55);
        beam.addColorStop(0, `rgba(0,0,0,${(0.5 * charge).toFixed(3)})`);
        beam.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 1;
        ctx.filter = `blur(${((LIGHT_RADIUS * GRIME_GAP) / gDist).toFixed(2)}px)`;
        ctx.drawImage(grime, gOffX, gOffY, box.width, box.height);
        // Keep only the part of the grime that sits in the beam.
        ctx.filter = "none";
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = beam;
        ctx.fillRect(0, 0, box.width, box.height);
        ctx.restore();

        /*
         * ---- And the light play, which is the other half of it ----
         *
         * Grime is not only opaque. A scratch is a groove in the surface, so
         * it refracts rather than blocks: it gathers the light crossing it and
         * throws it back out concentrated, which is why a scratched pane in
         * sunlight prints bright filaments as well as dark smears. Dirt
         * subtracts, scratches ADD, and a layer that can only multiply can
         * only ever tell half the story.
         *
         * Isolated by crushing the midtones -- brightness and contrast on the
         * same map leave the scratch highlights and drop the general grime, so
         * one texture serves both passes. Thrown slightly further than the
         * shadow, because a refracted ray bends away from the straight path
         * the blocked light would have taken.
         */
        cctx.save();
        cctx.filter = `blur(${((LIGHT_RADIUS * GRIME_GAP) / gDist / 1.6).toFixed(2)}px) brightness(2.3) contrast(3.6) saturate(1.3)`;
        cctx.drawImage(grime, gOffX * 1.45, gOffY * 1.45, box.width, box.height);
        cctx.filter = "none";
        cctx.globalCompositeOperation = "destination-in";
        const beamC = cctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, REACH * 0.42);
        beamC.addColorStop(0, `rgba(0,0,0,${(t("causticStrength") * charge * charge).toFixed(3)})`);
        beamC.addColorStop(1, "rgba(0,0,0,0)");
        cctx.fillStyle = beamC;
        cctx.fillRect(0, 0, box.width, box.height);
        cctx.restore();
      }

      /* ---- The things sitting on the glass ---- */
      const blockers = section.querySelectorAll<HTMLElement>("[data-cast]");
      ctx.save();
      ctx.fillStyle = "#000";
      for (const el of blockers) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - box.left;
        const cy = r.top + r.height / 2 - box.top;
        const dx = cx - lightX;
        const dy = cy - lightY;
        const dist = Math.hypot(dx, dy, HEIGHT);
        if (dist > REACH) continue;

        // Projection, and the penumbra that shrinks as the light retreats.
        const offX = (dx * GAP) / HEIGHT;
        const offY = (dy * GAP) / HEIGHT;
        const penumbra = (LIGHT_RADIUS * GAP) / dist;
        const fade = Math.max(0, 1 - dist / REACH);

        ctx.filter = `blur(${Math.max(0.5, penumbra).toFixed(2)}px)`;
        ctx.globalAlpha = t("shadowStrength") * fade * fade * charge;
        ctx.fillRect(r.left - box.left + offX, r.top - box.top + offY, r.width, r.height);
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <canvas ref={hostRef} aria-hidden="true" className="cast-shadows" />
      <canvas ref={causticRef} aria-hidden="true" className="cast-caustics" />
    </>
  );
}
