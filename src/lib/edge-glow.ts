/**
 * The glass surfaces, and the cursor light falling on them.
 *
 * Every registered panel shares ONE pointer listener and one rAF pass. Each
 * panel having its own listener would mean a `getBoundingClientRect` per panel
 * per pointer event — a forced layout several times a frame, which is exactly
 * the kind of thing that makes a page feel heavy for an effect nobody asked to
 * pay for.
 *
 * Two consumers now. The CSS layers read `--glow-x/y/on` off each panel, and
 * the shader in components/site/GlassLight.tsx reads the panels' geometry to
 * light their rims for real. Both are served from the same single layout pass.
 *
 * Nothing here writes a layout property, so the work stays in paint.
 */
const panels = new Set<HTMLElement>();

/**
 * Surfaces that only want to know where the light is standing on them.
 *
 * Photographs, mostly. They are not glass and get none of the bevel, the
 * reflection or the grime -- they are photographic paper resting ON the pane,
 * with a surface of their own -- but what decides where their gloss picks up
 * is the same light, so they are measured in the same pass rather than by a
 * second loop that could drift out of step with it.
 */
const litSurfaces = new Set<HTMLElement>();

/** How far outside a panel the cursor can be and still light its edge. */
const REACH = 320;

let frame = 0;
let pointerX = -9999;
let pointerY = -9999;

/**
 * Where the light is, and how hard it is burning.
 *
 * Shared rather than passed down: the shadow canvases live inside PhotoSection,
 * which has no idea the cursor exists, and threading a ref through every band
 * to reach them would put the gesture in the layout's vocabulary for no gain.
 * One pointer listener already runs here; this is the same reading.
 */
import { t } from "./tuning";
import { castShadow } from "./cast-shadow";

export const lightState = { x: -9999, y: -9999, charge: 0 };

/** Called by whoever owns the shutter gesture. */
export function reportCharge(charge: number) {
  lightState.charge = charge;
}
let bound = false;

export type GlassRect = {
  /** Top-left corner and size, in CSS pixels, viewport-relative. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, in CSS pixels. */
  r: number;
  /**
   * The photograph behind this pane, and where it is drawn on screen.
   *
   * Refraction means sampling the backdrop from somewhere else, so there has
   * to BE a backdrop to sample. On this site there always is: every glass band
   * sits on a parallax scene with a photograph in it, and that photograph is
   * already in the DOM. No DOM rasterisation needed — the one thing behind the
   * glass that matters is a picture we can bind directly.
   */
  src: string;
  /** The image element's box, in CSS pixels. */
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  /** Intrinsic aspect, for the object-fit: cover mapping. */
  ia: number;
  /**
   * Which surface this pane wears, 0-3. Assigned once and kept for the life of
   * the element, so a panel's grime does not change as the page scrolls — and
   * so two sections never show identical dirt.
   */
  s: number;
  /**
   * Viewing angle onto the pane, -1 to 1.
   *
   * A pane has thickness, so which of its two side faces you can see depends
   * on where it sits relative to your eye. Positive means the panel is below
   * the middle of the viewport and you are looking down at it, so its TOP side
   * is turned toward you; negative means it is above and you see the BOTTOM
   * side. Scrolling carries a panel from one to the other, which is what makes
   * the thickness move.
   */
  t: number;
};

/*
 * Corner radii are read once and kept. Unlike position and size they do not
 * change as the page scrolls, and `getComputedStyle` is the expensive half of
 * reading them.
 */
const radii = new WeakMap<HTMLElement, number>();

/**
 * The photograph this panel is sitting on.
 *
 * Found by walking up to the nearest photographic scene and taking its image,
 * rather than threading a prop through every call site — the relationship is
 * "whatever picture I happen to be over", which is a DOM fact, not a prop.
 */
/**
 * The smallest rendition of a photograph, for use as a refraction texture.
 *
 * The texture is a SECOND fetch, not a reuse of the one the page already made:
 * the DOM image is requested without CORS and a texture needs it with, and
 * those are different cache entries. Left alone that means downloading every
 * backdrop photograph twice at full size, which on a photography site is a lot
 * of bandwidth for an effect nobody asked for.
 *
 * It does not need to be full size. The backdrop is only ever sampled inside a
 * bevel a few dozen pixels deep and squeezed into a side band a few pixels
 * tall, so the smallest stored variant carries more detail than the effect can
 * show. Adding `crossorigin` to the page's own <img> would avoid the second
 * request entirely, but it would also mean that the day the storage host stops
 * sending the header, every photograph on the site vanishes rather than one
 * effect going quiet. Not worth it.
 */
