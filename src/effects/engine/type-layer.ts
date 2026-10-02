/**
 * The page's copy drawn as a texture, for the passes that look through it
 * (the rain: Ony, 2026-10-02, "the raindrops would be on top of the letters
 * magnifying the part that it's on").
 *
 * With "Type on the glass" the letters are printed on the glass's own face,
 * so a drop sitting on them shows them bent and enlarged, as a drop on a
 * printed page does. The DOM draws the letters where no water is; where the
 * water draws, it draws them itself from this texture, at the point its
 * sight lands on the glass. The words come from the same layout the shadow
 * casters use (effects/optics/casters wordsOf): each word in its own font,
 * spacing and colour, where the page put it.
 */

import { wordsOf } from "@/effects/optics/casters";
import { litSurfaceList } from "@/effects/scene/scene";

/**
 * Draw the type over a pane into `canvas`: pane-local, `scale` device px per
 * CSS px. Returns whether anything was drawn.
 */
export function paintTypeLayer(
  canvas: HTMLCanvasElement,
  paneEl: HTMLElement,
  scale: number,
): boolean {
  // Measured now, with the words: the two must agree to the pixel, whatever has scrolled since the pane was last read.
  const r = paneEl.getBoundingClientRect();
  const pane = { x: r.left, y: r.top, w: r.width, h: r.height };
  const w = Math.max(1, Math.round(pane.w * scale));
  const h = Math.max(1, Math.round(pane.h * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, -pane.x * scale, -pane.y * scale);
  let drawn = false;
  for (const s of litSurfaceList()) {
    if (s.material.id !== "ink") continue;
    const r = s.el.getBoundingClientRect();
    if (
      r.right < pane.x ||
      r.left > pane.x + pane.w ||
      r.bottom < pane.y ||
      r.top > pane.y + pane.h
    )
      continue;
    const { at, words } = wordsOf(s.el, ctx);
    ctx.textBaseline = "alphabetic";
    for (const word of words) {
      ctx.font = word.font;
      ctx.fillStyle = word.colour;
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = word.spacing;
      ctx.fillText(word.text, at.left + word.x, at.top + word.y + word.ascent);
      drawn = true;
    }
  }
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  return drawn;
}
