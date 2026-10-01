import { describe, expect, it } from "vitest";
import { birdPath, holdFor, magnification, PUPPET_MAX_DEPTH, shadowOf } from "./puppets";

describe("shadow puppets (item 83, shadows.md 6)", () => {
  it("magnifies by H / (H - h): 1 on the screen, 6.7 at the deepest", () => {
    expect(magnification(0, 300)).toBe(1);
    expect(magnification(150, 300)).toBeCloseTo(2, 6);
    expect(magnification(PUPPET_MAX_DEPTH * 300, 300)).toBeCloseTo(6.67, 2);
  });

  it("throws the shadow away from the lamp, (C - L) h / (H - h) further (shadows.md 6 test 1)", () => {
    const [sx, sy] = shadowOf(400, 300, 100, 300, 300, 300);
    expect(sx - 400).toBeCloseTo(((400 - 300) * 100) / 200, 6);
    expect(sy).toBeCloseTo(300, 6);
  });

  it("holdFor is the inverse of shadowOf", () => {
    const hold = holdFor(700, 200, 120, 180, 500, 100, 300);
    const [sx, sy] = shadowOf(hold.x, hold.y, 180, 500, 100, 300);
    expect(sx).toBeCloseTo(700, 6);
    expect(sy).toBeCloseTo(200, 6);
    expect(hold.size * magnification(180, 300)).toBeCloseTo(120, 6);
  });

  it("the bird's wings move with the flap", () => {
    expect(birdPath(1)).not.toBe(birdPath(-1));
    expect(birdPath(5)).toBe(birdPath(1));
  });
});
