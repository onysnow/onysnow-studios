import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A backtick inside one of the GLSL template literals, which has now happened
 * eight times.
 *
 * This file deliberately imports NOTHING. That is the whole point of it.
 *
 * The obvious place for this check is shaders.test.ts, and that is where I put
 * it first — where it was useless. That file imports the shader modules, so a
 * stray backtick makes it a parse error and the file never loads, taking the
 * check that would have explained why down with it. The failure reads as
 * "no tests" and names nothing.
 *
 * Reading the source as text cannot be broken by the source's own contents, so
 * this one still runs when the module will not load, and can say what
 * happened. It is the only guard here that works on the day it is needed.
 */
const SHADERS = ["glass-light-shader.ts", "cursor-light-shader.ts"] as const;

describe("GLSL template literals", () => {
  for (const name of SHADERS) {
    it(`${name} has no backtick inside its GLSL`, () => {
      const text = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");

      /*
       * Every backtick in these files should delimit a GLSL literal. They open
       * after a block comment and close before a semicolon, so counting those
       * two forms and comparing against the total finds anything else — which
       * in practice is always a pair wrapped around an identifier in prose.
       */
      const total = (text.match(/`/g) ?? []).length;
      const opens = (text.match(/\*\/\s*`/g) ?? []).length;
      const closes = (text.match(/`\s*;/g) ?? []).length;
      const stray = total - opens - closes;

      expect(total % 2, `${name}: unbalanced backticks`).toBe(0);
      expect(opens, `${name}: an opening delimiter has no closing one`).toBe(closes);
      expect(
        stray,
        `${name}: ${stray} backtick(s) are not delimiters — one has got into the GLSL, ` +
          `which terminates the literal and turns the rest of the file into a parse error`,
      ).toBe(0);
    });
  }
});
