/**
 * The CSS adapter (light-system design, step C).
 *
 * Stylesheets cannot read the light list, so what the CSS layers need of it
 * -- where the lamp stands relative to a pane or a surface, the shadow it
 * throws, how big its bright core is -- is written here as custom
 * properties, and ONLY here: a static test (adapters.test.ts) fails if any
 * other file writes a light variable. The scene decides WHEN (its write
 * phase, once a frame, after every read); this decides WHAT, from the lights.
 *
 * Nothing about the numbers changed when this moved out of the scene: the
 * same values, the same formatting, the same order.
 */

import type { Light } from "@/effects/light/lights";

/** How the lamp falls on one surface resting on the glass (worked out by the scene). */
export type SurfaceLight = {
  near: number;
  cast: { x: number; y: number; blur: number; model?: import("@/effects/optics/shadow").Shadow };
  alpha: number;
  lit: number;
  angle: number;
};

type Box = { left: number; top: number; width: number; height: number };

/** Where the viewer's lamp is, as a fraction of the viewport from its centre. */
export function writeLightView(
  root: CSSStyleDeclaration,
  lamp: Light,
  viewportWidth: number,
  viewportHeight: number,
) {
  root.setProperty("--reflect-x", (lamp.x / viewportWidth - 0.5).toFixed(3));
  root.setProperty("--reflect-y", (lamp.y / viewportHeight - 0.5).toFixed(3));
}

/** A pane: how near the lamp is (eased), and where it stands in the pane's own coordinates. */
export function writePaneLight(el: HTMLElement, r: Box, lamp: Light, glowOn: number) {
  el.style.setProperty("--glow-on", glowOn.toFixed(3));
  el.style.setProperty("--lit-x", `${Math.round(lamp.x - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(lamp.y - r.top)}px`);
}

/** A surface resting on the glass: the light on it and the shadow it throws. */
export function writeSurfaceLight(el: HTMLElement, r: Box, lamp: Light, light: SurfaceLight) {
  el.style.setProperty("--lit-x", `${Math.round(lamp.x - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(lamp.y - r.top)}px`);
  el.style.setProperty("--lit-near", light.near.toFixed(3));
  el.style.setProperty("--cast-x", `${light.cast.x.toFixed(1)}px`);
  el.style.setProperty("--cast-y", `${light.cast.y.toFixed(1)}px`);
  el.style.setProperty("--cast-blur", `${light.cast.blur.toFixed(1)}px`);
  /*
   * With the shadow model (previewing), how much bigger than the thing its
   * shadow is: a box-shadow spread, the mean of the two growths.
   */
  const model = light.cast.model;
  if (model) {
    const spread = ((model.scale - 1) * (r.width + r.height)) / 4;
    el.style.setProperty("--cast-spread", `${spread.toFixed(1)}px`);
    el.style.setProperty("--cast-scale", model.scale.toFixed(4));
  }
  el.style.setProperty("--cast-alpha", light.alpha.toFixed(3));
  el.style.setProperty("--lit-on", light.lit.toFixed(3));
  // The lamp's bright core, whose mirror image a glossy surface shows: the
  // emitter's radius less its glow, about two fifths of its size.
  el.style.setProperty("--lamp-core", `${(lamp.radius * 0.35).toFixed(1)}px`);
  el.style.setProperty("--lit-angle", `${light.angle.toFixed(1)}deg`);
  el.style.setProperty("--lit-over", litOver(r, lamp).toFixed(3));
  // How much ultraviolet reaches it (a black light, ?try=blacklight): what fluoresces glows by this.
  el.style.setProperty("--uv-on", (light.near * light.lit * lamp.uv).toFixed(3));
}

/**
 * How squarely the lamp is over a surface, 0 to 1: 1 with the lamp's centre
 * on it, falling to 0 as the lamp moves off it by half the lamp's radius. A
 * glossy sheet (the plastic) shows the lamp only when the lamp is over it --
 * its face is a mirror seen straight on, and a mirror shows what is in front
 * of it, not what is beside it.
 */
export function litOver(r: Box, lamp: Pick<Light, "x" | "y" | "radius">): number {
  const dx = Math.max(r.left - lamp.x, 0, lamp.x - (r.left + r.width));
  const dy = Math.max(r.top - lamp.y, 0, lamp.y - (r.top + r.height));
  const reach = Math.max(lamp.radius * 0.5, 8);
  const t = Math.min(1, Math.hypot(dx, dy) / reach);
  return 1 - t * t * (3 - 2 * t);
}
