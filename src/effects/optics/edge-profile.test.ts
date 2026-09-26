import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_WIDTH,
  EDGE_WIDTH_ATTR,
  edgeBand,
  fresnelRise,
  readEdgeWidth,
  surfaceHeight,
  toneMapFilm,
  toneMapGlass,
} from "./edge-profile";
import { EDGE_PROFILE_GLSL } from "./edge-profile.glsl";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { FLOOR_FRAGMENT_SHADER } from "@/lib/floor-light-shader";
import { tuning } from "@/lib/tuning";

/**
 * One edge, one width.
 *
 * The bug this step fixes was four widths for one edge -- 26 (CSS bend), 40
 * (light on the glass), 90 (shadow edge) and 150 (liquid bend) -- so the
 * highlight, the bend and the shadow landed in different places. These tests
 * guard the structure that makes that impossible: one width, declared once,
 * read by every effect, with no private copy anywhere.
 *
 * Whether the GLSL twins compute the same numbers as the TypeScript ones is
 * checked in a real WebGL context, in e2e/optics.spec.ts. CI has no GPU for
 * vitest to use.
 */

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("one edge width", () => {
  it("is a single knob, defaulting to the library's width", () => {
    expect(tuning["edgeWidth"]?.value).toBe(DEFAULT_EDGE_WIDTH);
    // The three knobs that were each a different width for the same edge.
    expect(tuning["glassDepth"]).toBeUndefined();
    expect(tuning["floorBevel"]).toBeUndefined();
  });

  it("is the only knob that feeds the liquid glass its bevel", () => {
    const zRadius = Object.entries(tuning).filter(([, k]) => k.glassKey === "zRadius");
    expect(zRadius.map(([key]) => key)).toEqual(["edgeWidth"]);
  });

  it("is a cause the same in both glass modes, not a per-mode number", () => {
    // Per-mode groups are kept twice; an edge has one width whatever draws it.
    expect(tuning["edgeWidth"]?.group).toBe("Glass shape");
  });

  it("leaves no private width in any effect", () => {
    const filters = source("../../lib/bevel-filters.ts");
    expect(filters).not.toMatch(/BEZEL_WIDTH\s*=/);
    const glass = source("../../lib/glass-light-shader.ts");
    expect(glass).not.toMatch(/#define\s+Z_RADIUS/);
    const floor = source("../../lib/floor-light-shader.ts");
    expect(floor).not.toMatch(/\buBevel\b/);
  });
});

describe("every shader draws the edge from the shared chunk", () => {
  const shaders = {
    "glass light": GLASS_LIGHT_FRAGMENT_SHADER,
    "floor light": FLOOR_FRAGMENT_SHADER,
  };

  for (const [name, src] of Object.entries(shaders)) {
    it(`${name} includes the chunk exactly once`, () => {
      expect(src.split(EDGE_PROFILE_GLSL).length - 1).toBe(1);
    });

    it(`${name} defines no edge function of its own`, () => {
      for (const fn of ["roundedBox", "edgeBand", "fresnelRise", "toneMapGlass", "toneMapFilm"]) {
        const definitions = src.match(new RegExp(`\\b(?:float|vec3)\\s+${fn}\\s*\\(`, "g")) ?? [];
        expect(definitions, `${name}: ${fn}`).toHaveLength(1);
      }
    });

    it(`${name} declares every uniform it reads`, () => {
      const declared = new Set(
        [...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1] as string),
      );
      const used = new Set([...src.matchAll(/\bu[A-Z]\w*/g)].map((m) => m[0]));
      expect([...used].filter((u) => !declared.has(u))).toEqual([]);
    });
  }

  it("the glass light reads the pane's width, not a constant", () => {
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toMatch(/edgeBand\(depth,\s*uEdgeWidth\)/);
  });

  it("the floor light reads each pane's width", () => {
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/uniform float uEdge\[/);
    expect(FLOOR_FRAGMENT_SHADER).toMatch(/edgeBand\(d,\s*uEdge\[i\]\)/);
  });
});

describe("the GLSL chunk", () => {
  it("has a twin for every function it defines", () => {
    const glsl = [...EDGE_PROFILE_GLSL.matchAll(/\b(?:float|vec3)\s+(\w+)\s*\(/g)].map((m) => m[1]);
    const ts = {
      roundedBox: true,
      edgeBand,
      surfaceHeight,
      fresnelRise,
      toneMapGlass,
      toneMapFilm,
    };
    expect(glsl.sort()).toEqual(Object.keys(ts).sort());
  });

  it("carries the default width from the TypeScript constant", () => {
    expect(EDGE_PROFILE_GLSL).toContain(
      `#define DEFAULT_EDGE_WIDTH ${DEFAULT_EDGE_WIDTH.toFixed(1)}`,
    );
  });

  it("has no backtick in it to end its literal early", () => {
    expect(EDGE_PROFILE_GLSL).not.toContain("`");
  });
});

describe("a pane's own edge width", () => {
  const pane = (value: string | null) => ({
    getAttribute: (name: string) => (name === EDGE_WIDTH_ATTR ? value : null),
  });

  it("wins over the knob when set", () => {
    expect(readEdgeWidth(pane("64") as unknown as Element, 40)).toBe(64);
  });

  it("falls back to the knob when missing or unusable", () => {
    for (const bad of [null, "", "wide", "0", "-3"]) {
      expect(readEdgeWidth(pane(bad) as unknown as Element, 40)).toBe(40);
    }
  });
});

describe("the edge functions", () => {
  it("edgeBand is 0 at the rim and 1 from the face inward", () => {
    expect(edgeBand(0, 40)).toBe(0);
    expect(edgeBand(20, 40)).toBe(0.5);
    expect(edgeBand(40, 40)).toBe(1);
    expect(edgeBand(400, 40)).toBe(1);
    expect(edgeBand(-5, 40)).toBe(0);
  });

  it("the band scales with the width, so a wider edge moves every result with it", () => {
    expect(edgeBand(30, 60)).toBe(edgeBand(20, 40));
  });

  it("fresnelRise is 1 at grazing and 0 straight on", () => {
    expect(fresnelRise(0)).toBe(1);
    expect(fresnelRise(1)).toBe(0);
    expect(fresnelRise(0.5)).toBeCloseTo(1 / 32, 10);
  });

  it("toneMapGlass is odd, bounded and passes through zero", () => {
    expect(toneMapGlass(0)).toBe(0);
    expect(toneMapGlass(-2)).toBeCloseTo(-toneMapGlass(2), 12);
    expect(toneMapGlass(1e6)).toBeLessThan(1);
    expect(toneMapGlass(3)).toBeGreaterThan(toneMapGlass(2));
  });

  it("toneMapFilm rolls off toward 1 without clipping", () => {
    expect(toneMapFilm(0)).toBe(0);
    expect(toneMapFilm(10)).toBeLessThan(1);
    expect(toneMapFilm(2)).toBeGreaterThan(toneMapFilm(1));
  });
});
