/**
 * The liquids the drop simulation knows (task 77, 76).
 *
 * Every number is from docs/research/liquids-spray.md 5.2 (the per-liquid
 * table), itself from water-drops.md 2 and 4; what that table marks as an
 * estimate is marked here too.
 */

export type Liquid = {
  readonly id: number;
  readonly name: string;
  /** Density, kg/m^3. */
  readonly rho: number;
  /** Dynamic viscosity, Pa*s. */
  readonly eta: number;
  /** Surface tension, N/m. */
  readonly gamma: number;
  /** Advancing and receding contact angles on window glass, degrees. */
  readonly thetaA: number;
  readonly thetaR: number;
  /** Refractive index. */
  readonly n: number;
  /** Absorption, per mm, red green blue (Beer-Lambert through the drop's height). */
  readonly sigma: readonly [number, number, number];
  /** Whether a running drop leaves trail drops behind it (slime leaves a tether instead). */
  readonly trails: boolean;
  /** Evaporation, mm^3 per second per mm of contact radius (diffusion-limited: dV/dt goes as the radius). */
  readonly evaporation: number;
};

const ETA_WATER = 1.0e-3;

export const WATER: Liquid = {
  id: 0,
  name: "water",
  rho: 1000,
  eta: ETA_WATER,
  gamma: 0.072,
  // A real window that beads rain: 60 / 40 (water-drops 2.1-2.3, Quere).
  thetaA: 60,
  thetaR: 40,
  n: 1.333,
  sigma: [0, 0, 0],
  trails: true,
  // (estimate) a 1 uL drop (radius about 1 mm) gone in a few minutes.
  evaporation: 0.004,
};

export const BLOOD: Liquid = {
  id: 1,
  name: "blood",
  rho: 1055,
  eta: 4.8 * ETA_WATER,
  gamma: 0.058,
  // (estimate) pins hard.
  thetaA: 45,
  thetaR: 15,
  n: 1.36,
  // Beer-Lambert from the haemoglobin spectrum (OMLC, Prahl; water-drops 4).
  sigma: [0.5, 29, 34],
  trails: true,
  evaporation: 0.002,
};

export const SLIME: Liquid = {
  id: 2,
  name: "slime",
  rho: 1000,
  eta: 3000 * ETA_WATER,
  gamma: 0.06,
  // (estimate) high hysteresis.
  thetaA: 60,
  thetaR: 20,
  n: 1.34,
  // A green dye, the toy's classic (estimate: passes green, takes most red and blue in a millimetre).
  sigma: [0.9, 0.12, 0.8],
  trails: false,
  // Very slow (hours).
  evaporation: 0.00005,
};

export const LIQUIDS: readonly Liquid[] = [WATER, BLOOD, SLIME];

/**
 * The friction law's dimensionless beta (Li et al., Nat. Commun. 2023: 20-200,
 * tested from 1e-3 to 1 Pa*s); 100 for every liquid (liquids-spray 5.2).
 */
export const FRICTION_BETA = 100;
/** Furmidge's prefactor; 1 reproduces the measured 7-19 uL threshold (water-drops 2.3, computed). */
export const FURMIDGE_K = 1;
export const GRAVITY = 9.81;
