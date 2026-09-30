/**
 * Changes to the look that are built but not yet approved.
 *
 * Every change that alters how the site looks ships switched OFF, and Ony
 * turns it on to see it by adding it to the address: `?try=marks`, or
 * several at once, `?try=a,b`. Nothing else turns them on, so the
 * site everyone sees is the approved one until a change is approved -- and
 * then its switch is removed and the new behaviour becomes the only one.
 *
 * The list is also put on the root element as `data-try`, so a stylesheet
 * can follow the same switch: `html[data-try~="marks"] ...`.
 *
 * Read once, on first use: a switch does not change without a page load.
 */

/** What can be tried, and what each one is. */
export const PREVIEWS = {
  /** Scratches and smudges block and scatter in proportion to each pixel's opacity. */
  marks: "Scratches and smudges act in proportion to how much of each pixel they cover",
  burn: "Bright coloured light burns toward white at its core, as on film, instead of staying fully saturated",
  satin: "The front of the glass etched like the back, so reflected room lights are soft glows",
  dimroom:
    "The room's brightest lights (windows, softboxes) compressed so their reflection doesn't clip to white",
  flash:
    "The shutter flash is a light in the scene: the glass, the light through it and the rims answer it",
  shaderplastic:
    "The orange buttons lit by the glass light pass from every light in the scene, instead of by CSS gradients that knew only the cursor",
  blacklight:
    "The lamp is a black light: it gives off UV and only a violet glow; smudges on the glass, white type and the orange plastic fluoresce",
  magnifier:
    "A detective's magnifying glass where the lamp is: the live page enlarged through a real lens, swimming and colour-fringed at the rim",
  flare:
    "A burning road flare where the lamp is: deep red, flickering and sputtering, lighting the glass and the photographs",
  liquidlights:
    "Liquid glass lit only by the scene's lights: its own fixed gloss, rim glow, white Fresnel and drop shadow are off",
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
