/**
 * The magnifying glass (item 21, ?try=magnifier): the lens, as numbers.
 *
 * A detective's reading glass is a thick biconvex lens held above the page.
 * Through its middle the page is enlarged by its magnification; toward the
 * rim the enlargement grows (the edge of a simple lens is not corrected, so
 * the picture swims outward there -- pincushion), and the colours come apart
 * (a simple lens bends blue more than red, and the error grows with the
 * distance from the axis).
 *
 * All of it is one mapping: for each point of the lens, which point of the
 * page behind it is seen there. The CSS side (components/site/Magnifier)
 * turns that mapping into a displacement map for a backdrop-filter, which is
 * the only way in a browser to show the real page, live, through a lens.
 */

/** How much the middle of the lens enlarges. A reading glass is 2-3x. */
export const MAGNIFICATION = 2.2;

/** How much stronger the enlargement grows toward the rim (pincushion). */
export const RIM_SWIM = 0.55;

/**
 * The map's full-scale displacement, in radii. The largest offset the lens
 * asks for is about 0.31 of its radius (near 0.8 of the way out), so 0.7
 * keeps it inside the 8 bits with room to spare.
 */
export const MAP_SCALE = 0.7;

/**
 * Which point of the page is seen at a point of the lens, both as fractions
 * of the lens's radius from its centre (0 at the axis, 1 at the rim).
 *
 * At the axis the page is enlarged by MAGNIFICATION; the enlargement then
 * falls toward the rim (the seen point runs outward faster than the lens
 * point), which is the pincushion swim of an uncorrected lens. Always seen
 * from inside the lens's own footprint, so a backdrop-filter, which can only
 * see what is under its element, has everything it needs.
 */
export function seenRadius(r: number): number {
  const clamped = Math.max(0, Math.min(1, r));
  return (clamped / MAGNIFICATION) * (1 + RIM_SWIM * clamped * clamped);
}

/**
 * The displacement map: for each texel of an N x N square over the lens,
 * the offset from that point to the page point seen there, in the form
 * feDisplacementMap reads -- red for x, green for y, 128 for none, one unit
 * per `scale / 255` pixels. Outside the lens the offset is zero.
 *
 * `scale` is the displacement at full red or green, as a share of the
 * lens's radius: the filter is given `scale * radius` pixels.
 */
export function magnifierMap(size: number, scale = MAP_SCALE): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const y = ((j + 0.5) / size) * 2 - 1;
      const r = Math.hypot(x, y);
      let dx = 0;
      let dy = 0;
      if (r > 0 && r <= 1) {
        const k = seenRadius(r) / r;
        dx = x * k - x;
        dy = y * k - y;
      }
      const o = (j * size + i) * 4;
      // feDisplacementMap: P'(x) = P(x + scale * (C - 0.5)). Here the offset
      // is in radii and the filter's scale is `scale` radii.
      data[o] = Math.round(128 + (dx / scale) * 255);
      data[o + 1] = Math.round(128 + (dy / scale) * 255);
      data[o + 2] = 128;
      data[o + 3] = 255;
    }
  }
  return data;
}
