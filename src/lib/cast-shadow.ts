/**
 * What a thing resting on the glass throws across it.
 *
 * Three numbers, all geometry rather than taste:
 *
 *   offset   = gap * lateral / height
 *   penumbra = lightRadius * gap / distance
 *   strength falls off with distance, like any real source
 *
 * The middle one is the one worth writing down, because every recipe for this
 * has it backwards: a shadow gets SHARPER as the light retreats, not softer.
 * The sun is ninety-three million miles away and casts the crispest shadow you
 * will ever see; bring a desk lamp close and the edges go to mush. `distance`
 * sits on the bottom, and that is what says so.
 */
export type CastInput = {
  /** How far the object stands off the surface it is resting on. */
  gap: number;
  /** How high the light is above that surface. */
  height: number;
  /** The emitter's own radius. A point source casts no penumbra at all. */
  lightRadius: number;
  /** From the light to the object's centre, across the surface. */
  lateralX: number;
  lateralY: number;
};

export type Cast = { x: number; y: number; blur: number };

export function castShadow({ gap, height, lightRadius, lateralX, lateralY }: CastInput): Cast {
  const h = Math.max(height, 1);
  const distance = Math.hypot(lateralX, lateralY, h);
  return {
    // Away from the light, by however far the gap and the angle say.
    x: (gap * lateralX) / h,
    y: (gap * lateralY) / h,
    blur: (lightRadius * gap) / distance,
  };
}