function smallestVariant(img: HTMLImageElement): string {
  const set = img.getAttribute("srcset");
  if (!set) return img.currentSrc || img.src;
  let best = "";
  let bestWidth = Infinity;
  for (const entry of set.split(",")) {
    const [url, descriptor] = entry.trim().split(/\s+/);
    const width = Number.parseInt(descriptor ?? "", 10);
    if (url && Number.isFinite(width) && width < bestWidth) {
      bestWidth = width;
      best = url;
    }
  }
  return best || img.currentSrc || img.src;
}

function backdropOf(el: HTMLElement): HTMLImageElement | null {
  const scene = el.closest("[data-photo]");
  if (!scene) return null;
  const images = scene.querySelectorAll<HTMLImageElement>("img[src]");
  for (let i = images.length - 1; i >= 0; i -= 1) {
    const img = images[i];
    // Skip the blurred placeholder, which is an inline data URI.
    if (img && !img.src.startsWith("data:") && img.naturalWidth > 0) return img;
  }
  return null;
}

const seeds = new WeakMap<HTMLElement, number>();
let nextSeed = 0;

function surfaceSeed(el: HTMLElement) {
  let seed = seeds.get(el);
  if (seed === undefined) {
    seed = nextSeed % 4;
    nextSeed += 1;
    seeds.set(el, seed);
  }
  return seed;
}

function cornerRadius(el: HTMLElement) {
  const known = radii.get(el);
  if (known !== undefined) return known;
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const value = Number.parseFloat(raw);
  const px = Number.isFinite(value) && !raw.includes("%") ? value : 0;
  radii.set(el, px);
  return px;
}

/**
 * How far the panel is from eye level, as a fraction of half the viewport.
 *
 * Clamped, and eased so the middle of the screen is a broad flat region rather
 * than a point the effect pivots around — a pane should not visibly flip its
 * thickness as it crosses the centre line.
 */
function paneTilt(r: DOMRect) {
  const middle = window.innerHeight / 2;
  const offset = (r.top + r.height / 2 - middle) / middle;
  const clamped = Math.max(-1, Math.min(1, offset));
  return clamped * Math.abs(clamped);
}

let geometry: GlassRect[] = [];
let geometryAt = -1;

/**
 * Where the glass is, right now.
 *
 * Cached for the length of a frame so that the CSS pass and the shader pass
 * asking in the same tick cost one set of layout reads between them rather
 * than two.
 */
export function glassGeometry(now = performance.now()): readonly GlassRect[] {
  if (now - geometryAt < 8) return geometry;
  geometryAt = now;
  geometry = [];
  for (const el of panels) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const img = backdropOf(el);
    const b = img?.getBoundingClientRect();
    geometry.push({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      r: cornerRadius(el),
      t: paneTilt(r),
      s: surfaceSeed(el),
      src: img ? smallestVariant(img) : "",
      ix: b?.left ?? 0,
      iy: b?.top ?? 0,
      iw: b?.width ?? 1,
      ih: b?.height ?? 1,
      ia: img && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1,
    });
  }
  return geometry;
}

/**
 * One panel's custom properties, from one layout read.
 *
 * Split out so a panel can be measured the moment it registers as well as on
 * the shared pass. Panels mount in bursts at different times — the header with
 * the layout, the bands with the route — and anything that waits for the next
 * shared frame leaves whichever panels arrived late sitting on their CSS
 * fallbacks until the visitor moves the pointer.
 */
