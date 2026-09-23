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
  hint?: string;
};

export const tuning: Record<string, Knob> = {
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
    value: 1.85,
    min: 0,
    max: 5,
    step: 0.05,
  },
  haloGain: {
    label: "Halo strength",
    group: "Light",
    value: 1,
    min: 0,
    max: 3,
    step: 0.05,
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
    value: 2.6,
    min: 0,
    max: 8,
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
  arris: {
    label: "Edge glow",
    group: "Glass",
    value: 6.5,
    min: 0,
    max: 16,
    step: 0.25,
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
    value: 40,
    min: 0,
    max: 120,
    step: 2,
    hint: "Peak bevel displacement, in pixels. Chromium only.",
  },

  // ---- Shadows ----
  shadowStrength: {
    label: "Shadow strength",
    group: "Shadows",
    value: 0.5,
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
  causticStrength: {
    label: "Scratch caustics",
    group: "Shadows",
    value: 0.42,
    min: 0,
    max: 1.5,
    step: 0.02,
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
}

/** The current settings, as something you can paste back to be baked in. */
export function serializeTuning() {
  const byGroup: Record<string, string[]> = {};
  for (const [key, knob] of Object.entries(tuning)) {
    (byGroup[knob.group] ??= []).push(`  ${key}: ${knob.value},`);
  }
  return Object.entries(byGroup)
    .map(([group, lines]) => `// ${group}\n${lines.join("\n")}`)
    .join("\n\n");
}

export function resetTuning(defaults: Record<string, number>) {
  for (const [key, value] of Object.entries(defaults)) {
    if (tuning[key]) tuning[key]!.value = value;
  }
  applyTuning();
}

/** Captured at module load, so Reset always has somewhere to go back to. */
export const TUNING_DEFAULTS: Record<string, number> = Object.fromEntries(
  Object.entries(tuning).map(([k, v]) => [k, v.value]),
);
