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

/*
 * The shutter charge gates ALL of it.
 *
 * A glass panel does not glow; a light shining on one does. With no light in
 * the room — the pointer drifting, nothing wound — the rim, the bloom, the
 * glare and the smudges have nothing to reveal them and are simply absent.
 * They come up with the charge and hold while it is held.
 */
let charge = 0;

export function setGlowCharge(value: number) {
  if (value === charge) return;
  charge = value;
  if (!frame) frame = requestAnimationFrame(apply);
}

export type GlassRect = {
  /** Top-left corner and size, in CSS pixels, viewport-relative. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, in CSS pixels. */
  r: number;
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
    geometry.push({ x: r.left, y: r.top, w: r.width, h: r.height, r: cornerRadius(el) });
  }
  return geometry;
}

function apply() {
  frame = 0;
  const now = performance.now();
  // Refreshes the shared cache as a side effect, so the shader's call this
  // frame is free.
  glassGeometry(now);

  for (const el of panels) {
    const r = el.getBoundingClientRect();

    // Distance from the pointer to the rectangle: zero while inside it, and
    // the straight-line gap to the nearest edge once outside.
    const dx = Math.max(r.left - pointerX, 0, pointerX - r.right);
    const dy = Math.max(r.top - pointerY, 0, pointerY - r.bottom);
    const nearness = Math.max(0, 1 - Math.hypot(dx, dy) / REACH);

    el.style.setProperty("--glow-x", `${pointerX - r.left}px`);
    el.style.setProperty("--glow-y", `${pointerY - r.top}px`);
    // Eased so the light comes up gently as the cursor approaches rather than
    // switching on at the boundary, then scaled by how wound the shutter is.
    el.style.setProperty("--glow-on", (nearness * nearness * charge).toFixed(3));
  }
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
