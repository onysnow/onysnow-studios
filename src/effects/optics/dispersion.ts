/**
 * How a glass's index changes with the colour of the light (dispersion), from
 * the two numbers a material carries: its index at the helium d line and its
 * Abbe number (effects/materials/presets).
 *
 * Cauchy's two-term law, n(lambda) = A + B / lambda^2, fitted so that
 *
 *   n(587.6 nm) = n_d                                  (the d line)
 *   (n_d - 1) / (n(486.1 nm) - n(656.3 nm)) = V_d      (the Abbe number)
 *
 * which is exactly what an Abbe number is defined to measure. Good to a few
 * parts in ten thousand across the visible for a crown glass like soda-lime,
 * which is far finer than a pixel can show. Used by the laser's beam (one
 * wavelength) and, later, by the prism (all of them).
 */

const LAMBDA_D = 587.6;
const LAMBDA_F = 486.1;
const LAMBDA_C = 656.3;

/** The glass's index at a wavelength in nanometres. */
export function indexAt(lambdaNm: number, nd: number, abbe: number): number {
  const spread = (nd - 1) / abbe; // n_F - n_C
  const b = spread / (1 / (LAMBDA_F * LAMBDA_F) - 1 / (LAMBDA_C * LAMBDA_C));
  const a = nd - b / (LAMBDA_D * LAMBDA_D);
  return a + b / (lambdaNm * lambdaNm);
}
