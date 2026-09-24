/**
 * Live tuning for the effect layer.
 *
 * Every number in the glass and light system was arrived at by someone
 * describing a screenshot in words and someone else changing a constant. That
 * loop is slow and it is wrong often. These are the same constants, exposed.
 *
 * Deliberately a plain mutable object rather than React state: the shaders and
 * the canvases read it from inside their own rAF loops, sixty times a second,
 * and routing that through a re-render would cost more than the effects do.
 * The panel writes, the loops read, nothing subscribes.
 *
 * CSS-side values are mirrored onto the document element as custom properties
 * by `applyTuning`, because stylesheets cannot read a JS object.
 */

import { getGlassMode, onGlassMode } from "./glass-mode";

export type Knob = {
  label: string;
  group: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Written to the document element as a custom property, with this suffix. */
  cssVar?: string;
  cssUnit?: string;
  /**
   * Written into each pane's `data-config` for the rasterised glass.
   *
   * That library watches the attribute with a MutationObserver and re-reads
   * its configuration when it changes, so this is a live sink exactly like
   * `cssVar` is -- no re-init, no reload.
   *
   * `"band"` and `"bar"` scope a value to the section panes or the fixed
   * header respectively; anything else applies to both.
   */
  glassKey?: string;
  glassScope?: "band" | "bar";
  /**
   * The glass mode this knob has a visible effect in.
   *
   * Omitted means both. `"raster"` means it feeds ybouane's shader and does
   * nothing at all in CSS mode.
   *
   * Declared rather than inferred from `glassKey` because the inverse is not
   * true and it would be a lie to imply it: the CSS-side knobs are NOT dead
   * in raster mode. Only the section bands are rasterised -- the fixed header
   * stays backdrop-filter in both modes -- so `transmit`, the paper gloss and
   * the reflection group still drive the bar when the bands are liquid. The
   * lab says so on the group rather than hiding them.
   */
  modes?: "raster";
  hint?: string;
};

