import { useEffect, useRef } from "react";
import { LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { glassGeometry } from "@/lib/edge-glow";

/**
 * The glass answering the cursor light.
 *
 * One viewport-sized canvas for every panel on the page rather than a layer
 * per panel. The rims, the bloom and the reflections are all the same light
 * seen three ways, and computing them together is both cheaper and the only
 * way they can sum — an edge that is being hit by the light AND carrying its
 * reflection has to add up past white, and separate CSS layers can only ever
 * paint over one another.
 *
 * Composited with `plus-lighter`, so the canvas adds to the page instead of
 * covering it. That is what makes it light rather than a picture of light.
 */

/** Uniform array length in the shader. Unused slots are parked offscreen. */
const MAX_RECTS = 8;

/*
 * Bloom is low-frequency and the rim filament is a couple of pixels wide, so
 * there is nothing here that repays a full 3x buffer on a dense display. Held
 * at 1.5 the rim is still crisp and the fill cost is less than half.
 */
const MAX_SCALE = 1.5;

export function GlassLight({
  chargeRef,
  positionRef,
}: {
  chargeRef: { current: number };
  positionRef: { current: { x: number; y: number } };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    // No WebGL: the glass simply goes unlit rather than falling back to
    // something that doesn't work.
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("glass light shader:", gl.getShaderInfoLog(shader));
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
      console.error("glass light link:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uViewport = gl.getUniformLocation(program, "uViewport");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uCharge = gl.getUniformLocation(program, "uCharge");
    const uRects = gl.getUniformLocation(program, "uRects");
    const uRadii = gl.getUniformLocation(program, "uRadii");
    const uTilts = gl.getUniformLocation(program, "uTilts");
    const uSeeds = gl.getUniformLocation(program, "uSeeds");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uHasSurface = gl.getUniformLocation(program, "uHasSurface");

    // The same amber and teal as the cursor, in linear light — the shader
    // works in linear and only returns to display space at the very end.
    const toLinear = (c: number) => Math.pow(c, 2.2);
    gl.uniform3f(
      gl.getUniformLocation(program, "uWarm"),
      toLinear(1.0),
      toLinear(0.68),
      toLinear(0.3),
    );
    gl.uniform3f(
      gl.getUniformLocation(program, "uCool"),
      toLinear(0.35),
      toLinear(0.78),
      toLinear(0.82),
    );

    /*
     * The photographed surface map, fetched lazily.
     *
     * Not blocking: the shader falls back to a generated surface until this
     * arrives, so the effect is never missing while a 200KB image is in
     * flight, and it never loads at all for anyone who never winds the
     * shutter.
     */
    gl.uniform1i(gl.getUniformLocation(program, "uSurface"), 0);
    gl.uniform1f(uHasSurface, 0);
    const surface = gl.createTexture();
    let surfaceRequested = false;
    const requestSurface = () => {
      if (surfaceRequested) return;
      surfaceRequested = true;
      const img = new Image();
      img.onload = () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, surface);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        // Tiled, and mipmapped so the far falloff does not alias into sparkle.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        /*
         * No mipmaps. The map is an atlas of four cells, and a minified level
         * blends them into one another — every panel would end up wearing an
         * average of all four rather than the one it was given.
         */
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.useProgram(program);
        gl.uniform1f(uHasSurface, 1);
      };
      img.src = "/glass-surface.jpg";
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      const w = Math.round(window.innerWidth * scale);
      const h = Math.round(window.innerHeight * scale);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uViewport, w, h);
      gl.uniform1f(uScale, scale);
    };
    resize();
    window.addEventListener("resize", resize);

    // Reused every frame. Allocating these inside the loop would hand the
    // collector two arrays per frame for no reason.
    const rects = new Float32Array(MAX_RECTS * 4);
    const radii = new Float32Array(MAX_RECTS);
    const tilts = new Float32Array(MAX_RECTS);
    const seeds = new Float32Array(MAX_RECTS);

    let frame = 0;
    let wasLit = false;
    const start = performance.now();

    const render = (now: number) => {
      frame = requestAnimationFrame(render);

      const charge = chargeRef.current;
      const lit = charge > 0.002;

      if (!lit) {
        // Clear once on the way down, then leave the canvas alone entirely.
        if (wasLit) {
          gl.clear(gl.COLOR_BUFFER_BIT);
          canvas.style.opacity = "0";
          wasLit = false;
        }
        return;
      }
      if (!wasLit) {
        requestSurface();
        canvas.style.opacity = "1";
        wasLit = true;
      }

      const panels = glassGeometry(now);
      const { x, y } = positionRef.current;

      /*
       * Nearest panels first, and only as many as the shader has slots for.
       * A panel's contribution dies with distance, so the ones that lose out
       * are the ones that were about to contribute nothing — and the home page
       * has more glass on it than any one screen can show at once.
       */
      const near =
        panels.length <= MAX_RECTS
          ? panels
          : [...panels]
              .sort((a, b) => {
                const da = Math.hypot(
                  Math.max(a.x - x, 0, x - (a.x + a.w)),
                  Math.max(a.y - y, 0, y - (a.y + a.h)),
                );
                const db = Math.hypot(
                  Math.max(b.x - x, 0, x - (b.x + b.w)),
                  Math.max(b.y - y, 0, y - (b.y + b.h)),
                );
                return da - db;
              })
              .slice(0, MAX_RECTS);

      for (let i = 0; i < MAX_RECTS; i += 1) {
        const rect = near[i];
        const o = i * 4;
        if (rect) {
          rects[o] = rect.x;
          rects[o + 1] = rect.y;
          rects[o + 2] = rect.w;
          rects[o + 3] = rect.h;
          radii[i] = rect.r;
          tilts[i] = rect.t;
          seeds[i] = rect.s;
        } else {
          // Parked far away at zero size: every distance is enormous, every
          // falloff is zero, and no branch is needed in the shader.
          rects[o] = -1e5;
          rects[o + 1] = -1e5;
          rects[o + 2] = 0;
          rects[o + 3] = 0;
          radii[i] = 0;
          tilts[i] = 0;
          seeds[i] = 0;
        }
      }

      gl.uniform4fv(uRects, rects);
      gl.uniform1fv(uRadii, radii);
      gl.uniform1fv(uTilts, tilts);
      gl.uniform1fv(uSeeds, seeds);
      gl.uniform2f(uLight, x, y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(surface);
    };
  }, [chargeRef, positionRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className="glass-light" />;
}
