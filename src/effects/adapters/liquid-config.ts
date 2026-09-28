/**
 * The liquid glass adapter (light-system design, step C).
 *
 * The vendored liquid glass library keeps its settings in each pane's
 * `data-config` and watches the attribute, so writing it is enough. What it
 * is given comes from the same places everything else reads: the pane's own
 * causes (its material's frost, its edge width) and the lights. The library's
 * remaining numbers are model constants (the RESULTS in lib/tuning.ts).
 *
 * The library also lights its own gloss and rim, from a fixed light of its
 * own that is not in the list. The only light in the list it could stand for
 * is the room's, so its gloss and rim are scaled by the room's light: with
 * the room dark they are out, and the lamp's own light on the glass is the
 * GlassLight pass above it.
 *
 * Only ever writes when the value would actually change: the library's
 * observer fires on any attribute write, and an identical one is pure work.
 */

import { roomLight } from "@/effects/light/lights";
import { readPaneCauses } from "@/effects/materials/pane-causes";
import { readEdgeWidth } from "@/effects/optics/edge-profile";
import { setGlassConfigWriter, t, tuning } from "@/lib/tuning";

/** What the library is told for one pane. */
export function liquidConfigFor(pane: HTMLElement): Record<string, number> {
  const isBar = pane.classList.contains("glass--bar");
  const config: Record<string, number> = {};
  for (const knob of Object.values(tuning)) {
    if (!knob.glassKey) continue;
    if (knob.glassScope === "band" && isBar) continue;
    if (knob.glassScope === "bar" && !isBar) continue;
    config[knob.glassKey] = knob.value;
  }
  // The pane's own matter: its material's frost, and its edge.
  const causes = readPaneCauses(pane, { frost: t("glassBlur"), gap: t("floorGap") });
  if ("blurAmount" in config) config["blurAmount"] = causes.material.frost;
  config["zRadius"] = readEdgeWidth(pane, tuning["edgeWidth"]!.value);
  // Its own light stands in for the room's.
  const roomOn = Math.min(roomLight.gain, 1);
  for (const key of ["specular", "edgeHighlight"]) {
    if (key in config) config[key] = config[key]! * roomOn;
  }
  return config;
}

/** Write every pane's config. */
export function applyGlassConfig() {
  if (typeof document === "undefined") return;
  for (const pane of Array.from(document.querySelectorAll<HTMLElement>(".glass"))) {
    const next = JSON.stringify(liquidConfigFor(pane));
    if (pane.dataset["config"] !== next) pane.dataset["config"] = next;
  }
}

// Every applied change to the knobs reaches the panes through this adapter.
setGlassConfigWriter(applyGlassConfig);
