import { describe, expect, it } from "vitest";
import { criticalAngle, focalLength, seenAt, trace } from "./lens";

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

  it("the exact trace matches the small-slope lens for a shallow face (water-drops 9.1)", () => {
    const G = 40;
    const t = trace(0.01, 0, 1.333, 1.5, 0, G);
    expect(t.tir).toBe(false);
    expect(t.offset).toBeCloseTo(0.333 * G * 0.01, 3);
  });

  it("glass bends the ray less than air: T of glass shifts it by k / n_glass, not k", () => {
    const t = trace(0.01, 0, 1.333, 1.5, 6, 0);
    expect(t.offset).toBeCloseTo((0.333 * 0.01 * 6) / 1.5, 4);
  });

  it("a ray from straight ahead is never totally reflected at the back face, however steep the drop's edge", () => {
    for (const deg of [10, 40, 60, 80, 89.9]) {
      expect(trace(Math.tan((deg * Math.PI) / 180), 0.5, 1.333, 1.5, 6, 40).tir).toBe(false);
    }
  });

  it("the steep edge looks far across: at a 60 degree edge the ray leaves the glass at about 26 degrees", () => {
    const t = trace(Math.tan(Math.PI / 3), 0, 1.333, 1.5, 0, 1);
    expect((Math.atan(t.offset) * 180) / Math.PI).toBeCloseTo(26.4, 0);
  });
});
