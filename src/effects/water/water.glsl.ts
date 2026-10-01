/**
 * The water's passes (task 77; docs/research/water-drops.md 6.2, 7.2, 9).
 *
 * 1. Height maps, at the device's pixels. Every drop (and, into a map of
 *    its own that persists, every small droplet) is drawn as a quad over
 *    its contact line, its height a spherical cap -- but on a contact line
 *    that is never quite a circle: pinned by the glass's defects (harmonics
 *    2-4, a random phase per drop) and pulled into a pear by gravity on the
 *    upright glass, wider and deeper at the bottom (water-drops 9.1).
 *    Heights add where drops overlap, so two drops necking together are one
 *    lens. R: height / full scale; G, B: blood and slime coverage; A: coverage.
 *
 * 2. Wiping: a drop swallows the droplets under it, and a running drop
 *    sweeps its whole path clean (the clean tracks of water-drops 7.4
 *    photo 3); and the film it leaves wets its track.
 *
 * 3. The water layer, per device pixel of the pane: where there is water,
 *    the eye's ray is traced through it -- refracted into the water at the
 *    face's slope, carried through the flat water-glass and glass-air faces
 *    by the tangential n sin(theta), across the glass's thickness and on
 *    to the scene (effects/water/lens, its JS twin). The photograph is the
 *    world outside the window, metres away, not a print behind the glass:
 *    every drop images it from that distance, sharp, small and upside down,
 *    as Ony's reference photographs show (the Golden Gate's tower inverted
 *    in each drop). Wet etched
 *    glass is clear (water-drops 9.1: water fills the roughness), so what
 *    it lands on is the photograph itself, sharp, inverted and shrunk where
 *    it lies past the drop's focal length, coloured as the pane colours its
 *    frost (its saturate and its fill, minus the blur). Fresnel reflects
 *    the room at each point's slant and every light puts its own highlight
 *    on every drop.
 */

import { ENVIRONMENT_GLSL } from "@/effects/optics/environment.glsl";
import { CAMERA_MATCH_GLSL } from "@/effects/light/camera-match";

/** The drops map's full scale in RGBA8, mm (an 8-bit step is 11.8 um); a half-float map holds mm as they are. */
export const HEIGHT_MAX = 3;
/** The droplet map's full scale, mm: droplets are under 0.3 mm tall, and 2 um a step keeps their slopes smooth. */
export const DROPLET_HEIGHT_MAX = 0.5;

export const MAP_VERTEX = /* glsl */ `
attribute vec2 aPos;      // map px
attribute vec2 aLocal;    // the drop's own frame: x across, y down the glass, 1 = contact radius
attribute vec4 aDrop;     // contact radius mm, cap height mm, seed, liquid id
attribute vec3 aShape;    // irregularity, pear taper, sag
attribute vec2 aExtra;    // x: how much of the drawn drop is really there (a sparkle smaller than it is drawn); y: unused
uniform vec2 uMapSize;    // map px
varying vec2 vLocal;
varying vec4 vDrop;
varying vec3 vShape;
varying float vCoverScale;
void main() {
  vLocal = aLocal;
  vDrop = aDrop;
  vShape = aShape;
  vCoverScale = aExtra.x;
  vec2 clip = aPos / uMapSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}
`;

/** The contact line and the cap, shared by the map and the wipe. */
const SHAPE_GLSL = /* glsl */ `
// How far out this point is, 1 on the contact line.
float contactRho(vec2 p, vec3 shape, float seed) {
  // The pear: narrower toward the top (y < 0), as gravity holds the advancing edge below.
  float wf = max(1.0 + shape.y * p.y, 0.35);
  vec2 q = vec2(p.x / wf, p.y);
  float ang = atan(q.y, q.x);
  float s1 = fract(seed * 0.6180339) * 6.2831853;
  float s2 = fract(seed * 0.7548777) * 6.2831853;
  float s3 = fract(seed * 0.5698403) * 6.2831853;
  float rc = 1.0 + shape.x * (0.55 * cos(2.0 * ang + s1) + 0.3 * cos(3.0 * ang + s2) + 0.15 * cos(4.0 * ang + s3));
  return length(q) / rc;
}
`;

