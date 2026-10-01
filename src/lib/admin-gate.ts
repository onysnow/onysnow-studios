/**
 * Only Ony sees the experimental and admin parts of the site (item 48; Ony,
 * 2026-10-01: "The only person who should be able to see the lab and
 * everything else experimental or admin stuff ... locked unless I am signed
 * in").
 *
 * What is locked:
 *   the lab and Lab samples      their routes check the session and the admin
 *                                seat before they load (requireAdmin);
 *   every ?try= preview and the  off for everyone else (experimentsAllowed):
 *   other test switches          ?quality=, ?crackphoto=, ?perf, ?laser=;
 *   the admin portal             already behind sign-in and the admin seat
 *                                (routes/_authenticated, admin.tsx).
 *
 * The switches are read the moment a page starts, before the sign-in has
 * been checked, so they go by a note this browser keeps of the admin who
 * signed in here. The note is checked against the real session on every
 * page (verifyAdminNote, from the root): a note that does not match a
 * signed-in admin is wiped and the page reloaded without the switches, and
 * a signed-in admin without a note gets one, the page reloading with them.
 * Writing the note by hand shows nothing that is not already in the page's
 * own code, and only until the check runs; the database is guarded by its
 * own policies whatever this says.
 *
 * On a developer's own machine (the dev server, at localhost) everything is
 * open, so the tests and the rigs need no account.
 */

import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const NOTE = "onysnow:admin";

/** The query switches that show unreleased work. */
export const EXPERIMENT_PARAMS = ["try", "quality", "crackphoto", "perf", "laser"] as const;

/** The dev server on this machine: open, for development and tests. */
export function isLocalDev(
  dev: boolean = Boolean(import.meta.env?.DEV),
  host: string = typeof window === "undefined" ? "" : window.location.hostname,
): boolean {
  return dev && (host === "localhost" || host === "127.0.0.1" || host === "[::1]");
}

function readNote(): string | null {
  try {
    return window.localStorage.getItem(NOTE);
  } catch {
    return null;
  }
}

function writeNote(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(NOTE, userId);
    else window.localStorage.removeItem(NOTE);
  } catch {
    /* no storage: the switches stay off, which is the safe side */
  }
}

/** Whether this page may show previews and test switches. */
export function experimentsAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (isLocalDev()) return true;
  return readNote() !== null;
}

/** Whether an address asks for anything experimental. */
export function asksForExperiments(search: string): boolean {
  try {
    const q = new URLSearchParams(search);
    return EXPERIMENT_PARAMS.some((p) => q.has(p));
  } catch {
    return false;
  }
}

/** Who is signed in here, and whether they hold the admin seat. */
export async function adminStatus(): Promise<{ userId: string | null; isAdmin: boolean }> {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user) return { userId: null, isAdmin: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: status } = await (supabase as any).rpc("bootstrap_current_user");
  return { userId: user.id, isAdmin: Boolean(status?.is_admin) };
}

/** Keep the note in step with what the session says (from useAdminStatus and the root). */
export function noteAdmin(userId: string | null, isAdmin: boolean) {
  if (typeof window === "undefined") return;
  writeNote(isAdmin ? userId : null);
}

/**
 * The note, checked against the real session: put right if it is wrong, and
 * the page reloaded if that changes what an experimental address shows.
 */
export async function verifyAdminNote() {
  if (typeof window === "undefined" || isLocalDev()) return;
  const before = readNote();
  let status: { userId: string | null; isAdmin: boolean };
  try {
    status = await adminStatus();
  } catch {
    // Could not ask: keep the switches off rather than guess.
    status = { userId: null, isAdmin: false };
  }
  const after = status.isAdmin ? status.userId : null;
  if (after === before) return;
  writeNote(after);
  if (asksForExperiments(window.location.search)) window.location.reload();
}

/** For a route: in only as the signed-in admin (or on the dev server), else to sign-in. */
export async function requireAdmin() {
  if (isLocalDev()) return;
  const status = await adminStatus();
  noteAdmin(status.userId, status.isAdmin);
  if (!status.userId) throw redirect({ to: "/auth" });
  if (!status.isAdmin) throw redirect({ to: "/" });
}
