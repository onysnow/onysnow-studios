import { describe, expect, it } from "vitest";

import {
  isResult,
  restoreTuning,
  RESULTS,
  serializeTuning,
  setValueIn,
  t,
  TUNING_DEFAULTS,
  tuning,
} from "./tuning";

/*
 * Optics plan step 7: he sets causes, physics sets effects. A result is a
 * locked model constant -- no control, and nothing saved can move it.
 */
describe("results are locked", () => {
  it("names only knobs that exist", () => {
    for (const key of Object.keys(RESULTS)) expect(tuning[key], key).toBeDefined();
  });

  it("keeps the causes the plan lists", () => {
    for (const key of [
      "edgeWidth",
      "roomBrightness",
      "glassBlur",
      "glassChroma",
      "glassTint",
      "coreGain",
      "aperture",
      "shadowHeight",
      "shadowSoftness",
      "floorGap",
      "shadowGap",
      "floorCaustics",
      "grimeRake",
      "grimeSpecks",
    ]) {
      expect(isResult(key), key).toBe(false);
    }
  });

  it("ignores a value set or saved for a result, and still takes one for a cause", () => {
    setValueIn("glassFresnel", "css", 9);
    restoreTuning({ css: { transmit: 0.99, floorLight: 3 }, raster: { transmit: 0.99 } });
    expect(t("glassFresnel")).toBe(TUNING_DEFAULTS["glassFresnel"]);
    expect(t("transmit")).toBe(TUNING_DEFAULTS["transmit"]);
    expect(t("floorLight")).toBe(TUNING_DEFAULTS["floorLight"]);

    restoreTuning({ css: { coreGain: 5 } });
    expect(t("coreGain")).toBe(5);
    restoreTuning({ css: { coreGain: TUNING_DEFAULTS["coreGain"]! } });
  });

  it("leaves results out of what Copy gives back", () => {
    const text = serializeTuning();
    expect(text).not.toMatch(/\bglassFresnel:/);
    expect(text).toMatch(/\bcoreGain:/);
  });
});
