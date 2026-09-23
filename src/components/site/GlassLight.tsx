import { useEffect, useRef, useState } from "react";
import { LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";
import { sleepingLoop } from "@/lib/gl-loop";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { glassGeometry } from "@/lib/edge-glow";
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

    let wasLit = false;
    canvas.style.opacity = "0";

    /* Returns whether there is still something to draw; false parks the loop. */
    const step = (now: number) => {
      const charge = chargeRef.current;
      const lit = charge > 0.002;
      if (!lit) {
        if (wasLit) {
          gl.disable(gl.SCISSOR_TEST);
          gl.clear(gl.COLOR_BUFFER_BIT);
          canvas.style.opacity = "0";
          wasLit = false;
        }
        return false;
      }
      if (!wasLit) {
        requestSurface();
        canvas.style.opacity = "1";
        wasLit = true;
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

        // Scissor in device pixels, y counted from the bottom.
        const sx = Math.floor((pane.x - BLEED) * scale);
        const sw = Math.ceil((pane.w + BLEED * 2) * scale);
        const sy = Math.floor((viewportHeight() - (pane.y + pane.h) - BLEED) * scale);
        const sh = Math.ceil((pane.h + BLEED * 2) * scale);
        gl.scissor(sx, sy, sw, sh);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
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
