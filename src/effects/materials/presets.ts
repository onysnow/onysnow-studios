import { POLISHED_ROUGHNESS, frostRoughness } from "@/effects/optics/reflection";

/**
 * What the glass is made of, as data.
 *
 * The start of the material presets in the optics plan. Only the properties
 * something reads today are here; the rest (tint, dispersion in use, the
 * clear-float and acrylic presets) arrive with the <Pane> component.
 *
 * Soda-lime float glass: n = 1.518 and Abbe number about 60 (dispersion
 * 0.00867), from the glass properties table cited in the design doc. Its
 * reflectance straight on, ((n - 1) / (n + 1))^2, is 4.2%.
 */
export type Material = {
  /** Index of refraction. */
  ior: number;
  /** Abbe number: how little the index changes with colour. */
  abbe: number;
  /**
   * Which face carries the frost. Satin (acid-etched) glass is frosted on one
   * side; with the frost on the BACK, what you see through it is diffused
   * while the front face stays polished and reflects the room sharply.
   */
  frostedFace: "front" | "back";
};

export const FLOAT_GLASS: Material = { ior: 1.518, abbe: 60, frostedFace: "back" };

/** GGX roughness of the face the viewer looks at, from where the frost is. */
export function frontRoughness(material: Material, frost: number): number {
  return material.frostedFace === "front" ? frostRoughness(frost) : POLISHED_ROUGHNESS;
}
