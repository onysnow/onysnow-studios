import { useEffect, useRef, useState } from "react";

import { glassGeometry, lightState, onCharge } from "@/lib/edge-glow";
import {
  FLOOR_FRAGMENT_SHADER,
  FLOOR_VERTEX_SHADER,
  MAX_FLOOR_PANES,
} from "@/lib/floor-light-shader";
import { sleepingLoop } from "@/lib/gl-loop";
import { assetUrl, SITE_ASSETS } from "@/lib/site-assets";
import { t } from "@/lib/tuning";

/**
 * Light through the glass, and the glass's shadow, on the photographs.
 *
 * See floor-light-shader.ts for the optics. This is the plumbing: one
 * viewport-sized canvas, drawn only while the shutter is charged, parked the
 * rest of the time exactly like the cursor light and the pane light.
 *
 * WHERE IT SITS
 *
 * Inside <main>, first, at z-index 1: above the photographs (z auto) and,
 * being first in the document among the z-index-1 layers, below the panes.
 * In CSS mode that means each pane's backdrop-filter frosts and bends this
 * light along with the photograph under it. Under liquid glass it is a canvas
 * child of the scene root, so the library draws it into the scene live; it is
 * marked dynamic only while lit, so the panes re-render with it while the
 * light is on and not a frame longer.
 */

const MAX_SCALE = 1.5;

export function FloorLight() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("floor light shader:", gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, FLOOR_VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FLOOR_FRAGMENT_SHADER);
    if (!vs || !fs) return;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("floor light link:", gl.getProgramInfoLog(program));
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
    const uGap = U("uGap");
    const uHeight = U("uHeight");
    const uReach = U("uReach");
    const uBevel = U("uBevel");
    const uLightGain = U("uLightGain");
    const uShadowGain = U("uShadowGain");
    const uCaustics = U("uCaustics");
    const uPenumbra = U("uPenumbra");
    const uCount = U("uCount");
    const uRect = U("uRect");
    const uSeed = U("uSeed");
    const uHasSurface = U("uHasSurface");
    gl.uniform1i(U("uSurface"), 0);
    gl.uniform1f(uHasSurface, 0);

    const surface = gl.createTexture();
    const img = new Image();
    img.onload = () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, surface);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.useProgram(program);
      gl.uniform1f(uHasSurface, 1);
    };
    img.src = assetUrl(SITE_ASSETS.glassSurface);

    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      const w = Math.round((document.documentElement.clientWidth || window.innerWidth) * scale);
      const h = Math.round((document.documentElement.clientHeight || window.innerHeight) * scale);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uViewport, w, h);
      gl.uniform1f(uScale, scale);
    };
    resize();
    window.addEventListener("resize", resize);

    const rects = new Float32Array(MAX_FLOOR_PANES * 4);
    const seeds = new Float32Array(MAX_FLOOR_PANES);
    let wasLit = false;

    /*
     * Dynamic only while there is something to show. The liquid glass
     * re-renders a pane every frame while a dynamic contributor overlaps it,
     * which is exactly right while the light moves and pure waste otherwise.
     */
    const setLive = (on: boolean) => {
      canvas.dataset["dynamic"] = on ? "" : "idle";
    };
    setLive(false);

    const step = (now: number) => {
      const charge = lightState.charge;
      if (charge <= 0.002) {
        if (wasLit) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          wasLit = false;
          setLive(false);
        }
        return false;
      }
      if (!wasLit) {
        wasLit = true;
        setLive(true);
      }

      const vh = document.documentElement.clientHeight || window.innerHeight;
      let n = 0;
      for (const pane of glassGeometry(now)) {
        if (n >= MAX_FLOOR_PANES) break;
        if (pane.y + pane.h < -200 || pane.y > vh + 200) continue;
        if (pane.w < 120 || pane.h < 40) continue; // buttons and menus throw nothing worth drawing
        rects.set([pane.x, pane.y, pane.w, pane.h], n * 4);
        seeds[n] = pane.s;
        n += 1;
      }

      gl.useProgram(program);
      gl.uniform2f(uLight, lightState.x, lightState.y);
      gl.uniform1f(uCharge, charge);
      gl.uniform1f(uGap, t("floorGap"));
      gl.uniform1f(uHeight, t("shadowHeight"));
      gl.uniform1f(uReach, t("floorReach"));
      gl.uniform1f(uBevel, t("floorBevel"));
      gl.uniform1f(uLightGain, t("floorLight"));
      gl.uniform1f(uShadowGain, t("floorShadow"));
      gl.uniform1f(uCaustics, t("floorCaustics"));
      // The same penumbra the cast shadows use: light size * gap / height.
      gl.uniform1f(
        uPenumbra,
        (t("shadowSoftness") * t("floorGap")) / Math.max(t("shadowHeight"), 1),
      );
      gl.uniform1i(uCount, n);
      gl.uniform4fv(uRect, rects);
      gl.uniform1fv(uSeed, seeds);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, surface);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    };

    const loop = sleepingLoop(step);
    const wake = () => loop.wake();
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    const stopCharge = onCharge(wake);
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
      stopCharge();
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [generation]);

  return <canvas ref={ref} aria-hidden="true" className="floor-light" />;
}
