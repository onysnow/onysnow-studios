import { DEFAULT_EDGE_WIDTH } from "./edge-profile";

/**
 * The GLSL twins of edge-profile.ts, as one chunk every shader splices in.
 *
 * A shader that needs the edge includes this instead of writing its own
 * rounded box, band, Fresnel rise or tonemap. Each function here matches its
 * TypeScript twin by name and by maths; e2e/optics.spec.ts runs both in a real
 * WebGL context and fails if they drift apart.
 *
 * The edge width itself is NOT a constant in here. It arrives per pane as a
 * uniform, because it is a property of the pane. DEFAULT_EDGE_WIDTH is exposed
 * only so a shader has a sane value before the first pane is measured.
 *
 * GLSL ES 1.0, to match every shader on the site. Keep backticks out of the
 * comments inside the literal: one of them ends the string early.
 */
export const EDGE_PROFILE_GLSL = /* glsl */ `
#define DEFAULT_EDGE_WIDTH ${DEFAULT_EDGE_WIDTH.toFixed(1)}

/* Signed distance to a rounded rectangle. Negative inside, zero on the edge. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  float r = min(radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

/* 0 at the rim, 1 where the bevel meets the flat face and beyond. */
float edgeBand(float depth, float edgeWidth) {
  return clamp(depth / max(edgeWidth, 1.0), 0.0, 1.0);
}

/* The bevel cross-section, circle profile: height 0 at the rim to 1 at the face. */
float surfaceHeight(float x) {
  float t = clamp(x, 0.0, 1.0);
  return sqrt(1.0 - (1.0 - t) * (1.0 - t));
}

/* Schlick's fifth-power rise toward grazing. facing: 1 straight on, 0 grazing. */
float fresnelRise(float facing) {
  return pow(1.0 - clamp(facing, 0.0, 1.0), 5.0);
}

/* Signed Reinhard, then display gamma. */
vec3 toneMapGlass(vec3 c) {
  c = c / (1.0 + abs(c));
  return sign(c) * pow(abs(c), vec3(1.0 / 2.2));
}

/* Film response: bright light rolls off instead of clipping flat. */
vec3 toneMapFilm(vec3 c) {
  return vec3(1.0) - exp(-c * 1.15);
}
`;
