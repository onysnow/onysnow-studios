/**
 * Detects the pointer being moved in a circle.
 *
 * The hard part is not noticing a circle, it's NOT noticing one while somebody
 * is just moving the mouse around. Four things have to hold together before
 * this fires:
 *
 *   - the recent path has to stay a sane distance from its own centre, so a
 *     drift across the page (centre somewhere off in the distance, radius
 *     enormous) doesn't qualify;
 *   - the radius has to be large enough that jitter in a small area can't wind
 *     up a full turn in a few pixels;
 *   - the turn has to accumulate in ONE direction — the signed sum cancels out
 *     for back-and-forth movement, which is what most real mouse motion is;
 *   - and it all has to happen inside a time window, so a slow orbit over half
 *     a minute of ordinary use doesn't add up to a gesture.
 */
const WINDOW_MS = 1800;
const MIN_RADIUS = 34;
const MAX_RADIUS = 420;
/** Wobble tolerance: how much the distance-from-centre may vary, proportionally. */
const MAX_RADIUS_SPREAD = 0.55;
const FULL_TURN = Math.PI * 2;
/*
 * More than one turn is required, and that is the single most important guard
 * here. Roundness cannot separate a deliberate circle from ordinary movement:
 * a rectangular sweep around the screen is a closed loop whose distance from
 * its own centre varies barely more than a circle's, so it passes every
 * shape test and sweeps a full turn. Nobody traces two consecutive turns by
 * accident, though, and doing it on purpose is effortless.
 */
const REQUIRED_TURNS = 1.75;
/** Share of samples allowed to move against the dominant direction. */
const MAX_REVERSAL_RATIO = 0.22;

type Point = { x: number; y: number; t: number };

export type CircleGestureHandlers = {
  /** 0 → 1 as the turn accumulates. Called on every sampled move. */
  onProgress?: (progress: number) => void;
  /** Fires once per completed turn, then the buffer resets. */
  onComplete?: () => void;
};

export function watchCircleGesture({ onProgress, onComplete }: CircleGestureHandlers) {
  let points: Point[] = [];
  let lastFire = 0;

  function reset() {
    points = [];
    onProgress?.(0);
  }

  function onMove(event: PointerEvent) {
    const now = performance.now();
    points.push({ x: event.clientX, y: event.clientY, t: now });
    // Drop anything older than the window; the gesture is always "recent path".
    points = points.filter((p) => now - p.t <= WINDOW_MS);

    if (points.length < 10) {
      onProgress?.(0);
      return;
    }

    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = radii.reduce((a, r) => a + r, 0) / radii.length;

    if (mean < MIN_RADIUS || mean > MAX_RADIUS) {
      onProgress?.(0);
      return;
    }

    // A circle keeps a roughly constant distance from its centre. A straight
    // line or a scribble does not.
    const spread = radii.reduce((a, r) => a + Math.abs(r - mean), 0) / radii.length / mean;
    if (spread > MAX_RADIUS_SPREAD) {
      onProgress?.(0);
      return;
    }

    // Sum the signed angle swept between consecutive samples. Back-and-forth
    // movement cancels itself; a genuine orbit accumulates.
    let swept = 0;
    let forward = 0;
    let backward = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!;
      const b = points[i]!;
      let d = Math.atan2(b.y - cy, b.x - cx) - Math.atan2(a.y - cy, a.x - cx);
      // Normalise into (-π, π] so crossing the seam doesn't read as a huge jump.
      if (d > Math.PI) d -= FULL_TURN;
      if (d < -Math.PI) d += FULL_TURN;
      swept += d;
      if (d > 0.0005) forward += 1;
      else if (d < -0.0005) backward += 1;
    }

    // A circle turns one way. A zig-zag that happens to close a loop doesn't.
    const turning = forward + backward;
    const against = Math.min(forward, backward);
    if (turning > 0 && against / turning > MAX_REVERSAL_RATIO) {
      onProgress?.(0);
      return;
    }

    const progress = Math.min(1, Math.abs(swept) / (FULL_TURN * REQUIRED_TURNS));
    onProgress?.(progress);

    if (progress >= 1 && now - lastFire > 900) {
      lastFire = now;
      onComplete?.();
      reset();
    }
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    window.removeEventListener("pointermove", onMove);
    reset();
  };
}
