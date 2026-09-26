import { expect, test } from "./fixtures";
import { EDGE_PROFILE_GLSL } from "../src/effects/optics/edge-profile.glsl";
import { REFLECTION_GLSL } from "../src/effects/optics/reflection.glsl";
import { TRANSMISSION_GLSL } from "../src/effects/optics/transmission.glsl";
import {
  frostSpread,
  irradianceFalloff,
  penumbraAcross,
  slantSpread,
  transmittance,
} from "../src/effects/optics/transmission";
import { fresnelSchlick, ggx, lampReflection } from "../src/effects/optics/reflection";
import {
  edgeBand,
  fresnelRise,
  roundedRectSDF,
  surfaceHeight,
  toneMapFilm,
  toneMapGlass,
} from "../src/effects/optics/edge-profile";

/**
 * The GLSL edge functions compute what their TypeScript twins compute.
 *
 * The CSS bend is built on the CPU from the TypeScript; the light on and under
 * the glass is drawn on the GPU from the GLSL. If the two drift, the bend and
 * the light of one edge land in different places again -- the bug the shared
 * library exists to end. So each function is run in a real WebGL context over
 * a sweep of inputs and compared with its twin.
 *
 * Results come back through an 8-bit canvas, so each is mapped into [0, 1]
 * over a known range and compared to within two steps of that range.
 */

const N = 64;

type Case = {
  name: string;
  /** GLSL expression of x giving the result. */
  glsl: string;
  ts: (x: number) => number;
  /** Input sweep. */
  from: number;
  to: number;
  /** Output range the result is mapped over for readback. */
  lo: number;
  hi: number;
};

const CASES: Case[] = [
  {
    name: "irradianceFalloff",
    glsl: "irradianceFalloff(x, 300.0)",
    ts: (x) => irradianceFalloff(x, 300),
    from: -900,
    to: 900,
    lo: 0,
    hi: 1,
  },
  {
    name: "transmittance",
    glsl: "transmittance(x, 1.518)",
    ts: (x) => transmittance(x, 1.518),
    from: 0,
    to: 1,
    lo: 0,
    hi: 1,
  },
  {
    name: "penumbraAcross",
    glsl: "penumbraAcross(46.0, 70.0, 300.0, x, 0.8)",
    ts: (x) => penumbraAcross(46, 70, 300, x, 0.8),
    from: 0.1,
    to: 1,
    lo: 0,
    hi: 120,
  },
  {
    name: "frostSpread",
    glsl: "frostSpread(0.6, 1.518, 70.0, x)",
    ts: (x) => frostSpread(0.6, 1.518, 70, x),
    from: 0.3,
    to: 1,
    lo: 0,
    hi: 150,
  },
  {
    name: "slantSpread",
    glsl: "slantSpread(x)",
    ts: (x) => slantSpread(x),
    from: 0.05,
    to: 1,
    lo: 0,
    hi: 7,
  },
  {
    name: "fresnelSchlick",
    glsl: "fresnelSchlick(x, 1.518)",
    ts: (x) => fresnelSchlick(x, 1.518),
    from: 0,
    to: 1,
    lo: 0,
    hi: 1,
  },
  {
    name: "ggx",
    glsl: "ggx(x, 0.38)",
    ts: (x) => ggx(x, 0.38),
    from: 0.5,
    to: 1,
    lo: 0,
    hi: 2.5,
  },
  {
    name: "lampReflection (frosted)",
    glsl: "lampReflection(vec2(x, 0.4 * x), 230.0, 756000.0, 1.518, 0.6)",
    ts: (x) => lampReflection(x, 0.4 * x, 230, 756000, 1.518, 0.6),
    from: -400,
    to: 400,
    lo: 0,
    hi: 0.4,
  },
  {
    name: "lampReflection (clear)",
    glsl: "lampReflection(vec2(x, 0.0), 230.0, 756000.0, 1.518, 0.0)",
    ts: (x) => lampReflection(x, 0, 230, 756000, 1.518, 0),
    from: -60,
    to: 60,
    lo: 0,
    hi: 4,
  },
  {
    name: "roundedBox",
    glsl: "roundedBox(vec2(x, 0.3 * x - 20.0), vec2(50.0, 30.0), 12.0)",
    ts: (x) => roundedRectSDF(x, 0.3 * x - 20, 50, 30, 12),
    from: -100,
    to: 100,
    lo: -60,
    hi: 80,
  },
  {
    name: "edgeBand",
    glsl: "edgeBand(x, 40.0)",
    ts: (x) => edgeBand(x, 40),
    from: -10,
    to: 60,
    lo: 0,
    hi: 1,
  },
  {
    name: "surfaceHeight",
    glsl: "surfaceHeight(x)",
    ts: (x) => surfaceHeight(x),
    from: -0.2,
    to: 1.2,
    lo: 0,
    hi: 1,
  },
  {
    name: "fresnelRise",
    glsl: "fresnelRise(x)",
    ts: (x) => fresnelRise(x),
    from: 0,
    to: 1,
    lo: 0,
    hi: 1,
  },
  {
    name: "toneMapGlass",
    glsl: "toneMapGlass(vec3(x)).r",
    ts: (x) => toneMapGlass(x),
    from: -3,
    to: 8,
    lo: -1,
    hi: 1,
  },
  {
    name: "toneMapFilm",
    glsl: "toneMapFilm(vec3(x)).r",
    ts: (x) => toneMapFilm(x),
    from: 0,
    to: 5,
    lo: 0,
    hi: 1,
  },
];

