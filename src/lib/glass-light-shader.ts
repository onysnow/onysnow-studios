/**
 * Fragment shader for the cursor light falling on glass.
 *
 * The same argument as the cursor light itself: CSS composites in SDR, so a
 * gradient can never be brighter than white and a "blown" edge has to be
 * hand-authored as a white stop — which is precisely why every CSS version of
 * the lit rim read as an amber tint painted along the border rather than as an
 * edge catching a light. Here the rim's emission genuinely exceeds 1.0 and a
 * tonemap crushes it, so the white core is an outcome of the brightness rather
 * than a colour that was chosen.
 *
 * Three things are computed per panel, all from one light position:
 *
 *   rim     the boundary catching the source. Modulated by the light reaching
 *           each point on it, so the near edge blows out and the far edge stays
 *           dark without any directional gradient being authored.
 *   face    light scattered into the body of the pane — the ambient bloom.
 *   mirror  the specular image of the source in the glass. Two of them, in
 *           fact: a pane has a front and a back surface and reflects from both,
 *           which is why a real window shows a bright reflection with a fainter
 *           ghost offset below it. That doubling is most of what makes a
 *           reflection read as glass rather than as a smear of light.
 *
 * Unused rect slots are parked far offscreen at zero size, so every fragment
 * runs the same fixed number of iterations and there is no dynamic branching.
 */
export const GLASS_LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

#define MAX_RECTS 8

uniform vec2  uViewport;          // device pixels
uniform float uScale;             // device pixels per CSS pixel
uniform vec2  uLight;             // CSS pixels, viewport-relative
uniform float uCharge;            // 0 to 1
uniform vec4  uRects[MAX_RECTS];  // x, y, w, h in CSS pixels
uniform float uRadii[MAX_RECTS];  // corner radius in CSS pixels
uniform vec3  uWarm;
uniform vec3  uCool;

/* Signed distance to a rounded rectangle. Negative inside, zero on the edge. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  float r = min(radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;

  float dl = distance(frag, uLight);

  /*
   * How much of the source reaches this point. Inverse-square close in, plus a
   * far exponential tail for the scatter — a single falloff, however bright,
   * stays a disc, and the tail is what makes a light look like it is lighting
   * something rather than sitting on top of it.
   */
  float direct = 1.0 / (1.0 + (dl * dl) / 3600.0);
  float spill = exp(-dl / 280.0);
  float reach = direct + spill * 0.4;

  float rim = 0.0;
  float face = 0.0;
  float mirror = 0.0;

  /*
   * The two reflected images of the source. Both sit slightly below the light:
   * the pane is in front of what it is reflecting, so its image of a source is
   * displaced, and the back surface is displaced further than the front. They
   * are stretched vertically because a highlight on a pane that is not
   * perfectly flat smears along it.
   */
  vec2 nearImage = uLight + vec2(0.0, 9.0);
  vec2 farImage = uLight + vec2(4.0, 27.0);
  float rNear = length((frag - nearImage) / vec2(1.0, 1.5));
  float rFar = length((frag - farImage) / vec2(1.0, 2.1));
  float image =
    1.0 / (1.0 + (rNear * rNear) / 1400.0) +
    0.34 / (1.0 + (rFar * rFar) / 5600.0);

  for (int i = 0; i < MAX_RECTS; i++) {
    vec4 rect = uRects[i];
    vec2 halfSize = rect.zw * 0.5;
    vec2 p = frag - (rect.xy + halfSize);
    float d = roundedBox(p, halfSize, uRadii[i]);
    float ad = abs(d);

    // ---- the rim ----
    // A hot filament on the boundary, a flare either side of it, and a wide
    // low haze. Summed kernels, the way bloom actually is.
    float filament = exp(-ad / 2.4);
    float flare = exp(-ad / 13.0);
    float haze = exp(-ad / 44.0);
    rim += (filament * 30.0 + flare * 6.0 + haze * 0.9) * reach;

    // ---- the face ----
    // 1 inside the panel, 0 outside, over a pixel.
    float inside = smoothstep(0.5, -0.5, d);
    face += inside * (direct * 2.4 + spill * 1.7);

    // ---- the reflection ----
    /*
     * Fresnel. Glass is barely reflective looked at face-on and mirror-like at
     * a grazing angle; on a flat panel the grazing angles are at the rim, so
     * reflectivity climbs toward the edges. The base term is what keeps the
     * source visible in the middle of the pane at all.
     */
    float depth = clamp(-d / max(min(halfSize.x, halfSize.y), 1.0), 0.0, 1.0);
    float fresnel = 0.24 + 0.76 * pow(1.0 - depth, 4.0);
    mirror += inside * image * fresnel * 11.0;
  }

  /*
   * Everything scales with the charge, and there is genuinely nothing at zero.
   * Glass does not glow; a light shining on it does, and with nothing wound
   * there is no light in the room. Eased so that the noise floor of a slow
   * drifting pointer stays dark rather than smouldering.
   */
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);
  float intensity = (rim + face + mirror) * lit;

  // Warm at the source, cooling through the falloff, as a hot source does.
  vec3 tint = mix(uWarm, uCool, smoothstep(0.0, 1.0, dl / 460.0));
  vec3 colour = tint * intensity;

  // The tonemap is what blows the edge out. Everything above 1.0 compresses
  // toward white, so colour survives only where the light has fallen off.
  colour = colour / (1.0 + colour);
  colour = pow(colour, vec3(1.0 / 2.2));

  float alpha = clamp(max(max(colour.r, colour.g), colour.b), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;
