import { describe, expect, it } from "vitest";

/**
 * Why the flare was only ever visible over the footer.
 *
 * `plus-lighter` sums and clips. Over dark content that is fine; over a bright
 * photograph the core of the hexagon and the field just outside it both reach
 * the ceiling, and two values that are both 1.0 have no contrast between them
 * — so the shape does not dim, it disappears. The footer is the one part of
 * this site dark enough for an additive layer to survive, which is exactly
 * where it kept showing up.
 *
 * This is arithmetic rather than opinion, so it is worth a test: anyone
 * reaching for `plus-lighter` on a layer that has to read over photographs
 * should see the number first.
 */
const plusLighter = (backdrop: number, source: number) => Math.min(1, backdrop + source);
const screen = (backdrop: number, source: number) => 1 - (1 - backdrop) * (1 - source);

/** The hexagon's core against the field immediately outside it. */
const CORE = 0.9;
const SURROUND = 0.28;
const contrast = (blend: (b: number, s: number) => number, backdrop: number) =>
  blend(backdrop, CORE) - blend(backdrop, SURROUND);

describe("compositing the flare", () => {
  it("shows plainly over the dark footer whichever blend is used", () => {
    expect(contrast(plusLighter, 0.04)).toBeGreaterThan(0.5);
    expect(contrast(screen, 0.04)).toBeGreaterThan(0.5);
  });

  it("vanishes completely under plus-lighter over a bright photograph", () => {
    expect(contrast(plusLighter, 0.82)).toBe(0);
  });

  it("survives under screen over the same photograph", () => {
    expect(contrast(screen, 0.82)).toBeGreaterThan(0.1);
  });

  it("keeps some contrast at every backdrop short of white", () => {
    // Pure white genuinely has no headroom under any lighten blend, which is
    // correct rather than a defect — nothing can be brighter than the ceiling.
    for (let b = 0; b < 1; b += 0.05) {
      expect(contrast(screen, b)).toBeGreaterThan(0);
    }
    expect(contrast(screen, 1)).toBe(0);
  });

  it("costs little where plus-lighter already worked", () => {
    const loss = contrast(plusLighter, 0.04) - contrast(screen, 0.04);
    expect(loss).toBeLessThan(0.05);
  });
});
