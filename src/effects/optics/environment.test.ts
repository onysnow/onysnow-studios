import { describe, expect, it } from "vitest";
import {
  CAMERA_DISTANCE,
  decodeRadiance,
  encodeRadiance,
  ROOM_LMAX,
  roomLod,
  roomMipChain,
  roomUv,
} from "./environment";
import { ENVIRONMENT_GLSL } from "./environment.glsl";
import { GLASS_LIGHT_FRAGMENT_SHADER } from "@/lib/glass-light-shader";
import { roomScript } from "@/lib/rooms";
import { tuning } from "@/lib/tuning";
import { FLOAT_GLASS, frontRoughness } from "@/effects/materials/presets";
import { POLISHED_ROUGHNESS } from "./reflection";

/**
 * The room the glass reflects: real brightness in, 4% (Fresnel) out, in the
 * glass shader in both modes. See environment.ts.
 */

describe("the room's encoding keeps real brightness", () => {
  it("round-trips radiance, lamps included, to within one 8-bit step", () => {
    for (const l of [0, 0.003, 0.18, 1, 5, 24, 64]) {
      const byte = Math.round(encodeRadiance(l) * 255) / 255;
      const back = decodeRadiance(byte);
      expect(Math.abs(back - l)).toBeLessThanOrEqual(Math.max(0.02 * l, 0.01));
    }
  });

  it("clips only above ROOM_LMAX, where 4% is already past white", () => {
    expect(encodeRadiance(ROOM_LMAX * 10)).toBe(1);
    expect(ROOM_LMAX * 0.042).toBeGreaterThan(1);
  });

  it("filters its mip levels in linear light, so a blurred lamp keeps its energy", () => {
    // One lamp texel at 64, the rest black, 4x4.
    const w = 4;
    const h = 4;
    const rgb = new Uint8Array(w * h * 3);
    rgb.fill(Math.round(encodeRadiance(64) * 255), 0, 3);
    const levels = roomMipChain(rgb, w, h);
    expect(levels.map((l) => `${l.width}x${l.height}`)).toEqual(["4x4", "2x2", "1x1"]);
    const top = levels[2]!;
    // The average of one 64 and fifteen zeros is 4 -- not the average of the codes.
    expect(decodeRadiance(top.data[0]! / 255)).toBeCloseTo(4, 0);
  });
});

describe("where a pane reflects", () => {
  const D = 1536;

  it("the middle of the screen reflects straight behind the viewer, at eye level", () => {
    const [u, v] = roomUv(0, 0, D);
    expect(u).toBeCloseTo(0.5, 10);
    // Eye level is row 0.5 of the original, inside the kept band.
    expect(v).toBeCloseTo((0.5 - 0.215) / (0.755 - 0.215), 10);
  });

  it("is mirrored: a point to the right shows what is on the viewer's right, left in the room image", () => {
    expect(roomUv(400, 0, D)[0]).toBeLessThan(0.5);
    expect(roomUv(-400, 0, D)[0]).toBeGreaterThan(0.5);
  });

  it("a pane above eye level shows more ceiling", () => {
    expect(roomUv(0, -300, D)[1]).toBeLessThan(roomUv(0, 300, D)[1]);
  });

  it("a rougher face samples a blurrier level", () => {
    expect(roomLod(0.6, 2048)).toBeGreaterThan(roomLod(0.02, 2048));
  });

  it("the camera sits about arm's length from the screen", () => {
    expect(CAMERA_DISTANCE).toBeGreaterThan(0.8);
    expect(CAMERA_DISTANCE).toBeLessThan(2);
  });
});

describe("the reflection is worked out from causes", () => {
  it("frosted float glass is frosted on the back, so its face reflects sharply", () => {
    expect(frontRoughness(FLOAT_GLASS, 0.6)).toBe(POLISHED_ROUGHNESS);
  });

  it("has no strength, zoom or parallax setting; the room's brightness is the cause", () => {
    for (const gone of [
      "reflectionBase",
      "reflectionLit",
      "reflectionZoom",
      "reflectionThrowX",
      "reflectionThrowY",
    ]) {
      expect(tuning[gone]).toBeUndefined();
    }
    // The room's own lights are off by default: the lamp is the only source.
    expect(tuning["roomBrightness"]?.value).toBe(0);
  });

  it("puts nothing on the edge at rest in a dark room, and keeps the lamp's share local", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    // The resting edge is the room, reflected: no room light, no edge.
    expect(src).toMatch(/restEdge = bevel \* bevel \* uRestEdge \* uRoomExposure/);
    // The lamp's share of the edge highlight falls off with the lamp's reach.
    expect(src).toContain("bevel * lit * reach");
    // Piped light is scattered back out by the frost as it goes, and spreads.
    expect(src).toMatch(/exp\(-dl \/ escapeLength\)/);
  });

  it("is drawn in the glass shader, from Fresnel, ungated by the lamp", () => {
    const src = GLASS_LIGHT_FRAGMENT_SHADER;
    expect(src.split(ENVIRONMENT_GLSL).length - 1).toBe(1);
    expect(src).toContain("fresnelSchlick(cosView, uIor)");
    expect(src).toMatch(/colour \+= inside \* reflectance \* room \* uRoomExposure \* uHasRoom;/);
  });

  it("the head script publishes the HDR room at the same index as the room", () => {
    const script = roomScript();
    expect(script).toContain("/rooms-hdr/metro.jpg");
    expect(script).toContain('setAttribute("data-room-hdr"');
  });

  it("the chunk has no backtick to end its literal early", () => {
    expect(ENVIRONMENT_GLSL).not.toContain("`");
  });
});