function measure(el: HTMLElement) {
  const r = el.getBoundingClientRect();

  // Distance from the pointer to the rectangle: zero while inside it, and the
  // straight-line gap to the nearest edge once outside.
  const dx = Math.max(r.left - pointerX, 0, pointerX - r.right);
  const dy = Math.max(r.top - pointerY, 0, pointerY - r.bottom);
  const nearness = Math.max(0, 1 - Math.hypot(dx, dy) / REACH);

  // Eased so it comes up gently as the cursor approaches rather than switching
  // on at the boundary. The lighting itself is the shader's job; this is only
  // for anything that wants to know the cursor is near.
  el.style.setProperty("--glow-on", (nearness * nearness).toFixed(3));

  /*
   * How far each side face of the pane is turned toward the viewer, 0 to 1.
   * Never quite zero: the far side is still there, just foreshortened and seen
   * through the glass, which is why it reads as subtler rather than absent.
   */
  const tilt = paneTilt(r);
  el.style.setProperty("--pane-top", (0.18 + 0.82 * Math.max(0, tilt)).toFixed(3));
  el.style.setProperty("--pane-bottom", (0.18 + 0.82 * Math.max(0, -tilt)).toFixed(3));

  /*
   * The corner radius, published for the stylesheet.
   *
   * The edge strips are rectangles and the pane is a rounded rectangle, so at
   * the corners the strips ran straight past where the pane had already curved
   * away — a band overshooting the section at both ends. The radius is set by
   * utility classes at each call site, so the stylesheet cannot know it; this
   * is already measuring it for the shader, so it may as well say so.
   */
  el.style.setProperty("--pane-radius", `${cornerRadius(el)}px`);

  /*
   * Where this pane sits in the viewport.
   *
   * The reflection is ONE room shared by every pane, so its background has
   * to be positioned in viewport space and then pulled back by each pane's
   * own offset — that is what turns a pane into a window onto the
   * reflection rather than a box the reflection is squashed into.
   *
   * Done here rather than with `background-attachment: fixed`, which looks
   * like the built-in answer but is not: `.glass` carries a
   * `backdrop-filter`, and a filtered element becomes the containing block
   * for its descendants, so a fixed background would quietly resolve
   * against the pane again and reintroduce the exact bug it was meant to
   * fix. This is measured, so it cannot drift.
   */
  el.style.setProperty("--pane-x", `${Math.round(r.left)}px`);
  el.style.setProperty("--pane-y", `${Math.round(r.top)}px`);

  /*
   * Where the light is standing, in the pane's own coordinates.
   *
   * The grime layer needs this. It is a surface effect that belongs to the
   * pane -- under the photographs and the copy, which sit ON the glass -- so
   * it cannot be drawn by the shared canvas the way the rest of the lighting
   * is; that canvas is above everything on the page, which is why smears were
   * landing on the pictures and on the text. A per-pane layer can be put in
   * the right place in the stack, and this is what tells it where to rake.
   */
  el.style.setProperty("--lit-x", `${Math.round(pointerX - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(pointerY - r.top)}px`);
}

function apply() {
  frame = 0;
  const now = performance.now();

  /*
   * Where the viewer is, as a fraction of the viewport from its centre.
   *
   * The environment reflection parallaxes against this. It is the same for
   * every pane on the page — there is only one viewer — so it is written once
   * on the root rather than onto each panel.
   */
  const root = document.documentElement.style;
  lightState.x = pointerX;
  lightState.y = pointerY;
  root.setProperty(
    "--reflect-x",
    (pointerX / (document.documentElement.clientWidth || window.innerWidth) - 0.5).toFixed(3),
  );
  root.setProperty(
    "--reflect-y",
    (pointerY / (document.documentElement.clientHeight || window.innerHeight) - 0.5).toFixed(3),
  );
  // Refreshes the shared cache as a side effect, so the shader's call this
  // frame is free.
  glassGeometry(now);

  for (const el of panels) measure(el);
  for (const el of litSurfaces) litSurface(el);
}

function onMove(event: PointerEvent) {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (!frame) frame = requestAnimationFrame(apply);
}

function onLeave() {
  pointerX = -9999;
  pointerY = -9999;
  if (!frame) frame = requestAnimationFrame(apply);
}

/**
 * Publish `--lit-x` / `--lit-y` on an element: where the light is standing
 * over it, in its own coordinates, plus `--lit-near` for how close it is.
 * What the surface does with that is the stylesheet's business.
 */
export function registerLitSurface(el: HTMLElement) {
  litSurfaces.add(el);
  litSurface(el);
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
  return () => litSurfaces.delete(el);
}

