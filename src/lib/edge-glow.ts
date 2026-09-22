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

/** How far outside a panel the cursor can be and still light its edge. */
const REACH = 320;

let frame = 0;
let pointerX = -9999;
let pointerY = -9999;
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
    geometry.push({
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      r: cornerRadius(el),
      t: paneTilt(r),
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
  root.setProperty("--reflect-x", (pointerX / window.innerWidth - 0.5).toFixed(3));
  root.setProperty("--reflect-y", (pointerY / window.innerHeight - 0.5).toFixed(3));
  // Refreshes the shared cache as a side effect, so the shader's call this
  // frame is free.
  glassGeometry(now);

  for (const el of panels) measure(el);
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