test.describe("optics library", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "WebGL twins run in Chromium.");

  for (const c of CASES) {
    test(`GLSL ${c.name} matches its TypeScript twin`, async ({ page }) => {
      await page.setContent("<canvas></canvas>");
      const gpu = await page.evaluate(
        ({ chunk, c, N }) => {
          const canvas = document.querySelector("canvas")!;
          canvas.width = N;
          canvas.height = 1;
          const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
          if (!gl) return { error: "no webgl" };
          const vs = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;
          const fs = `precision highp float;
${chunk}
void main() {
  float i = gl_FragCoord.x - 0.5;
  float x = ${c.from.toFixed(6)} + (${(c.to - c.from).toFixed(6)}) * i / ${(N - 1).toFixed(1)};
  float v = ${c.glsl};
  gl_FragColor = vec4(clamp((v - ${c.lo.toFixed(6)}) / ${(c.hi - c.lo).toFixed(6)}, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;
          const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
              throw new Error(gl.getShaderInfoLog(s) ?? "");
            return s;
          };
          const p = gl.createProgram()!;
          try {
            gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
            gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
          } catch (e) {
            return { error: String(e) };
          }
          gl.linkProgram(p);
          gl.useProgram(p);
          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          gl.viewport(0, 0, N, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const px = new Uint8Array(N * 4);
          gl.readPixels(0, 0, N, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return { values: Array.from({ length: N }, (_, i) => px[i * 4]! / 255) };
        },
        {
          chunk: EDGE_PROFILE_GLSL + REFLECTION_GLSL + TRANSMISSION_GLSL,
          c: { ...c, ts: undefined },
          N,
        },
      );

      expect(gpu.error, "the chunk compiles in a real WebGL context").toBeUndefined();
      const tolerance = 2 / 255;
      for (let i = 0; i < N; i++) {
        const x = c.from + ((c.to - c.from) * i) / (N - 1);
        const expected = Math.min(1, Math.max(0, (c.ts(x) - c.lo) / (c.hi - c.lo)));
        expect(
          Math.abs(gpu.values![i]! - expected),
          `${c.name}(${x.toFixed(3)})`,
        ).toBeLessThanOrEqual(tolerance);
      }
    });
  }

  test("every pane's CSS bend is built at the same edge width the light uses", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const band = page.locator("main .glass").first();
    await band.scrollIntoViewIfNeeded();
    await expect
      .poll(() => band.evaluate((el) => el.style.getPropertyValue("--glass-bevel")))
      .toContain("e40");
  });
});
