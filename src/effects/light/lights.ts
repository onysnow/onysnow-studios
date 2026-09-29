/**
 * What lights the scene (optics plan step 3).
 *
 * Lights are a LIST. Today it holds one, the cursor's lamp, but nothing that
 * reads the light assumes there is only one of it -- the backlight (step 11)
 * and anything after it join the list rather than growing a second global.
 *
 * A light has a position in the viewport and a charge, 0 to 1: how hard it is
 * burning. The cursor lamp's charge is the shutter's (reported by whoever owns
 * the gesture, components/site/CustomCursor); its position follows the pointer.
 *
 * Positions are committed once a frame, by the scene (effects/scene/scene.ts),
 * so every pass drawing that frame sees the lamp in the same place the CSS
 * layers were written for. Pointer events only record where it is going.
 *
 * No React here; the engine stays portable to the component library.
 */

import { LAMP_POWER_PER_GAIN } from "@/effects/optics/reflection";
import { t } from "@/lib/tuning";
import { camera } from "@/effects/camera/camera";

export type LightKind =
  /** A lamp at a point: the cursor's. */
  | "point"
  /** The room's own lights, seen as the room image reflected in the glass. */
  | "environment";

/*
 * Everything about a light lives here and nowhere else (light-system design,
 * step A): where it is, how big, what colour, how strong, how hard it is
 * burning. The passes read these; none of them reads a knob for a light
 * value, and a static test (lights.test.ts) holds them to that.
 *
 * The values that come from a knob are GETTERS, so a light always reports
 * exactly what the knob says at the moment it is read -- the same numbers the
 * passes read directly before, which is why nothing on the page changed.
 */
export type Light = {
  /** A stable name, so a pass can pick a light out of the list. */
  readonly id: string;
  readonly kind: LightKind;
  /** Viewport position, CSS pixels. Off-page is -9999. */
  x: number;
  y: number;
  /** How far above the photographs, CSS pixels ("Light height"). */
  readonly height: number;
  /** Its radius, CSS pixels ("Light size"): penumbrae, glint length. */
  readonly radius: number;
  /** Its colour, linear RGB. */
  readonly colour: readonly [number, number, number];
  /** How strong it is ("Core gain" for the lamp, "Room brightness" for the room). */
  readonly gain: number;
  /** How hard it is burning, 0 to 1. */
  charge: number;
};

/** The lamp's colour: a warm white, a little under daylight. */
export const LAMP_COLOUR = [1.0, 0.94, 0.84] as const;

/** The lamp the cursor carries. First in the list, always there. */
export const cursorLamp: Light = {
  id: "cursor",
  kind: "point",
  x: -9999,
  y: -9999,
  get height() {
    return t("shadowHeight");
  },
  get radius() {
    return t("shadowSoftness");
  },
  colour: LAMP_COLOUR,
  get gain() {
    return t("coreGain");
  },
  charge: 0,
};

/**
 * The room's own lights. Its gain is "Room brightness", 1 by default (0 is
 * a dark room, the lamp the only source). It is always "burning"; its gain says how
 * much.
 */
export const roomLight: Light = {
  id: "room",
  kind: "environment",
  x: 0,
  y: 0,
  height: 0,
  radius: 0,
  colour: [1, 1, 1],
  get gain() {
    return t("roomBrightness");
  },
  charge: 1,
};

/** Every light in the scene. */
export const lights: readonly Light[] = [cursorLamp, roomLight];

/*
 * The shutter's flash, as a light (light-system design, item 16).
 *
 * A speedlight on the camera, and the camera is the viewer: it stands at the
 * eye, the camera's distance above the screen, so it lights the whole page
 * almost evenly (its falloff over a screen is gentle from that high) and
 * sits face-on to every pane. A little cooler than the lamp, as a xenon tube
 * is. It burns for one pulse -- full at once, then down with a time
 * constant of FLASH_DECAY -- and while it burns it is in the light list like
 * any other light, so the glass, the light through it and the rims all answer
 * it by the same physics as the lamp. Out of the list the rest of the time.
 */
export const FLASH_COLOUR = [0.94, 0.97, 1.0] as const;
/** Seconds for the flash to fall to 1/e. A speedlight's pulse, eased for the eye. */
export const FLASH_DECAY = 0.12;
/** How much stronger than the lamp the flash is. */
export const FLASH_GAIN = 2.5;
/** The flash head's radius, CSS px: small beside the lamp's diffuser. */
export const FLASH_RADIUS = 18;

let flashViewportWidth = 1280;
export const flashLight: Light = {
  id: "flash",
  kind: "point",
  x: -9999,
  y: -9999,
  get height() {
    return camera.distance(flashViewportWidth);
  },
  radius: FLASH_RADIUS,
  colour: FLASH_COLOUR,
  get gain() {
    return t("coreGain") * FLASH_GAIN;
  },
  charge: 0,
};

const flashWatchers = new Set<() => void>();
/** Wake a pass for every frame of the flash's pulse. */
export function onFlash(fn: () => void) {
  flashWatchers.add(fn);
  return () => flashWatchers.delete(fn);
}

