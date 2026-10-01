/**
 * Shadows thrown onto the photographs, through the glass (item 52,
 * Ony, 2026-10-01: the shadows "dont go thru the glass like
 * theyre supposed to", and "The further away they are from the source of the
 * shadow combined with the angle, distance from the source of light and
 * brightness of that light the darker/more stretched/distorted it will be").
 *
 * Everything that stands in the light -- the copy and the buttons resting on
 * a pane, the cards, and the copy and buttons over the hero photograph -- is
 * painted, in its own shape (the very glyphs of the type), into a mask: the
 * casters. The floor light (lib/floor-light-shader), which works out the
 * lamp's light arriving at every point of the photographs, then asks of each
 * point how much of the lamp the casters hide from it. That is the whole of
 * a shadow, and everything Ony lists follows from it with nothing tuned:
 *
 *   where it falls, how big   a point P of the photograph sees the lamp
 *                             (height H, at L) along the ray to it; at a
 *                             caster's height h that ray crosses at
 *                             P + (L - P) h / H. So the shadow is the
 *                             caster's own shape, projected from the lamp:
 *                             thrown further and larger the higher the
 *                             caster stands and the nearer the lamp is.
 *   how soft, how stretched   the lamp is not a point: from P it is a disc of
 *                             radius R, and that disc, seen from P, crosses
 *                             the caster's plane as a disc of radius R h / H --
 *                             the mask is averaged over it, so the edge fades
 *                             over that width (the penumbra), growing with the
 *                             caster's height. Seen at a slant (theta off
 *                             straight down) the lamp's disc lies across the
 *                             plane stretched by 1 / cos(theta) toward it, so
 *                             a shadow far from the lamp is drawn out and
 *                             softer along the direction to the lamp.
 *   how dark                  what is hidden is the lamp's own light there --
 *                             falling as the inverse square of the distance,
 *                             with the slant, and scaled by its brightness --
 *                             so under a bright near lamp the shadow is deep
 *                             and far from it, faint; where the penumbra is
 *                             wider than the caster (a thin line of type high
 *                             up) no point is wholly hidden and the shadow is
 *                             a pale smudge.
 *   through the glass         a caster resting on a pane stands the pane's gap
 *                             and thickness higher above the photograph than
 *                             above the glass, and the frosted face spreads
 *                             the light that crosses it, so its shadow on the
 *                             photograph is further off, larger and softer
 *                             than the one on the glass -- and is seen back
 *                             through the pane's frost.
 *
 * Two heights, in two channels of the mask: red, what stands just off the
 * photograph itself (the hero's copy and buttons, CASTER_NEAR); green, what
 * rests on a pane (gap + thickness + its standoff above the glass).
 */

import type { SurfaceMaterial } from "@/effects/materials/surfaces";
import { litSurfaceList } from "@/effects/scene/scene";

/**
 * How far type and buttons stand off what they rest on, as a share of
 * "Content depth": between a line of type's and a plastic button's
 * (components/site/Glass TYPE_STANDOFF 0.42, PLASTIC_STANDOFF 0.5).
 */
export const CASTER_NEAR_STANDOFF = 0.45;

/**
 * What stands in the light: every lit surface but the photographs that ARE
 * the floor (an image not on a pane is a backdrop) and the light's own
 * layers.
 */
export function casterList(): Caster[] {
  const out: Caster[] = [];
  for (const s of litSurfaceList()) {
    const onGlass = s.el.closest(".glass") !== null;
    if (s.el.classList.contains("transmitted")) continue;
    /*
     * A photograph not on a pane is the floor itself. One on a pane -- a
     * card's print -- stands on it like the type and throws its two shadows
     * the same way (Ony, 2026-10-01: "The cards need to cast 2 shadows as
     * well"), from its own height: a mounted print stands further off the
     * glass than a line of type (blue channel, uCasterPrint*).
     */
    const isPhoto = s.el.querySelector("img") !== null || s.el.tagName === "IMG";
    if (isPhoto && !onGlass) continue;
    out.push({ el: s.el, material: s.material, onGlass, print: isPhoto });
  }
  return out;
}

