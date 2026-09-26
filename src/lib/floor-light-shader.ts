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
 *   and absorption, but the sheet is never quite flat, and its slow waviness
 *   focuses and spreads the light into the net of bright lines on the floor of
 *   a pool. It moves across the floor as the light moves, because Q does.
 *
 * The caustic comes from the glass's waviness (see causticAt), the rest from
 * the bevel's shape and the light's position.
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
uniform float uView;

uniform int uCount;
uniform vec4 uRect[${MAX_FLOOR_PANES}];
uniform float uSeed[${MAX_FLOOR_PANES}];

/*
 * The bottom of the pool, worked out rather than drawn.
 *
 * No sheet of glass is flat: rolled and float glass both carry a slow
 * waviness, a fraction of a millimetre over a few centimetres, and it is that
 * waviness -- not the dirt -- that throws a pool-floor pattern. The surface is
 * modelled as a handful of long, shallow ripples at unrelated angles and
 * lengths (the same model a pool's surface is: a sum of waves). Each point of
 * the glass tips the light passing it by the slope there, so after the gap the
 * light that went through a small patch lands on a patch stretched or squeezed
 * by the CURVATURE there. The brightness is the ratio of the two areas --
 * 1 / det(I + s * Hessian) -- which is exactly the optics of a caustic: where
 * neighbouring rays cross, det goes to zero and the floor gets the bright,
 * knotted lines a pool floor is made of; where they spread it goes dim.
 *
 * The light is not a point, so a line can only be as sharp as the light is
 * small: the determinant is floored by the penumbra, and a big soft lamp
 * gives soft cells while a tight one gives wire-thin lines.
 */
float causticAt(vec2 x, float seed) {
  x += vec2(seed * 613.0, seed * 389.0);
  float hxx = 0.0;
  float hyy = 0.0;
  float hxy = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float ang = seed * 1.7 + fk * 2.39996;       // golden angle: never lined up
    vec2 d = vec2(cos(ang), sin(ang));
    float len = 190.0 / (1.0 + fk * 0.33);        // 190 px down to ~72 px
    float w = 6.2831853 / len;
    // Amplitude chosen so every ripple bends equally: a * w^2 = 1/6.
    float curve = -sin(dot(d, x) * w + fk * 1.618 + seed * 4.0) / 6.0;
    hxx += curve * d.x * d.x;
    hyy += curve * d.y * d.y;
    hxy += curve * d.x * d.y;
  }
  float s = 3.5 * uCaustics * clamp(uGap / 70.0, 0.3, 2.5);
  float det = (1.0 + s * hxx) * (1.0 + s * hyy) - s * s * hxy * hxy;
  float soft = clamp(uPenumbra / 240.0, 0.03, 0.4);
  return clamp(1.0 / max(abs(det), soft), 0.2, 7.0);
}

/*
 * Light and shadow arriving at one point of the photograph.
 * x: light added, y: light taken away.
 */
vec2 floorAt(vec2 P, float lit) {
  float dist = length(P - uLight);
  float pool = exp(-(dist * dist) / (uReach * uReach)) * lit;
  if (pool < 0.002) return vec2(0.0);

  // Back along the ray to the glass plane.
  vec2 Q = P + (uLight - P) * (uGap / max(uHeight, uGap + 1.0));

  float through = 1.0;
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = Q - (r.xy + hs);
    // A band as wide as the page has no sides to cast: top and bottom only.
    bool straight = r.z >= uViewport.x / uScale - 1.0;
    float d = straight ? hs.y - abs(q.y) : min(hs.x - abs(q.x), hs.y - abs(q.y));
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

    // The face's own lenses -- see causticAt().
    if (uCaustics > 0.0) {
      t *= causticAt(Q - r.xy, uSeed[i]);
    }

    through = mix(1.0, t, inGlass);
    break;
  }

  return vec2(pool * uLightGain * through, pool * uShadowGain * max(1.0 - through, 0.0));
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);

  /*
   * Seen THROUGH a pane, the floor is bent by it on the way back to the eye.
   * Near an edge the bevel pulls in what lies beyond it -- the same lensing
   * the glass does to the photograph -- so the light and shadow under the
   * glass are stretched and bowed toward the rim instead of sitting flat.
   */
  vec2 look = P;
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = P - (r.xy + hs);
    bool straight = r.z >= uViewport.x / uScale - 1.0;
    float dy = hs.y - abs(q.y);
    float dx = straight ? 1e5 : hs.x - abs(q.x);
    float d = min(dx, dy);
    if (d <= 0.0) continue;
    float x = clamp(d / max(uBevel, 1.0), 0.0, 1.0);
    float bend = (1.0 - x) * (1.0 - x) * uBevel * 0.9 * uView;
    vec2 outward = dy < dx ? vec2(0.0, sign(q.y)) : vec2(sign(q.x), 0.0);
    look = P + outward * bend;
    break;
  }

  vec2 f = floorAt(look, lit);
  // Film, not a calculator: bright lines roll off instead of clipping flat,
  // so a knot of crossed caustics stays a line and does not become a blob.
  float add = 1.0 - exp(-f.x * 1.15);
  float take = f.y;
  float a = clamp(add + take, 0.0, 1.0);
  vec3 warm = vec3(1.0, 0.92, 0.8);
  gl_FragColor = vec4(warm * clamp(add, 0.0, 1.0), a);
}
`;
