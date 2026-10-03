import { useEffect } from "react";
import { previewing } from "@/effects/engine/preview";
import { addTask, ORDER } from "@/effects/engine/scheduler";
import {
  beginPass,
  blitAll,
  buildProgram,
  endPass,
  onSharedGlLoss,
  sharedGl,
} from "@/effects/engine/gl";
import { paneCanvas } from "@/effects/engine/compositor";
import {
  geometryStamp,
  glassGeometry,
  litSurfaceList,
  type GlassRect,
} from "@/effects/scene/scene";
import { pointLights, roomLight, strongestCharge } from "@/effects/light/lights";
import { floorScale } from "@/effects/light/floor-scale";
import { publishLensMap } from "@/effects/water/lens-map";
import { floorMap } from "@/effects/light/floor-map";
import { photoTextures } from "@/effects/engine/photo-texture";
import { paneLook } from "@/effects/engine/pane-look";
import { roomTexture } from "@/effects/engine/room-texture";
import { paintTypeLayer } from "@/effects/engine/type-layer";
import { fontStamp } from "@/effects/optics/casters";
import { roomFillOverride } from "@/effects/light/room-fill";
import { quality, surfaceScaleCap } from "@/effects/engine/quality";
import { rainType } from "@/effects/water/rain-types";
import { camera } from "@/effects/camera/camera";
import { t } from "@/lib/tuning";
import { capOf, DropSim, FILM_DRY, hash01, restAngle } from "@/effects/water/sim";
import { BLOOD, LIQUIDS, SLIME, WATER } from "@/effects/water/liquids";
import { onSpray, squeeze } from "@/effects/water/spray";
import { rainVolume } from "@/effects/water/rain";
import {
  COMPOSE_FRAGMENT,
  LENS_FRAGMENT,
  LENS_LUT_PENUMBRAS,
  LENS_LUT_RATIO_MAX,
  LENS_LUT_RATIO_MIN,
  LENS_RHO_MAX,
  LENS_VERTEX,
  RIVULET_LENS_FRAGMENT,
  RIVULET_LENS_VERTEX,
  MAX_WATER_EMITTERS,
  COMPOSE_VERTEX,
  DROPLET_HEIGHT_MAX,
  FADE_FRAGMENT,
  HEIGHT_MAX,
  MAP_FRAGMENT,
  MAP_VERTEX,
  MAX_WATER_LIGHTS,
  WIPE_FRAGMENT,
  WIPE_VERTEX,
} from "@/effects/water/water.glsl";

/**
 * How many CSS px a millimetre of the glass is: the scale the drop physics
 * is measured in. 4: the largest drop that can still cling (4.4 mm, where
 * water starts to run) is about 18 px, most drops 4-10 px -- a rainy window
 * at arm's length, not a macro shot (Ony, 2026-10-01: the drops were "too
 * big", "like we're super zoomed in"; water-drops.md 9.5).
 */
export const PX_PER_MM = 4;
/** Below this radius, device px, a drop is drawn at it and faded by its area: a sparkle, not a lens too small to draw. */
const MIN_DRAWN_PX = 1.2;
/** How tall a fresh rivulet stands, mm (estimate: a film a drop leaves is a few tenths of a millimetre at its crest). */
const RIVULET_MM = 0.18;
/** How long steam takes to fog the glass fully, s (estimate: a bathroom mirror fogs in well under a minute). */
const FOG_BUILD = 30;
/** The glass's index (soda-lime, 1.52). */
const GLASS_IOR = 1.52;
/**
 * A photograph's light (PhotoLights) seen through a drop, against the white
 * the print clipped it to, at full strength (estimate: a lit sign or a street
 * lamp in a night photograph is one to two orders of magnitude over that
 * white; 12 keeps a light a quarter of a pixel across clipping to a sparkle).
 */
const EMIT_RADIANCE = 12;
/** Below this, a landing drop is a droplet: drawn into the droplet map, not tracked (uL; about 0.5 mm across at 50 degrees). */
const DROPLET_UL = 0.02;
/** Droplets evaporate this fast, mm of height a second (estimate: a 0.1 mm droplet lasts about two minutes in a rainy room). */
const DROPLET_DRY = 0.0008;
/** The droplets' and drops' resting contact angle on window glass, degrees (water-drops 2.2: 60 advancing, 40 receding). */
const REST_ANGLE = 50;
/** Water's surface tension N/m and density kg/m^3, for the Bond number that sets how much gravity pulls a drop into a pear. */
const GAMMA = 0.072;
const RHO = 1000;

type Droplet = { x: number; y: number; a: number; liquid: number; seed: number };

type PaneState = {
  w: number;
  h: number;
  droplets: WebGLTexture | null;
  dropletFbo: WebGLFramebuffer | null;
  wet: WebGLTexture | null;
  wetFbo: WebGLFramebuffer | null;
  /** The condensation (steam fog), half size: R how far it has built up, 0-1. */
  fog: WebGLTexture | null;
  fogFbo: WebGLFramebuffer | null;
  fogClock: number;
  pending: Droplet[];
  fresh: boolean;
  /** Each drop's place last frame, map px, and how far it has run, mm. */
  prev: Map<number, [number, number, number]>;
  dryClock: number;
  wetClock: number;
};

/** The shape of a drop of contact radius a mm: how irregular, how much of a pear, how much it sags (water-drops 9.1). */
function shapeOf(a: number, speed: number): [number, number, number] {
  // The Bond number: gravity against surface tension over the drop's size.
  const bond = Math.min(1.2, (RHO * 9.81 * (a / 1000) ** 2) / GAMMA);
  // Slightly imperfect: 2% for a droplet, 6% for the largest clinging drop (Ony: "slightly imperfect, not super imperfect").
  const irregular = 0.02 + 0.04 * Math.min(1, a / 2.2);
  const run = Math.min(1, speed / 20);
  return [irregular, 0.28 * Math.min(1, bond) + 0.2 * run, 0.12 * Math.min(1, bond)];
}

/** A stream reaches its full width over this many of its drop's radii of run. */
const TRAIL_TAPER = 6;
/** How long it has rained before you arrive, s (the drops already on the glass). */
const PRE_RAIN = 150;
/** Floats a vertex in the drops' quads. */
const VERT = 21;
const NO_OUTLINE = new Float32Array(8);
const OUTLINE_SAMPLES = 48;
/** How much of each outline harmonic, 1-4, a merged drop keeps. */
const OUTLINE_DAMP = [1, 0.85, 0.6, 0.35] as const;

/**
 * The outline of a drop made of parts (DropSim): from its centre, the far
 * edge of the union of the parts' contact circles at each angle, as its mean
 * radius r0 and harmonics 1-4 against it (cos, sin), with the union's area.
 */
function outlineOf(
  cx: number,
  cy: number,
  parts: readonly (readonly [number, number, number])[],
  theta: number,
): { r0: number; area: number; coeffs: Float32Array } {
  const circles = parts.map(([x, y, v]) => [x - cx, y - cy, capOf(v, theta).a] as const);
  const r = new Float64Array(OUTLINE_SAMPLES);
  let r0 = 0;
  let area = 0;
  for (let j = 0; j < OUTLINE_SAMPLES; j++) {
    const ang = (j / OUTLINE_SAMPLES) * Math.PI * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    let far = 0;
    for (const [px, py, pa] of circles) {
      // The ray from the centre leaves this circle at t = b + sqrt(b^2 - c).
      const b = px * ux + py * uy;
      const c = px * px + py * py - pa * pa;
      const disc = b * b - c;
      if (disc < 0) continue;
      far = Math.max(far, b + Math.sqrt(disc));
    }
    r[j] = far;
    r0 += far / OUTLINE_SAMPLES;
    area += (0.5 * far * far * Math.PI * 2) / OUTLINE_SAMPLES;
  }
  const coeffs = new Float32Array(8);
  if (r0 <= 0) return { r0: capOf(1e-3, theta).a, area: 1e-6, coeffs };
  for (let n = 1; n <= 4; n++) {
    let c = 0;
    let s = 0;
    for (let j = 0; j < OUTLINE_SAMPLES; j++) {
      const ang = (j / OUTLINE_SAMPLES) * Math.PI * 2;
      c += r[j]! * Math.cos(n * ang);
      s += r[j]! * Math.sin(n * ang);
    }
    // Surface tension evens the finer wiggles out faster: the necks fill, no bow ties (estimate).
    const damp = OUTLINE_DAMP[n - 1]!;
    coeffs[(n - 1) * 2] = ((2 * c) / OUTLINE_SAMPLES / r0) * damp;
    coeffs[(n - 1) * 2 + 1] = ((2 * s) / OUTLINE_SAMPLES / r0) * damp;
  }
  return { r0, area, coeffs };
}

