import { describe, expect, it } from "vitest";

import { GLASS_LIGHT_FRAGMENT_SHADER } from "./glass-light-shader";

/**
 * The per-pixel occlusion, checked two ways.
 *
 * WHY THIS IS NOT A BROWSER TEST
 *
 * The thing being tested runs in a fragment shader, and the term it modifies
 * is gated on the shutter's charge. Charging is a gesture -- sustained pointer
 * SPEED over about three seconds -- and synthetic mouse events have no
 * believable timing, so an automated browser winds it to about 0.1 where 0.6
 * is needed before there is any grime to occlude. I spent several attempts
 * failing to imitate a hand.
 *
 * So the arithmetic is mirrored here and tested directly, and the shader is
 * checked separately for the shape of the code that uses it. Between them:
 * the maths is right, and the maths is what is wired up.
 */

/** The same rounded-box distance the shader computes. Negative inside. */
function roundedBoxDistance(
  px: number,
  py: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  radius: number,
): number {
  const r = Math.min(radius, Math.min(hw, hh));
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type Occluder = {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  radius: number;
  blur: number;
  alpha: number;
};

function occlusionAt(x: number, y: number, list: Occluder[]): number {
  let blocked = 0;
  for (const o of list) {
    const d = roundedBoxDistance(x, y, o.cx, o.cy, o.hw, o.hh, o.radius);
    const edge = Math.max(o.blur, 0.5);
    blocked = Math.max(blocked, o.alpha * (1 - smoothstep(-edge, edge, d)));
  }
  return Math.min(1, Math.max(0, blocked));
}

const PRINT: Occluder = {
  cx: 200,
  cy: 100,
  hw: 80,
  hh: 50,
  radius: 8,
  blur: 4,
  alpha: 0.8,
};

describe("per-pixel occlusion", () => {
  it("blocks light at the centre of a shadow and nowhere near it", () => {
    expect(occlusionAt(200, 100, [PRINT])).toBeCloseTo(0.8, 2);
    expect(occlusionAt(600, 400, [PRINT])).toBe(0);
  });

  it("cuts a SHAPE rather than dimming everything", () => {
    /*
     * The whole point of the change. The previous implementation was one
     * number per pane, so every one of these sampled points returned the same
     * value however far it was from the thing casting the shadow.
     */
    const inside = occlusionAt(200, 100, [PRINT]);
    const justOutside = occlusionAt(200 + 80 + 20, 100, [PRINT]);
    const farAway = occlusionAt(200 + 400, 100, [PRINT]);

    expect(inside).toBeGreaterThan(0.7);
    expect(justOutside).toBeLessThan(0.05);
    expect(farAway).toBe(0);
  });

  it("fades across the penumbra instead of stopping dead", () => {
    // Straddling the right edge: fully blocked inside, half at the boundary,
    // clear outside. A hard step here would read as a cut-out, not a shadow.
    const edgeX = PRINT.cx + PRINT.hw;
    const within = occlusionAt(edgeX - 6, PRINT.cy, [PRINT]);
    const atEdge = occlusionAt(edgeX, PRINT.cy, [PRINT]);
    const beyond = occlusionAt(edgeX + 6, PRINT.cy, [PRINT]);

    expect(within).toBeGreaterThan(atEdge);
    expect(atEdge).toBeGreaterThan(beyond);
    expect(atEdge).toBeCloseTo(PRINT.alpha / 2, 1);
  });

  it("takes the darkest overlapping shadow rather than summing them", () => {
    /*
     * Two prints overlapping do not make a blacker hole than one. Summing
     * would drive the overlap past 1 and punch a void through the pane.
     */
    const second: Occluder = { ...PRINT, cx: 240, alpha: 0.6 };
    const overlap = occlusionAt(220, 100, [PRINT, second]);
    expect(overlap).toBeCloseTo(0.8, 2);
    expect(overlap).toBeLessThanOrEqual(1);
  });

  it("never exceeds one, whatever is piled up", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...PRINT, cx: 200 + i, alpha: 0.9 }));
    expect(occlusionAt(200, 100, many)).toBeLessThanOrEqual(1);
  });

  it("respects the corner radius", () => {
    // The corner of the bounding box is outside a rounded rectangle.
    const square = occlusionAt(PRINT.cx + 79, PRINT.cy + 49, [{ ...PRINT, radius: 0, blur: 0.5 }]);
    const rounded = occlusionAt(PRINT.cx + 79, PRINT.cy + 49, [
      { ...PRINT, radius: 40, blur: 0.5 },
    ]);
    expect(square).toBeGreaterThan(rounded);
  });
});

describe("the shader actually uses it", () => {
  const src = GLASS_LIGHT_FRAGMENT_SHADER;

  it("declares the occluder uniforms", () => {
    expect(src).toContain("uniform vec4 uOccRect[MAX_OCC]");
    expect(src).toContain("uniform vec4 uOccSoft[MAX_OCC]");
    expect(src).toContain("uniform float uOccCount");
  });

  it("multiplies BOTH grime terms by the unlit factor", () => {
    /*
     * The rake and the ambient scatter. Missing either one leaves grime
     * visible inside a shadow, which is the bug this replaced.
     */
    const rake = src.match(/face \+= vec3\(inside \* rake \*[^;]*\);/)?.[0] ?? "";
    const scatter = src.match(/face \+= vec3\(inside \* direct \*[^;]*\);/)?.[0] ?? "";
    expect(rake).toContain("unlit");
    expect(scatter).toContain("unlit");
  });

  it("bounds the loop with a constant, as GLSL ES 1.0 requires", () => {
    /*
     * A uniform in the loop CONDITION fails to compile on some drivers -- the
     * kind of thing that works everywhere it is tested and not on somebody's
     * laptop. The count is tested inside the body instead.
     */
    expect(src).toContain("for (int i = 0; i < MAX_OCC; i++)");
    expect(src).not.toMatch(/for \(int i = 0; i < uOccCount/);
  });
});
