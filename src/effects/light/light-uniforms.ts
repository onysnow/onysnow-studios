/**
 * The lights, as a shader sees them (light-system design, step B).
 *
 * Every pass that draws light declares the same arrays and loops over them,
 * so a light added to the list (effects/light/lights.ts) reaches every pass
 * with no new code. Today the list the passes draw holds one light, the
 * cursor's lamp, and the loops run once -- which is why nothing on the page
 * changed when they arrived.
 *
 * WebGL1 has no uniform buffers, so the lights are plain arrays. MAX_LIGHTS
 * is kept small: each light costs 4 vec4-equivalents of uniform space and
 * one trip round each loop per lit pixel.
 */

export const MAX_LIGHTS = 4;

/** The declarations every light-drawing shader includes. */
export const LIGHTS_GLSL = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform int   uLightCount;                 // how many of the arrays are in use
uniform vec3  uLightPos[MAX_LIGHTS];       // x, y (viewport CSS px), height above the receiver
uniform vec3  uLightColour[MAX_LIGHTS];    // linear RGB
uniform float uLightPower[MAX_LIGHTS];     // radiant power (glass) or gain (lens)
uniform float uLightRadius[MAX_LIGHTS];    // the source's radius, CSS px
uniform float uLightCharge[MAX_LIGHTS];    // how hard it is burning, 0 to 1
`;

/** One light, packed for a pass: already resolved to that pass's receiver. */
export type PackedLight = {
  x: number;
  y: number;
  /** Height above whatever this pass lights (the glass, or the photographs). */
  height: number;
  colour: readonly [number, number, number];
  power: number;
  radius: number;
  charge: number;
};

export type LightLocations = {
  count: WebGLUniformLocation | null;
  pos: WebGLUniformLocation | null;
  colour: WebGLUniformLocation | null;
  power: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  charge: WebGLUniformLocation | null;
};

export function lightLocations(gl: WebGLRenderingContext, program: WebGLProgram): LightLocations {
  const U = (name: string) => gl.getUniformLocation(program, name);
  return {
    count: U("uLightCount"),
    pos: U("uLightPos"),
    colour: U("uLightColour"),
    power: U("uLightPower"),
    radius: U("uLightRadius"),
    charge: U("uLightCharge"),
  };
}

/* Scratch arrays, allocated once: uploaded per pane per frame. */
const pos = new Float32Array(MAX_LIGHTS * 3);
const colour = new Float32Array(MAX_LIGHTS * 3);
const power = new Float32Array(MAX_LIGHTS);
const radius = new Float32Array(MAX_LIGHTS);
const charge = new Float32Array(MAX_LIGHTS);

/** Upload up to MAX_LIGHTS lights; the program must be in use. */
export function uploadLights(
  gl: WebGLRenderingContext,
  loc: LightLocations,
  lights: readonly PackedLight[],
) {
  const n = Math.min(lights.length, MAX_LIGHTS);
  for (let i = 0; i < n; i++) {
    const l = lights[i]!;
    pos[i * 3] = l.x;
    pos[i * 3 + 1] = l.y;
    pos[i * 3 + 2] = l.height;
    colour[i * 3] = l.colour[0];
    colour[i * 3 + 1] = l.colour[1];
    colour[i * 3 + 2] = l.colour[2];
    power[i] = l.power;
    radius[i] = l.radius;
    charge[i] = l.charge;
  }
  gl.uniform1i(loc.count, n);
  gl.uniform3fv(loc.pos, pos);
  gl.uniform3fv(loc.colour, colour);
  gl.uniform1fv(loc.power, power);
  gl.uniform1fv(loc.radius, radius);
  gl.uniform1fv(loc.charge, charge);
}
