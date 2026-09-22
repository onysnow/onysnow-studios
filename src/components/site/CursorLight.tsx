import { useEffect, useRef } from "react";
import { LIGHT_FRAGMENT_SHADER, LIGHT_VERTEX_SHADER } from "@/lib/cursor-light-shader";

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
 * Cheap: one quad, no textures, a few dozen instructions. It costs far less
 * than the stacked backdrop-filters it sits over.
 */
const SIZE = 512;

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

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
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

    gl.viewport(0, 0, SIZE, SIZE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let frame = 0;
    const start = performance.now();

    const render = (now: number) => {
      const charge = chargeRef.current;
      const closed = closedRef.current;
      const { x, y } = positionRef.current;

      canvas.style.transform = `translate3d(${x - SIZE / 2}px, ${y - SIZE / 2}px, 0)`;
      canvas.style.opacity = charge > 0.002 ? "1" : "0";

      if (charge > 0.002) {
        gl.uniform1f(uCharge, charge);
        gl.uniform1f(uClosed, closed);
        gl.uniform1f(uTime, (now - start) / 1000);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [chargeRef, closedRef, positionRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      width={SIZE}
      height={SIZE}
      className="cursor-light"
    />
  );
}
