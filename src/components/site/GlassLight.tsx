import { useEffect, useState } from "react";
import { LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";
import { sleepingLoop } from "@/lib/gl-loop";
import {
  beginPass,
  buildProgram,
  fullScreenTriangle,
  onSharedGlLoss,
  sharedGl,
} from "@/effects/engine/gl";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { glassGeometry, geometryStamp, MAX_OCCLUDERS, viewState } from "@/effects/scene/scene";
import { cursorLamp, lampPower, onCharge, roomLight } from "@/effects/light/lights";
import { paneCanvas } from "@/effects/engine/compositor";
import { onTuningApplied, t } from "@/lib/tuning";
import { frontRoughness } from "@/effects/materials/presets";
import { CAMERA_DISTANCE, roomMipChain } from "@/effects/optics/environment";
import { loadSurfaceLayer } from "@/effects/optics/surface-layers";
import { LAMP_REFLECTION_ENABLED } from "@/effects/optics/reflection";
import { assetUrl, SITE_ASSETS } from "@/lib/site-assets";

/**
 * The glass itself: what it does to the photograph behind it, and what it does
 * with the cursor light falling on it.
 *
 * One draw per pane, scissored to that pane's box, rather than one pass over
 * the whole viewport. Three reasons, in order of importance:
 *
 *   1. Refraction needs the backdrop as a texture, and each pane sits on a
 *      different photograph. A shader cannot pick a sampler by loop index, so
 *      the panes have to be separate draws whatever else is true.
 *   2. The vast majority of the viewport has no glass on it. Shading those
 *      fragments to have them contribute nothing is most of the cost of a
 *      full-screen pass.
 *   3. The shader stops needing a fixed-size loop and a pile of uniform
 *      arrays, and becomes a shader about one pane.
 *
 * Composited with `plus-lighter`, so what it draws ADDS to the page — which is
 * the only way an edge that is both catching the light and carrying its
 * reflection can sum past white.
 */

/*
 * Bloom is low-frequency and the sharp features are a few pixels wide, so
 * there is nothing here that repays a full buffer on a dense display.
 */
const MAX_SCALE = 1.5;

/*
 * The LAYOUT viewport, not `window.innerWidth`.
 *
 * These canvases are CSS-sized `position: fixed; inset: 0`, which resolves
 * against the initial containing block and EXCLUDES the classic scrollbar.
 * `window.innerWidth` includes it. Sizing the drawing buffer from the wrong
 * one stretches a buffer ~17px too wide into a box that narrow, squeezing
 * everything the shader draws by about 1.3%: no error at the left edge,
 * seventeen pixels of it by the right. That is why every pane had a bright
 * line inboard of its right edge while the top and bottom sat correctly --
 * there is no horizontal scrollbar to introduce the same error vertically.
 */
const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;
const viewportHeight = () => document.documentElement.clientHeight || window.innerHeight;

/** How far outside a pane the bloom still has something to contribute. */
const BLEED = 90;

export function GlassLight({
  chargeRef,
  positionRef,
}: {
  chargeRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  /* Bumped when a lost GL context returns; see CursorLight for why this is
     the whole recovery path. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives all of this needs a fine pointer, so on a touch
    // device the charge can never leave zero. Nothing to do but not start.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    /*
     * The shared context (effects/engine/gl). Its buffer is offscreen, as
     * this pass's own canvas already was: each pane's region is copied out
     * of it into that pane's surface layer.
     */
    const shared = sharedGl();
    if (!shared) return;
    const { gl } = shared;
    const canvas = shared.canvas;
    const program = buildProgram(gl, LIGHT_VERTEX_SHADER, GLASS_LIGHT_FRAGMENT_SHADER, "glass");
    if (!program) return;
    gl.useProgram(program);
    const quad = fullScreenTriangle(gl, program);

    const U = (name: string) => gl.getUniformLocation(program, name);
    const uViewport = U("uViewport");
    const uScale = U("uScale");
    const uLight = U("uLight");
    const uCharge = U("uCharge");
    const uRect = U("uRect");
    const uRadius = U("uRadius");
    const uEdgeWidth = U("uEdgeWidth");
    const uStraight = U("uStraight");
    const uTilt = U("uTilt");
    const uBar = U("uBar");
    const uThickness = U("uThickness");
    const uSeed = U("uSeed");
    const uImage = U("uImage");
    const uImageAspect = U("uImageAspect");
    const uHasBackdrop = U("uHasBackdrop");
    const uHasSurface = U("uHasSurface");
    const uGrimeRake = U("uGrimeRake");
    const uGrimeSpecks = U("uGrimeSpecks");
    const uGrimeFloor = U("uGrimeFloor");
    const uGap = U("uGap");
    const uHasBelow = U("uHasBelow");
    const uImageBelow = U("uImageBelow");
    const uImageBelowAspect = U("uImageBelowAspect");
    const uRestEdge = U("uRestEdge");
    const uOccRect = U("uOccRect");
    const uOccSoft = U("uOccSoft");
    const uOccCount = U("uOccCount");

    /*
     * Scratch buffers for the occluders, allocated once.
     *
     * These are uploaded per pane per frame. Building two arrays each time
     * would allocate a hundred-odd small Float32Arrays a second and hand the
     * collector work to do in the middle of an animation, which is exactly
     * where a pause is most visible.
     */
    const occRect = new Float32Array(MAX_OCCLUDERS * 4);
    const occSoft = new Float32Array(MAX_OCCLUDERS * 4);
    const uIor = U("uIor");
    const uFrost = U("uFrost");
    const uLightHeight = U("uLightHeight");
    const uLampPower = U("uLampPower");
    const uFaceLamp = U("uFaceLamp");
    const uLightSize = U("uLightSize");
    const uLampColour = U("uLampColour");

    // The site's amber and teal in linear light — the shader works in linear
    // and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(U("uWarm"), toLinear(1.0), toLinear(0.68), toLinear(0.3));
    gl.uniform3f(U("uCool"), toLinear(0.35), toLinear(0.78), toLinear(0.82));
    gl.uniform1i(U("uSmudge"), 0);
    gl.uniform1i(U("uScratch"), 2);
    const uSmudgeTile = U("uSmudgeTile");
    gl.uniform1i(U("uRoom"), 3);
    const uHasRoom = U("uHasRoom");
    const uRoomWidth = U("uRoomWidth");
    const uCameraDistance = U("uCameraDistance");
    const uFrontRoughness = U("uFrontRoughness");
    const uRoomExposure = U("uRoomExposure");
    const uEye = U("uEye");
    gl.uniform1f(uHasRoom, 0);
    const uScratchTile = U("uScratchTile");
    gl.uniform1f(uSmudgeTile, 1024);
    gl.uniform1f(uScratchTile, 2048);
    gl.uniform1i(U("uBackdrop"), 1);
    gl.uniform1i(U("uBackdropBelow"), 4);
    gl.uniform1f(uHasSurface, 0);

    let scale = 1;

    /*
     * The photographed surface map, fetched lazily: the shader falls back to
     * no surface detail until it arrives, and it never loads at all for
     * somebody who never winds the shutter.
     */
    let surfaceRequested = false;
    let layersLoaded = 0;
    /** Smudge on texture unit 0, scratch on unit 2. */
    const layers = new Map<number, WebGLTexture>();
    /*
     * One surface layer: a seamless greyscale photograph, repeated (the shader
     * hex-tiles it, so the repeat is never visible). WebGL1 can only repeat a
     * power-of-two texture, so an uploaded image of any other size is drawn
     * onto the nearest power-of-two canvas first -- an admin upload must never
     * be able to turn the layer black.
     */
    const loadLayer = (unit: number, src: string, tile: WebGLUniformLocation | null) =>
      loadSurfaceLayer(gl, unit, src, (tex, side) => {
        layers.set(unit, tex);
        gl.useProgram(program);
        gl.uniform1f(tile, side);
        layersLoaded += 1;
        if (layersLoaded === 2) gl.uniform1f(uHasSurface, 1);
      });
    /*
     * The photographed surface layers, fetched lazily: the shader falls back
     * to no surface detail until both arrive, and they never load at all for
     * somebody who never winds the shutter.
     */
    /*
     * The room the face reflects, in real brightness (see
     * effects/optics/environment.ts). Its mip levels are filtered here in
     * LINEAR light and uploaded one by one: the browser's own would average
     * the log-encoded values, and a lamp blurred over a rough face would come
     * out far dimmer than its light really is.
     */
    let room: WebGLTexture | null = null;
    let roomRequested = false;
    const requestRoom = () => {
      if (roomRequested) return;
      roomRequested = true;
      const src = document.documentElement.getAttribute("data-room-hdr");
      if (!src) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const w = 2048;
        const h = 512;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
          rgb[j] = rgba[i]!;
          rgb[j + 1] = rgba[i + 1]!;
          rgb[j + 2] = rgba[i + 2]!;
        }
        const tex = gl.createTexture();
        if (!tex) return;
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        roomMipChain(rgb, w, h).forEach((level, i) => {
          gl.texImage2D(
            gl.TEXTURE_2D,
            i,
            gl.RGB,
            level.width,
            level.height,
            0,
            gl.RGB,
            gl.UNSIGNED_BYTE,
            level.data,
          );
        });
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        // Round the full 360 degrees across; clamped top and bottom.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        room = tex;
        gl.useProgram(program);
        gl.uniform1f(uRoomWidth, w);
        gl.uniform1f(uHasRoom, 1);
        restingDrawn = false;
        wake();
      };
      img.src = src;
    };

    const requestSurface = () => {
      if (surfaceRequested) return;
      surfaceRequested = true;
      loadLayer(0, assetUrl(SITE_ASSETS.glassSmudge), uSmudgeTile);
      loadLayer(2, assetUrl(SITE_ASSETS.glassScratch), uScratchTile);
    };

    /*
     * Backdrop textures, one per photograph, cached by URL.
     *
     * `crossOrigin` matters: a texture built from an image the page cannot
     * read taints the context and every later read throws. If the storage host
     * declines CORS the entry stays null and that pane simply does not
     * refract, rather than taking the whole canvas down with it.
     */
    const backdrops = new Map<string, WebGLTexture | null>();
    const requestBackdrop = (src: string) => {
      if (backdrops.has(src)) return backdrops.get(src) ?? null;
      backdrops.set(src, null);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        // Non-power-of-two photographs: clamped and unmipped, as WebGL1 requires.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        backdrops.set(src, tex);
      };
      img.src = src;
      return null;
    };

    /*
     * ---- The pane's own surface layer ----
     *
     * The grime is a mark ON the glass. The photographs and the copy REST on
     * that glass. So the marks have to be behind them, and the shared canvas
     * cannot do it: it is fixed to the viewport at z-index 9997, above every
     * piece of content on the page, and a mask to a pane's footprint does not
     * help because a footprint contains whatever is standing in it. Reported
     * five times; deferred five times; this is the fix.
     *
     * Each pane gets its own canvas at z-index -1 -- above the bevel and the
     * reflection at -2 and below, under everything in normal flow. The shared
     * WebGL canvas becomes an offscreen buffer that nothing displays, and each
     * pane's scissored region is blitted out of it into that pane's layer.
     *
     * The layer is BLEED larger than the pane on every side, because the rim
     * bloom genuinely escapes the glass and would otherwise be cut off square
     * at the edge. `.glass` is position:relative with no overflow rule, so it
     * spills correctly.
     */
    const surfaces = new WeakMap<HTMLElement, HTMLCanvasElement>();

    const surfaceFor = (el: HTMLElement, cssW: number, cssH: number) => {
      let layer = surfaces.get(el);
      if (!layer || !layer.isConnected) {
        // Its slot in the pane's stack is the compositor's (effects/engine/compositor).
        layer = paneCanvas(el, "pane:surface");
        surfaces.set(el, layer);
      }
      const w = Math.max(1, Math.round(cssW * scale));
      const h = Math.max(1, Math.round(cssH * scale));
      if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
      }
      return layer;
    };

    /** Every pane layer this pass touched, so the rest can be cleared. */
    const drawn = new Set<HTMLCanvasElement>();
    const allLayers = new Set<HTMLCanvasElement>();

    let wasLit = false;

    /* Returns whether there is still something to draw; false parks the loop. */
    /*
     * Glass does not stop being glass in the dark.
     *
     * This used to bail out entirely whenever the charge was zero -- clear the
     * buffer, hide the canvas, park the loop. Which threw away the two things
     * the shader deliberately keeps OUTSIDE the charge gate: the refracted
     * backdrop and the side band you can genuinely see through. The shader's
     * own comment says a pane bends what is behind it whether or not anybody
     * is shining anything at it, and then this hid all of it anyway. That is
     * why the panes went flat the moment the shutter was idle.
     *
     * Now the resting state is DRAWN, once, and then the loop parks. The
     * refraction and the side band only change when a pane moves or its
     * backdrop loads -- never with the cursor -- so one frame is enough until
     * something invalidates the geometry, and scroll and resize already do
     * that. Idle costs one frame, not sixty a second.
     */
    let restingDrawn = false;
    let restingStamp = -1;
    let restingEyeX = Number.NaN;
    let restingEyeY = Number.NaN;

    const step = (now: number) => {
      const charge = chargeRef.current;
      const lit = charge > 0.002;

      if (!lit) {
        // Already settled and nothing has moved: park without redrawing.
        /*
         * Already settled and nothing has moved -- including the viewpoint,
         * which moves the photographs under the glass and the room in it.
         */
        const eyeStill = viewState.eyeX === restingEyeX && viewState.eyeY === restingEyeY;
        if (!wasLit && restingDrawn && eyeStill && geometryStamp() === restingStamp) return false;
        restingEyeX = viewState.eyeX;
        restingEyeY = viewState.eyeY;
        wasLit = false;
        restingDrawn = true;
        restingStamp = geometryStamp();
      } else {
        restingDrawn = false;
        if (!wasLit) {
          requestSurface();
          wasLit = true;
        }
      }

      const panes = glassGeometry(now);
      const { x, y } = positionRef.current;

      scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      const bw = Math.round(viewportWidth() * scale);
      const bh = Math.round(viewportHeight() * scale);
      if (!beginPass(bw, bh)) return false;
      quad.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(uViewport, bw, bh);
      gl.uniform1f(uScale, scale);
      gl.enable(gl.SCISSOR_TEST);
      gl.uniform2f(uLight, x, y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uGrimeFloor, t("grimeFloor"));
      gl.uniform1f(uRestEdge, t("restEdge"));
      /*
       * The lamp's power reaches the arris glints whatever the switch says;
       * the switch turns off only the face's own image of the lamp, which is
       * off by request (it reads as a flashlight; see LAMP_REFLECTION_ENABLED).
       */
      gl.uniform1f(uLampPower, lampPower(cursorLamp));
      gl.uniform3fv(uLampColour, cursorLamp.colour);
      gl.uniform1f(uFaceLamp, LAMP_REFLECTION_ENABLED ? 1 : 0);
      gl.uniform1f(uLightSize, cursorLamp.radius);
      requestRoom();
      gl.uniform1f(
        uCameraDistance,
        CAMERA_DISTANCE * (document.documentElement.clientWidth || window.innerWidth),
      );
      gl.uniform1f(uRoomExposure, roomLight.gain);
      gl.uniform2f(uEye, viewState.eyeX, viewState.eyeY);
      if (room) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, room);
      }
      for (const [unit, tex] of layers) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      }

      for (const pane of panes) {
        // Offscreen panes cost nothing but a rectangle test.
        if (pane.y + pane.h < -BLEED || pane.y > viewportHeight() + BLEED) continue;

        const texture = pane.src ? requestBackdrop(pane.src) : null;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uHasBackdrop, texture ? 1 : 0);
        // The photograph the bottom side face looks down at.
        const below = pane.below ? requestBackdrop(pane.below.src) : null;
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, below);
        gl.uniform1f(uHasBelow, below ? 1 : 0);
        if (pane.below) {
          gl.uniform4f(uImageBelow, pane.below.x, pane.below.y, pane.below.w, pane.below.h);
          gl.uniform1f(uImageBelowAspect, pane.below.a);
        }

        gl.uniform4f(uRect, pane.x, pane.y, pane.w, pane.h);
        gl.uniform1f(uRadius, pane.r);
        gl.uniform1f(uEdgeWidth, pane.e);
        gl.uniform1f(uStraight, pane.w >= viewportWidth() - 1 ? 1 : 0);
        gl.uniform1f(uTilt, pane.t);
        gl.uniform1f(uBar, pane.el.classList.contains("glass--bar") ? 1 : 0);
        /*
         * What this pane is, as <Pane> declared it (effects/materials/
         * pane-causes): its material, thickness, gap and surface layers. The
         * lamp stands a fixed height above the photographs, so its height
         * above THIS glass is that less this pane's gap.
         */
        const { material, thickness, gap, smudge, scratch } = pane.causes;
        gl.uniform1f(uIor, material.ior);
        gl.uniform1f(uFrost, material.frost);
        gl.uniform1f(uFrontRoughness, frontRoughness(material, material.frost));
        gl.uniform1f(uThickness, thickness);
        gl.uniform1f(uGap, gap);
        gl.uniform1f(uLightHeight, Math.max(cursorLamp.height - gap, 1));
        gl.uniform1f(uGrimeRake, t("grimeRake") * smudge);
        gl.uniform1f(uGrimeSpecks, t("grimeSpecks") * scratch);
        gl.uniform1f(uSeed, pane.s);
        gl.uniform4f(uImage, pane.ix, pane.iy, pane.iw, pane.ih);
        gl.uniform1f(uImageAspect, pane.ia);

        /*
         * What is standing on this pane, as shapes the shader can test.
         *
         * Pane-local pixels, already displaced by each occluder's cast vector,
         * so the hole in the rake lands where the shadow does rather than
         * under the object. The tail of the buffer is not cleared -- the count
         * bounds the loop, so stale values past it are never read.
         */
        const occ = pane.occ;
        const count = Math.min(occ.length, MAX_OCCLUDERS);
        for (let i = 0; i < count; i++) {
          const o = occ[i];
          if (!o) continue;
          const k = i * 4;
          occRect[k] = o.cx;
          occRect[k + 1] = o.cy;
          occRect[k + 2] = o.hw;
          occRect[k + 3] = o.hh;
          occSoft[k] = Math.min(o.radius, Math.min(o.hw, o.hh));
          occSoft[k + 1] = o.blur;
          occSoft[k + 2] = o.alpha;
          occSoft[k + 3] = 0;
        }
        gl.uniform1f(uOccCount, count);
        if (count > 0) {
          gl.uniform4fv(uOccRect, occRect);
          gl.uniform4fv(uOccSoft, occSoft);
        }

        // Scissor in device pixels, y counted from the bottom.
        const sx = Math.floor((pane.x - BLEED) * scale);
        const sw = Math.ceil((pane.w + BLEED * 2) * scale);
        const sy = Math.floor((viewportHeight() - (pane.y + pane.h) - BLEED) * scale);
        const sh = Math.ceil((pane.h + BLEED * 2) * scale);
        gl.scissor(sx, sy, sw, sh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        /*
         * Out of the shared buffer and into the pane.
         *
         * drawImage reads top-down while the scissor counts from the bottom,
         * so the source y is computed separately rather than reused -- getting
         * that wrong mirrors every pane vertically, which looks like a shader
         * bug and is not one.
         */
        const layer = surfaceFor(pane.el, pane.w + BLEED * 2, pane.h + BLEED * 2);
        const ctx = layer.getContext("2d");
        if (ctx) {
          /*
           * THE SOURCE RECTANGLE IS CLAMPED TO THE CANVAS.
           *
           * The layer is BLEED bigger than the pane on every side, so for any
           * pane touching an edge of the viewport -- which is every full-width
           * band on this site, where pane.x is 0 -- the rectangle this wants
           * to read starts at -90 * scale and runs 180 * scale wider than the
           * buffer. Those pixels do not exist. Asked for them, the browser
           * smears the outermost row and column to fill the gap, which paints
           * a torn streak of repeated pixels down the side of the pane.
           *
           * It is not new. It was invisible because the section wrapper had
           * `overflow: hidden` and cropped the bleed away; moving that clip in
           * so the bloom could escape stopped hiding it too.
           *
           * So: read only the part that exists, and put it at the matching
           * offset in the layer rather than stretching it to fill. Source and
           * destination stay 1:1 -- the layer is already the bleed size at the
           * same scale -- so nothing is resampled and the missing margin is
           * simply left transparent, which is what it should be. A pane
           * entirely off-buffer yields no draw at all.
           */
          const srcX = (pane.x - BLEED) * scale;
          const srcY = (pane.y - BLEED) * scale;
          const cx = Math.max(0, Math.floor(srcX));
          const cy = Math.max(0, Math.floor(srcY));
          const cw = Math.min(canvas.width, Math.ceil(srcX + sw)) - cx;
          const ch = Math.min(canvas.height, Math.ceil(srcY + sh)) - cy;

          ctx.clearRect(0, 0, layer.width, layer.height);
          if (cw > 0 && ch > 0) {
            ctx.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);

            /*
             * Glare: the glow of the edge carried PAST the edge.
             *
             * The highlight lives in the bevel, inside the glass, and most of
             * the shader's terms stop at the rim because the glass does. The
             * glow that makes a lit edge read as bright does not: it is the
             * lens spreading the hottest light a little in every direction,
             * and it has no idea where the pane ends. Without it the warm
             * glow above a lit bottom edge stopped dead on the line and read
             * as clipped.
             *
             * So a blurred copy of this same light is added over itself --
             * the standard bloom pass -- which spreads the bright part of the
             * rim out over the photograph beyond as much as into the glass.
             */
            const spill = t("rimGlare");
            if (spill > 0) {
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = Math.min(spill, 1);
              ctx.filter = `blur(${Math.round(t("rimGlareSize") * scale)}px)`;
              ctx.drawImage(canvas, cx, cy, cw, ch, cx - srcX, cy - srcY, cw, ch);
              ctx.restore();
            }
          }
          drawn.add(layer);
          allLayers.add(layer);
        }
      }
      gl.disable(gl.SCISSOR_TEST);

      // A pane that scrolled out of range this frame keeps its last image
      // otherwise, frozen, while the light moves on without it.
      for (const layer of allLayers) {
        if (drawn.has(layer)) continue;
        layer.getContext("2d")?.clearRect(0, 0, layer.width, layer.height);
      }
      drawn.clear();
      return true;
    };

    const loop = sleepingLoop(step, "glass-light");
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    /*
     * And on the charge itself. The loop parks at zero charge and used to be
     * woken only by pointer movement -- so winding the shutter by HOLDING
     * still, which is the whole point of the hold trigger, grew the ring and
     * lit nothing. Caught frame by frame: 25, 50, 75, 100% charge with the
     * pointer still, and not one photon on the glass until it moved.
     */
    const stopCharge = onCharge(wake);
    // A changed setting (the room's brightness, the frost) changes the resting
    // frame too, so it has to be redrawn, not just the lit one.
    const stopTuning = onTuningApplied(() => {
      restingDrawn = false;
      wake();
    });
    loop.wake();

    const stopLoss = onSharedGlLoss(
      () => loop.stop(),
      () => setGeneration((g) => g + 1),
    );

    return () => {
      loop.stop();
      window.removeEventListener("pointermove", wake);
      stopCharge();
      stopTuning();
      stopLoss();
      gl.deleteProgram(program);
      quad.delete();
      for (const tex of layers.values()) gl.deleteTexture(tex);
      if (room) gl.deleteTexture(room);
      for (const tex of backdrops.values()) if (tex) gl.deleteTexture(tex);
    };
  }, [chargeRef, positionRef, generation]);

  // Nothing of its own to show: it draws into each pane's surface layer.
  return null;
}