export const tuning: Record<string, Knob> = {
  // ---- The rasterised glass ----
  //
  // These are the shader's own uniforms, not CSS. They only do anything in
  // `?glass=raster`; in CSS mode the panes are backdrop-filter and an SVG
  // displacement map, and none of this reaches them.
  restEdge: {
    label: "Edge at rest",
    group: "Glass",
    value: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How much of the bevel shows with nothing shining on it. Glass does not stop being glass in the dark, but at the old 0.35 this covered up to a third of the pane and read as dust rather than as an edge.",
  },
  shutterTime: {
    label: "Shutter speed",
    group: "Cursor",
    value: 520,
    min: 120,
    max: 1400,
    step: 20,
    cssVar: "--tune-shutter-time",
    cssUnit: "ms",
    hint: "How long the aperture takes to close and reopen. A real leaf shutter is nearer 230ms, which is too fast to read — this one is the whole feedback for a click, so it is deliberately slower than life. All three animations (blades, housing, ring recoil) run off this, so they stay one event.",
  },
  ringOpen: {
    label: "Ring opens with charge",
    group: "Cursor",
    value: 2.4,
    min: 0,
    max: 6,
    step: 0.1,
    cssVar: "--tune-ring-open",
    hint: "How far the ring widens as the flash winds, as a multiple of its resting size. The emitter's bloom widens with charge squared, so the ring has to open at least as fast or the light escapes it. The aperture follows automatically — it derives its size from the ring.",
  },
  glassRefraction: {
    label: "Refraction",
    group: "Liquid glass",
    value: 0.69,
    min: 0,
    max: 2,
    step: 0.01,
    glassKey: "refraction",
    modes: "raster",
    hint: "How far the bevel bends what is behind the pane. This is the effect; everything else is trim.",
  },
  glassChroma: {
    label: "Dispersion",
    group: "Liquid glass",
    value: 0.05,
    min: 0,
    max: 0.4,
    step: 0.005,
    glassKey: "chromAberration",
    modes: "raster",
    hint: "Chromatic aberration at the rim. Glass splits wavelengths by slightly different amounts, and this is the single strongest cue that something is glass rather than a blur.",
  },
  glassBlur: {
    label: "Frost",
    group: "Liquid glass",
    value: 0.18,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "blurAmount",
    modes: "raster",
    hint: "How far from clear the body of the pane is. 0 is optical glass; the photographs read straight through it.",
  },
  glassSpecular: {
    label: "Gloss",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 2,
    step: 0.02,
    glassKey: "specular",
    modes: "raster",
    hint: "Strength of the hard highlights off the bevel. Four fixed lights, Blinn-Phong, exponents 90/50/6/120.",
  },
  glassDistortion: {
    label: "Roughness",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "distortion",
    modes: "raster",
    hint: "Micro-distortion in the surface. Small amounts read as imperfect glass; large amounts read as water.",
  },
  glassFresnel: {
    label: "Fresnel",
    group: "Liquid glass",
    value: 1,
    min: 0,
    max: 2,
    step: 0.02,
    glassKey: "fresnel",
    modes: "raster",
    hint: "How much brighter the pane gets where you see it at a grazing angle. Lives on the bevel, since the face is dead flat.",
  },
  glassEdge: {
    label: "Edge highlight",
    group: "Liquid glass",
    value: 0.05,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "edgeHighlight",
    modes: "raster",
    hint: "The inner stroke and rim glow. Trim rather than optics.",
  },
  glassDepth: {
    label: "Bevel depth",
    group: "Liquid glass",
    value: 40,
    min: 4,
    max: 140,
    step: 2,
    glassKey: "zRadius",
    modes: "raster",
    hint: "How far the edge rounds over. EVERY optical term lives here -- across the flat face the normal is (0,0,1) and refraction, fresnel and specular are all exactly zero. Too small and the pane is a blurred rectangle.",
  },
  glassCornerBand: {
    label: "Corner, bands",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 140,
    step: 2,
    glassKey: "cornerRadius",
    modes: "raster",
    glassScope: "band",
    hint: "0 runs them straight across, which is what a full-bleed band wants.",
  },
  glassCornerBar: {
    label: "Corner, header",
    group: "Liquid glass",
    value: 65,
    min: 0,
    max: 140,
    step: 2,
    glassKey: "cornerRadius",
    modes: "raster",
    glassScope: "bar",
    hint: "The header is a floating bar, so it keeps a pill.",
  },
  glassTint: {
    label: "Tint",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "tintStrength",
    modes: "raster",
    hint: "Cool cast through the body, as thick glass has.",
  },
  glassSaturation: {
    label: "Saturation",
    group: "Liquid glass",
    value: 0,
    min: -1,
    max: 1,
    step: 0.02,
    glassKey: "saturation",
    modes: "raster",
    hint: "Applied to what is seen THROUGH the pane, not to the page.",
  },
  glassSpecTight: {
    label: "Highlight tightness",
    group: "Liquid glass",
    value: 1,
    min: 0.1,
    max: 4,
    step: 0.05,
    glassKey: "specularTightness",
    modes: "raster",
    hint: "Scales all four specular exponents at once (90/50/6/120 at 1.0). Higher is a smaller, harder glint; lower spreads it into a sheen. This is the roughness of the surface in the optical sense.",
  },
  glassLightX: {
    label: "Light across",
    group: "Liquid glass",
    value: 0,
    min: -1.5,
    max: 1.5,
    step: 0.05,
    glassKey: "lightX",
    modes: "raster",
    hint: "Moves the two TIGHT speculars left and right. The two broad fill lights stay put — moving those muddies the face rather than lighting it.",
  },
  glassLightY: {
    label: "Light up",
    group: "Liquid glass",
    value: 0,
    min: -1.5,
    max: 1.5,
    step: 0.05,
    glassKey: "lightY",
    modes: "raster",
    hint: "Same, vertically. 0,0 is the rig the library ships with.",
  },
  glassBlurPasses: {
    label: "Frost quality",
    group: "Liquid glass",
    value: 6,
    min: 1,
    max: 12,
    step: 1,
    glassKey: "blurPasses",
    modes: "raster",
    hint: "Gaussian passes behind the frost. Each one costs two full-screen draws, so this is the knob to drop first if the panes are expensive.",
  },
  glassOpacity: {
    label: "Pane opacity",
    group: "Liquid glass",
    value: 1,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "opacity",
    modes: "raster",
    hint: "The whole shader output's alpha. Below 1 the unrefracted page shows through underneath, which reads as thin glass rather than as clear glass.",
  },
  glassBevelMode: {
    label: "Bevel profile",
    group: "Liquid glass",
    value: 0,
    min: 0,
    max: 1,
    step: 1,
    glassKey: "bevelMode",
    modes: "raster",
    hint: "0 is a biconvex pill, curved from both faces. 1 is a dome: flat underneath, quarter-circle on top. Set 1 with bevel depth equal to the corner radius for a half-sphere magnifier.",
  },
  glassShadow: {
    label: "Drop shadow",
    group: "Liquid glass",
    value: 0.3,
    min: 0,
    max: 1,
    step: 0.01,
    glassKey: "shadowOpacity",
    modes: "raster",
    hint: "The shadow the pane casts on the page. Drawn inside a 20px pad around the canvas, so a large spread gets clipped rather than growing.",
  },
  glassShadowSpread: {
    label: "Shadow spread",
    group: "Liquid glass",
    value: 10,
    min: 0,
    max: 20,
    step: 1,
    glassKey: "shadowSpread",
    modes: "raster",
    hint: "Capped by the same 20px pad. Past that the shadow is cut off square, which looks worse than a smaller shadow.",
  },
  glassShadowY: {
    label: "Shadow offset",
    group: "Liquid glass",
    value: 1,
    min: -20,
    max: 20,
    step: 1,
    glassKey: "shadowOffsetY",
    modes: "raster",
    hint: "Vertical only, which is upstream's choice — the implied light is directly above.",
  },
  glassBrightness: {
    label: "Brightness",
    group: "Liquid glass",
    value: 0,
    min: -0.5,
    max: 0.5,
    step: 0.01,
    glassKey: "brightness",
    modes: "raster",
  },

  // ---- The light itself ----
  coreGain: {
    label: "Core gain",
    group: "Light",
    value: 8,
    min: 1,
    max: 30,
    step: 0.5,
    hint: "How far the emission exceeds white. The tonemap clips everything above 1, so this sets how BIG the blown hexagon is — not the aperture.",
  },
  coreFalloff: {
    label: "Core tightness",
    group: "Light",
    value: 1500,
    min: 300,
    max: 4000,
    step: 50,
    hint: "Higher pulls the blown region in.",
  },
  aperture: {
    label: "Aperture radius",
    group: "Light",
    value: 0.062,
    min: 0.02,
    max: 0.2,
    step: 0.002,
    hint: "The hexagon's actual size, as a fraction of half the viewport's short side.",
  },
  spread: {
    label: "Growth with charge",
    group: "Light",
    value: 0.3,
    min: 0.1,
    max: 1,
    step: 0.02,
    hint: "Size at zero charge relative to full. 1 means it never grows.",
  },
  ghostGain: {
    label: "Ghost strength",
    group: "Light",
    value: 2.78,
    min: 0,
    max: 6,
    step: 0.05,
    hint: "The chain of aperture images thrown back along the optical axis. Up half again from 1.85 — they were reading as an artefact rather than as part of the flare.",
  },
  haloGain: {
    label: "Halo strength",
    group: "Light",
    value: 1.5,
    min: 0,
    max: 4,
    step: 0.05,
    hint: "The ring of scatter around the source, from the coating rather than the elements.",
  },

  // ---- The glass surface ----
  grimeRake: {
    label: "Grime, raked",
    group: "Glass",
    value: 2.4,
    min: 0,
    max: 8,
    step: 0.1,
    hint: "Smudges catching the light at a shallow angle.",
  },
  grimeSpecks: {
    label: "Specks",
    group: "Glass",
    value: 9.5,
    min: 0,
    max: 25,
    step: 0.5,
  },
  sheen: {
    label: "Surface sheen",
    group: "Glass",
    value: 3.9,
    min: 0,
    max: 10,
    step: 0.1,
    hint: "The broad glare across the face, as opposed to the point reflection.",
  },
  sheenFalloff: {
    label: "Sheen reach",
    group: "Glass",
    value: 540,
    min: 120,
    max: 1600,
    step: 20,
  },
  sideReach: {
    label: "Side reach",
    group: "Glass",
    value: 0.7,
    min: 0,
    max: 2,
    step: 0.05,
    hint: "How far the light has to travel before the pane's edges stop catching it. Grazing surfaces hold their reflectance over a much wider range of angles than a face-on one, so this is deliberately broader than the face's falloff.",
  },

  arris: {
    label: "Edge glow",
    group: "Glass",
    value: 9.75,
    min: 0,
    max: 20,
    step: 0.25,
    hint: "The lit arris — the bright line along the pane's edge where the light catches the corner between the face and the side.",
  },

  // ---- CSS-side ----
  reflectionBase: {
    label: "Reflection, at rest",
    group: "Reflection",
    value: 0.16,
    min: 0,
    max: 1,
    step: 0.01,
    cssVar: "--tune-reflect-base",
  },
  reflectionLit: {
    label: "Reflection, lit",
    group: "Reflection",
    value: 0.5,
    min: 0,
    max: 1.5,
    step: 0.02,
    cssVar: "--tune-reflect-lit",
  },
  reflectionZoom: {
    label: "Reflection zoom",
    group: "Reflection",
    value: 210,
    min: 60,
    max: 600,
    step: 10,
    cssVar: "--tune-reflect-zoom",
    cssUnit: "vh",
  },
  reflectionThrowX: {
    label: "Parallax, across",
    group: "Reflection",
    value: 1100,
    min: 0,
    max: 3000,
    step: 50,
    cssVar: "--tune-reflect-x",
    cssUnit: "px",
  },
  reflectionThrowY: {
    label: "Parallax, down",
    group: "Reflection",
    value: 750,
    min: 0,
    max: 2000,
    step: 50,
    cssVar: "--tune-reflect-y",
    cssUnit: "px",
  },
  displacement: {
    label: "Refraction",
    group: "Reflection",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
    hint: "Multiplies the bend. 1 is what Snell's law gives for the glass's own thickness and index — it used to be an absolute pixel figure, which had to be re-picked whenever anything else changed. Chromium only.",
  },

  // ---- Shadows ----
  shadowStrength: {
    label: "Shadow strength",
    group: "Shadows",
    value: 0.8,
    min: 0,
    max: 1,
    step: 0.02,
  },
  shadowGap: {
    label: "Content depth",
    group: "Shadows",
    value: 22,
    min: 2,
    max: 80,
    step: 1,
    hint: "How far the content floats above the photograph. Drives the throw.",
  },
  shadowHeight: {
    label: "Light height",
    group: "Shadows",
    value: 300,
    min: 60,
    max: 1200,
    step: 10,
    hint: "Lower means a closer light: longer, softer shadows.",
  },
  shadowSoftness: {
    label: "Light size",
    group: "Shadows",
    value: 46,
    min: 1,
    max: 200,
    step: 1,
    hint: "The emitter's radius. This is what sets the penumbra.",
  },

  // ---- Cursor ----
  ringSize: {
    label: "Ring",
    group: "Cursor",
    value: 30,
    min: 8,
    max: 80,
    step: 1,
    cssVar: "--tune-ring",
    cssUnit: "px",
  },
  dotSize: {
    label: "Dot",
    group: "Cursor",
    value: 6,
    min: 1,
    max: 20,
    step: 1,
    cssVar: "--tune-dot",
    cssUnit: "px",
  },
  ringEase: {
    label: "Ring follow",
    group: "Cursor",
    value: 0.16,
    min: 0.05,
    max: 1,
    step: 0.01,
    hint: "Per-frame fraction of the remaining distance. Lower trails more. 0.16 settles in about 0.29s — roughly twice the reference's lag, which is deliberate.",
  },
  dotEase: {
    label: "Dot follow",
    group: "Cursor",
    value: 0.2,
    min: 0.05,
    max: 1,
    step: 0.01,
    hint: "Keep this at about 1.25x the ring's. Further apart and the dot runs ahead of the ring and the light, which is what made it look off-centre.",
  },

  // ---- What the flash leaves on the retina ----
  transmit: {
    label: "Light through the glass",
    group: "Glass",
    value: 0.34,
    min: 0,
    max: 1.2,
    step: 0.02,
    cssVar: "--tune-transmit",
    hint: "How much of the light makes it through the pane onto what is behind it, mottled by the same marks you can see on the face.",
  },
  transmitReach: {
    label: "Transmitted spread",
    group: "Glass",
    value: 640,
    min: 160,
    max: 1600,
    step: 20,
    cssVar: "--tune-transmit-reach",
    cssUnit: "px",
  },
  transmitCore: {
    label: "Caustic core",
    group: "Glass",
    value: 210,
    min: 40,
    max: 700,
    step: 10,
    cssVar: "--tune-transmit-core",
    cssUnit: "px",
    hint: "The bright middle where the bevel gathered the light instead of spreading it — the line a glass of water throws inside its own shadow.",
  },

  paperGloss: {
    label: "Paper specular",
    group: "Glass",
    value: 0.92,
    min: 0,
    max: 1,
    step: 0.02,
    cssVar: "--tune-paper",
    hint: "The hard highlight a glossy print throws. Near-white and close to blown out at the centre — this is a mirror image of the source, not a tint.",
  },
  paperCore: {
    label: "Paper specular size",
    group: "Glass",
    value: 52,
    min: 8,
    max: 260,
    step: 2,
    cssVar: "--tune-paper-core",
    cssUnit: "px",
    hint: "How big the hard highlight is. A glossy coating is a smooth dielectric, so this is small and sharp — nearly as tight as the pane's own specular.",
  },
  paperSheen: {
    label: "Paper sheen",
    group: "Glass",
    value: 0.06,
    min: 0,
    max: 0.5,
    step: 0.01,
    cssVar: "--tune-paper-sheen",
    hint: "The faint wide wash around the highlight, off the emulsion under the coating. This is the part that should be dull, and it should be weak.",
  },
  paperReach: {
    label: "Paper sheen spread",
    group: "Glass",
    value: 340,
    min: 80,
    max: 900,
    step: 10,
    cssVar: "--tune-paper-reach",
    cssUnit: "px",
    hint: "How far the faint wash carries. Only the sheen uses this; the hard highlight has its own size.",
  },
  paperRoom: {
    label: "Paper reflection",
    group: "Glass",
    value: 0.12,
    min: 0,
    max: 0.5,
    step: 0.01,
    cssVar: "--tune-paper-room",
    hint: "How much of the room a print catches. Far less than the pane, and offset from it, because it sits a little nearer the eye.",
  },

  grimeFloor: {
    label: "Grime clarity",
    group: "Glass",
    value: 0.46,
    min: 0,
    max: 0.9,
    step: 0.01,
    hint: "Everything in the surface map below this is cleaned off entirely. Higher is clearer glass with fewer, more distinct marks — it removes marks rather than dimming them.",
  },

  afterStrength: {
    label: "Afterimage",
    group: "Afterimage",
    value: 1,
    min: 0,
    max: 2.5,
    step: 0.05,
    cssVar: "--tune-after",
    hint: "Scales both ghosts together. 0 turns them off and leaves the veil.",
  },
  afterDwell: {
    label: "Afterimage dwell",
    group: "Afterimage",
    value: 6.4,
    min: 0.8,
    max: 14,
    step: 0.1,
    cssVar: "--tune-after-dwell",
    cssUnit: "s",
    hint: "How long the negative takes to fade. The decay stays exponential — this stretches the whole curve.",
  },
  afterVeil: {
    label: "Vision washout",
    group: "Afterimage",
    value: 0.34,
    min: 0,
    max: 0.85,
    step: 0.01,
    cssVar: "--tune-after-veil",
    hint: "Peak veiling luminance at the point of discharge. This is contrast loss, not a second flash.",
  },
};

