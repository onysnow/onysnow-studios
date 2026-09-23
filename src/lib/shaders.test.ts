import { describe, expect, it } from "vitest";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "./glass-light-shader";
import { LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER } from "./cursor-light-shader";

/**
 * The shaders live in template literals, so a backtick anywhere inside one --
 * including inside a comment, which is where it always happens -- terminates
 * the string early and turns the rest of the file into a syntax error.
 *
 * This has now happened six times in this project. It is invisible on review
 * because a backtick around an identifier is the natural way to write prose
 * about code, and the failure surfaces as a TypeScript parse error tens of
 * lines away from the cause.
 *
 * These tests do not check the shaders compile on a GPU -- CI has none. They
 * check the things that can be checked cheaply and that have actually broken:
 * the sources exist, they are complete, and every uniform the source reads is
 * declared.
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