/** Where the ray from a point of the photograph to the lamp crosses a caster's plane `h` up. */
export function castPoint(
  P: { x: number; y: number },
  L: { x: number; y: number },
  H: number,
  h: number,
): { x: number; y: number } {
  const k = h / Math.max(H, h + 1);
  return { x: P.x + (L.x - P.x) * k, y: P.y + (L.y - P.y) * k };
}

/**
 * The lamp's disc, seen from a point of the photograph, across a caster's
 * plane `h` up: its radius across, and along the direction to the lamp.
 */
export function lampDiscAt(
  P: { x: number; y: number },
  L: { x: number; y: number },
  H: number,
  R: number,
  h: number,
): { across: number; along: number } {
  const across = (R * h) / Math.max(H, h + 1);
  const lateral = Math.hypot(L.x - P.x, L.y - P.y);
  const cos = H / Math.hypot(lateral, H);
  return { across, along: across / Math.max(cos, 0.2) };
}

/**
 * The mask is drawn at the page's own resolution. It was half, and then
 * blurred a pixel on top -- 2 to 3 CSS px of softness that no lamp put
 * there -- so a thin stroke's shadow came out grey and fuzzy even with the
 * lamp right beside it, where a small light throws a crisp, dark shadow
 * (Ony, 2026-10-01). The softness now is only the lamp's own: its size,
 * the caster's height and the frost (casterCover).
 */
export const CASTER_SCALE = 1;

/** How opaque each kind of caster is to the lamp's light. */
export function casterOpacity(el: Element, material: SurfaceMaterial): number {
  if (el.classList.contains("plastic") && !el.classList.contains("plastic--dark")) {
    // Day-glo orange plastic: a coloured sheet, letting some of the light through.
    return material.id === "dayglo-orange" ? 0.55 : 0.6;
  }
  return 1;
}

type Word = { text: string; x: number; y: number; font: string; spacing: string; ascent: number };

const wordCache = new WeakMap<Element, { key: string; words: Word[] }>();

/*
 * Bumped whenever a web font finishes loading. The cache was keyed on the
 * block's size alone, and a heading laid out in the fallback font before
 * its own arrived keeps its size while its lines break differently -- so
 * the words' shadows stayed where the fallback put them: "to remember."
 * cast at the end of the first line, off to the right of "want", while the
 * words themselves had wrapped under it (Ony, 2026-10-01).
 */
let fontGeneration = 0;
if (typeof document !== "undefined") {
  document.fonts?.addEventListener?.("loadingdone", () => {
    fontGeneration += 1;
  });
}

/** Where a block's last character sits: changes whenever its lines break differently. */
function lastGlyphAt(el: HTMLElement, at: DOMRect): string {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (/\S/.test(node.data)) last = node;
  }
  if (!last) return "";
  const end = last.data.trimEnd().length;
  const range = document.createRange();
  range.setStart(last, Math.max(0, end - 1));
  range.setEnd(last, end);
  const r = range.getBoundingClientRect();
  return `${Math.round(r.left - at.left)},${Math.round(r.top - at.top)}`;
}

/** Whether something between `node` and `top` clips it away (a visually hidden span). */
function hiddenByClip(node: Element, top: Element): boolean {
  for (let n: Element | null = node; n && n !== top.parentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.clipPath !== "none" && /inset\(50%|polygon\(0/.test(cs.clipPath)) return true;
    if (cs.clip !== "auto" && /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip))
      return true;
    if (cs.position === "absolute" && cs.overflow === "hidden" && parseFloat(cs.width) <= 1)
      return true;
  }
  return false;
}