export const MAP_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vLocal;
varying vec4 vDrop;
varying vec3 vShape;
varying float vCoverScale;
uniform float uHeightScale;  // 1 / full scale, mm
uniform float uPxPerMm;      // map px per mm
${SHAPE_GLSL}
void main() {
  float a = vDrop.x;
  float h0 = vDrop.y;
  float rho = contactRho(vLocal, vShape, vDrop.z);
  // The contact line, antialiased over one map pixel.
  float cover = clamp(0.5 + (1.0 - rho) * a * uPxPerMm, 0.0, 1.0);
  if (cover <= 0.0) discard;
  // A droplet smaller than it is drawn covers only its share of the pixels it is drawn on.
  cover *= vCoverScale;
  // A spherical cap over the (irregular) contact line: R = (a^2 + h0^2) / 2 h0.
  float R = (a * a + h0 * h0) / max(2.0 * h0, 1e-5);
  float r = min(rho, 1.0) * a;
  float h = sqrt(max(R * R - r * r, 0.0)) - (R - h0);
  // Deeper toward the bottom (gravity), the volume kept: 1 + sag y.
  h = max(h, 0.0) * (1.0 + vShape.z * clamp(vLocal.y, -1.0, 1.0));
  float blood = abs(vDrop.w - 1.0) < 0.5 ? cover : 0.0;
  float slime = abs(vDrop.w - 2.0) < 0.5 ? cover : 0.0;
  gl_FragColor = vec4(h * uHeightScale, blood, slime, cover);
}
`;

/**
 * The wipe: drawn with blend (ZERO, ONE_MINUS_SRC_ALPHA) into the droplet
 * map it clears what it covers; with (ONE, ONE) into the wet map it wets.
 * A capsule: the drop's footprint swept from where it was to where it is.
 */
export const WIPE_VERTEX = /* glsl */ `
attribute vec2 aPos;    // map px
attribute vec2 aLocal;  // along the sweep (x, 0 to len), across (y, -1 to 1 = the radius)
attribute float aLen;   // the sweep's length in radii
uniform vec2 uMapSize;
varying vec2 vLocal;
varying float vLen;
void main() {
  vLocal = aLocal;
  vLen = aLen;
  vec2 clip = aPos / uMapSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y, 0.0, 1.0);
}
`;

export const WIPE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vLocal;
varying float vLen;
uniform float uSoft;    // the edge's softness, in radii
uniform vec4 uColour;
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float d = length(vec2(vLocal.x - x, vLocal.y));
  float a = 1.0 - smoothstep(1.0 - uSoft, 1.0, d);
  if (a <= 0.0) discard;
  gl_FragColor = uColour * a;
}
`;

/** A full-map quad that takes a constant off (blend REVERSE_SUBTRACT): drying, evaporating. */
export const FADE_FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec4 uColour;
void main() { gl_FragColor = uColour; }
`;

export const COMPOSE_VERTEX = /* glsl */ `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const MAX_WATER_LIGHTS = 4;

