/**
 * Glow-in-the-dark paint (item 25): a phosphor, as two stores of light.
 *
 * Strontium aluminate -- the green of modern glow paint -- does not fade the
 * way a single exponential would. Light excites it into two kinds of trap:
 * shallow ones that empty within a couple of seconds (the bright first
 * flare you see the moment the light goes off) and deep ones that leak for
 * minutes (the steady mid glow that is left, fading slowly to nothing). The
 * glow is what both stores give back as they empty, so it falls hard at
 * first and then sits on a plateau that sinks slowly: exactly the behaviour
 * asked for.
 *
 * Kept in one place so the paint (components/site/GlowPaint) and its test
 * read the same numbers. Times in seconds.
 */

/** How long the shallow traps take to empty to 1/e. */
export const FAST_DECAY = 1.2;
/** How long the deep traps take to empty to 1/e. */
export const SLOW_DECAY = 45;
/** Of the light taken in, the share that lands in the shallow traps. */
export const FAST_SHARE = 0.78;
/** The colour it glows: the yellow-green of strontium aluminate. */
export const PHOSPHOR_GLOW = [0.55, 1.0, 0.62] as const;

export type PhosphorCell = { fast: number; slow: number };

/** Light falls on a cell: fill both stores, never past full. */
export function excite(cell: PhosphorCell, amount: number) {
  cell.fast = Math.min(1, cell.fast + amount * FAST_SHARE);
  cell.slow = Math.min(1, cell.slow + amount * (1 - FAST_SHARE));
}

/** Time passes for a cell. */
export function decay(cell: PhosphorCell, seconds: number) {
  cell.fast *= Math.exp(-seconds / FAST_DECAY);
  cell.slow *= Math.exp(-seconds / SLOW_DECAY);
}

/**
 * How brightly a cell glows. The shallow store is emptying fast, so it gives
 * back a lot of light per second for a little while; the deep store a little
 * for a long time. The shallow store is weighted up to show that: it is what
 * makes the first seconds blaze.
 */
export function glowOf(cell: PhosphorCell): number {
  return Math.min(1, cell.fast * 1.15 + cell.slow * 1.2);
}