/*
 * ---- Two sets of values, one per glass mode ----
 *
 * WHY
 *
 * Most of this panel is NOT mode-specific in the sense of being dead in one
 * mode -- the light pass, the cast shadows, the reflection and the pane's own
 * CSS surface all run whichever glass is in front of them. But they do not
 * want the SAME numbers in both. A sheen that sits right on a backdrop-filter
 * pane is wrong over a refracting one, because the two surfaces return light
 * differently; tuning one used to silently detune the other, and the only
 * symptom was coming back later to find the other mode looked worse than you
 * left it.
 *
 * So those knobs keep a value per mode. Switching the glass swaps the whole
 * set over, live.
 *
 * HOW, AND WHY IT IS DONE THIS WAY
 *
 * `knob.value` stays a single number and stays the live one. Every reader --
 * `t()` in four rAF loops, `applyTuning`, `applyGlassConfig` -- is unchanged
 * and cannot get this wrong. The inactive mode's numbers sit in `stash` and
 * are swapped in on the mode change. The alternative, making `value` a pair,
 * would have put a mode lookup inside loops that run sixty times a second and
 * would have touched every call site to save nothing.
 */

/**
 * The groups whose knobs are live in both systems, and so are kept twice.
 *
 * Not Cursor or Afterimage: the pointer and the flash are in front of the
 * glass rather than part of it, and doubling them would only create two
 * places to set one number. Not Liquid glass either -- those are dead in CSS
 * mode, which is a different thing and is marked with `modes` instead.
 */