/** The height of a cap of `volume` uL over a footprint of `area` mm^2: V = (pi / 6) h (3 A / pi + h^2), solved by Newton. */
function capHeightFor(volume: number, area: number): number {
  const a2 = area / Math.PI;
  let h = (2 * volume) / Math.max(area, 1e-6);
  for (let k = 0; k < 6; k++) {
    const f = (Math.PI / 6) * h * (3 * a2 + h * h) - volume;
    const d = (Math.PI / 6) * (3 * a2 + 3 * h * h);
    h -= f / d;
  }
  return Math.max(h, 0);
}

/** A cap's contact radius for its volume (uL = mm^3) at contact angle theta: V = (pi / 6) h (3 a^2 + h^2), h = a tan(theta / 2). */
function radiusFor(volume: number, thetaDeg: number): number {
  const q = Math.tan(((thetaDeg / 2) * Math.PI) / 180);
  return Math.cbrt(volume / ((Math.PI / 6) * q * (3 + q * q)));
}

/** A droplet's cap height for its contact radius at the resting angle: h = a tan(theta / 2). */
const capH = (a: number) => a * Math.tan(((REST_ANGLE / 2) * Math.PI) / 180);

/**
 * Water drops on the glass (task 77, ?try=drops), rebuilt for photorealism
 * (water-drops.md 9): rain lands on every pane in view; the big drops bead,
 * merge and run once heavy enough (effects/water/sim, ported from
 * raindrop-fx, MIT); thousands of tiny droplets fill the glass between them
 * and the runners sweep clean tracks through them. Wet etched glass is
 * clear, so every drop is a lens onto the photograph -- traced through the
 * water and the glass to the scene it shows, sharp, small and upside down
 * against the frost -- with every light's highlight on it. Merged drops stay
 * stretched, runners leave wavy rivulets that bend the scene, and steam can
 * fog the glass on either face (Condensation). The rain's kind comes from
 * Rain type (effects/water/rain-types). Drawn at twice the pixels where the
 * machine can afford it.
 */
