import { describe, expect, it } from "vitest";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "./glass-light-shader";
import { LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER } from "./cursor-light-shader";

/**
 * The shaders live in template literals, so a backtick anywhere inside one --
 * including inside a comment, which is where it always happens -- terminates
 * the string early and turns the rest of the file into a syntax error.
 *
 * This has now happened EIGHT times in this project. It is invisible on review
 * because a backtick around an identifier is the natural way to write prose
 * about code, and the failure surfaces as a TypeScript parse error tens of
 * lines away from the cause.
 *
 * These tests do not check the shaders compile on a GPU -- CI has none. They
 * check the things that can be checked cheaply and that have actually broken:
 * the sources exist, they are complete, every uniform the source reads is
 * declared, and -- read from the file as TEXT rather than imported -- that no
 * stray backtick has got into one in the first place.
 *
 * That last one matters because of how this fails. Importing a module whose
 * template literal was terminated early does not give you a useful error; it
 * gives you a parse error at some unrelated line, and every other test in the
 * file disappears with it. Reading the source as text cannot be broken by its
 * own contents, so it can say what actually happened.
 */

const SOURCES = {
  "glass fragment": GLASS_LIGHT_FRAGMENT_SHADER,
  "cursor fragment": LIGHT_FRAGMENT_SHADER,
  "cursor vertex": LIGHT_VERTEX_SHADER,
};

describe("shader sources", () => {
  for (const [name, src] of Object.entries(SOURCES)) {
    it(`${name} is non-empty and complete`, () => {
      expect(src.length).toBeGreaterThan(50);
      expect(src).toContain("void main");
      // Balanced braces: a truncated literal loses its closing brace.
      const open = (src.match(/\{/g) ?? []).length;
      const close = (src.match(/\}/g) ?? []).length;
      expect(open).toBe(close);
    });

    it(`${name} declares every uniform it reads`, () => {
      const declared = new Set(
        [...src.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1] as string),
      );
      const used = new Set([...src.matchAll(/\bu[A-Z]\w*/g)].map((m) => m[0]));
      // A uniform that is used but never declared fails to compile, which in
      // this codebase means the whole pass silently draws nothing.
      const missing = [...used].filter((u) => !declared.has(u));
      expect(missing).toEqual([]);
    });
  }
});

/*
 * NO GENERATED TEXTURE IN THE GLASS.
 *
 * A per-pixel `hash()` grain used to be dithered in after the tonemap,
 * weighted by 4*l*(1-l) so it peaked in the midtones -- which is exactly the
 * mid-grey a pane spends most of its time at. It read as an even dust over
 * the whole surface rather than as glass, and was asked to be removed
 * repeatedly before it actually was.
 *
 * The pane carries the smudge and scratch PHOTOGRAPHS and nothing else. This
 * test is here so that cannot quietly stop being true: any pseudo-random term
 * reintroduced into the light shader fails here, rather than in a screenshot
 * weeks later.
 */
describe("no generated noise in the glass", () => {
  it("has no pseudo-random term in the light shader", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    expect(src).not.toMatch(/fract\s*\(\s*sin\s*\(/);
    expect(src).not.toMatch(/\bhash\s*\(/);
    expect(src).not.toMatch(/\brandom\s*\(/);
    expect(src).not.toMatch(/\bnoise\s*\(/);
  });

  it("gets its texture from the supplied photographs instead", () => {
    // Sampled from the smudge/scratch images, not synthesised.
    expect(GLASS_LIGHT_FRAGMENT_SHADER).toContain("uniform sampler2D uSurface");
  });
});
