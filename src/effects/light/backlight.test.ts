import { afterEach, describe, expect, it } from "vitest";
import { resetPreviews } from "@/effects/engine/preview";
import { tuning } from "@/lib/tuning";
import { backLight, pointLights, strongestCharge } from "./lights";

/*
 * Item 31b: a backlight is one light behind the glass (Light.below), off
 * unless tried and turned up.
 */
describe("the backlight", () => {
  afterEach(() => {
    resetPreviews();
    tuning["backlight"]!.value = 0;
  });

  it("is out unless switched on, and out at 0 even when switched on", () => {
    expect(pointLights()).not.toContain(backLight);
    resetPreviews(["backlight"]);
    tuning["backlight"]!.value = 0;
    expect(pointLights()).not.toContain(backLight);
  });

  it("burns behind the glass when tried and turned up", () => {
    resetPreviews(["backlight"]);
    tuning["backlight"]!.value = 1;
    expect(pointLights()).toContain(backLight);
    expect(backLight.below).toBe(true);
    expect(strongestCharge()).toBe(1);
    expect(backLight.gain).toBeGreaterThan(0);
  });
});
