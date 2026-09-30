import { describe, expect, it } from "vitest";
import { decay, excite, glowOf, type PhosphorCell } from "./phosphor";

const after = (seconds: number) => {
  const cell: PhosphorCell = { fast: 0, slow: 0 };
  excite(cell, 1);
  // In the small steps the paint takes, a frame at a time.
  for (let t = 0; t < seconds; t += 1 / 30) decay(cell, 1 / 30);
  return glowOf(cell);
};

describe("glow-in-the-dark paint", () => {
  it("loses most of its glow quickly", () => {
    const start = after(0);
    expect(after(3) / start).toBeLessThan(0.35);
  });

  it("then sits on a plateau that fades far more slowly", () => {
    // Over the first three seconds it falls by more than the next thirty.
    const firstDrop = after(0) - after(3);
    const nextDrop = after(3) - after(33);
    expect(firstDrop).toBeGreaterThan(nextDrop);
    // Still clearly glowing after half a minute...
    expect(after(30)).toBeGreaterThan(0.1);
    // ...and gone in the end.
    expect(after(400)).toBeLessThan(0.01);
  });

  it("never fills past full, however much light it takes", () => {
    const cell: PhosphorCell = { fast: 0, slow: 0 };
    for (let i = 0; i < 50; i++) excite(cell, 1);
    expect(cell.fast).toBeLessThanOrEqual(1);
    expect(cell.slow).toBeLessThanOrEqual(1);
    expect(glowOf(cell)).toBeLessThanOrEqual(1);
  });
});
