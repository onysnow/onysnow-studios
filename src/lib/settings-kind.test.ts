import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `kind` a migration inserts must be one the CHECK constraint allows.
 *
 * WHY THIS EXISTS
 *
 * `site_settings.kind` is constrained to a fixed list, and the list has been
 * widened twice already -- once for 'font' and 'scale', once for 'bool'. I
 * then added rows with kind 'image' without widening it, and every insert was
 * rejected at the point someone pasted the SQL into production:
 *
 *   new row for relation "site_settings" violates check constraint
 *   "site_settings_kind_check"
 *
 * Nothing in the repository could have caught that. The TypeScript knows
 * nothing about the constraint, the settings page renders whatever `kind` it
 * is handed, and the migration is a text file nobody executes until it
 * matters. This test reads the migrations the way Postgres would -- in
 * filename order, last constraint wins -- and checks the two halves agree.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

function migrations(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(DIR, f), "utf8"));
}

/** The kinds the LAST constraint definition in migration order permits. */
function allowedKinds(files: string[]): Set<string> {
  let allowed = new Set<string>();
  for (const sql of files) {
    // Both spellings the migrations have used: `kind IN (...)` and
    // `kind = ANY (ARRAY[...])`.
    for (const m of sql.matchAll(/kind\s*(?:IN|=\s*ANY\s*\(\s*ARRAY)\s*\[?\(?([^)\]]+)[\])]/gi)) {
      const list = [...(m[1] ?? "").matchAll(/'([^']+)'/g)].map((q) => q[1]!);
      if (list.length) allowed = new Set(list);
    }
  }
  return allowed;
}

/** Every kind literal any migration inserts into site_settings. */
function insertedKinds(files: string[]): Map<string, string> {
  const used = new Map<string, string>();
  for (const sql of files) {
    for (const block of sql.matchAll(
      /INSERT\s+INTO\s+public\.site_settings\s*\([^)]*\)\s*VALUES([\s\S]*?);/gi,
    )) {
      for (const row of (block[1] ?? "").matchAll(/\(\s*'([^']+)'[\s\S]*?\)/g)) {
        const quoted = [...(row[0] ?? "").matchAll(/'([^']*)'/g)].map((q) => q[1]!);
        // (key, value, label, kind, sort_order)
        if (quoted.length >= 4) used.set(quoted[0]!, quoted[3]!);
      }
    }
  }
  return used;
}

describe("site_settings kinds", () => {
  const files = migrations();

  it("finds the constraint at all", () => {
    // A rename or a rewrite that this parser stops matching would make every
    // other assertion here vacuously true, which is worse than no test.
    expect(allowedKinds(files).size).toBeGreaterThan(3);
  });

  it("finds rows to check", () => {
    expect(insertedKinds(files).size).toBeGreaterThan(5);
  });

  it("never inserts a kind the constraint rejects", () => {
    const allowed = allowedKinds(files);
    const offenders = [...insertedKinds(files).entries()]
      .filter(([, kind]) => !allowed.has(kind))
      .map(([key, kind]) => `${key} uses kind '${kind}'`);

    expect(offenders, `allowed: ${[...allowed].join(", ")}`).toEqual([]);
  });
});
