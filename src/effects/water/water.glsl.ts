/**
 * The water's two passes (task 77; docs/research/water-drops.md 6.2, 7.2).
 *
 * 1. The drop map: every drop drawn as a quad over its contact circle into a
 *    texture, its height as a spherical cap (water-drops 2.1), added -- so
 *    where two drops neck together their heights sum into one lens, as the
 *    photographs of merged drops show (7.4 photo 1). R: height / HEIGHT_MAX;
 *    A: coverage. No sprite (raindrop-fx's raindrop.png is not ported): the
 *    cap is exact and needs no texture.
 *
 * 2. The water layer: per pixel of the pane, the drop map's height and its
 *    slope. A drop is a plano-convex lens on the glass: a ray from the eye
 *    entering its curved face at slope s is turned toward the drop's centre
 *    by (n - 1) s once it is out of the flat back of the pane (Snell at both
 *    faces, small angles), and meets the photograph `gap` behind the glass
 *    displaced by (n - 1) gap grad(h) toward the centre. With the gap
 *    longer than the drop's focal length the image crosses over: every drop
 *    holds the photograph upside down and small, as the reference
 *    photographs do (7.4 photos 1, 2, 7). The water fills the frosted
 *    face's roughness, so through a drop the photograph is sharp. Fresnel
 *    (Schlick) reflects the room at the slant of each point; every light
 *    puts its own highlight on every drop (Blinn-Phong on the cap's
 *    normal).
 */

import { ENVIRONMENT_GLSL } from "@/effects/optics/environment.glsl";

/** The tallest height the map holds, mm (an 8-bit step is 11.8 um). */
export const HEIGHT_MAX = 3;

export const MAP_VERTEX = /* glsl */ `
attribute vec2 aPos;      // pane px
attribute vec4 aDrop;     // local x, y (the contact circle is the unit circle), contact radius mm, cap height mm
uniform vec2 uMapSize;    // the pane, px
varying vec4 vDrop;
void main() {
  vDrop = aDrop;
  vec2 clip = aPos / uMapSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}
`;

export const MAP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec4 vDrop;
const float HEIGHT_MAX = ${HEIGHT_MAX.toFixed(1)};
void main() {
  float a = vDrop.z;
  float h0 = vDrop.w;
  float r = length(vDrop.xy) * a;
  // The sphere the cap is cut from: R = (a^2 + h0^2) / 2 h0.
  float R = (a * a + h0 * h0) / max(2.0 * h0, 1e-4);
  float h = r < a ? sqrt(max(R * R - r * r, 0.0)) - (R - h0) : 0.0;
  // Coverage, antialiased over the outermost few per cent of the radius.
  float cover = 1.0 - smoothstep(0.92, 1.0, length(vDrop.xy));
  gl_FragColor = vec4(max(h, 0.0) / HEIGHT_MAX, 0.0, 0.0, cover);
}
`;

export const COMPOSE_VERTEX = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const MAX_WATER_LIGHTS = 4;

export const COMPOSE_FRAGMENT = /* glsl */ `
precision highp float;
${ENVIRONMENT_GLSL}
uniform sampler2D uMap;       // the drop map
uniform vec2 uMapUv;          // how much of the map texture this pane uses
uniform vec2 uMapTexel;       // one map texel, in uv
uniform sampler2D uPhoto;     // the photograph behind the pane
uniform float uHasPhoto;
uniform vec4 uImage;          // where the photograph is drawn, page px
uniform vec3 uImageFit;       // its aspect and object-position
uniform vec4 uPane;           // the pane's x, y, w, h, page px
uniform float uScale;         // buffer px per CSS px
uniform float uPxPerMm;
uniform float uGap;           // how far behind the glass the photograph is, px
uniform float uIor;
uniform vec3 uRoom;           // the room, where its image has not loaded: a dim warm grey
uniform sampler2D uRoomTex;   // the room the glass reflects (effects/optics/environment)
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec2 uViewCentre;     // page px
uniform float uCameraDistance; // CSS px
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_WATER_LIGHTS}];    // page px, height px
uniform vec3 uLightColour[${MAX_WATER_LIGHTS}]; // colour times strength
uniform float uLightRadius[${MAX_WATER_LIGHTS}]; // px
const float HEIGHT_MAX = ${HEIGHT_MAX.toFixed(1)};

