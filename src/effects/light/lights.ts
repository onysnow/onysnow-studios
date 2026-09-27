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

export type Light = {
  /** A stable name, so a pass can pick a light out of the list. */
  id: string;
  /** Viewport position, CSS pixels. Off-page is -9999. */
  x: number;
  y: number;
  /** How hard it is burning, 0 to 1. */
  charge: number;
};

/** The lamp the cursor carries. First in the list, always there. */
export const cursorLamp: Light = { id: "cursor", x: -9999, y: -9999, charge: 0 };

/** Every light in the scene. */
export const lights: readonly Light[] = [cursorLamp];

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

/** The pointer moved (or left the page, at -9999). */
export function movePointer(x: number, y: number) {
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
