import { describe, expect, it } from "vitest";
import { fracture, polygonArea, type GlassKind } from "./fracture";

/*
 * Item 10: a pane breaks the way its glass does (claude/tools-research.md
 * §2): annealed into long radial shards with rings near the impact,
 * tempered into small even dice, laminated into a held spider web -- and
 * whatever the pattern, the shards are the whole pane, no more, no less.
 */

const pane = { w: 800, h: 500, at: { x: 300, y: 220 } };
const breakOf = (kind: GlassKind, energy = 0.6) => fracture({ ...pane, energy, kind });
const areaOf = (kind: GlassKind) =>
  breakOf(kind).shards.reduce((a, s) => a + polygonArea(s.poly), 0);

describe("a pane breaking", () => {
  it("cuts the whole pane into shards, nothing missing or doubled", () => {
    for (const kind of ["annealed", "tempered", "laminated"] as const) {
      expect(areaOf(kind) / (pane.w * pane.h)).toBeCloseTo(1, 2);
    }
  });

  it("annealed: more energy, more radial cracks, so more shards", () => {
    expect(breakOf("annealed", 1).shards.length).toBeGreaterThan(
      breakOf("annealed", 0).shards.length,
    );
  });

  it("annealed breaks into long shards; tempered dices into many small even ones", () => {
    const annealed = breakOf("annealed");
    const tempered = breakOf("tempered");
    expect(tempered.shards.length).toBeGreaterThan(annealed.shards.length * 5);
    const sizes = tempered.shards.map((s) => polygonArea(s.poly));
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    // About a centimetre on a side (38 px), and no piece far from the rest.
    expect(Math.sqrt(mean)).toBeGreaterThan(25);
    expect(Math.sqrt(mean)).toBeLessThan(50);
    expect(Math.max(...sizes) / mean).toBeLessThan(3);
  });

  it("laminated is a spider web of many pieces, held nearly in place", () => {
    const lam = breakOf("laminated");
    const ann = breakOf("annealed");
    expect(lam.shards.length).toBeGreaterThan(ann.shards.length);
    const move = (f: typeof lam) =>
      Math.max(...f.shards.map((s) => Math.hypot(s.slip.x, s.slip.y)));
    expect(move(lam)).toBeLessThan(move(ann));
  });

  it("knocks the pieces by the impact about most", () => {
    const f = breakOf("annealed", 1);
    const near = f.shards.filter((s) => s.reach < 0.1);
    const far = f.shards.filter((s) => s.reach > 0.5);
    const tilt = (ss: typeof near) =>
      ss.reduce((a, s) => a + Math.hypot(s.tiltX, s.tiltY), 0) / Math.max(ss.length, 1);
    expect(tilt(near)).toBeGreaterThan(tilt(far));
  });

  it("breaks the same way every time for the same impact", () => {
    expect(JSON.stringify(breakOf("annealed"))).toBe(JSON.stringify(breakOf("annealed")));
  });
});
