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
 * The bevel's cross-section, as a height in [0, 1] across its width.
 *
 * `x` is 0 at the outer edge and 1 where the bevel meets the flat face. The
 * circular profile is the default and is what a rounded-over edge is; the
 * squircle is the shape this used to approximate the circle with, kept because
 * it is a flatter, more industrial edge and worth having as a choice.
 *
 * Profiles from jeantimex/glass-effect-webgpu (ISC).
 */
export type SurfaceProfile = "circle" | "squircle";

export function surfaceHeight(x: number, profile: SurfaceProfile = "circle"): number {
  const t = Math.min(1, Math.max(0, x));
  if (profile === "squircle") return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
  return Math.sqrt(1 - Math.pow(1 - t, 2));
}

function surfaceDerivative(x: number, profile: SurfaceProfile): number {
  const dx = 0.001;
  const a = Math.max(x - dx, 0);
  const b = Math.min(x + dx, 1);
  return (surfaceHeight(b, profile) - surfaceHeight(a, profile)) / Math.max(b - a, 1e-6);
}

/**
 * How far the backdrop moves under a point on the bevel, in pixels.
 *
 * This is the part the first version faked. It took the gradient of the height
 * field, normalised it against the steepest slope on the pane and multiplied
 * by a chosen 40px -- so the displacement was a shape scaled by a number
 * somebody picked, and the number had to be re-picked whenever anything else
 * changed.
 *
 * Snell's law instead: refract the viewing ray at the surface, then follow it
 * through the glass it still has to cross and see where it comes out. The
 * answer falls out of the two quantities that actually determine it -- how
 * thick the glass is and what it is made of -- and is in real pixels, so
 * nothing needs scaling to taste.
 *
 * Method from jeantimex/glass-effect-webgpu (ISC).
 */
export function refractionOffset(
  x: number,
  bezelWidth: number,
  thickness: number,
  ior: number,
  profile: SurfaceProfile = "circle",
): number {
  const eta = 1 / ior;
  const height = surfaceHeight(x, profile);
  const slope = surfaceDerivative(x, profile);

  // Surface normal, pointing back out of the glass.
  const magnitude = Math.hypot(slope, 1);
  const nx = -slope / magnitude;
  const ny = -1 / magnitude;

  const dotNI = ny;
  const k = 1 - eta * eta * (1 - dotNI * dotNI);
  // Total internal reflection: nothing gets through along this ray.
  if (k < 0) return 0;

  const kSqrt = Math.sqrt(k);
  const rx = -(eta * dotNI + kSqrt) * nx;
  const ry = eta - (eta * dotNI + kSqrt) * ny;
  if (Math.abs(ry) < 1e-3) return 0;

  // The ray still has the bevel's own height plus the slab to cross.
  const remaining = height * bezelWidth + thickness;
  return rx * (remaining / ry);
}

export type BevelField = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, ready for `putImageData`. */
  data: Uint8ClampedArray;
  /**
   * The largest offset anywhere in the field, in map pixels.
   *
   * The map encodes each offset as a fraction of this, so the filter's `scale`
   * has to be set to it for the result to come out in real pixels. That is the
   * number that used to be a chosen 40.
   */
  maxOffset: number;
};

export type BevelOptions = {
  /** How wide the rounded-over edge is, in map pixels. */
  bezelWidth: number;
  /** How thick the slab is behind the bevel, in map pixels. */
  thickness: number;
  /** Index of refraction. 1.5 is ordinary glass. */
  ior: number;
  profile?: SurfaceProfile;
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
  options: BevelOptions,
): BevelField {
  const { bezelWidth, thickness, ior, profile = "circle" } = options;
  const data = new Uint8ClampedArray(width * height * 4);
  const halfW = width / 2;
  const halfH = height / 2;
  const e = 1;

  const ox = new Float32Array(width * height);
  const oy = new Float32Array(width * height);
  let maxOffset = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;

      const inside = -roundedRectSDF(px, py, halfW, halfH, radius);
      if (inside <= 0) continue;
      // Past the bevel the face is flat, so the ray goes straight through.
      if (inside >= bezelWidth) continue;

      /*
       * The direction is the SDF's own gradient, which points straight in from
       * the nearest edge -- along the top it is downward, at a corner it is
       * diagonal, and it follows the corner radius without being told about
       * it. The magnitude is Snell. Separating the two is what lets one
       * one-dimensional profile wrap correctly around a two-dimensional pane.
       */
      const dR = -roundedRectSDF(px + e, py, halfW, halfH, radius);
      const dL = -roundedRectSDF(px - e, py, halfW, halfH, radius);
      const dD = -roundedRectSDF(px, py + e, halfW, halfH, radius);
      const dU = -roundedRectSDF(px, py - e, halfW, halfH, radius);

      let gx = (dR - dL) / (2 * e);
      let gy = (dD - dU) / (2 * e);
      const len = Math.hypot(gx, gy);
      if (len < 1e-6) continue;
      gx /= len;
      gy /= len;

      const offset = refractionOffset(inside / bezelWidth, bezelWidth, thickness, ior, profile);

      const i = y * width + x;
      ox[i] = gx * offset;
      oy[i] = gy * offset;
      const mag = Math.abs(offset);
      if (mag > maxOffset) maxOffset = mag;
    }
  }

  const norm = maxOffset > 0 ? 1 / maxOffset : 0;

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // 128 exactly, not 127.5 rounded: a pixel in the body of the pane must not
    // move at all, and a half-step bias across the whole interior is a visible
    // shift of the entire backdrop.
    data[o] = 128 + Math.round(ox[i]! * norm * 127);
    data[o + 1] = 128 + Math.round(oy[i]! * norm * 127);
    data[o + 2] = 0;
    data[o + 3] = 255;
  }

  return { width, height, data, maxOffset };
}

/** True when nothing in the flat middle of the pane is displaced. */
export function interiorIsNeutral(field: BevelField, bezelWidth: number): boolean {
  const { width, height, data } = field;
  const halfW = width / 2;
  const halfH = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = -roundedRectSDF(x + 0.5 - halfW, y + 0.5 - halfH, halfW, halfH, 0);
      if (inside <= bezelWidth + 2) continue;
      const o = (y * width + x) * 4;
      if (data[o] !== 128 || data[o + 1] !== 128) return false;
    }
  }
  return true;
}