const PER_MODE_GROUPS = new Set(["Glass", "Light", "Reflection", "Shadows"]);

export function isPerMode(knob: Knob): boolean {
  return PER_MODE_GROUPS.has(knob.group);
}

let activeMode: TuningMode = "css";
const stash: Record<TuningMode, Record<string, number>> = { css: {}, raster: {} };

export type TuningMode = "css" | "raster";

/** Which set is currently loaded into `knob.value`. */
export function tuningMode(): TuningMode {
  return activeMode;
}

/** A knob's value in a given mode, whether or not that mode is loaded. */
export function valueIn(key: string, mode: TuningMode): number {
  const knob = tuning[key];
  if (!knob) return 0;
  if (mode === activeMode || !isPerMode(knob)) return knob.value;
  return stash[mode][key] ?? knob.value;
}

/** Set a knob's value in a given mode, loaded or not. */
export function setValueIn(key: string, mode: TuningMode, value: number) {
  const knob = tuning[key];
  if (!knob) return;
  if (mode === activeMode || !isPerMode(knob)) {
    knob.value = value;
    applyTuning();
    return;
  }
  stash[mode][key] = value;
}

/**
 * Load a mode's set.
 *
 * An unset mode inherits what is on screen rather than snapping to the
 * defaults. The first switch therefore copies the current tuning across,
 * which is the only sane starting point for a comparison -- landing in the
 * other mode with every number reset would make the two incomparable at
 * exactly the moment you went to compare them.
 */
