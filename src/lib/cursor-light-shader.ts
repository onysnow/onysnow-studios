/**
 * Fragment shader for the cursor light.
 *
 * Written against real optics rather than approximated with gradients, because
 * gradients cannot do the one thing that matters here. A CSS gradient
 * composites in SDR: nothing can be brighter than white, so a "blown" core has
 * to be hand-authored as a white stop and it reads as a white disc sitting in
 * an orange smear. In a renderer the core clips to white BECAUSE the intensity
 * exceeds 1.0 and the tonemap crushes everything above it — the white is an
 * outcome, not a colour choice. That is the whole difference between a light
 * and an aura, and it is why every previous attempt stayed orange.
 *
 * The aperture uses the N-blade signed-distance formulation: work in polar
 * coordinates, fold the angle into one blade sector, and measure distance
 * along the blade's flat edge. Mixing that distance back toward the plain
 * radius bends the blades, which is what real ones do as they open.
 */
export const LIGHT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uCharge;   // 0 → 1, how wound the shutter is
uniform float uClosed;   // 0 → 1, how far the iris has stopped down
uniform float uTime;
uniform vec3  uWarm;     // the amber, linear
uniform vec3  uCool;     // the teal, linear

#define TAU 6.28318530718
#define BLADES 6.0

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
 * than being a separate decorative number.
 */
float starburst(vec2 p, float r) {
  float phi = atan(p.y, p.x);
  float lobes = abs(cos(phi * BLADES * 0.5));
  float spike = pow(lobes, 180.0);
  // Spikes are a property of the source, so they decay from it, not uniformly.
  return spike * exp(-r * 5.5) * 3.0;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);

  // ---- Emission, in linear light with real headroom ----
  // Inverse-square from a small emitter. The +eps keeps the centre finite; the
  // gain is what pushes the core far above 1.0 so the tonemap can clip it.
  float falloff = 1.0 / (1.0 + 260.0 * r * r);
  float gain = 26.0 * (0.22 + uCharge * 0.78);
  float core = falloff * gain;

  // A second, wider lobe: bloom is several kernel sizes summed, and one falloff
  // alone reads as a gradient however bright it is.
  // Two wider lobes. Real bloom sums several kernel sizes; a single falloff
  // stays a disc however bright it is, and the far tail is what makes a light
  // look like it is lighting something rather than sitting on top of it.
  float halo = exp(-r * 3.1) * 2.3 * uCharge;
  float spill = exp(-r * 1.15) * 0.85 * uCharge;

  float spikes = starburst(p, r) * uCharge;

  float intensity = core + halo + spill + spikes;

  /*
   * Chromatic dispersion: sample the falloff at slightly different radii per
   * channel. Long wavelengths refract least, so red carries furthest — the
   * reason a real highlight fringes warm on the outside.
   */
  float rr = 1.0 / (1.0 + 250.0 * r * r);
  float gg = 1.0 / (1.0 + 268.0 * r * r);
  float bb = 1.0 / (1.0 + 290.0 * r * r);
  vec3 dispersion = vec3(rr, gg, bb) * gain * 0.34;

  // Warm core, cooler in the far falloff — hot sources read warm at the centre
  // and their scatter goes cool.
  vec3 tint = mix(uWarm, uCool, smoothstep(0.12, 0.62, r));

  vec3 colour = tint * intensity + dispersion;

  // ---- The aperture, silhouetted against its own light ----
  // Blades open as the iris opens; roundness eases as it stops down.
  float apertureRadius = mix(0.30, 0.055, uClosed);
  float d = apertureDistance(p, mix(0.42, 0.12, uClosed));
  // Inside the opening light passes; across the blades it is blocked.
  float blades = smoothstep(apertureRadius - 0.006, apertureRadius + 0.006, d);
  // Only occlude once the iris is actually closing, and never completely —
  // a blown highlight bleeds around whatever is in front of it.
  float occlusion = 1.0 - blades * uClosed * 0.82;
  colour *= occlusion;

  // A thin lit edge where the blades meet the light.
  float rim = exp(-pow((d - apertureRadius) * 90.0, 2.0)) * uClosed;
  colour += uWarm * rim * 1.4;

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