/** The words of a block of type, where each one sits (relative to the block), in its own font. */
function wordsOf(el: HTMLElement, ctx: CanvasRenderingContext2D): { at: DOMRect; words: Word[] } {
  const at = el.getBoundingClientRect();
  const key =
    `${Math.round(at.width)}x${Math.round(at.height)}|${el.textContent?.length ?? 0}` +
    `|${fontGeneration}|${lastGlyphAt(el, at)}`;
  const hit = wordCache.get(el);
  if (hit && hit.key === key) return { at, words: hit.words };
  const words: Word[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    /*
     * Text that is there for screen readers only, not for the eye: the
     * animated headings carry their whole line once more in a visually
     * hidden (.sr-only, clipped to nothing) span. Measured, it lay along the
     * heading in one unbroken run, a few pixels short of the real letters
     * (no per-letter cells), so every heading cast a second, fixed shadow
     * just to the left of its letters, whichever side the lamp was on (Ony,
     * 2026-10-01: the shadow of "it" sat beside it with the lamp on its left).
     */
    if (parent.closest(".sr-only") || hiddenByClip(parent, el)) continue;
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.font = font;
    const ascent = ctx.measureText("Hg").fontBoundingBoxAscent;
    const text = node.data;
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (r.width < 0.5) continue;
      const shown = cs.textTransform === "uppercase" ? m[0].toUpperCase() : m[0];
      words.push({
        text: shown,
        x: r.left - at.left,
        y: r.top - at.top,
        font,
        spacing: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing,
        ascent,
      });
    }
  }
  wordCache.set(el, { key, words });
  return { at, words };
}

const bare = new WeakMap<Element, boolean>();

/** Whether a computed colour paints nothing. */
export function isClear(colour: string): boolean {
  if (colour === "transparent" || colour === "rgba(0, 0, 0, 0)") return true;
  const slash = colour.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1) < 0.05;
  const rgba = colour.match(/^rgba\([^)]*,\s*([\d.]+)\)$/);
  if (rgba) return Number(rgba[1]) < 0.05;
  return false;
}

/**
 * A link or button that is only its words -- no fill, no border, no
 * picture -- casts its letters, not its box. "Explore the work" is an <a>
 * with nothing round its type, and threw a solid bar (Ony, 2026-10-01).
 */
function bareText(el: HTMLElement): boolean {
  const known = bare.get(el);
  if (known !== undefined) return known;
  const cs = getComputedStyle(el);
  const filled = cs.backgroundImage !== "none" || !isClear(cs.backgroundColor);
  const bordered = ["Top", "Right", "Bottom", "Left"].some(
    (side) =>
      parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
      cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none",
  );
  const result = !filled && !bordered && (el.textContent ?? "").trim().length > 0;
  bare.set(el, result);
  return result;
}

export type Caster = {
  el: HTMLElement;
  material: SurfaceMaterial;
  onGlass: boolean;
  /** A photograph mounted on a pane (a card): its own height, the mask's blue. */
  print?: boolean;
};

/**
 * Paint the casters into the mask: red, those just off the photograph;
 * green, those resting on glass. The canvas is the page at CASTER_SCALE.
 */
export function paintCasters(canvas: HTMLCanvasElement, casters: readonly Caster[]) {
  const w = Math.max(
    1,
    Math.round((document.documentElement.clientWidth || window.innerWidth) * CASTER_SCALE),
  );
  const h = Math.max(1, Math.round(window.innerHeight * CASTER_SCALE));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  ctx.setTransform(CASTER_SCALE, 0, 0, CASTER_SCALE, 0, 0);

  const vh = window.innerHeight;
  for (const c of casters) {
    const r = c.el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200 || r.width < 1) continue;
    const a = casterOpacity(c.el, c.material);
    const v = Math.round(255 * a);
    const colour = c.print ? `rgb(0 0 ${v})` : c.onGlass ? `rgb(0 ${v} 0)` : `rgb(${v} 0 0)`;
    ctx.fillStyle = colour;
    // A print's frame is a span too: it is drawn as its box, not as type.
    const isType =
      !c.print &&
      !c.el.classList.contains("plastic") &&
      (/^(H[1-6]|P|BLOCKQUOTE|SPAN|LI)$/.test(c.el.tagName) || bareText(c.el));
    if (isType) {
      const { at, words } = wordsOf(c.el, ctx);
      ctx.textBaseline = "alphabetic";
      for (const word of words) {
        ctx.font = word.font;
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = word.spacing;
        ctx.fillText(word.text, at.left + word.x, at.top + word.y + word.ascent);
      }
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    } else {
      const radius = Math.min(
        parseFloat(getComputedStyle(c.el).borderTopLeftRadius) || 0,
        r.height / 2,
      );
      ctx.beginPath();
      ctx.roundRect(r.left, r.top, r.width, r.height, radius);
      ctx.fill();
    }
  }
}
