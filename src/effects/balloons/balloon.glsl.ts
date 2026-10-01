/**
 * The latex balloon (task 74; docs/research/balloons.md 2, 6 "The balloon
 * shader"). One quad per balloon, viewport CSS px.
 *
 * - Shape: a teardrop -- a circle stretched 1.15x along its axis, narrowing
 *   toward the knot -- with a small knot cap (estimate, from photographs).
 * - Thickness: stretching thins the wall, so the colour is lightest over
 *   the body, a little denser at the pole spot (1.6x, Garcia-Herrera) and
 *   far denser toward the neck (about 10x, estimate). Through the wall,
 *   light goes as exp(-sigma t): sigma is the dye, from the balloon's
 *   colour at full inflation.
 * - Light, per light: Blinn-Phong for the specular (F0 0.042, latex n
 *   1.519; roughness about 0.1, estimate), wrapped diffuse for opaque
 *   "fashion" latex (w 0.3, estimate), none for crystal latex; the room the
 *   page reflects, by Fresnel -- which also makes the bright rim (2.4: the
 *   rim is Fresnel plus the slant path, no separate term).
 * - Crystal (transparent) latex lets the page through, tinted twice (in
 *   and out of the balloon), and darker at the rim where the path through
 *   the wall is slanted: alpha 1 - T^(2/cos).
 * - Under a black light, neon latex fluoresces in its own colour, more
 *   where the wall is thicker (the neck), standard latex barely (5).
 */

import { ENVIRONMENT_GLSL } from "@/effects/optics/environment.glsl";

export const MAX_BALLOON_LIGHTS = 4;

export const BALLOON_VERTEX = /* glsl */ `
attribute vec2 aPos;       // viewport px
attribute vec2 aLocal;     // balloon frame, in radii: x across, y toward the knot
attribute vec3 aColour;    // the latex at full inflation
attribute vec3 aInfo;      // radius px, finish (0 fashion, 1 crystal, 2 neon), height above the page px
uniform vec2 uViewport;
varying vec2 vLocal;
varying vec3 vColour;
varying vec3 vInfo;
varying vec2 vPos;
void main() {
  vLocal = aLocal;
  vColour = aColour;
  vInfo = aInfo;
  vPos = aPos;
  vec2 clip = aPos / uViewport * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

export const BALLOON_FRAGMENT = /* glsl */ `
precision highp float;
${ENVIRONMENT_GLSL}
varying vec2 vLocal;
varying vec3 vColour;
varying vec3 vInfo;
varying vec2 vPos;
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_BALLOON_LIGHTS}];
uniform vec3 uLightColour[${MAX_BALLOON_LIGHTS}];
uniform float uLightUv[${MAX_BALLOON_LIGHTS}];
uniform sampler2D uRoomTex;
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec2 uViewCentre;
uniform float uCameraDistance;
uniform float uAmbient;

const float F0 = 0.042;

void main() {
  float R = vInfo.x;
  float finish = vInfo.y;
  vec2 p = vLocal;
  // The knot: a small rounded cap below the neck.
  float knot = 0.0;
  {
    vec2 k = (p - vec2(0.0, 1.2)) / vec2(0.07, 0.06);
    knot = 1.0 - smoothstep(0.8, 1.0, length(k));
  }
  // The body: stretched 1.15 along the axis, narrowing toward the knot.
  float along = p.y / 1.15;
  float narrow = 1.0 - 0.28 * smoothstep(0.0, 1.0, along) * smoothstep(-0.2, 1.0, along);
  vec2 q = vec2(p.x / max(narrow, 0.2), along);
  float d = length(q);
  float edge = 1.5 / R;   // about a pixel and a half, in radii
  float body = 1.0 - smoothstep(1.0 - edge, 1.0, d);
  float cover = max(body, knot);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // The normal of the body as a sphere-like height field.
  float z = sqrt(max(1.0 - d * d, 0.0));
  vec3 N = normalize(vec3(q.x, q.y, max(z, 0.02)));
  // Where along the skin: 0 at the pole, 1 at the neck.
  float u = clamp((along + 1.0) * 0.5, 0.0, 1.0);
  float thick = 1.0 + 0.6 * (1.0 - smoothstep(0.0, 0.08, u)) + 9.0 * smoothstep(0.75, 1.0, u);
  thick = mix(thick, 12.0, knot);
  // The dye: exp(-sigma) = the colour at full inflation.
  vec3 sigma = -log(clamp(vColour, 0.02, 1.0));
  vec3 T = exp(-sigma * thick);

  vec3 P = vec3(vPos, vInfo.z + z * R);
  vec3 V = vec3(0.0, 0.0, 1.0);
  float cosV = max(N.z, 0.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);

  vec3 colour = vec3(0.0);
  vec3 spec = vec3(0.0);
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_BALLOON_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i] - P;
    float dist = length(toL);
    vec3 L = toL / max(dist, 1.0);
    // Falls off with distance against the lamp's height (the floor's own normalisation).
    float fall = clamp(300.0 * 300.0 / max(dist * dist, 1.0), 0.0, 4.0);
    float nl = dot(N, L);
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float fl = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    spec += uLightColour[i] * pow(nh, 180.0) * fl * 30.0 * fall;
    // Wrapped diffuse for opaque latex.
    float wrap = max((nl + 0.3) / 1.3, 0.0);
    colour += uLightColour[i] * wrap * fall * (1.0 - uLightUv[i]);
    // Neon dye under UV: more where the wall is thicker.
    glow += uLightColour[i] * uLightUv[i] * fall * clamp(thick / 3.0, 0.5, 2.0);
  }

  // The room the latex reflects.
  vec3 viewRay = normalize(vec3(vPos - uViewCentre, -uCameraDistance));
  vec3 Nw = normalize(vec3(N.xy, N.z));
  vec3 roomDir = reflect(viewRay, Nw);
  vec3 room = uHasRoom > 0.5
    ? decodeRadiance(texture2D(uRoomTex, roomUvDir(roomDir)).rgb) * uRoomExposure
    : vec3(0.3);

  vec3 out3;
  float alpha;
  if (finish > 0.5 && finish < 1.5) {
    // Crystal: the page through it, tinted in and out; slanted at the rim.
    vec3 through = pow(T, vec3(2.0 / max(cosV, 0.15)));
    alpha = clamp(1.0 - (through.r + through.g + through.b) / 3.0, 0.0, 0.92);
    vec3 tint = vColour * (uAmbient + colour * 0.3);
    out3 = tint * (1.0 - F) + room * F + spec;
    alpha = max(alpha, clamp(F * 2.0 + length(spec), 0.0, 1.0));
  } else {
    // Fashion (and neon) latex: opaque, its colour lit, lighter where stretched thin.
    vec3 albedo = mix(vColour, vColour * T * 2.0, 0.35);
    out3 = albedo * (uAmbient + colour) * (1.0 - F) + room * F + spec;
    alpha = 1.0;
  }
  if (finish > 1.5) out3 += vColour * glow * 1.5;
  out3 = mix(out3, vColour * 0.25 * (uAmbient + colour), knot);
  gl_FragColor = vec4(min(out3, vec3(1.0)), alpha * cover);
}
`;
