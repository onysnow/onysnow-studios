import { POLISHED_ROUGHNESS, frostRoughness } from "@/effects/optics/reflection";

/**
 * What the glass is made of, as data (optics plan step 2).
 *
 * A pane names its material (`<Pane material="frosted-float">`, carried on
 * the element as `data-material`), and every pass reads that one description,
 * so the light on the glass, through it and under it always agree. These are
 * CAUSES: change the material and every result changes with it.
 *
 * Only the preset the site uses is here. The clear-float, acrylic and water
 * presets and the admin picker arrive with step 10, when something can use
 * them; their values in the design doc still have entries to confirm.
 */
export type Material = {
  /** The name a pane uses to pick it. */
  id: MaterialId;
  /** Index of refraction. */
  ior: number;
  /** Abbe number: how little the index changes with colour. */
  abbe: number;
  /**
   * How frosted the frosted face is, 0 (polished) to 1 (acid-etched). The
   * "Frost" setting edits it on the site's glass.
   */
  frost: number;
  /**
   * Which face carries the frost. Satin (acid-etched) glass is frosted on one
   * side; with the frost on the BACK, what you see through it is diffused
   * while the front face stays polished and reflects the room sharply.
   */
  frostedFace: "front" | "back";
  /**
   * Beer-Lambert absorption per unit of path, red / green / blue: the colour
   * of a long path through it (its side faces). Measured for soda-lime float
   * glass from Ony's reference photographs; see effects/optics/edge-side.ts.
   */
  absorb: readonly [number, number, number];
};

export type MaterialId = "frosted-float";

/**
 * Soda-lime float glass, satin-etched on the back: today's panes.
 *
 * n = 1.518 and Abbe number about 60 (dispersion 0.00867), from the glass
 * properties table cited in the design doc. Reflectance straight on,
 * ((n - 1) / (n + 1))^2, is 4.2%. Frost 0.6 is the value the panes have
 * always had.
 */
export const FROSTED_FLOAT: Material = {
  id: "frosted-float",
  ior: 1.518,
  abbe: 60,
  frost: 0.6,
  frostedFace: "back",
  absorb: [2.7, 0.9, 1.2],
};

export const MATERIALS: Readonly<Record<MaterialId, Material>> = {
  "frosted-float": FROSTED_FLOAT,
};

export const DEFAULT_MATERIAL: MaterialId = "frosted-float";

/** The attribute a pane carries its material on. */
export const MATERIAL_ATTR = "data-material";

/** A material by name; an unknown name is the default rather than an error. */
export function materialById(id: string | null | undefined): Material {
  return (id && MATERIALS[id as MaterialId]) || MATERIALS[DEFAULT_MATERIAL];
}

/** The old name, kept so existing imports read the same glass. */
export const FLOAT_GLASS = FROSTED_FLOAT;

/** GGX roughness of the face the viewer looks at, from where the frost is. */
export function frontRoughness(material: Pick<Material, "frostedFace">, frost: number): number {
  return material.frostedFace === "front" ? frostRoughness(frost) : POLISHED_ROUGHNESS;
}