vec2 coverUv(vec2 pt, vec4 image, vec3 fit) {
  vec2 rel = (pt - image.xy) / max(image.zw, vec2(1.0));
  float aspect = fit.x;
  float boxAspect = image.z / max(image.w, 1.0);
  vec2 scale = boxAspect > aspect ? vec2(1.0, boxAspect / aspect) : vec2(aspect / boxAspect, 1.0);
  return (rel - fit.yz) / scale + fit.yz;
}

float heightAt(vec2 uv) { return texture2D(uMap, uv).r * HEIGHT_MAX; }

void main() {
  // This pixel, pane px from the top left.
  vec2 local = vec2(gl_FragCoord.x, uPane.w * uScale - gl_FragCoord.y) / uScale;
  // The map was drawn with pane y = 0 at v = 0 (MAP_VERTEX), so v runs down the pane like page y.
  vec2 uv = local / uPane.zw * uMapUv;
  vec4 m = texture2D(uMap, uv);
  // The contact line, antialiased over about a pixel (the map's coverage ramps over the drop's outer 8%).
  float cover = smoothstep(0.05, 0.6, m.a);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float h = m.r * HEIGHT_MAX;
  // The slope, mm per mm, by central differences over one map texel each way.
  vec2 texelMm = uMapTexel / uMapUv * uPane.zw / uPxPerMm;
  float dx = (heightAt(uv + vec2(uMapTexel.x, 0.0)) - heightAt(uv - vec2(uMapTexel.x, 0.0))) / (2.0 * texelMm.x);
  float dy = (heightAt(uv + vec2(0.0, uMapTexel.y)) - heightAt(uv - vec2(0.0, uMapTexel.y))) / (2.0 * texelMm.y);
  vec2 grad = vec2(dx, dy);
  // The lens: toward the centre (where the height rises) by (n - 1) gap grad(h).
  vec2 page = uPane.xy + local + (uIor - 1.0) * uGap * grad;
  vec3 seen = uHasPhoto > 0.5 ? texture2D(uPhoto, coverUv(page, uImage, uImageFit)).rgb : uRoom;
  // Fresnel at this slant (Schlick), n from air.
  vec3 N = normalize(vec3(-grad, 1.0));
  float cosI = N.z;
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - cosI, 5.0);
  /*
   * What the drop's face reflects: the room behind the viewer, turned by the
   * cap's slope (twice its tilt), as the glass's own face reflects it
   * (GlassLight). On a curved drop that is a small, bright image of the
   * room's windows and lamps -- much of why a drop on a window shows.
   */
  vec3 pagePt = vec3(uPane.xy + local - uViewCentre, 0.0);
  vec3 viewRay = normalize(vec3(pagePt.xy, -uCameraDistance));
  vec3 roomDir = reflect(viewRay, N);
  vec3 room = uHasRoom > 0.5
    ? decodeRadiance(texture2D(uRoomTex, roomUvDir(roomDir)).rgb) * uRoomExposure
    : uRoom;
  float cosV = max(-dot(viewRay, N), 0.0);
  F = f0 + (1.0 - f0) * pow(1.0 - cosV, 5.0);
  vec3 col = seen * (1.0 - F) + room * F;
  /*
   * Every light's highlight: the lamp itself, seen mirrored in the drop's
   * curved face. Where the view reflected off this point of the cap
   * (reflect(-V, N)) points within the lamp's own angular size of the lamp,
   * the drop shows the lamp, at the face's Fresnel reflectance. On a drop a
   * few pixels across that image is smaller than a pixel: it is widened to
   * about a pixel's worth of the cap's turn (0.12 rad, estimate) and dimmed
   * by the same area, so it reads as the glint every drop has (water-drops
   * 7.4 photo 6) without flickering.
   */
  vec3 P = vec3(uPane.xy + local, h * uPxPerMm);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Rv = reflect(-V, N);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i] - P;
    float dist = length(toL);
    vec3 L = toL / dist;
    float size = atan(max(uLightRadius[i], 1.0) / dist);
    float wide = max(size, 0.12);
    float off = acos(clamp(dot(Rv, L), -1.0, 1.0));
    float disc = 1.0 - smoothstep(wide * 0.7, wide * 1.3, off);
    float fl = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, L), 0.0), 5.0);
    // A lamp seen directly is far brighter than what it lights: the reflection clips to white even at 2%.
    spec += uLightColour[i] * disc * fl * 60.0 * (size * size) / (wide * wide) + uLightColour[i] * disc * fl * 4.0;
  }
  col += spec;
  gl_FragColor = vec4(min(col, vec3(1.0)), cover);
}
`;
