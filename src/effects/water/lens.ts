/**
 * The JS twin of the water layer's lens (water.glsl.ts), for tests
 * (water-drops.md 7.5 step 3).
 *
 * A drop is a spherical cap of contact radius a and height h0 (mm). At a
 * distance r from its centre its face slopes by s = r / sqrt(R^2 - r^2),
 * R = (a^2 + h0^2) / 2 h0; a ray from straight ahead is turned toward the
 * centre by (n - 1) s and meets the photograph `gap` behind the glass that
 * far over. Same units throughout.
 */
export function capSlope(r: number, a: number, h0: number): number {
  const R = (a * a + h0 * h0) / (2 * h0);
  if (r >= a) return 0;
  return r / Math.sqrt(Math.max(R * R - r * r, 1e-12));
}

/** Where the photograph is seen through the point r from the drop's centre (signed, along the same line). */
export function seenAt(r: number, a: number, h0: number, n: number, gap: number): number {
  return r - (n - 1) * gap * capSlope(r, a, h0);
}

/** The drop's focal length as a thin plano-convex lens: R / (n - 1). */
export function focalLength(a: number, h0: number, n: number): number {
  return (a * a + h0 * h0) / (2 * h0) / (n - 1);
}

/** The critical angle inside water against air, degrees: asin(1 / n). */
export function criticalAngle(n: number): number {
  return (Math.asin(1 / n) * 180) / Math.PI;
}
