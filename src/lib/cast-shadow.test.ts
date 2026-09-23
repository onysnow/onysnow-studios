import { describe, expect, it } from "vitest";
import { castShadow } from "./cast-shadow";

const base = { gap: 22, height: 300, lightRadius: 46, lateralX: 0, lateralY: 0 };

describe("castShadow", () => {
  it("throws the shadow away from the light, on both axes", () => {
    expect(castShadow({ ...base, lateralX: 400 }).x).toBeGreaterThan(0);
    expect(castShadow({ ...base, lateralX: -400 }).x).toBeLessThan(0);
    expect(castShadow({ ...base, lateralY: 400 }).y).toBeGreaterThan(0);
    expect(castShadow({ ...base, lateralY: -400 }).y).toBeLessThan(0);
  });

  it("puts the shadow directly underneath when the light is overhead", () => {
    const { x, y } = castShadow(base);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });

  it("throws it further as the light drops toward the surface", () => {
    const high = castShadow({ ...base, height: 900, lateralX: 400 }).x;
    const low = castShadow({ ...base, height: 120, lateralX: 400 }).x;
    expect(low).toBeGreaterThan(high);
  });

  it("throws it further the higher the object stands off the glass", () => {
    const flat = castShadow({ ...base, gap: 4, lateralX: 400 }).x;
    const raised = castShadow({ ...base, gap: 40, lateralX: 400 }).x;
    expect(raised).toBeGreaterThan(flat);
  });

  it("SHARPENS as the light retreats, which is the part everyone gets wrong", () => {
    const near = castShadow({ ...base, lateralX: 60 }).blur;
    const far = castShadow({ ...base, lateralX: 2000 }).blur;
    expect(far).toBeLessThan(near);
  });

  it("casts no penumbra at all from a point source", () => {
    expect(castShadow({ ...base, lightRadius: 0, lateralX: 400 }).blur).toBe(0);
  });

  it("softens as the emitter grows, at a fixed distance", () => {
    const small = castShadow({ ...base, lightRadius: 10, lateralX: 300 }).blur;
    const large = castShadow({ ...base, lightRadius: 120, lateralX: 300 }).blur;
    expect(large).toBeGreaterThan(small);
  });

  it("does not divide by zero when the light is on the surface", () => {
    const out = castShadow({ ...base, height: 0, lateralX: 400 });
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.blur)).toBe(true);
  });
});
