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
import { lampMode, onToolChange } from "@/effects/tools/held";
import { flareFlickerAt } from "./flame";

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
  /**
   * How much of what it gives off is ultraviolet, 0 to 1 (item 20). UV is
   * invisible: it lights nothing you can see directly, but what fluoresces
   * turns it into visible light -- finger oils and dust on the glass,
   * optical brighteners in paper, fluorescent orange plastic.
   */
  readonly uv: number;
  /**
   * For a line light (a neon tube), half its length as a vector from its
   * centre (x, y). Points have none. The passes light each point from the
   * nearest point on the line.
   */
  readonly span?: readonly [number, number] | undefined;
};

/** The lamp's colour: a warm white, a little under daylight. */
export const LAMP_COLOUR = [1.0, 0.94, 0.84] as const;

/**
 * A black light's visible leak (?try=blacklight). A 365 nm lamp's output
 * tails off before 400 nm, leaving only a dull bluish-white glow -- a few
 * per cent of a lamp -- which is why what fluoresces reads so clearly under
 * it; a 395 nm torch's strong violet washes faint glows out
 * (claude/tools-research.md). Everything else it gives off is UV (Light.uv).
 */
export const BLACKLIGHT_VISIBLE = [0.07, 0.07, 0.11] as const;

/** The shutter's charge as reported, before the hand decides whether the lamp is in it. */
let windCharge = 0;

/**
 * The lamp the cursor carries. First in the list, always there -- but lit
 * only while it is in the hand (effects/tools/held): put down for the flare
 * or the laser, it gives no light however the shutter is wound; held as the
 * black light, its visible light is the dull leak and the rest is UV.
 */
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
  get colour() {
    return lampMode() === "uv" ? BLACKLIGHT_VISIBLE : LAMP_COLOUR;
  },
  get gain() {
    return t("coreGain");
  },
  get charge() {
    return lampMode() === null ? 0 : windCharge;
  },
  set charge(value: number) {
    windCharge = value;
  },
  get uv() {
    return lampMode() === "uv" ? 1 : 0;
  },
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
  uv: 0,
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
  uv: 0,
};

const flashWatchers = new Set<() => void>();
/** Wake a pass for every frame of the flash's pulse (and of the flare's flicker). */
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

/*
 * A road flare (item 22, ?try=flare), held where the lamp is.
 *
 * Burning strontium nitrate: a deep red, a small fierce source (sharp
 * shadows), always burning while it is held -- not wound up like the lamp --
 * and never steady: it puffs, wobbles and sputters (effects/light/flame).
 * The flame wanders a couple of pixels. It is in the light list like the flash, so the
 * glass, the light through it and the rims answer it by the same physics.
 */
export const FLARE_COLOUR = [1.0, 0.2, 0.09] as const;
/** The flame's size, CSS px: small beside the lamp's diffuser, so its shadows are sharp. */
export const FLARE_RADIUS = 10;
/** How much stronger than the lamp a flare burns at its steady level. */
export const FLARE_GAIN = 1.3;

let flareFlicker = 1;
export const flareLight: Light = {
  id: "flare",
  kind: "point",
  x: -9999,
  y: -9999,
  get height() {
    return t("shadowHeight");
  },
  radius: FLARE_RADIUS,
  colour: FLARE_COLOUR,
  get gain() {
    return t("coreGain") * FLARE_GAIN * flareFlicker;
  },
  charge: 0,
  uv: 0,
};

// How the flame burns over time is effects/light/flame's.
export { flareFlickerAt, sputterAt } from "./flame";

let flareFrame = 0;
/**
 * Light the flare (returns the put-out). It follows the lamp's position and
 * redraws the passes as it flickers, a frame at a time, while it is held.
 */
