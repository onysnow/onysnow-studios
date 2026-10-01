import { describe, expect, it } from "vitest";
import { castPoint, lampDiscAt } from "./casters";
import { CASTERS_GLSL } from "./casters.glsl";
import { FLOOR_FRAGMENT_SHADER } from "@/lib/floor-light-shader";

describe("shadows thrown onto the photographs, through the glass (item 52)", () => {
  const L = { x: 0, y: 0 };
  const H = 400;

  it("projects a caster from the lamp: further off the higher it stands", () => {
    const P = { x: 300, y: 0 };
    // The ray from P to the lamp crosses the caster's plane nearer the lamp the higher it is.
    expect(castPoint(P, L, H, 10).x).toBeCloseTo(300 - 300 * (10 / 400), 9);
    expect(castPoint(P, L, H, 90).x).toBeLessThan(castPoint(P, L, H, 10).x);
  });

  it("softens with the caster's height and stretches toward the lamp at a slant", () => {
    const below = lampDiscAt({ x: 0, y: 0 }, L, H, 30, 80);
    expect(below.across).toBeCloseTo(30 * (80 / 400), 9);
    expect(below.along).toBeCloseTo(below.across, 9);
    const far = lampDiscAt({ x: 800, y: 0 }, L, H, 30, 80);
    expect(far.along).toBeGreaterThan(far.across * 2);
    expect(lampDiscAt({ x: 0, y: 0 }, L, H, 30, 10).across).toBeLessThan(below.across);
  });

  it("is in the floor light's shader, and only there", () => {
    expect(FLOOR_FRAGMENT_SHADER.split(CASTERS_GLSL).length - 1).toBe(1);
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/light \*= \(1\.0 - near \* uCasterStrength\)/);
    expect(CASTERS_GLSL).not.toContain("`");
  });
});
