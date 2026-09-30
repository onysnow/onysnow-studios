/**
 * Secret 2: the red room (item 39, claude/site-ideas.md; ?try=redroom).
 *
 * Fire the shutter at a photograph -- wind it and click a picture -- and
 * the page becomes a darkroom. The only light is the safelight: a deep red
 * that photographic paper cannot see (it is blind past about 590 nm, which
 * is why a darkroom can be lit at all). Everything shows as a negative in
 * that red, the way a print looks in the developer before it is fixed, and
 * the cursor becomes a loupe that shows the true frame under it.
 *
 * This module is the state: whether the room is on, and whether it has
 * ever been found (kept in the browser -- the secrets are for their own
 * sake, so nothing needs enforcing on a server). No React here.
 */

/**
 * The safelight's colour, linear RGB: a red filter over a lamp (a Kodak
 * No. 1A or an LED at about 630 nm) -- nearly all red, a trace of orange.
 */
export const SAFELIGHT_COLOUR = [1.0, 0.1, 0.03] as const;

const FOUND_KEY = "onysnow:secret-redroom";

let active = false;
const watchers = new Set<(on: boolean) => void>();

/** Whether the room is lit by the safelight now. */
export function redRoomOn(): boolean {
  return active;
}

/** Whether this browser has found the room before. */
export function redRoomFound(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function set(on: boolean) {
  if (active === on) return;
  active = on;
  if (typeof document !== "undefined")
    document.documentElement.toggleAttribute("data-red-room", on);
  for (const fn of watchers) fn(on);
}

/** Into the darkroom: the room is found. */
export function enterRedRoom() {
  try {
    localStorage.setItem(FOUND_KEY, "1");
  } catch {
    /* found, but not remembered */
  }
  set(true);
}

/** Lights on: back to the page. */
export function leaveRedRoom() {
  set(false);
}

/** Watch the room (returns the unwatch). */
export function onRedRoom(fn: (on: boolean) => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}