export function WaterDrops() {
  useEffect(() => {
    if (!previewing("drops")) return;
    const s = sharedGl();
    if (!s) return;
    const { gl, canvas } = s;

    const mapProgram = buildProgram(gl, MAP_VERTEX, MAP_FRAGMENT, "water map");
    const wipeProgram = buildProgram(gl, WIPE_VERTEX, WIPE_FRAGMENT, "water wipe");
    const fadeProgram = buildProgram(gl, COMPOSE_VERTEX, FADE_FRAGMENT, "water fade");
    /*
     * Explicit mip levels for the photograph seen through a drop (rain W1,
     * the sharp lookup; water.glsl photoLod): the extension is on nearly
     * every desktop and phone; without it the shader falls back to texture2D.
     */
    const lodExt = gl.getExtension("EXT_shader_texture_lod");
    const composeProgram = buildProgram(
      gl,
      COMPOSE_VERTEX,
      lodExt
        ? `#extension GL_EXT_shader_texture_lod : enable\n#define HAS_TEXTURE_LOD 1\n${COMPOSE_FRAGMENT}`
        : COMPOSE_FRAGMENT,
      "water",
    );
    const lensProgram = buildProgram(gl, LENS_VERTEX, LENS_FRAGMENT, "water lens map");
    const rivuletProgram = buildProgram(
      gl,
      RIVULET_LENS_VERTEX,
      RIVULET_LENS_FRAGMENT,
      "water rivulet lens",
    );
    if (
      !mapProgram ||
      !wipeProgram ||
      !fadeProgram ||
      !composeProgram ||
      !lensProgram ||
      !rivuletProgram
    )
      return;
    const A = (p: WebGLProgram, n: string) => gl.getAttribLocation(p, n);
    const riv = {
      pos: A(rivuletProgram, "aPos"),
      uv: A(rivuletProgram, "aUv"),
      viewport: gl.getUniformLocation(rivuletProgram, "uViewport"),
      wet: gl.getUniformLocation(rivuletProgram, "uWet"),
      wetTexel: gl.getUniformLocation(rivuletProgram, "uWetTexel"),
      rivulet: gl.getUniformLocation(rivuletProgram, "uRivulet"),
      mmPerTexel: gl.getUniformLocation(rivuletProgram, "uMmPerTexel"),
      bend: gl.getUniformLocation(rivuletProgram, "uBend"),
    };
    const rivuletQuad = gl.createBuffer();
    const lens = {
      pos: A(lensProgram, "aPos"),
      local: A(lensProgram, "aLocal"),
      lens: A(lensProgram, "aLens"),
      viewport: gl.getUniformLocation(lensProgram, "uViewport"),
      lut: gl.getUniformLocation(lensProgram, "uLut"),
    };
    const map = {
      pos: A(mapProgram, "aPos"),
      local: A(mapProgram, "aLocal"),
      drop: A(mapProgram, "aDrop"),
      shape: A(mapProgram, "aShape"),
      extra: A(mapProgram, "aExtra"),
      outA: A(mapProgram, "aOutA"),
      outB: A(mapProgram, "aOutB"),
      size: gl.getUniformLocation(mapProgram, "uMapSize"),
      scale: gl.getUniformLocation(mapProgram, "uHeightScale"),
      pxPerMm: gl.getUniformLocation(mapProgram, "uPxPerMm"),
      slopeOut: gl.getUniformLocation(mapProgram, "uSlopeOut"),
    };
    const wipe = {
      pos: A(wipeProgram, "aPos"),
      local: A(wipeProgram, "aLocal"),
      len: A(wipeProgram, "aLen"),
      size: gl.getUniformLocation(wipeProgram, "uMapSize"),
      soft: gl.getUniformLocation(wipeProgram, "uSoft"),
      colour: gl.getUniformLocation(wipeProgram, "uColour"),
    };
    const fade = {
      pos: A(fadeProgram, "aPos"),
      colour: gl.getUniformLocation(fadeProgram, "uColour"),
    };
    const composePos = A(composeProgram, "aPos");
    const CU = (n: string) => gl.getUniformLocation(composeProgram, n);
    const UNIFORMS = [
      "uDrops",
      "uDropsUv",
      "uDropsTexel",
      "uDropsFull",
      "uDroplets",
      "uDropletsTexel",
      "uWet",
      "uPhoto",
      "uHasPhoto",
      "uImage",
      "uImageFit",
      "uPane",
      "uScale",
      "uPxPerMm",
      "uThickness",
      "uScene",
      "uRivulet",
      "uWetTexel",
      "uFog",
      "uFogAmount",
      "uFogSide",
      "uSamples",
      "uClear",
      "uIor",
      "uGlassIor",
      "uSaturate",
      "uFill",
      "uRoom",
      "uRoomTex",
      "uHasRoom",
      "uRoomExposure",
      "uViewCentre",
      "uCameraDistance",
      "uSigmaBlood",
      "uSigmaSlime",
      "uLightCount",
      "uLightPos",
      "uLightColour",
      "uLightRadius",
      "uLightFloor",
      "uLightTint",
      "uRoomFill",
      "uBurning",
      "uFloorMap",
      "uHasFloorMap",
      "uFloorSize",
      "uType",
      "uHasType",
      "uFrostLod",
      "uNear",
      "uFrosted",
      "uPhotoTexels",
      "uEmitCount",
      "uEmitPos",
      "uEmitColour",
    ] as const;
    const u = Object.fromEntries(UNIFORMS.map((n) => [n, CU(n)])) as Record<
      (typeof UNIFORMS)[number],
      WebGLUniformLocation | null
    >;

    /*
     * Height precision (water-drops 9.1): the drops map in half-float where
     * the GPU renders and blends into it, holding mm as they are; RGBA8
     * otherwise, in units of HEIGHT_MAX.
     */
    const half = gl.getExtension("OES_texture_half_float");
    const halfRender = gl.getExtension("EXT_color_buffer_half_float");
    const halfLinear = gl.getExtension("OES_texture_half_float_linear");
    let dropsType: number = gl.UNSIGNED_BYTE;
    let dropsFull = HEIGHT_MAX;

    const quadBuffer = gl.createBuffer();
    const triangle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const makeTarget = (w: number, h: number, type: number, filter: number) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ok) {
        gl.clearColor(0, 0, 0, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
        return null;
      }
      return { tex, fbo };
    };

    /*
     * The lens map (rain W2; effects/water/lens-map): what the drops do to
     * the lamp's light on the print, drawn each frame the lamp is lit, for
     * the floor light to read. Viewport-sized at CSS px; RGBA8.
     */
    let lensTarget: { tex: WebGLTexture | null; fbo: WebGLFramebuffer | null } | null = null;
    let lensW = 0;
    let lensH = 0;
    let lensLut: WebGLTexture | null = null;
    let lensLutRequested = false;
    const requestLensLut = () => {
      if (lensLutRequested) return;
      lensLutRequested = true;
      const img = new Image();
      img.onload = () => {
        lensLut = gl.createTexture();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, lensLut);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        task.wake();
      };
      img.src = "/water/drop-lens-lut.png";
    };
    const lensBuffer = gl.createBuffer();
    // Development only: the lens map's state, for the rigs.
    if (import.meta.env.DEV) {
      (window as unknown as { __lensState?: () => unknown }).__lensState = () => ({
        lut: Boolean(lensLut),
        requested: lensLutRequested,
        frame: lensFrame,
        size: [lensW, lensH],
        sims: sims.size,
      });
    }
    let lensData = new Float32Array(6 * 6 * 512);
    let lensFrame = 0;
    const ensureLens = (w: number, h: number) => {
      if (lensTarget && w === lensW && h === lensH) return true;
      if (lensTarget) {
        gl.deleteTexture(lensTarget.tex);
        gl.deleteFramebuffer(lensTarget.fbo);
      }
      lensW = w;
      lensH = h;
      lensTarget = makeTarget(w, h, gl.UNSIGNED_BYTE, gl.LINEAR);
      return Boolean(lensTarget);
    };
    /*
     * One sprite per drop for the lamp: centred where the lamp's ray through
     * the drop lands on the print (a gap G behind the glass, the lamp H above
     * it: offset (drop - lamp) G / H, the footprint magnified (H + G) / H),
     * reading the lookup row for the gap over the drop's focal length
     * R / (n - 1), R = (a^2 + h^2) / 2h, and the penumbra tile for the lamp's
     * size on the print, G r / H, over the contact radius.
     */
    const drawLensMap = (
      vw: number,
      vh: number,
      lamp: { id: string; x: number; y: number; height: number; radius: number },
    ) => {
      if (!lensLut) {
        requestLensLut();
        return;
      }
      if (!ensureLens(vw, vh) || !lensTarget) return;
      // Panes and lights are in viewport CSS px already (scene.glassGeometry, lights).
      const sx = 0;
      const sy = 0;
      const H = Math.max(lamp.height, 20);
      let n = 0;
      let count = 0;
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || !pane.src) continue;
        const sim = sims.get(pane.el);
        if (!sim) continue;
        const frosted = pane.causes.material.frost > 0;
        const nearFace = !frosted && Math.round(t("rainFace")) === 1;
        // The print's distance behind the drop, CSS px (the slab lies between for drops on the near face).
        const G = pane.causes.gap + (nearFace ? pane.causes.thickness / GLASS_IOR : 0);
        if (G <= 0) continue;
        const mag = (H + G) / H;
        for (let i = 0; i < sim.count; i++) {
          const a = sim.radius(i);
          if (a < 0.08) continue;
          const h0 = sim.capHeight(i);
          const R = (a * a + h0 * h0) / Math.max(2 * h0, 1e-4);
          const f = R / (WATER.n - 1);
          const ratio = G / PX_PER_MM / f;
          const row =
            Math.log(Math.max(ratio, LENS_LUT_RATIO_MIN) / LENS_LUT_RATIO_MIN) /
            Math.log(LENS_LUT_RATIO_MAX / LENS_LUT_RATIO_MIN);
          const dx = pane.x + sim.x[i]! * PX_PER_MM;
          const dy = pane.y + sim.y[i]! * PX_PER_MM;
          const cx = dx + ((dx - lamp.x) * G) / H - sx;
          const cy = dy + ((dy - lamp.y) * G) / H - sy;
          const af = a * PX_PER_MM * mag;
          const pen = (G * Math.max(lamp.radius, 1)) / H / af;
          let tile = 0;
          for (let k = 1; k < LENS_LUT_PENUMBRAS.length; k++) {
            if (
              Math.abs(Math.log((pen + 1e-3) / LENS_LUT_PENUMBRAS[k]!)) <
              Math.abs(Math.log((pen + 1e-3) / LENS_LUT_PENUMBRAS[tile]!))
            )
              tile = k;
          }
          const ext = af * LENS_RHO_MAX;
          if (cx + ext < 0 || cx - ext > vw || cy + ext < 0 || cy - ext > vh) continue;
          if (n + 36 > lensData.length) {
            const grown = new Float32Array(lensData.length * 2);
            grown.set(lensData);
            lensData = grown;
          }
          const corners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
          for (let c = 0; c < 6; c++) {
            const ux = corners[c * 2]!;
            const uy = corners[c * 2 + 1]!;
            lensData[n++] = cx + ux * ext;
            lensData[n++] = cy + uy * ext;
            lensData[n++] = ux * LENS_RHO_MAX;
            lensData[n++] = uy * LENS_RHO_MAX;
            lensData[n++] = Math.min(Math.max(row, 0), 1);
            lensData[n++] = tile;
          }
          count++;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, lensTarget.fbo);
      gl.viewport(0, 0, vw, vh);
      gl.clearColor(1, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // The rivulets' focus lines first; the drops' sprites lie over them.
      gl.useProgram(rivuletProgram);
      gl.uniform2f(riv.viewport, vw, vh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || !pane.src) continue;
        const st = states.get(pane.el);
        if (!st?.wet) continue;
        const frosted = pane.causes.material.frost > 0;
        const nearFace = !frosted && Math.round(t("rainFace")) === 1;
        const G = pane.causes.gap + (nearFace ? pane.causes.thickness / GLASS_IOR : 0);
        if (G <= 0) continue;
        const m = 1 + G / H;
        // The pane as the lamp projects it onto the print.
        const px = (q: number) => q * m - (lamp.x * G) / H;
        const py = (q: number) => q * m - (lamp.y * G) / H;
        const x0 = px(pane.x);
        const x1 = px(pane.x + pane.w);
        const y0 = py(pane.y);
        const y1 = py(pane.y + pane.h);
        const quad = new Float32Array([
          x0,
          y0,
          0,
          0,
          x1,
          y0,
          1,
          0,
          x1,
          y1,
          1,
          1,
          x0,
          y0,
          0,
          0,
          x1,
          y1,
          1,
          1,
          x0,
          y1,
          0,
          1,
        ]);
        gl.bindBuffer(gl.ARRAY_BUFFER, rivuletQuad);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(riv.pos);
        gl.vertexAttribPointer(riv.pos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(riv.uv);
        gl.vertexAttribPointer(riv.uv, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, st.wet);
        gl.uniform1i(riv.wet, 5);
        gl.uniform2f(riv.wetTexel, 2 / st.w, 2 / st.h);
        gl.uniform1f(riv.rivulet, RIVULET_MM);
        gl.uniform1f(riv.mmPerTexel, 2 / (st.w / pane.w) / PX_PER_MM);
        gl.uniform1f(riv.bend, (G / PX_PER_MM) * (WATER.n - 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(riv.pos);
        gl.disableVertexAttribArray(riv.uv);
      }
      gl.disable(gl.BLEND);
      if (count > 0) {
        gl.useProgram(lensProgram);
        gl.uniform2f(lens.viewport, vw, vh);
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, lensLut);
        gl.uniform1i(lens.lut, 7);
        gl.bindBuffer(gl.ARRAY_BUFFER, lensBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, lensData.subarray(0, n), gl.DYNAMIC_DRAW);
        const stride = 6 * 4;
        gl.enableVertexAttribArray(lens.pos);
        gl.vertexAttribPointer(lens.pos, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(lens.local);
        gl.vertexAttribPointer(lens.local, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(lens.lens);
        gl.vertexAttribPointer(lens.lens, 2, gl.FLOAT, false, stride, 16);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, count * 6);
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(lens.pos);
        gl.disableVertexAttribArray(lens.local);
        gl.disableVertexAttribArray(lens.lens);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      lensFrame++;
      publishLensMap({
        texture: lensTarget.tex!,
        scrollX: sx,
        scrollY: sy,
        width: vw,
        height: vh,
        lightId: lamp.id,
        frame: lensFrame,
      });
    };

    // The drops map: one, cleared and redrawn each frame, as large as the largest pane needs.
    let drops: { tex: WebGLTexture | null; fbo: WebGLFramebuffer | null } | null = null;
    let dropsW = 0;
    let dropsH = 0;
    const ensureDrops = (w: number, h: number) => {
      if (drops && w <= dropsW && h <= dropsH) return true;
      dropsW = Math.max(dropsW, w);
      dropsH = Math.max(dropsH, h);
      if (drops) {
        gl.deleteTexture(drops.tex);
        gl.deleteFramebuffer(drops.fbo);
      }
      drops = null;
      if (half && halfRender) {
        drops = makeTarget(
          dropsW,
          dropsH,
          half.HALF_FLOAT_OES,
          halfLinear ? gl.LINEAR : gl.NEAREST,
        );
        if (drops) {
          dropsType = half.HALF_FLOAT_OES;
          dropsFull = 1;
        }
      }
      if (!drops) {
        drops = makeTarget(dropsW, dropsH, gl.UNSIGNED_BYTE, gl.LINEAR);
        dropsType = gl.UNSIGNED_BYTE;
        dropsFull = HEIGHT_MAX;
      }
      return Boolean(drops);
    };

    /*
     * The photographs, as textures (effects/engine/photo-texture): the same
     * loader the crack faces use, mipmapped so a drop's shrunk image does
     * not shimmer.
     */
    const photoTex = photoTextures(gl, () => task.wake(), gl.TEXTURE1);
    const photo = (src: string, fallback?: string) => photoTex.get(src, fallback);

    // The room the glass reflects (effects/engine/room-texture), shared with the crack faces.
    const roomTex = roomTexture(gl, () => task.wake(), gl.TEXTURE3);

    const lookOf = paneLook;

    const sims = new Map<HTMLElement, DropSim>();
    const states = new Map<HTMLElement, PaneState>();
    const layers = new Map<HTMLElement, HTMLCanvasElement>();
    /*
     * The copy printed on each pane, as a texture the drops look through
     * (effects/engine/type-layer; Ony, 2026-10-02): repainted when the page
     * is re-measured, a font lands, or the setting changes.
     */
    const typeCanvas = document.createElement("canvas");
    // Development only: the type layer as last painted, for the rigs.
    if (import.meta.env.DEV) {
      (window as unknown as { __typeLayer?: () => string }).__typeLayer = () =>
        typeCanvas.toDataURL();
    }
    const types = new Map<HTMLElement, { tex: WebGLTexture | null; key: string; has: boolean }>();
    const typeFor = (pane: GlassRect, scale: number) => {
      const on = t("typeOnGlass") > 0.5;
      /*
       * The words and where their blocks sit are part of the key: an animated
       * heading settles letter by letter after the first paint, and while its
       * wide stand-in glyphs wrap to an extra line everything below it sits a
       * line lower (the ghost rows of 2026-10-02).
       */
      let text = 0;
      if (on) {
        for (const su of litSurfaceList()) {
          if (su.material.id !== "ink" || !pane.el.contains(su.el)) continue;
          const tc = su.el.textContent ?? "";
          for (let i = 0; i < tc.length; i++) text = (text * 31 + tc.charCodeAt(i)) | 0;
          const r = su.el.getBoundingClientRect();
          text = (text * 31 + Math.round((r.top - pane.y) * 4) + Math.round(r.height * 4) * 7) | 0;
        }
      }
      const key = on
        ? `${geometryStamp()}|${fontStamp()}|${Math.round(pane.w)}x${Math.round(pane.h)}|${scale}|${text}`
        : "off";
      let entry = types.get(pane.el);
      if (entry && entry.key === key) return entry;
      if (!entry) {
        entry = { tex: null, key: "", has: false };
        types.set(pane.el, entry);
      }
      entry.key = key;
      entry.has = on && paintTypeLayer(typeCanvas, pane.el, scale);
      if (entry.has) {
        if (!entry.tex) entry.tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE7);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, typeCanvas);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      // Over the copy when the copy is on the glass (the drops sit on the letters); under it otherwise.
      const layer = layers.get(pane.el);
      if (layer) layer.classList.toggle("glass__water--over-type", entry.has);
      return entry;
    };
    let seed = 1;
    let rng = 0x2545f491;
    const random = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    const gauss = () =>
      Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
    /*
     * The maps' and the water layer's scale, device px per CSS px: the
     * screen's own, and at least 2 on a machine that can afford it -- drawn
     * at twice the pixels and shown smaller, every drop's rim and every
     * droplet is antialiased by the browser's downscale (Ony, 2026-10-01:
     * the drops were "still way too pixelated").
     */
    const dpr = () =>
      Math.max(Math.min(2, Math.max(1, window.devicePixelRatio || 1)), surfaceScaleCap());

    /*
     * Where rain lands on a pane is not even (Ony, 2026-10-02: "sometimes
     * spaces have a lot less raindrops while other areas are more
     * concentrated. It depends on how heavy the rain is"). Gusts and the
     * eaves and frame shelter some of the glass, so drops arrive in drifts:
     * a slow field over the pane (cells PATCH_MM and a finer third of it)
     * sets how likely a drop is to land at a point. Light rain is patchy,
     * a downpour covers the glass almost evenly.
     */
    const PATCH_MM = 30;
    const patchAt = (sim: DropSim, x: number, y: number) => {
      const octave = (cell: number, salt: number) => {
        const gx = x / cell;
        const gy = y / cell;
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        const fx = gx - i;
        const fy = gy - j;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const v = (p: number, q: number) => hash01(sim.seed * 31337 + salt + p * 8191, q);
        return (
          (v(i, j) * (1 - sx) + v(i + 1, j) * sx) * (1 - sy) +
          (v(i, j + 1) * (1 - sx) + v(i + 1, j + 1) * sx) * sy
        );
      };
      return 0.7 * octave(PATCH_MM, 11) + 0.3 * octave(PATCH_MM / 3, 29);
    };
    /** A point on the pane where rain lands, drawn from the drift field. */
    const spot = (sim: DropSim): [number, number] => {
      const heavy = Math.min(1, (rainType(t("rainType")).rate * t("rainStrength")) / 0.3);
      const contrast = 0.9 - 0.6 * heavy;
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = random() * sim.width;
        y = random() * sim.height;
        // Smoothstepped so the drifts have edges, not a gentle ramp.
        const p = patchAt(sim, x, y);
        const e = p * p * (3 - 2 * p);
        if (random() < 1 - contrast * (1 - e)) break;
      }
      return [x, y];
    };

    /** A rain drop landing: a drop the sim tracks if it is big enough, and its splash of droplets. */
    const land = (sim: DropSim, st: PaneState, volume: number) => {
      const [x, y] = spot(sim);
      if (volume >= DROPLET_UL) sim.addVolume(x, y, volume, WATER.id);
      else {
        const a = radiusFor(volume, REST_ANGLE);
        st.pending.push({
          x: Math.min(sim.width - a, Math.max(a, x)),
          y: Math.min(sim.height - a, Math.max(a, y)),
          a,
          liquid: WATER.id,
          seed: random() * 1000,
        });
      }
    };
    /** Drizzle and splash: tiny droplets anywhere on the pane, radius log-normal round 0.17 mm (water-drops 9.1: 2-4 px across in the 1280 px reference frames). */
    const drizzle = (sim: DropSim, st: PaneState, n: number) => {
      for (let q = 0; q < n; q++) {
        const a = Math.min(0.45, 0.17 * Math.exp(0.45 * gauss()));
        const [sx, sy] = spot(sim);
        // Wholly on the glass: a droplet cannot hang past the pane's edge.
        const x = Math.min(sim.width - a, Math.max(a, sx));
        const y = Math.min(sim.height - a, Math.max(a, sy));
        /*
         * A droplet landing on the wet film a runner left joins the film: the
         * lanes the streams wiped stay clear for a while, the lines in the
         * negative space (Ony, 2026-10-02).
         */
        const film = sim.filmAt(x, y);
        if (film > 0.1 && random() < film) continue;
        st.pending.push({
          x,
          y,
          a,
          liquid: WATER.id,
          seed: random() * 1000,
        });
      }
    };

    const stateFor = (pane: ReturnType<typeof glassGeometry>[number], sim: DropSim) => {
      const k = dpr();
      const w = Math.max(1, Math.round(pane.w * k));
      const h = Math.max(1, Math.round(pane.h * k));
      let st = states.get(pane.el);
      if (st && (st.w !== w || st.h !== h)) {
        gl.deleteTexture(st.droplets);
        gl.deleteFramebuffer(st.dropletFbo);
        gl.deleteTexture(st.wet);
        gl.deleteFramebuffer(st.wetFbo);
        gl.deleteTexture(st.fog);
        gl.deleteFramebuffer(st.fogFbo);
        st = undefined;
      }
      if (!st) {
        const d = makeTarget(w, h, gl.UNSIGNED_BYTE, gl.LINEAR);
        const wt = makeTarget(
          Math.max(1, Math.round(w / 2)),
          Math.max(1, Math.round(h / 2)),
          gl.UNSIGNED_BYTE,
          gl.LINEAR,
        );
        const fg = makeTarget(
          Math.max(1, Math.round(w / 2)),
          Math.max(1, Math.round(h / 2)),
          gl.UNSIGNED_BYTE,
          gl.LINEAR,
        );
        st = {
          w,
          h,
          droplets: d?.tex ?? null,
          dropletFbo: d?.fbo ?? null,
          wet: wt?.tex ?? null,
          wetFbo: wt?.fbo ?? null,
          fog: fg?.tex ?? null,
          fogFbo: fg?.fbo ?? null,
          fogClock: 0,
          pending: [],
          fresh: true,
          prev: new Map(),
          dryClock: 0,
          wetClock: 0,
        };
        states.set(pane.el, st);
        // Steam on the glass when you arrive: already fogged, as the rain has already fallen.
        if (st.fogFbo && t("fogAmount") > 0) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.fogFbo);
          gl.viewport(0, 0, Math.round(w / 2), Math.round(h / 2));
          gl.clearColor(1, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.clearColor(0, 0, 0, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        /*
         * It has been raining a while when you arrive: a minute of drizzle
         * already on the glass, and the sim run on from PRE_RAIN seconds of
         * rain -- long enough for the drops to meet and merge into the lumpy
         * shapes a window has after a few minutes (Ony, 2026-10-02: "a lot
         * of almost perfect ovals"; forty seconds left nearly every drop
         * still a lone round bead). Coarse steps, so it costs what the forty
         * did.
         */
        const type = rainType(t("rainType"));
        const rain = type.before * t("rainStrength");
        const areaCm2 = (sim.width * sim.height) / 100;
        drizzle(
          sim,
          st,
          Math.round(rain * areaCm2 * 60 * Math.max(type.droplets, 12) * t("dropletScale")),
        );
        sim.wind = type.wind;
        if (sim.count === 0 && rain > 0) {
          for (let s = 0; s < PRE_RAIN * 30; s++) {
            const expected = (rain * areaCm2) / 30;
            let n = Math.floor(expected);
            if (random() < expected - n) n++;
            for (let q = 0; q < n; q++) land(sim, st, rainVolume(random(), random(), type.median));
            sim.fastForward(1 / 30);
          }
        }
      }
      return st;
    };

    const simFor = (pane: ReturnType<typeof glassGeometry>[number]) => {
      let sim = sims.get(pane.el);
      if (!sim) {
        // Up to 3000 drops a pane (1500 at 6 px a mm; the same glass is 2.25 times the area at 4): in steady rain a window holds about a fifth of its area in drops (estimate, from the reference photographs); 400 capped it at 9%.
        sim = new DropSim({
          width: pane.w / PX_PER_MM,
          height: pane.h / PX_PER_MM,
          seed: seed++,
          maxDrops: 3000,
        });
        sims.set(pane.el, sim);
      }
      return sim;
    };
    // For the verification rigs (dev only): the sims, to count drops and runners.
    if (import.meta.env.DEV)
      Object.assign(window as unknown as Record<string, unknown>, {
        __waterSims: sims,
        __glassGeometry: glassGeometry,
        // Start the rain over, as on arriving, with the knobs as they are now.
        __waterReset: () => {
          sims.clear();
          for (const st of states.values()) {
            gl.deleteTexture(st.droplets);
            gl.deleteFramebuffer(st.dropletFbo);
            gl.deleteTexture(st.wet);
            gl.deleteFramebuffer(st.wetFbo);
            gl.deleteTexture(st.fog);
            gl.deleteFramebuffer(st.fogFbo);
          }
          states.clear();
          task.wake();
        },
      });

    let verts = new Float32Array(4096);
    const grow = (n: number) => {
      if (verts.length < n) verts = new Float32Array(Math.max(n, verts.length * 2));
    };
    const lightPos = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightColour = new Float32Array(MAX_WATER_LIGHTS * 3);
    const lightRadius = new Float32Array(MAX_WATER_LIGHTS);
    const lightFloor = new Float32Array(MAX_WATER_LIGHTS);
    const lightTint = new Float32Array(MAX_WATER_LIGHTS * 3);
    const emitPos = new Float32Array(MAX_WATER_EMITTERS * 3);
    const emitColour = new Float32Array(MAX_WATER_EMITTERS * 3);
    let idleTimer = 0;
    const CORNERS = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ] as const;

    /** Write one drop's quad: centre (map px), radius (map px), stretch, and its attributes. VERT floats a vertex. */
    const pushDrop = (
      k: number,
      cx: number,
      cy: number,
      rPx: number,
      stretch: number,
      a: number,
      h0: number,
      sd: number,
      liquid: number,
      shape: readonly [number, number, number],
      skewX = 0,
      skewY = 0,
      out: ArrayLike<number> = NO_OUTLINE,
    ) => {
      /*
       * Too small to draw as a lens (under MIN_DRAWN_PX): drawn at that size,
       * faded by how much of it there really is -- a sparkle with a glint,
       * as a camera records a droplet smaller than a pixel.
       */
      let coverScale = 1;
      if (rPx < MIN_DRAWN_PX) {
        coverScale = (rPx / MIN_DRAWN_PX) ** 2;
        a *= MIN_DRAWN_PX / rPx;
        rPx = MIN_DRAWN_PX;
      }
      // The pear and the irregularity reach past the circle: x to 1 + taper, y a little; a merged drop's lobes further.
      let reach = 1;
      for (let n = 0; n < 8; n++) reach += Math.abs(out[n]!);
      const ex = (1.15 + shape[1]) * reach;
      const ey = 1.15 * reach;
      const sx = 1 / Math.sqrt(stretch);
      /*
       * What a merge left (DropSim skew): stretched along that axis by 1 + s,
       * narrowed across it by 1 / sqrt(1 + s), the cap lowered to keep its
       * volume. An affine map of the drop's own frame, so the shape the map
       * pass draws in that frame comes out stretched.
       */
      const sk = Math.hypot(skewX, skewY);
      const e = 1 + sk;
      const ux = sk > 1e-6 ? skewX / sk : 0;
      const uy = sk > 1e-6 ? skewY / sk : 1;
      const across = 1 / Math.sqrt(e);
      const m00 = across + (e - across) * ux * ux;
      const m01 = (e - across) * ux * uy;
      const m11 = across + (e - across) * uy * uy;
      h0 /= Math.sqrt(e);
      for (const [qx, qy] of CORNERS) {
        const lx = qx * ex * rPx * sx;
        const ly = qy * ey * rPx * stretch;
        verts[k++] = cx + m00 * lx + m01 * ly;
        verts[k++] = cy + m01 * lx + m11 * ly;
        verts[k++] = qx * ex;
        verts[k++] = qy * ey;
        verts[k++] = a;
        verts[k++] = h0;
        verts[k++] = sd;
        verts[k++] = liquid;
        verts[k++] = shape[0];
        verts[k++] = shape[1];
        verts[k++] = shape[2];
        verts[k++] = coverScale;
        verts[k++] = 0;
        for (let n = 0; n < 8; n++) verts[k++] = out[n]!;
      }
      return k;
    };

    const drawDrops = (
      count: number,
      w: number,
      h: number,
      heightScale: number,
      pxPerMm: number,
      slopeOut = 0,
    ) => {
      gl.useProgram(mapProgram);
      gl.uniform1f(map.slopeOut, slopeOut);
      gl.uniform2f(map.size, w, h);
      gl.uniform1f(map.scale, heightScale);
      gl.uniform1f(map.pxPerMm, pxPerMm);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * VERT), gl.DYNAMIC_DRAW);
      const S = VERT * 4;
      gl.enableVertexAttribArray(map.pos);
      gl.vertexAttribPointer(map.pos, 2, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(map.local);
      gl.vertexAttribPointer(map.local, 2, gl.FLOAT, false, S, 8);
      gl.enableVertexAttribArray(map.drop);
      gl.vertexAttribPointer(map.drop, 4, gl.FLOAT, false, S, 16);
      gl.enableVertexAttribArray(map.shape);
      gl.vertexAttribPointer(map.shape, 3, gl.FLOAT, false, S, 32);
      gl.enableVertexAttribArray(map.extra);
      gl.vertexAttribPointer(map.extra, 2, gl.FLOAT, false, S, 44);
      gl.enableVertexAttribArray(map.outA);
      gl.vertexAttribPointer(map.outA, 4, gl.FLOAT, false, S, 52);
      gl.enableVertexAttribArray(map.outB);
      gl.vertexAttribPointer(map.outB, 4, gl.FLOAT, false, S, 68);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.disableVertexAttribArray(map.local);
      gl.disableVertexAttribArray(map.drop);
      gl.disableVertexAttribArray(map.shape);
      gl.disableVertexAttribArray(map.extra);
      gl.disableVertexAttribArray(map.outA);
      gl.disableVertexAttribArray(map.outB);
    };

    /** Capsules from each drop's last place to its place now, into a map (7 floats a vertex... 5 used). */
    const drawWipes = (
      caps: number[],
      w: number,
      h: number,
      colour: readonly [number, number, number, number],
      soft = 0.15,
    ) => {
      if (caps.length === 0) return;
      // caps: x0, y0, x1, y1, r (map px), per capsule.
      const n = caps.length / 5;
      grow(n * 6 * 5);
      let k = 0;
      for (let c = 0; c < n; c++) {
        const x0 = caps[c * 5]!;
        const y0 = caps[c * 5 + 1]!;
        const x1 = caps[c * 5 + 2]!;
        const y1 = caps[c * 5 + 3]!;
        const r = Math.max(caps[c * 5 + 4]!, 0.5);
        const len = Math.hypot(x1 - x0, y1 - y0);
        const ux = len > 1e-3 ? (x1 - x0) / len : 0;
        const uy = len > 1e-3 ? (y1 - y0) / len : 1;
        const L = len / r;
        for (const [qx, qy] of CORNERS) {
          // Along: from -1 radius behind the start to +1 past the end.
          const along = qx < 0 ? -1 : L + 1;
          const across = qy * 1;
          verts[k++] = x0 + (ux * along - uy * across) * r;
          verts[k++] = y0 + (uy * along + ux * across) * r;
          verts[k++] = along;
          verts[k++] = across;
          verts[k++] = L;
        }
      }
      gl.useProgram(wipeProgram);
      gl.uniform2f(wipe.size, w, h);
      gl.uniform1f(wipe.soft, soft);
      gl.uniform4f(wipe.colour, ...colour);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(wipe.pos);
      gl.vertexAttribPointer(wipe.pos, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(wipe.local);
      gl.vertexAttribPointer(wipe.local, 2, gl.FLOAT, false, 20, 8);
      gl.enableVertexAttribArray(wipe.len);
      gl.vertexAttribPointer(wipe.len, 1, gl.FLOAT, false, 20, 16);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.disableVertexAttribArray(wipe.local);
      gl.disableVertexAttribArray(wipe.len);
    };

    /** Take a constant off every texel of the bound target (drying, evaporating). */
    const fadeBy = (colour: readonly [number, number, number, number]) => {
      gl.useProgram(fadeProgram);
      gl.uniform4f(fade.colour, ...colour);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(fade.pos);
      gl.vertexAttribPointer(fade.pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    };

    /** Add a constant to the whole bound map (blend ONE, ONE): the fog building up. */
    const addBy = (colour: readonly [number, number, number, number]) => {
      gl.useProgram(fadeProgram);
      gl.uniform4f(fade.colour, ...colour);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(fade.pos);
      gl.vertexAttribPointer(fade.pos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    };

    const drawPane = (
      pane: ReturnType<typeof glassGeometry>[number],
      sim: DropSim,
      st: PaneState,
      dt: number,
    ) => {
      const k = st.w / pane.w;
      let layer = layers.get(pane.el);
      if (!layer || !layer.isConnected) {
        layer = paneCanvas(pane.el, "pane:water");
        layers.set(pane.el, layer);
      }
      if (!beginPass(st.w, st.h, "water")) return;
      if (!ensureDrops(st.w, st.h) || !drops) return endPass();
      const pxMm = PX_PER_MM * k; // map px per mm

      // 1. New droplets, into the droplet map: heights add where they overlap.
      if (st.dropletFbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, st.dropletFbo);
        gl.viewport(0, 0, st.w, st.h);
        if (st.pending.length) {
          let done = 0;
          while (done < st.pending.length) {
            const batch = Math.min(4000, st.pending.length - done);
            grow(batch * 6 * VERT);
            let v = 0;
            for (let q = 0; q < batch; q++) {
              const d = st.pending[done + q]!;
              v = pushDrop(
                v,
                d.x * pxMm,
                d.y * pxMm,
                d.a * pxMm,
                1,
                d.a,
                capH(d.a),
                d.seed,
                d.liquid,
                shapeOf(d.a, 0),
              );
            }
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);
            drawDrops(batch * 6, st.w, st.h, 1 / DROPLET_HEIGHT_MAX, pxMm);
            gl.disable(gl.BLEND);
            done += batch;
          }
          st.pending.length = 0;
        }
        // 2. Every drop swallows the droplets under it; a running one sweeps its path.
        const caps: number[] = [];
        const wets: number[] = [];
        const seen = new Set<number>();
        for (let i = 0; i < sim.count; i++) {
          const id = sim.serial[i]!;
          seen.add(id);
          const x = sim.x[i]! * pxMm;
          const y = sim.y[i]! * pxMm;
          const r = sim.radius(i) * pxMm;
          const p = st.prev.get(id);
          const [x0, y0, run0] = p ?? [x, y, 0];
          caps.push(x0, y0, x, y, r * 1.05);
          const step = Math.hypot(x - x0, y - y0);
          const run = run0 + step / pxMm;
          if (p && step > 0.3) {
            /*
             * The film is narrower than the drop that laid it (its receding
             * edge, water-drops 2.5: a rivulet is narrower than its drop) and
             * thin at its edges. It starts as a thread where the drop let go
             * and widens over the first few radii of its run (Ony,
             * 2026-10-03: the streams had "a loop at the top" -- the track's
             * round end, full width, read as the stream turning back).
             */
            const a = sim.radius(i);
            const grown = Math.min(1, run / (TRAIL_TAPER * a));
            const taper = grown * grown * (3 - 2 * grown);
            wets.push(x0 / 2, y0 / 2, x / 2, y / 2, (r * 0.45 * Math.max(taper, 0.05)) / 2);
          }
          st.prev.set(id, [x, y, run]);
        }
        for (const id of st.prev.keys()) if (!seen.has(id)) st.prev.delete(id);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        drawWipes(caps, st.w, st.h, [1, 1, 1, 1]);
        gl.disable(gl.BLEND);
        // Evaporation: a whole 8-bit step of height at a time.
        st.dryClock += dt;
        const step = DROPLET_HEIGHT_MAX / 255;
        if (st.dryClock * DROPLET_DRY >= step) {
          const n = Math.floor((st.dryClock * DROPLET_DRY) / step);
          st.dryClock -= (n * step) / DROPLET_DRY;
          fadeBy([n / 255, 0, 0, 0]);
        }
        // 3. The film a runner leaves: wet, so clear; drying at FILM_DRY.
        if (st.wetFbo) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.wetFbo);
          gl.viewport(0, 0, Math.round(st.w / 2), Math.round(st.h / 2));
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);
          drawWipes(wets, Math.round(st.w / 2), Math.round(st.h / 2), [0.35, 0, 0, 0.35], 0.7);
          gl.disable(gl.BLEND);
          st.wetClock += dt;
          if (st.wetClock * FILM_DRY >= 3 / 255) {
            fadeBy([Math.floor(st.wetClock * FILM_DRY * 255) / 255, 0, 0, 0]);
            st.wetClock = 0;
          }
        }
        /*
         * 4. Condensation: steam fogging the glass, building up over about
         * FOG_BUILD seconds (a whole 8-bit step at a time). On the rain's own
         * face every drop's footprint and every runner's path wipes it, and
         * it builds back over the tracks; on the other face nothing touches it.
         */
        if (st.fogFbo) {
          const fw = Math.round(st.w / 2);
          const fh = Math.round(st.h / 2);
          gl.bindFramebuffer(gl.FRAMEBUFFER, st.fogFbo);
          gl.viewport(0, 0, fw, fh);
          if (t("fogAmount") > 0) {
            st.fogClock = Math.max(st.fogClock, 0) + dt;
            const n = Math.floor((st.fogClock / FOG_BUILD) * 255);
            if (n > 0) {
              addBy([n / 255, 0, 0, 0]);
              st.fogClock -= (n / 255) * FOG_BUILD;
            }
            if (Math.round(t("fogSide")) === 0) {
              const half = caps.map((v) => v / 2);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
              drawWipes(half, fw, fh, [1, 1, 1, 1], 0.35);
              gl.disable(gl.BLEND);
            }
          } else if (st.fogClock !== -1) {
            // Off: the glass is clear of it, and builds from nothing when it is turned on.
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            st.fogClock = -1;
          }
        }
      }

      // 4. The drops map, cleared and drawn whole.
      gl.bindFramebuffer(gl.FRAMEBUFFER, drops.fbo);
      gl.viewport(0, 0, st.w, st.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (sim.count) {
        grow(sim.count * 6 * VERT);
        let v = 0;
        let quads = 0;
        for (let i = 0; i < sim.count; i++) {
          const speed = Math.hypot(sim.vx[i]!, sim.vy[i]!);
          // Stretched along its run as it speeds up (raindrop-fx raindrop.ts L82-L85).
          const stretch = 1 + 0.35 * (2 / Math.PI) * Math.atan(0.05 * speed);
          const theta = restAngle(sim.liquidOf(i));
          const parts = sim.parts(i);
          let a = sim.radius(i);
          let h0 = sim.capHeight(i);
          let out: ArrayLike<number> = NO_OUTLINE;
          if (parts.length > 1) {
            /*
             * A merged drop (DropSim parts: each lobe's footprint pinned where
             * it was): one sprite over the union of its lobes' contact circles,
             * that outline as harmonics round the drop's centre, and the cap
             * height that holds its volume over that footprint.
             */
            const o = outlineOf(sim.x[i]!, sim.y[i]!, parts, theta);
            a = o.r0;
            h0 = capHeightFor(sim.vol[i]!, o.area);
            out = o.coeffs;
          }
          v = pushDrop(
            v,
            sim.x[i]! * pxMm,
            sim.y[i]! * pxMm,
            a * pxMm,
            stretch,
            a,
            h0,
            (sim.serial[i]! * 0.618034) % 997,
            sim.liquid[i]!,
            shapeOf(a, speed),
            0,
            0,
            out,
          );
          quads++;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        drawDrops(
          quads * 6,
          st.w,
          st.h,
          dropsType === gl.UNSIGNED_BYTE ? 1 / HEIGHT_MAX : 1,
          pxMm,
          1,
        );
        gl.disable(gl.BLEND);
      }
      gl.disableVertexAttribArray(map.pos);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // 5. The water layer.
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(composeProgram);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, drops.tex);
      gl.uniform1i(u.uDrops!, 2);
      gl.uniform2f(u.uDropsUv!, st.w / dropsW, st.h / dropsH);
      gl.uniform2f(u.uDropsTexel!, 1 / dropsW, 1 / dropsH);
      gl.uniform1f(u.uDropsFull!, dropsFull);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, st.droplets);
      gl.uniform1i(u.uDroplets!, 4);
      gl.uniform2f(u.uDropletsTexel!, 1 / st.w, 1 / st.h);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, st.wet);
      gl.uniform1i(u.uWet!, 5);
      const tex = pane.srcFull || pane.src ? photo(pane.srcFull || pane.src, pane.src) : null;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uPhoto!, 1);
      gl.uniform1f(u.uHasPhoto!, tex ? 1 : 0);
      const size = tex ? photoTex.size(tex) : undefined;
      gl.uniform2f(u.uPhotoTexels!, size?.[0] ?? 1024, size?.[1] ?? 1024);
      gl.uniform4f(u.uImage!, pane.ix, pane.iy, pane.iw, pane.ih);
      gl.uniform3f(u.uImageFit!, pane.ia, pane.ifocus.x, pane.ifocus.y);
      gl.uniform4f(u.uPane!, pane.x, pane.y, pane.w, pane.h);
      gl.uniform1f(u.uScale!, k);
      gl.uniform1f(u.uPxPerMm!, PX_PER_MM);
      gl.uniform1f(u.uThickness!, pane.causes.thickness);
      /*
       * How far behind the drops the photograph is: the pane's gap, the
       * distance the glass's refraction, the floor light and the shadows
       * all use (rain W1; it was a fixed 900 px "world outside" that nothing
       * else agreed with). Rain on the near face of clear glass looks through
       * the slab first, which brings the photograph nearer by its apparent
       * depth, thickness / n.
       */
      const frosted = pane.causes.material.frost > 0;
      const nearFace = !frosted && Math.round(t("rainFace")) === 1;
      gl.uniform1f(
        u.uScene!,
        pane.causes.gap * t("dropSceneDepth") + (nearFace ? pane.causes.thickness / GLASS_IOR : 0),
      );
      gl.uniform1f(u.uNear!, nearFace ? 1 : 0);
      gl.uniform1f(u.uFrosted!, frosted ? 1 : 0);
      gl.uniform1f(u.uRivulet!, RIVULET_MM);
      gl.uniform2f(u.uWetTexel!, 2 / st.w, 2 / st.h);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, st.fog);
      gl.uniform1i(u.uFog!, 6);
      gl.uniform1f(u.uFogAmount!, st.fog ? t("fogAmount") : 0);
      gl.uniform1f(u.uFogSide!, Math.round(t("fogSide")));
      // Four samples a pixel where there is water, on machines that run the full tier.
      gl.uniform1f(u.uSamples!, quality() === "full" ? 4 : 1);
      // On clear glass the water is a lens whichever face it is on; on frosted glass, only on the etched face.
      gl.uniform1f(u.uClear!, !frosted || Math.round(t("rainFace")) === 0 ? 1 : 0);
      gl.uniform1f(u.uIor!, WATER.n);
      gl.uniform1f(u.uGlassIor!, GLASS_IOR);
      const look = lookOf(pane.el);
      gl.uniform1f(u.uSaturate!, look.saturate);
      gl.uniform4f(u.uFill!, ...look.fill);
      gl.uniform3f(u.uRoom!, 0.05, 0.045, 0.04);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, roomTex.texture);
      gl.uniform1i(u.uRoomTex!, 3);
      gl.uniform1f(u.uHasRoom!, roomTex.texture ? 1 : 0);
      gl.uniform1f(u.uRoomExposure!, roomLight.gain);
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vhNow = document.documentElement.clientHeight || window.innerHeight;
      gl.uniform2f(u.uViewCentre!, vw / 2, vhNow / 2);
      gl.uniform1f(u.uCameraDistance!, camera.distance(vw));
      gl.uniform3f(u.uSigmaBlood!, ...BLOOD.sigma);
      gl.uniform3f(u.uSigmaSlime!, ...SLIME.sigma);
      let n = 0;
      for (const l of pointLights()) {
        if (n >= MAX_WATER_LIGHTS || l.below || l.charge <= 0.002) continue;
        lightPos[n * 3] = l.x;
        lightPos[n * 3 + 1] = l.y;
        lightPos[n * 3 + 2] = Math.max(l.height, 20);
        const strength = l.charge * Math.min(l.gain / 8, 2);
        lightColour[n * 3] = l.colour[0] * strength;
        lightColour[n * 3 + 1] = l.colour[1] * strength;
        lightColour[n * 3 + 2] = l.colour[2] * strength;
        lightRadius[n] = l.radius;
        /*
         * The lamp on the print, as the floor light sends it (FloorLight):
         * its charge eased, its power and height against the defaults
         * (cursor lamp and physical lights only), and "Light through glass".
         */
        const lit = l.charge * l.charge * (3 - 2 * l.charge);
        const scale = l.id === "cursor" || l.physicalFloor ? floorScale(l.gain, l.height) : 1;
        lightFloor[n] = lit * scale * t("floorLight");
        lightTint[n * 3] = l.colour[0];
        lightTint[n * 3 + 1] = l.colour[1];
        lightTint[n * 3 + 2] = l.colour[2];
        n++;
      }
      gl.uniform1i(u.uLightCount!, n);
      gl.uniform1fv(u.uLightFloor!, lightFloor);
      gl.uniform3fv(u.uLightTint!, lightTint);
      gl.uniform1f(u.uRoomFill!, Math.min(t("roomFill"), roomFillOverride()));
      gl.uniform1f(u.uBurning!, strongestCharge());
      // The lit floor this frame, where the lenses land (rain W2; effects/light/floor-map).
      const floorNow = floorMap();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, floorNow ? floorNow.texture : null);
      gl.uniform1i(u.uFloorMap!, 0);
      gl.uniform1f(u.uHasFloorMap!, floorNow ? 1 : 0);
      gl.uniform2f(u.uFloorSize!, floorNow?.width ?? 1, floorNow?.height ?? 1);
      // The copy printed on the glass, for the drops over it (effects/engine/type-layer).
      const ty = typeFor(pane, k);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, ty.has ? ty.tex : null);
      gl.uniform1i(u.uType!, 7);
      gl.uniform1f(u.uHasType!, ty.has ? 1 : 0);
      // The frost's blur as a mip level of the photograph, for a near-face drop's view of the far face.
      const texPerPx = (size?.[0] ?? 1024) / Math.max(pane.iw, 1);
      gl.uniform1f(
        u.uFrostLod!,
        frosted ? Math.max(0, Math.log2(Math.max(1, 2 * look.blur * texPerPx))) : 0,
      );
      /*
       * The photograph's own lights (PhotoLights: its brightest spots, as
       * lights under the glass), carried through each drop's lens (rain W1).
       * A print clips a lamp or a neon to white; it was brighter than that,
       * by EMIT_RADIANCE at full strength (estimate: a lit sign or a street
       * lamp in a night photograph is one to two orders of magnitude over
       * the white it was clipped to), so in a drop it is still a sparkle.
       */
      let ne = 0;
      for (const l of pointLights()) {
        if (ne >= MAX_WATER_EMITTERS || !l.below || l.charge <= 0.002) continue;
        if (l.x < pane.x - 400 || l.x > pane.x + pane.w + 400) continue;
        if (l.y < pane.y - 400 || l.y > pane.y + pane.h + 400) continue;
        emitPos[ne * 3] = l.x;
        emitPos[ne * 3 + 1] = l.y;
        emitPos[ne * 3 + 2] = Math.max(l.radius, 1);
        const e = EMIT_RADIANCE * l.charge;
        emitColour[ne * 3] = l.colour[0] * e;
        emitColour[ne * 3 + 1] = l.colour[1] * e;
        emitColour[ne * 3 + 2] = l.colour[2] * e;
        ne++;
      }
      gl.uniform1i(u.uEmitCount!, ne);
      gl.uniform3fv(u.uEmitPos!, emitPos);
      gl.uniform3fv(u.uEmitColour!, emitColour);
      gl.uniform3fv(u.uLightPos!, lightPos);
      gl.uniform3fv(u.uLightColour!, lightColour);
      gl.uniform1fv(u.uLightRadius!, lightRadius);
      gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
      gl.enableVertexAttribArray(composePos);
      gl.vertexAttribPointer(composePos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(composePos);
      blitAll(canvas, layer);
      if (import.meta.env.DEV) {
        const w = window as unknown as { __waterFrames?: number };
        w.__waterFrames = (w.__waterFrames ?? 0) + 1;
      }
      endPass();
    };

    let lastLights = "";
    let lastClear = "";
    const task = addTask("water", ORDER.passes, (_now, dtMs) => {
      const dt = Math.min(dtMs / 1000, 0.25);
      const vh = document.documentElement.clientHeight || window.innerHeight;
      // Rain: drops per second per square centimetre of glass, the rain type's times "Rain".
      const type = rainType(t("rainType"));
      const rain = type.rate * t("rainStrength");
      const fogging = t("fogAmount") > 0;
      let busy = rain > 0 || fogging;
      const lightsNow = pointLights()
        .filter((l) => !l.below && l.charge > 0.002)
        .map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.charge.toFixed(2)}`)
        .join(";");
      const lightsMoved = lightsNow !== lastLights;
      lastLights = lightsNow;
      const clearNow = `${t("rainFace")},${t("fogAmount")},${t("fogSide")}`;
      const faceChanged = clearNow !== lastClear;
      lastClear = clearNow;
      for (const pane of glassGeometry()) {
        if (pane.y + pane.h < 0 || pane.y > vh || pane.w < 40 || pane.h < 40) continue;
        // A drop shows the photograph behind its pane; a pane with none (the header bar) gets no rain yet.
        if (!pane.src) continue;
        const sim = simFor(pane);
        const st = stateFor(pane, sim);
        const areaCm2 = (sim.width * sim.height) / 100;
        const expected = rain * areaCm2 * dt;
        let spawn = Math.floor(expected);
        if (random() < expected - spawn) spawn++;
        for (let q = 0; q < spawn; q++) {
          land(sim, st, rainVolume(random(), random(), type.median));
        }
        sim.wind = type.wind;
        // Drizzle between the drops.
        const dz = expected * type.droplets * t("dropletScale");
        let nz = Math.floor(dz);
        if (random() < dz - nz) nz++;
        if (nz) drizzle(sim, st, nz);
        const moved = sim.step(dt) || spawn > 0 || st.pending.length > 0 || fogging;
        if (moved) busy = true;
        if (moved || lightsMoved || faceChanged || st.fresh || !layers.has(pane.el)) {
          st.fresh = false;
          drawPane(pane, sim, st, dt);
        }
      }
      /*
       * The light through the drops onto the print (rain W2): for the
       * cursor lamp while it burns, redrawn whenever the drops or the lamp
       * moved. The floor light reads the map it publishes.
       */
      const lamp = pointLights().find((l) => l.id === "cursor" && !l.below && l.charge > 0.002);
      if (lamp && sims.size > 0) {
        const vwNow = document.documentElement.clientWidth || window.innerWidth;
        drawLensMap(vwNow, vh, lamp);
      } else if (lensFrame > 0) {
        publishLensMap(null);
        lensFrame = 0;
      }
      if (!busy) {
        // Nothing runs: evaporation still goes on, slowly (water-drops 6.1: 4 Hz is plenty).
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => task.wake(), 250);
      }
      return busy;
    });
    /*
     * The spray bottle (task 76): a squeeze aimed at a page point lands on
     * whatever panes its cone covers (effects/water/spray): into the drops
     * it hits, as droplets where it does not, and the sim's mist beads into
     * drops where enough gathers; slime lands as gobs.
     */
    const stopSpray = onSpray((x, y, liquid) => {
      const parcels = squeeze(liquid, random);
      for (const pane of glassGeometry()) {
        if (!pane.src) continue;
        const sim = simFor(pane);
        const st = stateFor(pane, sim);
        const l = LIQUIDS[liquid] ?? WATER;
        for (const p of parcels) {
          const px = x + p.dx * PX_PER_MM - pane.x;
          const py = y + p.dy * PX_PER_MM - pane.y;
          if (px < 0 || py < 0 || px >= pane.w || py >= pane.h) continue;
          const mx = px / PX_PER_MM;
          const my = py / PX_PER_MM;
          if (p.gob) {
            sim.addVolume(mx, my, p.volume, liquid);
          } else if (!sim.deposit(mx, my, p.volume, liquid)) {
            // A droplet of the volume it carries, at the liquid's resting angle.
            const a = radiusFor(p.volume, (l.thetaA + l.thetaR) / 2);
            st.pending.push({ x: mx, y: my, a: Math.min(a, 0.6), liquid, seed: random() * 1000 });
          }
        }
      }
      task.wake();
    });
    const wake = () => task.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    task.wake();

    const stopLoss = onSharedGlLoss(
      () => task.stop(),
      () => {},
    );
    return () => {
      stopSpray();
      task.stop();
      stopLoss();
      publishLensMap(null);
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      for (const layer of layers.values()) layer.remove();
      photoTex.dispose();
      roomTex.dispose();
      for (const st of states.values()) {
        gl.deleteTexture(st.droplets);
        gl.deleteFramebuffer(st.dropletFbo);
        gl.deleteTexture(st.wet);
        gl.deleteFramebuffer(st.wetFbo);
        gl.deleteTexture(st.fog);
        gl.deleteFramebuffer(st.fogFbo);
      }
      if (drops) {
        gl.deleteTexture(drops.tex);
        gl.deleteFramebuffer(drops.fbo);
      }
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(triangle);
    };
  }, []);
  return null;
}