let flashFrame = 0;
/**
 * Fire the flash from the camera: centred on the viewer's eye (the middle of
 * the viewport, moved by where the eye has followed the pointer).
 */
export function fireFlash(x: number, y: number, viewportWidth: number) {
  if (typeof window === "undefined") return;
  flashViewportWidth = viewportWidth;
  flashLight.x = x;
  flashLight.y = y;
  const start = performance.now();
  cancelAnimationFrame(flashFrame);
  const step = (now: number) => {
    const charge = Math.exp(-(now - start) / 1000 / FLASH_DECAY);
    flashLight.charge = charge > 0.01 ? charge : 0;
    changed();
    for (const fn of flashWatchers) fn();
    if (flashLight.charge > 0) flashFrame = requestAnimationFrame(step);
  };
  step(start);
}

/*
 * Development only: hold the flash at a strength, so a screenshot on a slow
 * renderer can see what a pulse too short to catch does. 0 puts it out.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __holdFlash?: unknown }).__holdFlash = (charge: number) => {
    cancelAnimationFrame(flashFrame);
    flashViewportWidth = document.documentElement.clientWidth || window.innerWidth;
    flashLight.x = flashViewportWidth / 2;
    flashLight.y = (document.documentElement.clientHeight || window.innerHeight) / 2;
    flashLight.charge = Math.max(0, Math.min(1, charge));
    changed();
    for (const fn of flashWatchers) fn();
  };
}

/** The lights that stand at a point: the lamp, and the flash while it burns. */
export function pointLights(): Light[] {
  const out = lights.filter((l) => l.kind === "point");
  if (flashLight.charge > 0) out.push(flashLight);
  return out;
}

/** How hard the most strongly burning point light is burning: whether to draw at all. */
export function strongestCharge(): number {
  return Math.max(cursorLamp.charge, flashLight.charge);
}

/** The lamp's radiant power, for the passes that work in real units. */
export const lampPower = (light: Light = cursorLamp) => LAMP_POWER_PER_GAIN * light.gain;

/** Where the pointer is going; committed to the lamp at the next frame. */
export const pointer = { x: -9999, y: -9999 };

/** Commit pending positions. Called by the scene at the start of its frame. */
export function commitLights() {
  cursorLamp.x = pointer.x;
  cursorLamp.y = pointer.y;
}

const changeWatchers = new Set<() => void>();
const chargeWatchers = new Set<(charge: number) => void>();

/**
 * Be told whenever any light moves or changes charge. The scene uses it to
 * schedule a frame; nothing else needs to poll.
 */
export function onLightChange(fn: () => void) {
  changeWatchers.add(fn);
  return () => changeWatchers.delete(fn);
}

function changed() {
  for (const fn of changeWatchers) fn();
}

/*
 * Who says where the lamp is.
 *
 * The lamp you see is drawn by the cursor (components/site/CustomCursor),
 * which eases toward the pointer. The scene used to light everything from the
 * raw pointer instead, so while the pointer moved the light on the glass, the
 * light under it and every lit surface ran ahead of the lamp drawn on screen
 * -- 236 px ahead, 60 ms after an 800 px move. While a drawn lamp is on the
 * page it is the lamp: raw pointer moves are ignored and it reports its own
 * position every frame it moves. Without one (no custom cursor), the pointer
 * is the lamp, as before.
 */
let drawn = 0;

/** A drawn lamp is on the page (returns the release). */
export function claimLamp(): () => void {
  drawn += 1;
  return () => {
    drawn = Math.max(0, drawn - 1);
  };
}

/** The pointer moved (or left the page, at -9999). */
export function movePointer(x: number, y: number) {
  // Leaving the page always takes the lamp away; moving is the drawn lamp's.
  if (drawn > 0 && x > -9999) return;
  setLamp(x, y);
}

/** Where the lamp is: the drawn lamp's position, each frame it moves. */
export function moveLamp(x: number, y: number) {
  setLamp(x, y);
}

function setLamp(x: number, y: number) {
  if (pointer.x === x && pointer.y === y) return;
  pointer.x = x;
  pointer.y = y;
  changed();
}

/**
 * Called by whoever owns the shutter gesture.
 *
 * Guarded on a real change so the cursor's own rAF loop, which reports every
 * frame whether or not the number moved, does not keep a second loop alive
 * against a resting page. The charge decays on its own after the pointer
 * stops, so without the wake-up the cast shadows would freeze at whatever
 * the last move left them at.
 */
export function reportCharge(charge: number) {
  const moved = Math.abs(charge - cursorLamp.charge) > 0.003;
  cursorLamp.charge = charge;
  if (!moved) return;
  changed();
  for (const fn of chargeWatchers) fn(charge);
}

/**
 * Watch the cursor lamp's charge. The shutter overlay uses it to start
 * photographing the page while the gesture is still winding, which is the
 * only way its afterimage can be ready at the instant the thing fires.
 */
export function onCharge(fn: (charge: number) => void) {
  chargeWatchers.add(fn);
  return () => chargeWatchers.delete(fn);
}

/**
 * The old name for the cursor lamp, kept so passes that read `lightState`
 * read the same object.
 */
export const lightState = cursorLamp;
