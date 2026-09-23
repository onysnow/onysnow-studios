import { describe, expect, it } from "vitest";
import { bevelField, bevelHeight, interiorIsNeutral, roundedRectSDF } from "./bevel-map";

describe("roundedRectSDF", () => {
  it("is zero on the edge, negative inside, positive outside", () => {
    expect(roundedRectSDF(0, 0, 50, 50, 0)).toBeCloseTo(-50, 5);
    expect(roundedRectSDF(50, 0, 50, 50, 0)).toBeCloseTo(0, 5);
    expect(roundedRectSDF(60, 0, 50, 50, 0)).toBeCloseTo(10, 5);
  });

  it("rounds the corner by the radius", () => {
    // The corner of a square is sqrt(2)*50 from centre; with a radius the
    // surface is pulled in, so the same point is further outside.
    const square = roundedRectSDF(50, 50, 50, 50, 0);
    const rounded = roundedRectSDF(50, 50, 50, 50, 12);
    expect(rounded).toBeGreaterThan(square);
  });
});

describe("bevelHeight", () => {
  it("is a circular arc: flat past the bevel, steep at the rim", () => {
    expect(bevelHeight(0, 20)).toBe(0);
    expect(bevelHeight(20, 20)).toBe(20);
    expect(bevelHeight(40, 20)).toBe(20);
    // At the halfway point a circle of radius R stands at sqrt(3)/2 of R,
    // which a straight ramp would put at half. That difference IS the bend.
    expect(bevelHeight(10, 20)).toBeCloseTo((20 * Math.sqrt(3)) / 2, 5);
  });

  it("rises faster than linearly near the edge", () => {
    const slopeAtRim = bevelHeight(1, 20) - bevelHeight(0, 20);
    const slopeAtMiddle = bevelHeight(11, 20) - bevelHeight(10, 20);
    expect(slopeAtRim).toBeGreaterThan(slopeAtMiddle * 3);
  });
});

describe("bevelField", () => {
  const field = bevelField(120, 80, 6, 14);

  it("leaves the body of the pane exactly neutral", () => {
    // 128 means "do not move this pixel". Any drift here shifts the whole
    // backdrop behind the glass, which is what smeared the photographs before.
    expect(interiorIsNeutral(field, 14)).toBe(true);
  });

  it("displaces at the rim and not in the middle", () => {
    const at = (x: number, y: number) => {
      const o = (y * field.width + x) * 4;
      return [field.data[o]!, field.data[o + 1]!];
    };
    const [topR, topG] = at(60, 1) as [number, number];
    const [, bottomG] = at(60, 78) as [number, number];
    const [leftR] = at(1, 40) as [number, number];

    expect(Math.abs(topG - 128)).toBeGreaterThan(8);
    expect(Math.abs(bottomG - 128)).toBeGreaterThan(8);
    // The old map was green only, so a vertical arris did not bend at all.
    expect(Math.abs(leftR - 128)).toBeGreaterThan(8);
    // A horizontal edge has no sideways component of its own.
    expect(topR).toBe(128);
  });

  it("samples inward at every edge, which is what compresses the bevel", () => {
    /*
     * The gradient of the height field points uphill, which is toward the
     * middle of the pane -- so the displacement at the rim samples the
     * backdrop from further inside. That is the right direction: a bevel
     * gathers a wide inner region into a narrow band, which is why the strip
     * along the edge of real glass looks squeezed rather than magnified.
     *
     * `feDisplacementMap` moves a pixel by (channel - 128), so "samples from
     * below" is green above 128.
     */
    const g = (x: number, y: number) => field.data[(y * field.width + x) * 4 + 1]!;
    expect(g(60, 1)).toBeGreaterThan(128); // top edge samples downward
    expect(g(60, 78)).toBeLessThan(128); // bottom edge samples upward

    const r = (x: number, y: number) => field.data[(y * field.width + x) * 4]!;
    expect(r(1, 40)).toBeGreaterThan(128); // left edge samples rightward
    expect(r(118, 40)).toBeLessThan(128); // right edge samples leftward
  });

  it("stays within the encodable range at any geometry", () => {
    for (const [w, h, rad, z] of [
      [64, 64, 0, 10],
      [400, 60, 4, 30],
      [40, 400, 20, 18],
      [30, 30, 15, 15],
    ] as const) {
      const f = bevelField(w, h, rad, z);
      for (let i = 0; i < f.data.length; i += 4) {
        expect(f.data[i]).toBeGreaterThanOrEqual(1);
        expect(f.data[i]).toBeLessThanOrEqual(255);
      }
    }
  });

  it("does not blow up when the bevel is deeper than the pane", () => {
    expect(() => bevelField(20, 20, 4, 200)).not.toThrow();
    expect(interiorIsNeutral(bevelField(20, 20, 4, 200), 200)).toBe(true);
  });
});
