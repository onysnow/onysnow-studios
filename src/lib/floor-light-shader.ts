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
uniform float uFrost;
uniform float uPrism;

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
 * Light and shadow arriving at one point of the photograph, as the eye sees
 * it back through the glass.
 *
 * WHAT KIND OF GLASS
 *
 * These panes are flat sheets, frosted on the face, with a polished clear
 * bevel round the edge. That decides everything the light does:
 *
 *   The FACE is flat, so it focuses nothing. There is no pattern to throw --
 *   a pool-floor net only happens when the surface is wavy (see causticAt,
 *   off unless "Glass waviness" is raised for rolled or hammered glass). What
 *   the frost does instead is scatter: the beam going through comes out as a
 *   wider, dimmer spread of the same light, a little is sent back, and the
 *   photograph behind is seen through that same frost, so the light on it
 *   reads soft.
 *
 *   The BEVEL is clear, polished and angled: a prism. It turns the light
 *   that crosses it inward, so the floor right under it goes dark and that
 *   light lands further in as a band -- sharp-edged, brighter than the light
 *   around it because it is squeezed into less room, and fringed with colour
 *   at its edges because a prism bends blue more than red.
 *
 * All of it moves as the light moves, because where the ray crosses the
 * glass (Q) moves with the light.
 *
 * Returns the light added (per colour) in rgb and the light taken away in a.
 */
vec4 floorAt(vec2 P, float lit) {
  float dist2 = dot(P - uLight, P - uLight);
  float R = uReach;
  float pool = exp(-dist2 / (R * R)) * lit;
  // The same light after the frost has spread it: wider, and dimmer by the
  // same area, so no light is made up.
  float Rf = R * (1.0 + 0.9 * uFrost);
  float poolFrost = exp(-dist2 / (Rf * Rf)) * (R * R) / (Rf * Rf) * lit;
  if (max(pool, poolFrost) < 0.002) return vec4(0.0);

  // Back along the ray to the glass plane.
  vec2 Q = P + (uLight - P) * (uGap / max(uHeight, uGap + 1.0));

  vec3 light = vec3(pool);
  for (int i = 0; i < ${MAX_FLOOR_PANES}; i++) {
    if (i >= uCount) break;
    vec4 r = uRect[i];
    vec2 hs = r.zw * 0.5;
    vec2 q = Q - (r.xy + hs);
    // A band as wide as the page has no sides to cast: top and bottom only.
    bool straight = r.z >= uViewport.x / uScale - 1.0;
    float d = straight ? hs.y - abs(q.y) : min(hs.x - abs(q.x), hs.y - abs(q.y));
    // The shadow's edge is as soft as the light is big, and no softer.
    float pen = max(uPenumbra, 2.0);
    if (d <= -pen) continue;
    float inGlass = smoothstep(-pen, pen, d);
    d = max(d, 0.0);
    float W = max(uBevel, 1.0);
    float x = d / W;
    float soft = pen / W;

    /*
     * The face: flat, frosted. Straight on through, but the frost spreads
     * the beam (poolFrost) and sends a little back.
     */
    float onFace = smoothstep(1.0 - soft, 1.0 + soft, x);
    vec3 through = vec3(poolFrost * (1.0 - 0.18 * uFrost) * onFace);

    /*
     * The bevel: a clear, polished strip, angled. Every ray through it is
     * turned inward by about the same amount, so the light that crossed the
     * strip lands as a BAND -- the strip's own shape, moved -- not a line.
     * Under the strip itself that leaves a gap with nothing in it: the dark
     * part of the shadow. The facet is very slightly curved, so the band is
     * narrower than the strip it came through, and the same light in less
     * room is brighter by exactly that ratio: 1 / (1 - converge). Where the
     * band lands on top of light already coming straight through the face,
     * the two add, and that overlap is the brightest thing on the floor.
     *
     * The prism bends blue more than red, so the band lands a little
     * further in for blue: white in the middle, colour only at its edges.
     */
    float converge = 0.35;
    float width = 1.0 - converge;
    float shift = 0.55;
    float split = 0.05 * uPrism;
    vec3 from = vec3(shift - split, shift, shift + split);
    vec3 band = smoothstep(from - soft, from + soft, vec3(x))
              * (1.0 - smoothstep(from + width - soft, from + width + soft, vec3(x)));
    through += band * pool * 0.92 / width;

    // Wavy glass only -- flat glass has no pattern to throw.
    if (uCaustics > 0.0) {
      through *= causticAt(Q - r.xy, uSeed[i]);
    }

    light = mix(vec3(pool), through, inGlass);
    break;
  }

  vec3 add = light * uLightGain;
  float lost = max(pool - dot(light, vec3(0.3333)), 0.0);
  return vec4(add, lost * uShadowGain);
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);

  /*
   * Seen THROUGH a pane, the floor is bent by it on the way back to the eye.
   * Near an edge the bevel pulls in what lies beyond it -- the same lensing
   * the glass does to the photograph -- so the light and shadow under the
   * glass are bowed toward the rim instead of sitting flat.
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

  vec4 f = floorAt(look, lit);
  // Film, not a calculator: bright light rolls off instead of clipping flat.
  vec3 add = vec3(1.0) - exp(-f.rgb * 1.15);
  float a = clamp(max(add.r, max(add.g, add.b)) + f.a, 0.0, 1.0);
  vec3 warm = vec3(1.0, 0.94, 0.84);
  gl_FragColor = vec4(warm * add, a);
}
`;
