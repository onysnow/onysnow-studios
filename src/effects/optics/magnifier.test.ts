import { describe, expect, it } from "vitest";
import { MAGNIFICATION, MAP_SCALE, magnifierMap, seenRadius } from "./magnifier";

describe("the magnifying glass", () => {
  it("enlarges the middle by its magnification", () => {
    const r = 0.01;
    expect(r / seenRadius(r)).toBeCloseTo(MAGNIFICATION, 2);
  });

  it("swims outward toward the rim (an uncorrected lens), never past it", () => {
    // Local enlargement falls toward the rim: the seen point runs faster.
    const slope = (r: number) => (seenRadius(r + 1e-3) - seenRadius(r)) / 1e-3;
    expect(slope(0.9)).toBeGreaterThan(slope(0.1));
    // Everything seen is under the lens: a backdrop-filter sees nothing else.
    for (let r = 0; r <= 1; r += 0.05) expect(seenRadius(r)).toBeLessThanOrEqual(r + 1e-9);
  });

  it("encodes every offset within the map's 8 bits, and none outside the lens", () => {
    const n = 64;
    const map = magnifierMap(n);
    let extreme = 0;
    for (let i = 0; i < map.length; i += 4) {
      extreme = Math.max(extreme, Math.abs(map[i]! - 128), Math.abs(map[i + 1]! - 128));
    }
    expect(extreme).toBeLessThan(127);
    expect(extreme).toBeGreaterThan(60);
    // A corner texel is outside the circle: no offset.
    expect(map[0]).toBe(128);
    expect(map[1]).toBe(128);
    expect(MAP_SCALE).toBeGreaterThan(0);
  });
});