export const COMPOSE_FRAGMENT = /* glsl */ `
precision highp float;
${ENVIRONMENT_GLSL}
${CAMERA_MATCH_GLSL}
uniform sampler2D uDrops;     // the drops map
uniform vec2 uDropsUv;        // how much of the drops texture this pane uses
uniform vec2 uDropsTexel;     // one texel, in uv
uniform float uDropsFull;     // its full scale, mm (1 for a half-float map, which holds mm)
uniform sampler2D uDroplets;  // the droplet map (this pane's own)
uniform vec2 uDropletsTexel;
uniform sampler2D uWet;       // the wet map: R wetness 0-1
uniform sampler2D uPhoto;     // the photograph behind the pane (mipmapped)
uniform float uHasPhoto;
uniform vec4 uImage;          // where the photograph is drawn, page px
uniform vec3 uImageFit;       // its aspect and object-position
uniform vec4 uPane;           // the pane's x, y, w, h, page px
uniform float uScale;         // device px per CSS px
uniform float uPxPerMm;       // CSS px per mm
uniform float uThickness;     // the glass, CSS px
uniform float uScene;         // how far behind the glass the scene the drops image is, CSS px
uniform float uRivulet;       // a fresh rivulet's height, mm, where the wet map is 1
uniform vec2 uWetTexel;       // one wet-map texel, in uv
uniform sampler2D uFog;       // the condensation map: R how far it has built up
uniform float uFogAmount;     // its full density, 0-1
uniform float uFogSide;       // 0: on the rain's face (wiped by it); 1: on the other face (veiling it)
uniform float uClear;         // 1: the water clears the etch (rain on the etched face); 0: on the polished face, reflections only
uniform float uIor;
uniform float uGlassIor;
uniform float uSaturate;      // the pane's own saturate()
uniform vec4 uFill;           // the pane's fill colour and its alpha
uniform vec3 uRoom;
uniform sampler2D uRoomTex;
uniform float uHasRoom;
uniform float uRoomExposure;
uniform vec2 uViewCentre;     // page px
uniform float uCameraDistance; // CSS px
uniform vec3 uSigmaBlood;
uniform vec3 uSigmaSlime;
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_WATER_LIGHTS}];
uniform vec3 uLightColour[${MAX_WATER_LIGHTS}];
uniform float uLightRadius[${MAX_WATER_LIGHTS}];
const float DROPLET_FULL = ${DROPLET_HEIGHT_MAX.toFixed(2)};

vec2 coverUv(vec2 pt, vec4 image, vec3 fit) {
  vec2 rel = (pt - image.xy) / max(image.zw, vec2(1.0));
  float aspect = fit.x;
  float boxAspect = image.z / max(image.w, 1.0);
  vec2 scale = boxAspect > aspect ? vec2(1.0, boxAspect / aspect) : vec2(aspect / boxAspect, 1.0);
  return (rel - fit.yz) / scale + fit.yz;
}

// The photograph as the pane shows it through clear glass: saturated and veiled by the glass's own fill, as its frost is.
vec3 photoAt(vec2 page) {
  if (uHasPhoto < 0.5) return uRoom;
  vec3 c = texture2D(uPhoto, clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0)).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(l), c, uSaturate), 0.0, 1.0);
  return mix(c, uFill.rgb, uFill.a);
}

/*
 * Where a ray from the eye (V, into the glass) that meets the water's face
 * with normal N lands on the photograph, as an offset across the page, px;
 * z: 1 if it is totally reflected at the glass's back face. Refracted into
 * the water; the tangential n sin(theta) carries through the flat faces;
 * then across the water's own height hPx, the glass and the gap.
 */
vec3 traceTo(vec3 V, vec3 N, float hPx) {
  vec3 t = refract(V, N, 1.0 / uIor);
  vec2 k = uIor * t.xy;
  float k2 = dot(k, k);
  vec2 tanW = t.xy / max(-t.z, 1e-3);
  float sg = k2 / (uGlassIor * uGlassIor);
  vec2 tanG = (k / uGlassIor) / sqrt(max(1.0 - sg, 1e-4));
  vec2 tanA = k / sqrt(max(1.0 - k2, 1e-4));
  return vec3(hPx * tanW + uThickness * tanG + uScene * tanA, k2 >= 0.999 ? 1.0 : 0.0);
}

float dropsH(vec2 uv) { return texture2D(uDrops, uv).r * uDropsFull; }
float dropletsH(vec2 uv) { return texture2D(uDroplets, uv).r * DROPLET_FULL; }
float waterH(vec2 local) {
  vec2 uvP = clamp(local / uPane.zw, 0.0, 1.0);
  return dropsH(uvP * uDropsUv) + dropletsH(uvP);
}

// A rivulet: the film a runner leaves, standing as a low ridge of water as tall as it is fresh.
float rivuletH(vec2 uv) { return uRivulet * smoothstep(0.1, 1.0, texture2D(uWet, uv).r); }

// Cheap value noise, for the fog's uneven density and its grain.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

/*
 * Condensation's colour (water-drops 9.5): droplets far smaller than a
 * pixel, so dense they scatter most of the light through them sideways.
 * What shows through is the scene smeared out (the photograph's coarsest
 * mip levels), its contrast and colour washed toward the milky grey of the
 * scattered light, with the faint grain of the droplets.
 */
vec3 fogColour(vec2 page) {
  vec3 blur;
  if (uHasPhoto > 0.5) {
    vec2 uv = clamp(coverUv(page, uImage, uImageFit), 0.0, 1.0);
    blur = 0.6 * texture2D(uPhoto, uv, 6.0).rgb + 0.4 * texture2D(uPhoto, uv, 8.0).rgb;
  } else blur = uRoom;
  float l = dot(blur, vec3(0.2126, 0.7152, 0.0722));
  vec3 milk = vec3(l * 0.7 + 0.16);
  /*
   * And the lamps in front of it: the fog scatters their light toward the
   * viewer over a wide halo round each (the glow a steamed window has round
   * every light; its width an estimate).
   */
  for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec2 dl = (page - uLightPos[i].xy) / 260.0;
    milk += uLightColour[i] * 0.12 / (1.0 + dot(dl, dl));
  }
  vec3 c = mix(blur, milk, 0.65);
  return c * (0.94 + 0.12 * hash12(floor(gl_FragCoord.xy)));
}

void main() {
  // This pixel, pane CSS px from the top left; the maps were drawn with y = 0 at v = 0.
  vec2 local = vec2(gl_FragCoord.x, uPane.w * uScale - gl_FragCoord.y) / uScale;
  vec2 uvP = local / uPane.zw;
  vec2 uvD = uvP * uDropsUv;
  vec4 d = texture2D(uDrops, uvD);
  vec4 s = texture2D(uDroplets, uvP);
  float wet = texture2D(uWet, uvP).r;
  float coverD = clamp(d.a, 0.0, 1.0);
  // A droplet that has evaporated to nothing leaves its coverage behind: the height decides.
  float coverS = clamp(s.a, 0.0, 1.0) * smoothstep(0.0, 2.0 / 255.0, s.r);
  // A fresh rivulet is water standing on the glass, a lens of its own: it bends the scene as it wanders.
  float coverW = smoothstep(0.2, 0.55, wet);
  float cover = max(max(coverD, coverS), coverW);
  // A film clears the etch as far as it is thick: fully only where it is fresh, fading as it dries.
  float film = smoothstep(0.1, 1.0, wet) * 0.85 * uClear;

  /*
   * The condensation here: its full density, uneven over the glass (thinner
   * in patches a few centimetres across, estimate), as far as it has built
   * up. On the rain's face, none under the water (the wipe clears the map
   * too; this keeps a drop's own footprint clean before the next frame).
   */
  vec2 pageHere = uPane.xy + local;
  float patchy = 0.75 + 0.25 * vnoise(pageHere / 90.0) + 0.1 * vnoise(pageHere / 23.0);
  float fogA = uFogAmount * clamp(texture2D(uFog, uvP).r * patchy, 0.0, 1.0) * 0.92;
  if (uFogSide < 0.5) fogA *= 1.0 - max(coverD, coverW);

  if (cover <= 0.0 && film <= 0.0) {
    if (fogA <= 0.0) { gl_FragColor = vec4(0.0); return; }
    gl_FragColor = vec4(fogColour(pageHere), fogA);
    return;
  }

  // The water's height and slope here, mm and mm per mm: both maps, by central differences over one texel.
  float mmPerTexel = 1.0 / (uScale * uPxPerMm);
  float h = d.r * uDropsFull + s.r * DROPLET_FULL + rivuletH(uvP);
  vec2 tx = vec2(uDropsTexel.x, 0.0);
  vec2 ty = vec2(0.0, uDropsTexel.y);
  vec2 sx = vec2(uDropletsTexel.x, 0.0);
  vec2 sy = vec2(0.0, uDropletsTexel.y);
  vec2 grad = vec2(
    dropsH(uvD + tx) - dropsH(uvD - tx) + dropletsH(uvP + sx) - dropletsH(uvP - sx),
    dropsH(uvD + ty) - dropsH(uvD - ty) + dropletsH(uvP + sy) - dropletsH(uvP - sy)
  ) / (2.0 * mmPerTexel);
  // The rivulet's slope, over its own (half-size) map's texel.
  vec2 wx = vec2(uWetTexel.x, 0.0);
  vec2 wy = vec2(0.0, uWetTexel.y);
  grad += vec2(rivuletH(uvP + wx) - rivuletH(uvP - wx), rivuletH(uvP + wy) - rivuletH(uvP - wy))
        / (4.0 * mmPerTexel);
  // Page y runs down, the face's normal toward the viewer (+z).
  vec3 N = normalize(vec3(-grad, 1.0));

  vec2 page = uPane.xy + local;
  vec3 eye = vec3(uViewCentre, uCameraDistance);
  vec3 V = normalize(vec3(page, h * uPxPerMm) - eye); // from the eye, into the glass (z down)

  /*
   * The trace (effects/water/lens trace), less the flat glass's own (the
   * page draws the photograph without parallax, so only what the water
   * adds moves it).
   */
  vec3 tr = traceTo(V, N, h * uPxPerMm);
  vec3 flatTr = traceTo(V, vec3(0.0, 0.0, 1.0), 0.0);
  bool tir = tr.z > 0.5;
  vec2 seenPage = page + tr.xy - flatTr.xy;

  // Fresnel at the water's face (Schlick) for this slant.
  float cosV = max(-dot(V, N), 0.0);
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - cosV, 5.0);
  // What the face reflects: the room behind the viewer, turned by the slope.
  vec3 roomDir = reflect(V, N);
  vec3 room = uHasRoom > 0.5
    ? decodeRadiance(texture2D(uRoomTex, roomUvDir(roomDir)).rgb) * uRoomExposure
    : uRoom;

  // Blood and slime take light out on the way through (Beer-Lambert).
  float bloodFrac = clamp((d.g + s.g) / max(d.a + s.a, 1e-3), 0.0, 1.0);
  float slimeFrac = clamp((d.b + s.b) / max(d.a + s.a, 1e-3), 0.0, 1.0);
  vec3 T = exp(-(uSigmaBlood * bloodFrac + uSigmaSlime * slimeFrac) * h);

  /*
   * Every light's highlight: the lamp seen mirrored in the curved face,
   * where the reflected view comes within the lamp's own angular size of it,
   * at the face's Fresnel reflectance; the lamp is far brighter than what it
   * lights, so even 2% of it clips to white.
   */
  vec3 P = vec3(page, h * uPxPerMm);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < ${MAX_WATER_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = vec3(uLightPos[i].xy, uLightPos[i].z) - P;
    float dist = length(toL);
    vec3 L = toL / dist;
    float size = atan(max(uLightRadius[i], 1.0) / dist);
    float off = acos(clamp(dot(roomDir, L), -1.0, 1.0));
    /*
     * Across one pixel of a drop a few millimetres wide its reflected view
     * turns by about 0.1 rad, so a lamp's image is smaller than a pixel:
     * widened to that (and dimmed by the same area, so it carries the same
     * light), it is the steady glint every drop has instead of a pixel that
     * flickers on and off.
     */
    float wide = max(size, 0.1);
    float disc = 1.0 - smoothstep(wide * 0.7, wide * 1.3, off);
    float fl = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, L), 0.0), 5.0);
    spec += uLightColour[i] * disc * fl * (60.0 * (size * size) / (wide * wide) + 4.0);
  }

  vec3 col;
  float alpha;
  // Until the photograph has loaded, the drop has nothing to show through it but black: draw only its reflections.
  if (uClear > 0.5 && uHasPhoto > 0.5) {
    vec3 through = tir ? room * 0.3 : photoAt(seenPage);
    vec3 wetGlass = photoAt(page);
    // Where there is a drop, its lens; where only the film, the clear glass under it.
    vec3 water = through * T * (1.0 - F) + room * F + spec;
    col = mix(wetGlass, water, cover);
    alpha = max(cover, film);
  } else {
    // On the polished face: only what the water reflects, over the frost the pane already shows.
    vec3 add = room * F + spec;
    float peak = max(add.r, max(add.g, add.b));
    col = peak > 1e-4 ? add / peak : vec3(0.0);
    alpha = min(peak, 1.0) * cover;
  }
  /*
   * A highlight brighter than the screen goes to white, as a sensor's
   * clipped highlight does: clipping each channel on its own turned a
   * bright pinkish window in the room into a violet dot on every drop.
   */
  float pk = max(col.r, max(col.g, col.b));
  if (pk > 1.0) col = mix(col / pk, vec3(1.0), clamp((pk - 1.0) / pk, 0.0, 1.0));
  // The photographs' shoulder and grain on the lens (effects/light/camera-match): a glint is their cream, not a screen's white.
  if (uClear > 0.5 && uHasPhoto > 0.5) col = cameraHighlights(col * max(pk, 1.0), gl_FragCoord.xy / uScale);
  /*
   * With the condensation: on the other face it lies between the viewer and
   * the water, so the water is seen through it; on the rain's face what is
   * left of it lies round the water.
   */
  if (fogA > 0.0) {
    vec3 fc = fogColour(pageHere);
    if (uFogSide > 0.5) {
      float a = fogA + alpha * (1.0 - fogA);
      col = (fc * fogA + col * alpha * (1.0 - fogA)) / max(a, 1e-4);
      alpha = a;
    } else {
      float a = alpha + fogA * (1.0 - alpha);
      col = (col * alpha + fc * fogA * (1.0 - alpha)) / max(a, 1e-4);
      alpha = a;
    }
  }
  gl_FragColor = vec4(col, alpha);
}
`;
