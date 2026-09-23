/**
 * The displacement map for the pane bevel, computed from a distance field.
 *
 * WHAT CHANGED AND WHY
 *
 * The map used to be a single 8x128 PNG: a one-dimensional vertical profile,
 * green channel only, stretched across every pane with
 * `preserveAspectRatio="none"`. That carries two assumptions that are no longer
 * true. It has no horizontal component at all, so a pane narrow enough to show
 * its left and right arrises has no bend there; and its profile is a squircle
 * ramp, which is not the cross-section of a rounded-over edge.
 *
 * This computes the field instead, per pane geometry:
 *
 *   1. a rounded-rectangle signed distance function, so the bevel follows the
 *      pane's actual corner radius rather than being stretched over it;
 *   2. a circular height profile, `sqrt(d * (2R - d))` -- the true
 *      cross-section of an edge rounded over with radius R;
 *   3. the surface normal from the gradient of that height, by central
 *      differences, which is exact at every pixel and every size.
 *
 * The SDF and the height profile are from ybouane/liquidglass (MIT), which
 * arrives at the same place for a WebGL pipeline that rasterises the page into
 * a texture. We keep `backdrop-filter`, which gets the real backdrop from the
 * compositor for nothing, and take the geometry.
 *
 * ENCODING, WHICH IS FUSSY AND HAS BROKEN BEFORE
 *
 * `feDisplacementMap` reads the red channel as the X component of the
 * displacement and green as Y, each mapped from [0, 255] onto [-0.5, 0.5] and
 * then scaled. 128 is the fixed point: a pixel encoded 128 is not moved. Any
 * drift in the body of the map shifts the entire backdrop behind the pane,
 * which is what "the photographs are smeared" looked like the last time this
 * was wrong. `interiorIsNeutral` below is the guard.
 */

/** Signed distance to a rounded rectangle. Negative inside. */
export function roundedRectSDF(
  px: number,
  py: number,
  halfW: number,
  halfH: number,
  radius: number,
): number {
  const r = Math.min(radius, Math.min(halfW, halfH));
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

/**
 * Height of the bevel at `d` pixels in from the edge.
 *
 * A circle of radius `zRadius` rolled along the edge: flat once you are past
 * it, rising steeply right at the rim. This is the shape the old squircle ramp
 * was approximating.
 */
export function bevelHeight(d: number, zRadius: number): number {
  if (d <= 0) return 0;
  if (d >= zRadius) return zRadius;
  return Math.sqrt(d * (2 * zRadius - d));
}

export type BevelField = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, ready for `putImageData`. */
  data: Uint8ClampedArray;
  /** The largest slope in the field, so the caller can scale to real pixels. */
  peakSlope: number;
};

/**
 * Compute the map for one pane geometry.
 *
 * Everything is in the map's own pixel space. The caller scales the pane's
 * dimensions down uniformly before calling, so the bevel stays in proportion
 * when the map is stretched back over the pane.
 */
export function bevelField(
  width: number,
  height: number,
  radius: number,
  zRadius: number,
): BevelField {
  const data = new Uint8ClampedArray(width * height * 4);
  const halfW = width / 2;
  const halfH = height / 2;
  const e = 1;

  // Two passes: the slopes first, so they can be normalised against the real
  // peak rather than a guessed clamp. The old map clamped an unbounded
  // derivative, which is why its outermost row was arbitrary.
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  let peak = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;

      const inside = -roundedRectSDF(px, py, halfW, halfH, radius);
      const i = y * width + x;

      if (inside <= 0) {
        // Outside the pane: nothing to displace.
        continue;
      }

      const dR = -roundedRectSDF(px + e, py, halfW, halfH, radius);
      const dL = -roundedRectSDF(px - e, py, halfW, halfH, radius);
      const dD = -roundedRectSDF(px, py + e, halfW, halfH, radius);
      const dU = -roundedRectSDF(px, py - e, halfW, halfH, radius);

      // Central differences of the height field give the surface gradient;
      // the normal is (-grad, 1) normalised, and the displacement follows the
      // gradient directly.
      const sx = (bevelHeight(dR, zRadius) - bevelHeight(dL, zRadius)) / (2 * e);
      const sy = (bevelHeight(dD, zRadius) - bevelHeight(dU, zRadius)) / (2 * e);

      gx[i] = sx;
      gy[i] = sy;
      const mag = Math.hypot(sx, sy);
      if (mag > peak) peak = mag;
    }
  }

  const norm = peak > 0 ? 1 / peak : 0;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // 128 exactly, not 127.5 rounded: a pixel in the body of the pane must not
    // move at all, and a half-step bias across the whole interior is a visible
    // shift of the entire backdrop.
    data[o] = 128 + Math.round(gx[i]! * norm * 127);
    data[o + 1] = 128 + Math.round(gy[i]! * norm * 127);
    data[o + 2] = 0;
    data[o + 3] = 255;
  }

  return { width, height, data, peakSlope: peak };
}

/** True when nothing in the flat middle of the pane is displaced. */
export function interiorIsNeutral(field: BevelField, zRadius: number): boolean {
  const { width, height, data } = field;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = -roundedRectSDF(x + 0.5 - halfW, y + 0.5 - halfH, halfW, halfH, 0);
      // Well past the bevel, so the height field is flat and the slope zero.
      if (inside <= zRadius + 2) continue;
      const o = (y * width + x) * 4;
      if (data[o] !== 128 || data[o + 1] !== 128) return false;
    }
  }
  return true;
}
