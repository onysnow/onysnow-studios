/**
 * Fragment shader for the glass: its thickness, its material, and the cursor
 * light falling on it.
 *
 * The same argument as the cursor light itself. CSS composites in SDR, so a
 * gradient can never be brighter than white and a "blown" edge has to be
 * hand-authored as a white stop — which is precisely why every CSS version of
 * the lit rim read as amber paint along the border rather than as an edge
 * catching a light. Here the emission genuinely exceeds 1.0 and a tonemap
 * crushes it, so the white core is an outcome of the brightness rather than a
 * colour that was chosen.
 *
 * What a real pane shows, and what is modelled here:
 *
 *   arris    the corner where the face meets the side. A hard, very bright
 *            line — glass totally internally reflects along an edge, which is
 *            why the rim of a plate is the brightest part of it.
 *   side     the polished thickness between the two arrises. Dichroic: the
 *            path through the glass is long enough for dispersion to show, so
 *            the band runs blue to gold along its length.
 *   far arris the second corner, seen THROUGH the pane, so dimmer.
 *   mirror   the specular image of the source — two of them, since a pane
 *            reflects from its front and back surfaces. That doubling is most
 *            of what makes a reflection read as glass rather than as a smear.
 *   material grime and scratches, which appear because they scatter the light
 *            rather than because a shape was painted where the light is.
 *
 * Which side face you can see depends on where the panel sits relative to your
 * eye, which is what `uTilts` carries and what makes the thickness move as the
 * page scrolls.
 *
 * Unused rect slots are parked far offscreen at zero size, so every fragment
 * runs the same fixed number of iterations and there is no dynamic branching.
 */
export const GLASS_LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

#define MAX_RECTS 8
#define TAU 6.28318530718
#define BLADES 6.0

uniform vec2  uViewport;          // device pixels
uniform float uScale;             // device pixels per CSS pixel
uniform vec2  uLight;             // CSS pixels, viewport-relative
uniform float uCharge;            // 0 to 1
uniform vec4  uRects[MAX_RECTS];  // x, y, w, h in CSS pixels
uniform float uRadii[MAX_RECTS];  // corner radius in CSS pixels
uniform float uTilts[MAX_RECTS];  // -1 looking up at it, 1 looking down at it
uniform vec3  uWarm;
uniform vec3  uCool;