function litSurface(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;

  el.style.setProperty("--lit-x", `${Math.round(pointerX - r.left)}px`);
  el.style.setProperty("--lit-y", `${Math.round(pointerY - r.top)}px`);

  // Eased nearness, so a gloss comes up as the light approaches rather than
  // switching on at a boundary.
  const dx = Math.max(r.left - pointerX, 0, pointerX - r.right);
  const dy = Math.max(r.top - pointerY, 0, pointerY - r.bottom);
  const near = Math.max(0, 1 - Math.hypot(dx, dy) / 420);
  el.style.setProperty("--lit-near", (near * near).toFixed(3));

  /*
   * The shadow this surface casts onto whatever it is resting on.
   *
   * A photograph and a line of type both sit ON the glass, a small distance
   * above it, so a light off to one side throws them across it. Three numbers
   * decide what that looks like, and all three are geometry rather than taste:
   *
   *   offset   = gap * lateral / height
   *   penumbra = lightRadius * gap / distance
   *   strength falls off with distance, like any real source
   *
   * The second one is the one everybody gets backwards, including every
   * tutorial I have read on this: a shadow gets SHARPER as the light retreats,
   * not softer. The sun is ninety-three million miles away and casts the
   * crispest shadow you will ever see; move a desk lamp closer and the edges
   * go to mush. `distance` on the bottom is what says so.
   */
  const centreX = r.left + r.width / 2;
  const centreY = r.top + r.height / 2;
  const cast = castShadow({
    gap: t("shadowGap"),
    height: t("shadowHeight"),
    lightRadius: t("shadowSoftness"),
    lateralX: centreX - pointerX,
    lateralY: centreY - pointerY,
  });

  el.style.setProperty("--cast-x", `${cast.x.toFixed(1)}px`);
  el.style.setProperty("--cast-y", `${cast.y.toFixed(1)}px`);
  el.style.setProperty("--cast-blur", `${cast.blur.toFixed(1)}px`);

  // Only while the light is on it, and weaker the further away it is.
  el.style.setProperty("--cast-alpha", (near * near * t("shadowStrength")).toFixed(3));

  /*
   * The room reflection, offset for height.
   *
   * A photograph resting on the pane is a few millimetres nearer the eye than
   * the glass is, so it sees the same room from a slightly different place --
   * the reflection in it is shifted against the one in the pane rather than
   * continuous with it. That offset is what makes it read as sitting ON the
   * glass instead of being printed into it.
   */
  el.style.setProperty("--surface-x", `${Math.round(r.left)}px`);
  el.style.setProperty("--surface-y", `${Math.round(r.top)}px`);
}

export function registerEdgeGlow(el: HTMLElement) {
  panels.add(el);
  radii.delete(el);
  geometryAt = -1;
  // Measured at once, so this panel is never left on the fallback.
  measure(el);
  if (!bound) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    // Scrolling moves panels under a stationary cursor, so the lighting has to
    // be recomputed even when the pointer itself hasn't moved.
    const invalidate = () => {
      geometryAt = -1;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", () => {
      // Radii are cached, and a breakpoint can change them.
      for (const panel of panels) radii.delete(panel);
      invalidate();
    });
    bound = true;
  }
  /*
   * Measure once on registration. The thickness depends on where the panel
   * sits relative to the viewport, and nothing had computed that until the
   * first pointer move or scroll — so a panel that loaded under a stationary
   * cursor sat on the CSS fallback until you touched something.
   */
  /*
   * Rescheduled, not merely scheduled.
   *
   * Panels mount in bursts and at different times — the header with the
   * layout, the bands with the route — and the ordinary guard skips a
   * registration whenever a pass is already pending. That meant whichever
   * panel registered first was measured and the rest were left on the CSS
   * fallback until the visitor happened to move the pointer or scroll.
   * Cancelling and re-arming puts the pass after the last arrival instead.
   */
  geometryAt = -1;
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(apply);
  return () => {
    panels.delete(el);
    geometryAt = -1;
  };
}

/**
 * The frosted panels reacting to the shutter flash.
 *
 * The flash is a light source, so the glass answers it the way glass does: a
 * specular glare travelling across the face of each panel, and the rim flaring
 * to full brightness before falling back to whatever the cursor is doing.
 *
 * The attribute is removed and re-added around a forced reflow because
 * re-applying the same animation to an element that already has it does
 * nothing — the browser sees no change and the animation never restarts.
 */
export function flashPanels() {
  for (const el of panels) {
    el.removeAttribute("data-flash");
    // Reading layout here is the point: it flushes the removal so the
    // re-added attribute counts as a change.
    void el.offsetWidth;
    el.setAttribute("data-flash", "");
    window.setTimeout(() => el.removeAttribute("data-flash"), 1100);
  }
}
