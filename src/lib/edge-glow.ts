/**
 * Cursor-tracked edge lighting for the frosted bands.
 *
 * Every registered panel shares ONE pointer listener and one rAF pass. Each
 * panel having its own listener would mean a `getBoundingClientRect` per panel
 * per pointer event — a forced layout several times a frame, which is exactly
 * the kind of thing that makes a page feel heavy for an effect nobody asked to
 * pay for.
 *
 * Writes only custom properties, never layout properties, so the work stays in
 * paint rather than triggering reflow.
 */
const panels = new Set<HTMLElement>();

/** How far outside a panel the cursor can be and still light its edge. */
const REACH = 320;

let frame = 0;
let pointerX = -9999;
let pointerY = -9999;
let bound = false;

function apply() {
  frame = 0;
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
    // switching on at the boundary.
    el.style.setProperty("--glow-on", (nearness * nearness).toFixed(3));
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
  if (!bound) {
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    // Scrolling moves panels under a stationary cursor, so the lighting has to
    // be recomputed even when the pointer itself hasn't moved.
    window.addEventListener(
      "scroll",
      () => {
        if (!frame) frame = requestAnimationFrame(apply);
      },
      { passive: true },
    );
    bound = true;
  }
  return () => {
    panels.delete(el);
  };
}
