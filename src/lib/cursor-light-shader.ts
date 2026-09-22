/**
 * Fragment shader for the cursor light and its lens flare.
 *
 * Written against real optics rather than approximated with gradients, because
 * gradients cannot do the one thing that matters here. A CSS gradient
 * composites in SDR: nothing can be brighter than white, so a "blown" core has
 * to be hand-authored as a white stop and it reads as a white disc sitting in
 * an orange smear. In a renderer the core clips to white BECAUSE the intensity
 * exceeds 1.0 and the tonemap crushes everything above it — the white is an
 * outcome, not a colour choice.
 *
 * This draws the whole viewport, not a quad following the cursor. It has to:
 * a lens flare is not a property of the light, it is a property of the LENS,
 * and its ghosts march along the axis from the source through the centre of
 * the frame and out the other side. Confined to a box around the cursor there
 * is nowhere for them to go — and the box itself was visible wherever the
 * falloff crossed its edge.
 *
 * The aperture uses the N-blade signed-distance formulation: work in polar
 * coordinates, fold the angle into one blade sector, and measure distance
 * along the blade's flat edge. Mixing that distance back toward the plain
 * radius bends the blades, which is what real ones do as they open.
 */
export const LIGHT_FRAGMENT_SHADER = /* glsl */ `precision highp float;

uniform vec2  uViewport;   // device pixels
uniform float uScale;      // device pixels per CSS pixel
uniform vec2  uLight;      // CSS pixels, viewport-relative
uniform float uCharge;     // 0 to 1, how wound the shutter is
uniform float uClosed;     // 0 to 1, how far the iris has stopped down
uniform float uTime;
uniform vec3  uWarm;       // the amber, linear
uniform vec3  uCool;       // the teal, linear

#define TAU 6.28318530718
#define BLADES 6.0
#define GHOSTS 7

/* A cosine palette: smooth, wrapping, and no lookup texture. */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
}

/*
 * Distance to an N-bladed aperture edge, in the polygon's own metric.
 * 'roundness' blends toward a circle: real blades are curved, and a perfectly
 * straight-edged polygon looks machined rather than optical.
 */
float apertureDistance(vec2 p, float roundness) {
  float phi = atan(p.y, p.x);
  float r = length(p);
  float anglePerBlade = TAU / BLADES;
  float bladePhi = mod(phi, anglePerBlade) - anglePerBlade * 0.5;
  float d = r * cos(bladePhi);
  return mix(d, r, roundness);
}

/*
 * Diffraction spikes. An aperture with an even number of blades throws that
 * many spikes, which is why this shares BLADES with the geometry above rather
 * than being a separate decorative number. They fringe into spectrum along
 * their length because the grating that makes them is dispersive.
 */
vec3 starburst(vec2 p, float r) {
  float phi = atan(p.y, p.x);
  float lobes = abs(cos(phi * BLADES * 0.5));
  float spike = pow(lobes, 70.0) * exp(-r * 3.4);
  vec3 tint = mix(vec3(1.0), spectrum(r * 1.6 + 0.1), 0.65);
  return tint * spike * 4.6;
}

/*
 * One ghost: an out-of-focus image of the aperture, thrown by a reflection
 * between two elements. Bright at its rim and hollow in the middle, because it
 * is a defocused disc rather than a point — that hollow ring is what makes a
 * flare read as photographed rather than as a row of dots.
 */
vec3 ghost(vec2 p, float radius, float thickness, vec3 tint) {
  float d = length(p);
  float disc = smoothstep(radius, radius * 0.55, d) * 0.35;
  float ring = exp(-pow((d - radius) / thickness, 2.0));
  return tint * (disc + ring * 0.9);
}

void main() {
  // gl_FragCoord counts up from the bottom; the page counts down from the top.
  vec2 frag = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uScale;
  vec2 res = uViewport / uScale;

  // Normalised so the flare geometry does not change with window shape.
  float unit = min(res.x, res.y) * 0.5;
  vec2 p = (frag - uLight) / unit;
  float r = length(p);

  // ---- Emission, in linear light with real headroom ----
  // Inverse-square from a small emitter. The +eps keeps the centre finite; the
  // gain is what pushes the core far above 1.0 so the tonemap can clip it.
  /*
   * A tighter core than the emitter wants to be.
   *
   * Left wide, the blown region swallowed the aperture and the spikes whole
   * and what was left read as a torch pointed at the page rather than as a
   * lens looking at a light. The blades and the diffraction they throw ARE
   * the effect; the white disc is just where the sensor gave up.
   */
  float falloff = 1.0 / (1.0 + 900.0 * r * r);
  float gain = 22.0 * uCharge;
  float core = falloff * gain;

  // Two wider lobes. Real bloom sums several kernel sizes; a single falloff
  // stays a disc however bright it is, and the far tail is what makes a light
  // look like it is lighting something rather than sitting on top of it.
  float halo = exp(-r * 3.1) * 2.3 * uCharge;
  float spill = exp(-r * 1.15) * 0.85 * uCharge;

  vec3 intensity = vec3(core + halo + spill);
  intensity += starburst(p, r) * uCharge;

  /*
   * Chromatic dispersion: sample the falloff at slightly different radii per
   * channel. Long wavelengths refract least, so red carries furthest — the
   * reason a real highlight fringes warm on the outside.
   */
  vec3 dispersion = vec3(
    1.0 / (1.0 + 250.0 * r * r),
    1.0 / (1.0 + 268.0 * r * r),
    1.0 / (1.0 + 290.0 * r * r)
  ) * gain * 0.34;

  // Warm core, cooler in the far falloff — hot sources read warm at the centre
  // and their scatter goes cool.
  vec3 tint = mix(uWarm, uCool, smoothstep(0.12, 0.62, r));
  vec3 colour = tint * intensity + dispersion;

  /*
   * ---- The flare ----
   *
   * Ghosts are reflections between lens elements, so they are images of the
   * source thrown back through the optical axis: they land on the line from
   * the source through the CENTRE of the frame, spaced along it, and they walk
   * as the source moves. That axis is the whole reason a flare reads as a lens
   * and not as decoration stuck to the light.
   */
  vec2 centre = res * 0.5;
  vec2 axis = (centre - uLight) / unit;

  for (int i = 0; i < GHOSTS; i++) {
    float fi = float(i);
    // Spread across and past the centre, so some ghosts sit the far side of it.
    float t = 0.35 + fi * 0.34;
    vec2 gp = p - axis * t;
    // Sizes alternate the way a real element stack throws them.
    float radius = 0.045 + 0.075 * fract(fi * 0.62 + 0.2);
    float thickness = radius * (0.16 + 0.14 * fract(fi * 0.37));
    vec3 gt = spectrum(fi * 0.23 + 0.42) * (0.7 + 0.6 * fract(fi * 0.71));
    // Ghosts fade toward the edges of the frame, as the real ones do.
    float vig = 1.0 - clamp(length(p - axis * t) * 0.55, 0.0, 1.0);
    colour += ghost(gp, radius, thickness, gt) * 0.85 * vig * uCharge;
  }

  /*
   * The big halo: a wide, thin chromatic ring centred on the source itself,
   * thrown by the front element. This is the ring in the reference photographs
   * that is far larger than any of the ghosts.
   */
  float halo1 = exp(-pow((r - 0.31) / 0.035, 2.0)) * 0.9
              + exp(-pow((r - 0.46) / 0.07, 2.0)) * 0.4;
  colour += spectrum(r * 3.4 + 0.12) * halo1 * 1.15 * uCharge;

  /*
   * An anamorphic streak. Even a spherical lens smears a bright point
   * horizontally through its diaphragm; it is the cue people read as "this was
   * photographed" faster than any other.
   */
  float streak = exp(-abs(p.x) * 2.6) * exp(-abs(p.y) * 150.0);
  colour += mix(uWarm, vec3(0.6, 0.8, 1.0), 0.45) * streak * 2.2 * uCharge;

  // ---- The aperture, silhouetted against its own light ----
  /*
   * The iris is a silhouette, not a pinch. Stopping all the way down squeezed
   * the light into a small hard shape at exactly the moment it should read as
   * most intense — the charge was full and the light got SMALLER.
   */
  /*
   * Big enough to see, and it does not shrink.
   *
   * It used to stop down to a pinhole at full charge, which made the light
   * SMALLER exactly when it should read as most intense. It now barely closes
   * at all — what changes is how hard the blades cut, not how small the
   * opening is, so the hexagon stays legible across the whole wind.
   */
  float apertureRadius = mix(0.115, 0.098, uClosed);
  float d = apertureDistance(p, mix(0.42, 0.14, uClosed));
  float blades = smoothstep(apertureRadius - 0.0018, apertureRadius + 0.0018, d);
  float occlusion = 1.0 - blades * (0.25 + uClosed * 0.5);
  colour *= occlusion;

  // A thin lit edge where the blades meet the light.
  // The lit edge of the blades. Present from the start, not only once closed:
  // an open iris still has edges and they still catch the light.
  float rim = exp(-pow((d - apertureRadius) * 300.0, 2.0)) * (0.35 + 0.65 * uClosed);
  colour += mix(uWarm, vec3(1.0), 0.4) * rim * 2.4;

  /*
   * Tonemap. THIS is what produces the white core: everything above 1.0 is
   * compressed toward white, so the centre clips and colour survives only
   * where the intensity has fallen off. Authoring a white stop in a gradient
   * imitates the result; this causes it.
   */
  colour = colour / (1.0 + colour);
  // Back to display space.
  colour = pow(colour, vec3(1.0 / 2.2));

  float alpha = clamp(max(max(colour.r, colour.g), colour.b), 0.0, 1.0);
  gl_FragColor = vec4(colour, alpha);
}
`;

export const LIGHT_VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
