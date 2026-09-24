import { useEffect, useRef, useState } from "react";
import { LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";
import { sleepingLoop } from "@/lib/gl-loop";
import { t } from "@/lib/tuning";
import { assetUrl, SITE_ASSETS } from "@/lib/site-assets";

/**
 * The cursor light, rendered in WebGL.
 *
 * A canvas rather than CSS because the effect depends on light values above
 * 1.0. CSS composites in SDR — nothing can be brighter than white — so a
 * "blown out" core has to be faked as a white gradient stop, which is exactly
 * why every gradient version of this read as an orange aura with a white dot
 * in it. Here the emission genuinely exceeds the display range and a tonemap
 * clips it, so the white core, the coloured falloff and the dispersion all
 * fall out of the same calculation instead of being drawn separately.
 *
 * Viewport-sized, not a box that follows the cursor. A lens flare's ghosts
 * march along the axis from the source through the centre of the frame and
 * out the other side; penned into a box around the cursor there is nowhere
 * for them to go, and the box's own edge was visible wherever the falloff
 * crossed it.
 */
/*
 * Bloom and flare are low-frequency; the only sharp features are the spikes
 * and the aperture rim. Held at 1.5 they stay crisp and the fill cost of a
 * full-viewport pass is less than half what a dense display would ask.
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

export function CursorLight({
  chargeRef,
  closedRef,
  positionRef,
}: {
  chargeRef: { current: number };
  closedRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /*
   * Bumped when a lost GL context comes back. The effect depends on it, so
   * React tears the old setup down and runs a fresh one -- which is exactly
   * what restoration needs, since every shader, buffer and texture handle
   * from before the loss is dead. Re-running the effect rebuilds all of it
   * with no separate recovery path to keep correct.
   */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // The gesture that drives this needs a fine pointer, so on a touch device
    // the charge can never leave zero. Without this the page still built a GL
    // context and ran a loop forever for an effect that could not fire --
    // battery spent on the hardware least able to afford it.
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    // No WebGL: the page simply goes without the light rather than falling
    // back to something that doesn't work.
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("cursor light shader:", gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, LIGHT_VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, LIGHT_FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("cursor light link:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uCharge = gl.getUniformLocation(program, "uCharge");
    const uClosed = gl.getUniformLocation(program, "uClosed");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uWarm = gl.getUniformLocation(program, "uWarm");
    const uCool = gl.getUniformLocation(program, "uCool");

    // The site's amber and teal, converted to linear light — the shader works
    // in linear and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(uWarm, toLinear(1.0), toLinear(0.68), toLinear(0.3));
    gl.uniform3f(uCool, toLinear(0.35), toLinear(0.78), toLinear(0.82));

    const uViewport = gl.getUniformLocation(program, "uViewport");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uLight = gl.getUniformLocation(program, "uLight");
    /*
     * The tunables. Read from the shared store each frame rather than baked in,
     * so the panel at /lab can move them while the page is running. Six extra
     * uniform writes a frame is nothing next to the fill they control.
     */
    const uGain = gl.getUniformLocation(program, "uGain");
    const uFalloff = gl.getUniformLocation(program, "uFalloff");
    const uAperture = gl.getUniformLocation(program, "uAperture");
    const uSpread = gl.getUniformLocation(program, "uSpread");
    const uGhostGain = gl.getUniformLocation(program, "uGhostGain");
    const uHaloGain = gl.getUniformLocation(program, "uHaloGain");

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
     * The same photographed surface the panes wear, reused here to give the
     * ghosts an inside. A defocused image of an aperture carries the dust and
     * coating flaws of the glass it bounced off, and mottling across the disc
     * is most of what separates a photographed ghost from a drawn one.
     */
    gl.uniform1i(gl.getUniformLocation(program, "uGrit"), 0);
    const uHasGrit = gl.getUniformLocation(program, "uHasGrit");
    gl.uniform1f(uHasGrit, 0);
    const grit = gl.createTexture();
    let gritAsked = false;
    const askGrit = () => {
      if (gritAsked) return;
      gritAsked = true;
      const img = new Image();
      img.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, grit);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.useProgram(program);
        gl.uniform1f(uHasGrit, 1);
      };
      img.src = assetUrl(SITE_ASSETS.glassSurface);
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const start = performance.now();
    let wasLit = false;
    canvas.style.opacity = "0";

    /* Returns whether there is still something to draw; false parks the loop. */
    const step = (now: number) => {
      const charge = chargeRef.current;
      if (charge <= 0.002) {
        if (wasLit) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          canvas.style.opacity = "0";
          wasLit = false;
        }
        return false;
      }
      if (!wasLit) {
        canvas.style.opacity = "1";
        wasLit = true;
      }

      const closed = closedRef.current;
      const { x, y } = positionRef.current;
      askGrit();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, grit);
      gl.uniform2f(uLight, x, y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uClosed, closed);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uGain, t("coreGain"));
      gl.uniform1f(uFalloff, t("coreFalloff"));
      gl.uniform1f(uAperture, t("aperture"));
      gl.uniform1f(uSpread, t("spread"));
      gl.uniform1f(uGhostGain, t("ghostGain"));
      gl.uniform1f(uHaloGain, t("haloGain"));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    };

    const loop = sleepingLoop(step);
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    loop.wake();

    /*
     * `preventDefault` is not optional: without it the browser does not even
     * attempt to restore the context, and the canvas stays dead for good.
     */
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
      gl.deleteTexture(grit);
    };
  }, [chargeRef, closedRef, positionRef, generation]);

  return <canvas ref={canvasRef} aria-hidden="true" className="cursor-light" />;
}