export function switchTuningMode(mode: TuningMode) {
  if (mode === activeMode) return;
  for (const [key, knob] of Object.entries(tuning)) {
    if (!isPerMode(knob)) continue;
    stash[activeMode][key] = knob.value;
    knob.value = stash[mode][key] ?? knob.value;
  }
  activeMode = mode;
  applyTuning();
}

/** Both sets, for persisting. */
export function tuningSnapshot(): Record<TuningMode, Record<string, number>> {
  const css: Record<string, number> = {};
  const raster: Record<string, number> = {};
  for (const key of Object.keys(tuning)) {
    css[key] = valueIn(key, "css");
    raster[key] = valueIn(key, "raster");
  }
  return { css, raster };
}

/** Restore both sets. */
export function restoreTuning(saved: Partial<Record<TuningMode, Record<string, number>>>) {
  for (const mode of ["css", "raster"] as const) {
    for (const [key, value] of Object.entries(saved[mode] ?? {})) {
      if (typeof value === "number") setValueIn(key, mode, value);
    }
  }
  applyTuning();
}

if (typeof window !== "undefined") {
  activeMode = getGlassMode();
  onGlassMode(switchTuningMode);
}

/** Shorthand for the loops: `t("coreGain")`. */
export const t = (key: keyof typeof tuning | string): number => tuning[key]?.value ?? 0;

