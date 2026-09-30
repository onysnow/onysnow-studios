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
  polariser:
    "Light engine step H: the glass's reflections by the exact Fresnel equations, s and p apart, and a polarising filter on the camera (Camera > Polarising filter) to cut or keep them",
  roughglass:
    "Light engine step H: the light through a frosted face from its microfacets (Walter et al. 2007) -- how much gets through and how widely it scatters -- in place of two rules of thumb",
  photolights:
    "Light engine step I: the brightest spots of the photographs behind the panes -- neon, windows, lamps they recorded -- are lights under the glass, shining up into it in their own colour and following the photographs as they slide",
  backlight:
    "Light engine step I: a light behind the glass, under the photographs, like a lightbox (Environment > Backlight): the panes glow from beneath and their rims catch it",
  kelvin:
    "The lamp's colour from its temperature, as a camera's white balance speaks of it (Light > Lamp colour temperature): a blackbody's glow, 1900 K candle to 10000 K blue sky",
  vignette:
    "The lens's natural vignetting (Camera > Vignetting): the picture's corners darker by cos^4 of their angle off the lens's axis, as in a photograph",
  coating:
    "Museum and opal glass on Lab samples: polished glass with an anti-reflection coating on each face (a quarter wave of magnesium fluoride) beside the same glass bare -- the room's reflection falls to a third and turns faintly purple -- and opal glass, which scatters blue in its volume (Rayleigh): lit, it glows faintly blue and what comes through lands warm",
  gapparallax:
    "Item 33: how far a photograph slides under its glass as you scroll comes from how far the glass stands off it and how far away your eye is (gap / (distance + gap)), not from a depth preset",
  quality:
    "Item 34: quality tiers -- a device with 4 GB or less, 4 cores or fewer, no GPU, or frames that keep coming slow runs a lighter site (the light drawn at 1 device pixel per CSS pixel, the bokeh layer off); force one with ?quality=full|lite|minimal",
  redroom:
    "Item 39, secret 2: take a picture of a photograph (wind the shutter, click one) and the page goes dark but for the safelight -- everything a negative in red, as a print looks in the developer tray; the cursor is a loupe showing the true frame; the picture you took comes up in the developer and hangs on the line on a cord, swinging as a real one does -- grab it and swing it; Lights on or Escape leaves",
  flashlight:
    "A flashlight where the lamp is (item 25i): a beam -- a bright hotspot and a dim spill. Press and hold to plant it; it stays where you pressed and turns to point where the pointer goes, lighting whatever the beam falls on",
  laser:
    "A laser pointer's beam across the page (?laser=red|green|violet): it enters the panes at their edges, bends, splits, is guided and absorbed as real glass does; press and drag to aim",
  bounce:
    "Light bouncing off a lit photograph lights the frosted glass above it from below, in the photograph's colour (light engine step F)",
  corners:
    "The bevel's lines round each corner in a curve instead of meeting in a mitre, so no thin line runs in from the corners (item 2a)",
  contact:
    "Two panes resting dry on each other (the Contact stack on Lab samples): the air film between them shows Newton's colours where both faces are polished, black where they touch (light engine step G)",
  broken:
    "Broken panes on Lab samples -- annealed, tempered, laminated -- cracks as mirrors that flash with the lamp, the view stepping at each crack",
  solids:
    "Glass solids on Lab samples -- prism, sphere, cube, cone, pyramid, rod -- ray traced through their glass",
  tools:
    "A tray to pick what you hold -- lamp, black light, flare, laser or magnifier -- one at a time",
  liquidlights:
    "Liquid glass lit only by the scene's lights: its own fixed gloss, rim glow, white Fresnel and drop shadow are off",
  liquidedge:
    "Liquid glass edges the way the CSS glass draws them: the bevel bends by Snell through the pane's own edge and thickness (the same numbers as the CSS bend), colours split by the glass's own dispersion, the pane's smoky fill, no drawn rim lines, and none of the library's own fixed lights -- on a band they are the bright streaks across the screen (2j; includes liquidlights)",
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