/* Signed distance to a rounded rectangle. Negative inside, zero on the edge. */
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  float r = min(radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

/* A cosine palette. Cheap, smooth, and it wraps — no lookup texture needed. */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/* Value noise: hashed lattice, smoothstep between the corners. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

/*
 * The pane's surface, as a roughness map.
 *
 * Two populations, because they scatter differently. Grease is broad, soft and
 * low — a haze that lifts wherever light rakes it. Scratches are thin, sharp
 * and directional, and they are what actually catch a point source. Both are
 * generated rather than loaded: a texture would be a request, an asset to
 * manage, and — for anything with the right grain — a licence.
 */
float roughness(vec2 uv) {
  // Greasy blotches and general grime.
  float grime = fbm(uv * 2.4) * 0.55 + fbm(uv * 7.0) * 0.25;

  /*
   * Scratches. Noise sampled hard-stretched along one axis turns into streaks;
   * taking the ridge of it (distance from the midline, inverted) turns the
   * streaks into thin lines, and a high power makes them hair-fine.
   */
  vec2 a = uv * vec2(0.6, 26.0);
  float ridgeA = 1.0 - abs(noise(a) * 2.0 - 1.0);
  vec2 b = (uv.yx + 4.7) * vec2(0.9, 34.0);
  float ridgeB = 1.0 - abs(noise(b) * 2.0 - 1.0);
  float scratches = pow(ridgeA, 42.0) * 0.8 + pow(ridgeB, 58.0) * 0.55;

  return grime * 0.5 + scratches;
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
  /*
   * Two reaches, because the rim and the face answer the light differently.
   * An edge is a specular feature: it lights where the source actually falls
   * on it and goes black elsewhere, so it barely takes the scatter. A wash of
   * scatter along the whole perimeter is the aura failure in another costume.
   */
  float reach = direct + spill * 0.11;
  float ambient = direct + spill * 0.14;

  /*
   * The two reflected images of the source. Both sit slightly below the light:
   * the pane is in front of what it reflects, so its image of a source is
   * displaced, and the back surface is displaced further than the front. They
   * are stretched vertically because a highlight on a pane that is not
   * perfectly flat smears along it.
   */
  vec2 nearImage = uLight + vec2(0.0, 9.0);
  vec2 farImage = uLight + vec2(4.0, 27.0);
  vec2 toNear = frag - nearImage;
  vec2 qNear = toNear / vec2(1.0, 1.22);
  float rNear = length(qNear);
  float rFar = length((frag - farImage) / vec2(1.0, 1.6));

  /*
   * Dispersion. Long wavelengths refract least, so red carries furthest, which
   * is why a real highlight seen through glass fringes warm on the outside and
   * cool on the inside. Three radii, one per channel, rather than a colour
   * ramp that imitates the result.
   */
  vec3 core = vec3(
    1.6 / (1.0 + (rNear * rNear) / 620.0),
    1.6 / (1.0 + (rNear * rNear) / 520.0),
    1.6 / (1.0 + (rNear * rNear) / 450.0)
  );
  vec3 ghost = vec3(0.3) / (1.0 + (rFar * rFar) / 2600.0);

  /*
   * Diffraction. An aperture throws as many spikes as it has blades, and a
   * bright source photographed through glass also leaves concentric ghost
   * rings from the reflections between its surfaces. Both are properties of
   * the source, so they decay from it.
   */
  float phi = atan(toNear.y, toNear.x);
  float spikes = pow(abs(cos(phi * BLADES * 0.5)), 260.0) * exp(-rNear / 21.0) * 1.5;
  float ringR = exp(-pow((rNear - 36.0) / 7.0, 2.0)) * 0.8
              + exp(-pow((rNear - 66.0) / 14.0, 2.0)) * 0.34;
  vec3 rings = spectrum(rNear / 95.0) * ringR;

  vec3 image = core + ghost + vec3(spikes) + rings;

  vec3 rim = vec3(0.0);
  vec3 face = vec3(0.0);
  vec3 mirror = vec3(0.0);

  for (int i = 0; i < MAX_RECTS; i++) {
    vec4 rect = uRects[i];
    vec2 halfSize = rect.zw * 0.5;
    vec2 p = frag - (rect.xy + halfSize);
    float d = roundedBox(p, halfSize, uRadii[i]);
    float ad = abs(d);
    float tilt = uTilts[i];

    // 1 inside the panel, 0 outside, over a pixel.
    float inside = smoothstep(0.5, -0.5, d);

    // ---- the near arris ----
    // A hard filament on the boundary, a flare either side, and a wide haze.
    // Summed kernels, the way bloom actually is. Modulated by the light
    // reaching THIS point, so the near edge blows out and the far edge stays
    // dark without any directional gradient being authored.
    float filament = exp(-ad / 2.4);
    float flare = exp(-ad / 13.0);
    float haze = exp(-ad / 44.0);
    rim += vec3(filament * 24.0 + flare * 3.2 + haze * 0.22) * reach;

    /*
     * ---- the side faces ----
     *
     * The band of polished glass between the two arrises. How tall it is
     * depends on how far that side is turned toward the viewer, and the two
     * sides answer the tilt in opposite directions — which is the whole
     * effect: scroll down and the bottom thickness opens as the top closes.
     *
     * Never fully shut. The far side is still there, foreshortened and seen
     * through the pane, which is why it reads as subtler rather than absent.
     */
    float topOpen = 0.18 + 0.82 * max(0.0, tilt);
    float botOpen = 0.18 + 0.82 * max(0.0, -tilt);
    float topT = 3.0 + 13.0 * topOpen;
    float botT = 3.0 + 13.0 * botOpen;

    // Depth into the panel from each horizontal edge. Only meaningful where
    // the fragment is within the panel's width.
    float withinX = step(rect.x, frag.x) * step(frag.x, rect.x + rect.z);
    float dTop = frag.y - rect.y;
    float dBot = (rect.y + rect.w) - frag.y;

    /*
     * Three features per side, in order inward: the near arris (already in
     * the rim term), the glare riding the middle of the side face, and the far arris
     * where the side meets the back surface.
     */
    float glareTop = exp(-pow((dTop - topT * 0.5) / (topT * 0.42), 2.0)) * step(0.0, dTop);
    float glareBot = exp(-pow((dBot - botT * 0.5) / (botT * 0.42), 2.0)) * step(0.0, dBot);
    float farTop = exp(-pow((dTop - topT) / 1.7, 2.0)) * step(0.0, dTop);
    float farBot = exp(-pow((dBot - botT) / 1.7, 2.0)) * step(0.0, dBot);

    /*
     * The side is dichroic. Light crossing the thickness of the pane travels
     * far enough for dispersion to separate it, so the band runs through the
     * spectrum along its length — the blue-to-gold shift down the edge of a
     * cut plate. Keyed to position along the panel, not to the light, because
     * it is a property of the glass.
     */
    float along = (frag.x - rect.x) / max(rect.z, 1.0);
    vec3 dichroic = spectrum(along * 0.85 + 0.55);

    float sideGlare = (glareTop * topOpen + glareBot * botOpen) * withinX;
    float farArris = (farTop * topOpen + farBot * botOpen) * withinX;

    rim += dichroic * sideGlare * 30.0 * reach;
    // Seen through the glass, so it never reaches the near arris's brightness.
    rim += vec3(farArris) * 15.0 * reach;

    // ---- light scattered into the body of the pane ----
    face += vec3(inside * direct * 0.9);

    /*
     * ---- the material ----
     *
     * Grime and scratches are not drawn where the light is; they are always
     * there, and they show in proportion to the light that reaches them. That
     * is the whole difference between a texture revealed by a torch and a
     * shape painted under one. Anchored to the panel so it travels with it
     * rather than swimming as the page scrolls.
     */
    vec2 uv = (frag - rect.xy) / 130.0;
    float rough = roughness(uv);
    face += vec3(rough * inside * ambient * 3.2);

    /*
     * ---- the reflection ----
     *
     * Fresnel. Glass is barely reflective looked at face-on and mirror-like at
     * a grazing angle; on a flat panel the grazing angles are at the rim, so
     * reflectivity climbs toward the edges. The base term is what keeps the
     * source visible in the middle of the pane at all.
     */
    float depth = clamp(-d / max(min(halfSize.x, halfSize.y), 1.0), 0.0, 1.0);
    float fresnel = 0.3 + 0.7 * pow(1.0 - depth, 4.0);
    // Scratches are polished facets: they take the reflection too, brighter
    // than the surface around them.
    mirror += inside * image * fresnel * (13.0 + rough * 10.0);
  }

  /*
   * Everything scales with the charge, and there is genuinely nothing at zero.
   * Glass does not glow; a light shining on it does, and with nothing wound
   * there is no light in the room. Eased so that the noise floor of a slow
   * drifting pointer stays dark rather than smouldering.
   */
  float lit = uCharge * uCharge * (3.0 - 2.0 * uCharge);

  // Warm at the source, cooling through the falloff, as a hot source does.
  vec3 tint = mix(uWarm, uCool, smoothstep(0.0, 1.0, dl / 460.0));
  vec3 colour = (tint * (rim + face) + mirror) * lit;

  // The tonemap is what blows the edge out. Everything above 1.0 compresses
  // toward white, so colour survives only where the light has fallen off.
  colour = colour / (1.0 + colour);
  colour = pow(colour, vec3(1.0 / 2.2));

  float alpha = clamp(max(max(colour.r, colour.g), colour.b), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;