export function lightFlare(): () => void {
  if (typeof window === "undefined") return () => {};
  const start = performance.now();
  let last = 0;
  const step = (now: number) => {
    flareFrame = requestAnimationFrame(step);
    // The flame's own rate is what matters, not the display's: 30 a second.
    if (now - last < 33) return;
    last = now;
    const s = (now - start) / 1000;
    const held = pointer.x > -9999;
    flareFlicker = flareFlickerAt(s);
    flareLight.charge = held ? 1 : 0;
    flareLight.x = pointer.x + 1.6 * Math.sin(s * 11.3);
    flareLight.y = pointer.y + 1.6 * Math.sin(s * 9.1 + 0.7);
    changed();
    for (const fn of flashWatchers) fn();
  };
  flareFrame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(flareFrame);
    flareLight.charge = 0;
    changed();
  };
}

/*
 * A laser pointer's colours (item 25d, ?try=laser&laser=red|green|violet).
 *
 * A laser diode's light is one wavelength -- as saturated a colour as light
 * gets. Its beam runs across the page in the plane of the glass
 * (components/site/LaserBeam, effects/optics/beam); the spots where it
 * strikes a surface are emitters.
 */
export const LASER_COLOURS = {
  red: [1.0, 0.04, 0.03],
  green: [0.18, 1.0, 0.08],
  violet: [0.42, 0.08, 1.0],
  // A white (supercontinuum) laser: every wavelength at once, so a prism fans it into a spectrum.
  white: [1.0, 1.0, 1.0],
} as const;
/** Each laser's wavelength, nm: a red diode, a frequency-doubled green, a violet diode. */
export const LASER_WAVELENGTH = { red: 650, green: 532, violet: 405, white: 560 } as const;
export type LaserColour = keyof typeof LASER_COLOURS;
/** How brightly the flare is burning this moment, for what draws its flame. */
export function flareBrightness(): number {
  return flareLight.charge * flareFlicker;
}

/*
 * Emitters: lights that belong to something ON the page rather than to the
 * viewer -- a neon sign (item 23) -- and stand where it stands. A component
 * adds one while it is mounted, moves it with its element and sets its charge
 * as it burns; the passes take it with the rest of the list.
 */
const emitters = new Set<Light>();

/** An emitter: a light with a level, how hard it is burning this moment (0 to 1). */
export type Emitter = Light & { level: number };

/**
 * Make an emitter: a light of the given colour, `share` of the lamp's
 * strength at full, at `height` above what it lights, sized by `radius`.
 * Its strength follows the lamp's own knob, here, so nothing outside this
 * module reads a light knob.
 */
export function makeEmitter(
  id: string,
  colour: readonly [number, number, number],
  height: number | (() => number),
  radius: () => number,
  share = 0.8,
  span?: () => readonly [number, number],
): Emitter {
  return {
    get span() {
      return span?.();
    },
    id,
    kind: "point",
    x: -9999,
    y: -9999,
    get height() {
      return typeof height === "number" ? height : height();
    },
    get radius() {
      return radius();
    },
    colour,
    get gain() {
      return t("coreGain") * share * this.level;
    },
    charge: 0,
    uv: 0,
    level: 1,
  };
}

/** Add an emitter to the scene (returns the removal). */
export function addEmitter(light: Light): () => void {
  emitters.add(light);
  emitterChanged();
  return () => {
    emitters.delete(light);
    emitterChanged();
  };
}

/** An emitter moved or changed how hard it burns: relight the passes. */
export function emitterChanged() {
  changed();
  for (const fn of flashWatchers) fn();
}

/** The lights that stand at a point: the lamp, the flash and the flare while they burn, and the emitters. */
export function pointLights(): Light[] {
  const out = lights.filter((l) => l.kind === "point");
  if (flashLight.charge > 0) out.push(flashLight);
  if (flareLight.charge > 0) out.push(flareLight);
  for (const e of emitters) if (e.charge > 0) out.push(e);
  return out;
}

/** How hard the most strongly burning point light is burning: whether to draw at all. */
export function strongestCharge(): number {
  let strongest = Math.max(cursorLamp.charge, flashLight.charge, flareLight.charge);
  for (const e of emitters) strongest = Math.max(strongest, e.charge);
  return strongest;
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

// Picking up another tool changes the lamp: relight everything.
onToolChange(() => {
  changed();
  for (const fn of flashWatchers) fn();
});

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
  const moved = Math.abs(charge - windCharge) > 0.003;
  windCharge = charge;
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
