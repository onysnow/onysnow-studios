/**
 * The light that goes THROUGH the glass and lands on the photographs behind.
 *
 * Everything else in the effect layer is light ON the glass: the rim, the
 * gloss, the grime catching it. This is the other half -- what the pane does
 * to the light on its way through, painted onto whatever it is standing over.
 * The bottom of a swimming pool is the picture to hold in mind: the water is
 * clear, and yet the floor is covered in bright rippling lines, because every
 * little curve in the surface bends the light a little and the bends pile up.
 *
 * THE GEOMETRY
 *
 * The pane stands `uGap` pixels off the photograph; the light is `uHeight`
 * above it. For a point P on the photograph, the ray back to the light
 * crosses the glass at Q = P + (L - P) * gap / height. Whatever the glass is
 * doing at Q decides what reaches P:
 *
 *   Q OUTSIDE the pane -- nothing in the way. Full light.
 *
 *   Q on the BEVEL -- the rounded edge is a lens. Its outer part tips the
 *   light inward, so the floor under the very edge goes DARK, and that light
 *   piles up a little further in as a BRIGHT LINE. That is the edge of the
 *   shadow a glass of water throws: a dark rim with a bright seam inside it.
 *
 *   Q on the FACE -- mostly straight through, less a little for reflection
 *   and absorption, but every smudge and scratch is a tiny lens too. Where
 *   the surface curves inward the light converges (bright), outward it
 *   spreads (dark). The measure of that is the Laplacian of the surface, so
 *   the caustic pattern IS the second derivative of the same photographed
 *   smudge map the pane wears -- in register with the marks you can see on
 *   it, and moving across the floor as the light moves, because Q does.
 *
 * Nothing is generated. The only texture is the photographed surface map; the
 * rest is the bevel's shape and the light's position.
 *
 * WHAT IT DRAWS
 *
 * Premultiplied light and shadow in one pass: white where light is added,
 * black where it is taken away. The canvas sits above the photographs and
 * below the panes, so in CSS mode the pane's own frost and bevel then bend
 * this too, exactly as they bend the photograph under it.
 */

export const FLOOR_VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const MAX_FLOOR_PANES = 8;

export const FLOOR_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uViewport;
uniform float uScale;
uniform vec2 uLight;
uniform float uCharge;

uniform float uGap;
uniform float uHeight;
uniform float uReach;
uniform float uBevel;
uniform float uLightGain;
uniform float uShadowGain;
uniform float uCaustics;
uniform float uPenumbra;

uniform int uCount;
uniform vec4 uRect[${MAX_FLOOR_PANES}];
uniform float uSeed[${MAX_FLOOR_PANES}];

uniform sampler2D uSurface;
uniform float uHasSurface;

/* Same atlas mapping as the pane's own surface (glass-light-shader.ts). */
vec3 surfaceAt(vec2 uv, float seed) {
  vec2 tile = floor(uv);
  float pick = mod(seed + tile.x + 3.0 * tile.y, 4.0);
  vec2 cell = vec2(mod(pick, 2.0), floor(pick * 0.5));
  vec2 f = fract(uv);
  f = mix(f, 1.0 - f, mod(abs(tile), 2.0));
  vec2 inCell = f * 0.49 + 0.005;
  return texture2D(uSurface, (inCell + cell) * 0.5).rgb;
}

float heightAt(vec2 uv, float seed) {
  return dot(surfaceAt(uv, seed), vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);

  float dist = length(P - uLight);
  float pool = exp(-(dist * dist) / (uReach * uReach)) * lit;
  if (pool < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Back along the ray to the glass plane.
  vec2 Q = P + (uLight - P) * (uGap / max(uHeight, uGap + 1.0));

  float through = 1.0;
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = Q - (r.xy + hs);
    float d = min(hs.x - abs(q.x), hs.y - abs(q.y));
    float pen = max(uPenumbra, 2.0);
    if (d <= -pen) continue;
    // How much of the light's disc sees this point through the glass: the
    // shadow's own edge is soft by exactly the penumbra, like any other.
    float inGlass = smoothstep(-pen, pen, d);
    d = max(d, 0.0);

    // Straight through the face, less what the glass reflects and keeps.
    float t = 0.86;

    // The bevel as a lens: dark where it throws light away, a bright seam
    // where that light comes down.
    float x = d / max(uBevel, 1.0);
    float thrown = 1.0 - smoothstep(0.0, 0.5, x);
    float seam = exp(-pow((x - 0.62) / 0.11, 2.0));
    t *= 1.0 - 0.6 * thrown;
    t += 2.0 * seam * step(x, 1.4);

    // The face's own lenses: the Laplacian of the photographed surface.
    if (uHasSurface > 0.5 && uCaustics > 0.0) {
      vec2 uv = (Q - r.xy) / 680.0;
      // Sampled across the penumbra, not per pixel: a light with a size
      // softens its caustics exactly as it softens its shadows, and a 2px
      // Laplacian of a photographed smudge is a field of hard little rings.
      float e = max(uPenumbra, 3.0) / 680.0;
      float seed = uSeed[i];
      float h0 = heightAt(uv, seed);
      float lap = heightAt(uv + vec2(e, 0.0), seed) + heightAt(uv - vec2(e, 0.0), seed)
                + heightAt(uv + vec2(0.0, e), seed) + heightAt(uv - vec2(0.0, e), seed)
                - 4.0 * h0;
      // Concave (negative Laplacian) gathers light; convex spreads it.
      t *= clamp(1.0 - lap * 7.0 * uCaustics, 0.4, 1.7);
    }

    through = mix(1.0, t, inGlass);
    break;
  }

  float add = pool * uLightGain * through;
  float take = pool * uShadowGain * max(1.0 - through, 0.0);
  float a = clamp(add + take, 0.0, 1.0);
  vec3 warm = vec3(1.0, 0.92, 0.8);
  gl_FragColor = vec4(warm * clamp(add, 0.0, 1.0), a);
}
`;
