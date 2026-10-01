/**
 * Kinds of rain on a window (task 77; Ony, 2026-10-01: "there seems to be
 * many types of rain from what I can see in the photos I sent you").
 *
 * What tells them apart in the reference photographs (water-drops.md 9.5):
 * how often a drop lands, how big the drops are when they land, how many
 * fine droplets fill the glass between them, and whether the wind pushes
 * the runners sideways. Every number here is an estimate matched to those
 * photographs, not a measurement:
 *
 * - Drizzle: falling drops under 0.5 mm across (the meteorological
 *   definition of drizzle), so the glass fills with a dense mist of tiny
 *   droplets and few drops big enough to run.
 * - Light and steady rain: scattered beads, a few runners.
 * - Downpour: big drops landing often; the glass is soon covered and
 *   streaming.
 * - Wind-driven: rain blown against the glass; runners slant with the wind.
 * - After the rain: nothing new lands; what is left beads, runs a little
 *   and dries.
 */

export type RainType = {
  label: string;
  /** Drops landing per second per square centimetre of glass. */
  rate: number;
  /** Median landing volume, uL (log-normal). */
  median: number;
  /** Fine droplets settling for each drop that lands. */
  droplets: number;
  /** Sideways push on a running drop, as a fraction of its speed (DropSim.wind). */
  wind: number;
  /** How hard it rained before you arrived, drops per second per cm^2 (what is already on the glass). */
  before: number;
};

export const RAIN_TYPES: readonly RainType[] = [
  { label: "Drizzle", rate: 0.04, median: 0.12, droplets: 60, wind: 0, before: 0.04 },
  { label: "Light rain", rate: 0.04, median: 0.35, droplets: 12, wind: 0, before: 0.04 },
  { label: "Steady rain", rate: 0.1, median: 0.45, droplets: 15, wind: 0, before: 0.1 },
  { label: "Downpour", rate: 0.3, median: 0.9, droplets: 20, wind: 0, before: 0.3 },
  { label: "Wind-driven rain", rate: 0.14, median: 0.5, droplets: 20, wind: 0.55, before: 0.14 },
  { label: "After the rain", rate: 0, median: 0.45, droplets: 0, wind: 0, before: 0.12 },
];

/** The rain type a knob value names (rounded, clamped). */
export function rainType(value: number): RainType {
  const i = Math.min(RAIN_TYPES.length - 1, Math.max(0, Math.round(value)));
  return RAIN_TYPES[i]!;
}