/** Mirrors the CSS-side knobs onto the document element. */
export function applyTuning() {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  for (const knob of Object.values(tuning)) {
    if (!knob.cssVar) continue;
    root.setProperty(knob.cssVar, `${knob.value}${knob.cssUnit ?? ""}`);
  }
  applyGlassConfig();
}

/**
 * Mirrors the shader knobs onto each pane's `data-config`.
 *
 * The rasterised glass keeps its configuration in that attribute and watches
 * it with a MutationObserver, so writing it is enough -- the next frame picks
 * the new values up. No re-init, which matters: an init runs a full
 * html-to-image capture of everything behind the pane, and doing that on every
 * drag of a slider would make the panel unusable.
 *
 * Only ever writes when the value would actually change, because the observer
 * fires on any attribute write and an identical one is pure work.
 */
export function applyGlassConfig() {
  if (typeof document === "undefined") return;
  for (const pane of Array.from(document.querySelectorAll<HTMLElement>(".glass"))) {
    const isBar = pane.classList.contains("glass--bar");
    const config: Record<string, number> = {};
    for (const knob of Object.values(tuning)) {
      if (!knob.glassKey) continue;
      if (knob.glassScope === "band" && isBar) continue;
      if (knob.glassScope === "bar" && !isBar) continue;
      config[knob.glassKey] = knob.value;
    }
    const next = JSON.stringify(config);
    if (pane.dataset["config"] !== next) pane.dataset["config"] = next;
  }
}

/** The current settings, as something you can paste back to be baked in. */
export function serializeTuning() {
  const byGroup: Record<string, string[]> = {};
  for (const [key, knob] of Object.entries(tuning)) {
    // Both sets for anything kept twice, so pasting this back does not
    // silently bake one mode's numbers into the other.
    const line = isPerMode(knob)
      ? `  ${key}: ${valueIn(key, "css")}, // raster: ${valueIn(key, "raster")}`
      : `  ${key}: ${knob.value},`;
    (byGroup[knob.group] ??= []).push(line);
  }
  return Object.entries(byGroup)
    .map(([group, lines]) => `// ${group}\n${lines.join("\n")}`)
    .join("\n\n");
}

export function resetTuning(defaults: Record<string, number>) {
  for (const [key, value] of Object.entries(defaults)) {
    if (tuning[key]) tuning[key]!.value = value;
  }
  // Both sets, or reset would leave the other mode holding whatever it had
  // and the next switch would bring it straight back.
  stash.css = {};
  stash.raster = {};
  applyTuning();
}

/** Captured at module load, so Reset always has somewhere to go back to. */
export const TUNING_DEFAULTS: Record<string, number> = Object.fromEntries(
  Object.entries(tuning).map(([k, v]) => [k, v.value]),
);
