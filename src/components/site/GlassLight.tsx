import { useEffect, useRef, useState } from "react";
import { LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";
import { sleepingLoop } from "@/lib/gl-loop";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { glassGeometry, geometryStamp, MAX_OCCLUDERS } from "@/lib/edge-glow";
import { t } from "@/lib/tuning";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Bumped when a lost GL context returns; see CursorLight for why this is
     the whole recovery path. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives all of this needs a fine pointer, so on a touch
    // device the charge can never leave zero. Nothing to do but not start.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("glass shader:", gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, LIGHT_VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, GLASS_LIGHT_FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("glass link:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const U = (name: string) => gl.getUniformLocation(program, name);
    const uViewport = U("uViewport");
    const uScale = U("uScale");
    const uLight = U("uLight");
    const uCharge = U("uCharge");
    const uRect = U("uRect");
    const uRadius = U("uRadius");
    const uTilt = U("uTilt");
    const uSeed = U("uSeed");
    const uImage = U("uImage");
    const uImageAspect = U("uImageAspect");
    const uHasBackdrop = U("uHasBackdrop");
    const uHasSurface = U("uHasSurface");
    const uGrimeRake = U("uGrimeRake");
    const uGrimeSpecks = U("uGrimeSpecks");
    const uGrimeFloor = U("uGrimeFloor");
    const uSideReach = U("uSideReach");
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
    const uSheen = U("uSheen");
    const uSheenReach = U("uSheenReach");
    const uArris = U("uArris");

    // The site's amber and teal in linear light — the shader works in linear
    // and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(U("uWarm"), toLinear(1.0), toLinear(0.68), toLinear(0.3));
    gl.uniform3f(U("uCool"), toLinear(0.35), toLinear(0.78), toLinear(0.82));
    gl.uniform1i(U("uSurface"), 0);
    gl.uniform1i(U("uBackdrop"), 1);
    gl.uniform1f(uHasSurface, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      const w = Math.round(viewportWidth() * scale);
      const h = Math.round(viewportHeight() * scale);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uViewport, w, h);
      gl.uniform1f(uScale, scale);
    };
    resize();
    window.addEventListener("resize", resize);

    /*
     * The photographed surface map, fetched lazily: the shader falls back to
     * no surface detail until it arrives, and it never loads at all for
     * somebody who never winds the shutter.
     */
    const surface = gl.createTexture();
    let surfaceRequested = false;
    const requestSurface = () => {
      if (surfaceRequested) return;
      surfaceRequested = true;
      const img = new Image();
      img.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, surface);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        /*
         * No mipmaps. The map is an atlas of four cells, and a minified level
         * blends them into one another — every pane would end up wearing an
         * average of all four rather than the one it was given.
         */
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.useProgram(program);
        gl.uniform1f(uHasSurface, 1);
      };
      img.src = "/glass-surface.jpg";
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
      if (!layer) {
        layer = document.createElement("canvas");
        layer.className = "glass__surface";
        layer.setAttribute("aria-hidden", "true");
        el.insertBefore(layer, el.firstChild);
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
    canvas.style.opacity = "0";

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

    const step = (now: number) => {
      const charge = chargeRef.current;
      const lit = charge > 0.002;

      if (!lit) {
        // Already settled and nothing has moved: park without redrawing.
        if (!wasLit && restingDrawn && geometryStamp() === restingStamp) return false;
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

      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
      gl.uniform2f(uLight, x, y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uGrimeRake, t("grimeRake"));
      gl.uniform1f(uGrimeSpecks, t("grimeSpecks"));
      gl.uniform1f(uGrimeFloor, t("grimeFloor"));
      gl.uniform1f(uSideReach, t("sideReach"));
      gl.uniform1f(uRestEdge, t("restEdge"));
      gl.uniform1f(uSheen, t("sheen"));
      gl.uniform1f(uSheenReach, t("sheenFalloff"));
      gl.uniform1f(uArris, t("arris"));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, surface);

      for (const pane of panes) {
        // Offscreen panes cost nothing but a rectangle test.
        if (pane.y + pane.h < -BLEED || pane.y > viewportHeight() + BLEED) continue;

        const texture = pane.src ? requestBackdrop(pane.src) : null;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(uHasBackdrop, texture ? 1 : 0);

        gl.uniform4f(uRect, pane.x, pane.y, pane.w, pane.h);
        gl.uniform1f(uRadius, pane.r);
        gl.uniform1f(uTilt, pane.t);
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

    const loop = sleepingLoop(step);
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    loop.wake();

    const onLost = (event: Event) => {
      event.preventDefault();
      loop.stop();
    };
    const onRestored = () => setGeneration((g) => g + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      loop.stop();
      window.removeEventListener("pointermove", wake);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(surface);
      for (const tex of backdrops.values()) if (tex) gl.deleteTexture(tex);
    };
  }, [chargeRef, positionRef, generation]);

  return <canvas ref={canvasRef} aria-hidden="true" className="glass-light" />;
}
