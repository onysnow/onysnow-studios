import { describe, expect, it } from "vitest";
import { criticalAngle, focalLength, seenAt } from "./lens";

describe("a drop as a lens (water-drops 3.1, 7.5 step 3)", () => {
  const a = 1;
  const h0 = 0.47;
  const n = 1.333;
  const f = focalLength(a, h0, n);

  it("inverts when the photograph is further behind than the focal length", () => {
    const r = 0.2;
    expect(seenAt(r, a, h0, n, f * 4)).toBeLessThan(0);
  });

  it("does not invert when the photograph is nearer than the focal length", () => {
    const r = 0.2;
    const s = seenAt(r, a, h0, n, f * 0.5);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(r);
  });

  it("near the centre the image scale is 1 - gap / f", () => {
    const r = 0.01;
    const gap = f * 3;
    expect(seenAt(r, a, h0, n, gap) / r).toBeCloseTo(1 - gap / f, 2);
  });

  it("water's critical angle against air is 48.6 degrees", () => {
    expect(criticalAngle(1.333)).toBeCloseTo(48.6, 1);
  });
});
