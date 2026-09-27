import { describe, expect, it } from "vitest";
import {
  commitLights,
  cursorLamp,
  lightState,
  lights,
  movePointer,
  onCharge,
  onLightChange,
  reportCharge,
} from "./lights";

/** Optics plan step 3: the lights are a list, the cursor lamp first. */
describe("the lights", () => {
  it("are a list, and the cursor lamp is first", () => {
    expect(lights[0]).toBe(cursorLamp);
    expect(cursorLamp.id).toBe("cursor");
    // The old name reads the same lamp.
    expect(lightState).toBe(cursorLamp);
  });

  it("move when the frame commits them, not when the pointer moves", () => {
    movePointer(120, 340);
    expect(cursorLamp.x).not.toBe(120);
    commitLights();
    expect([cursorLamp.x, cursorLamp.y]).toEqual([120, 340]);
  });

  it("say when they change, so the scene can wake", () => {
    let woke = 0;
    const stop = onLightChange(() => (woke += 1));
    movePointer(10, 10);
    reportCharge(0.5);
    stop();
    movePointer(20, 20);
    expect(woke).toBe(2);
  });

  it("report the charge only when it really moved", () => {
    const seen: number[] = [];
    const stop = onCharge((c) => seen.push(c));
    reportCharge(0.2);
    reportCharge(0.201); // below the threshold: the cursor's own loop reporting the same value
    reportCharge(0.4);
    stop();
    expect(seen).toEqual([0.2, 0.4]);
  });
});
