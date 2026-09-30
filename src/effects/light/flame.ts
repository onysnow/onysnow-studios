/**
 * How a road flare's flame burns, over time (item 25e; claude/tools-research.md).
 *
 * A road flare (a fusee) is a paper tube of strontium nitrate with an
 * oxidiser and a fuel. Its light is strontium's: SrOH and SrCl radiate a
 * broad band between about 600 and 700 nm, a deep scarlet (Juknelevicius et
 * al.; PhysicsOpenLab flame test), so bright at the burning end that a
 * camera clips it to a pinkish white with the red only round it.
 *
 * The flame is a buoyant diffusion flame, and those do not flicker at
 * random: they PUFF, shedding a vortex at a frequency set by the size of
 * the burning surface, f ~ 1.5 / sqrt(D) Hz with D in metres (Cetegen &
 * Ahmed 1993, for pool fires and burner flames alike). A flare's end is
 * about 25 mm across, so it puffs near 9.5 Hz -- the fast, regular throb
 * you see in footage. On that ride smaller turbulent wobbles, and now and
 * then a sputter: a lump of slag breaks off the burning end, the flame
 * gutters for a fraction of a second and a spray of sparks flies.
 *
 * Deterministic in time (a hash, not Math.random), so a test and a
 * screenshot can pin a moment.
 */

/** The burning end's diameter, metres. */
export const FLARE_END = 0.025;

/** A buoyant flame's puffing frequency for a burning surface D metres across. */
export function puffingHz(diameter: number): number {
  return 1.5 / Math.sqrt(diameter);
}

/** How long, on average, between sputters, seconds. */
const SPUTTER_SLOT = 0.4;
/** The chance a slot holds a sputter. */
const SPUTTER_CHANCE = 0.3;
/** How fast a sputter recovers, seconds (to 1/e). */
const SPUTTER_RECOVERY = 0.09;

/** A repeatable pseudo-random number in [0, 1) for an integer. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The sputter under way at a moment: 0 for none, up to 1 the instant the
 * slag breaks away, dying back over a tenth of a second.
 */
export function sputterAt(seconds: number): number {
  const slot = Math.floor(seconds / SPUTTER_SLOT);
  let strongest = 0;
  // This slot's and the one before's, as a sputter can run across the boundary.
  for (const k of [slot - 1, slot]) {
    if (hash(k) >= SPUTTER_CHANCE) continue;
    const at = (k + hash(k + 0.5)) * SPUTTER_SLOT;
    if (seconds < at) continue;
    const size = 0.6 + 0.4 * hash(k + 0.25);
    strongest = Math.max(strongest, size * Math.exp(-(seconds - at) / SPUTTER_RECOVERY));
  }
  return strongest;
}

/**
 * How brightly the flare burns at a moment, as a share of its steady level:
 * the puffing throb, turbulence on it, and the gutter of a sputter.
 */
export function flareFlickerAt(seconds: number): number {
  const tau = Math.PI * 2;
  const f = puffingHz(FLARE_END);
  const puff = 0.07 * Math.sin(tau * f * seconds) + 0.025 * Math.sin(tau * 2 * f * seconds + 0.9);
  // Turbulence: smaller and faster wobbles, at incommensurate rates so they never repeat visibly.
  const turbulence =
    0.035 * Math.sin(tau * 3.1 * seconds + 0.3) +
    0.025 * Math.sin(tau * 5.7 * seconds + 2.1) +
    0.015 * Math.sin(tau * 14.3 * seconds + 1.1) +
    0.01 * Math.sin(tau * 21.9 * seconds + 0.6);
  const gutter = -0.45 * sputterAt(seconds);
  return Math.min(1.05, Math.max(0.4, 0.88 + puff + turbulence + gutter));
}
