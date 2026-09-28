/**
 * Changes to the look that are built but not yet approved.
 *
 * Every change that alters how the site looks ships switched OFF, and Ony
 * turns it on to see it by adding it to the address: `?try=shadows`, or
 * several at once, `?try=shadows,marks`. Nothing else turns them on, so the
 * site everyone sees is the approved one until a change is approved -- and
 * then its switch is removed and the new behaviour becomes the only one.
 *
 * The list is also put on the root element as `data-try`, so a stylesheet
 * can follow the same switch: `html[data-try~="shadows"] ...`.
 *
 * Read once, on first use: a switch does not change without a page load.
 */

/** What can be tried, and what each one is. */
export const PREVIEWS = {
  /** One shadow model for every shadow (effects/optics/shadow). */
  shadows: "Shadows grow and soften with the lamp's height and angle, one model for all",
  /** Scratches and smudges block and scatter in proportion to each pixel's opacity. */
  marks: "Scratches and smudges act in proportion to how much of each pixel they cover",
} as const;

export type PreviewName = keyof typeof PREVIEWS;

let active: ReadonlySet<string> | null = null;

function read(): ReadonlySet<string> {
  if (active) return active;
  if (typeof window === "undefined") return new Set();
  let list: string[] = [];
  try {
    list = (new URLSearchParams(window.location.search).get("try") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is PreviewName => s in PREVIEWS);
  } catch {
    list = [];
  }
  active = new Set(list);
  if (list.length > 0) document.documentElement.dataset["try"] = list.join(" ");
  return active;
}

/** Whether a change that is not yet approved is switched on for this page load. */
export function previewing(name: PreviewName): boolean {
  return read().has(name);
}

/** For tests: forget what was read. */
export function resetPreviews(next?: readonly PreviewName[]) {
  active = next ? new Set(next) : null;
}
