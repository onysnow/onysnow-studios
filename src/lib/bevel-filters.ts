import { bevelField } from "./bevel-map";

/**
 * One displacement map per pane geometry, shared by every pane that matches.
 *
 * The map used to be a single baked PNG stretched over every pane, so a bar
 * 64px tall and a band 400px tall were bent by the same profile. Computing it
 * means the bevel is the same physical depth everywhere regardless of how tall
 * the pane is -- which is the point of a bevel -- but it also means the map
 * depends on the pane's size and corner radius, and therefore so does the
 * filter that references it.
 *
 * Geometry is rounded into buckets before it becomes a key. Panes on this site
 * are full-width bands that all resize together, so without bucketing every
 * pixel of a window drag would mint a new map; with it, the whole page usually
 * shares two.
 */

/** The map is smooth, so it can be computed small and stretched back up. */
const MAX_EDGE = 320;

/** How deep the rounded-over edge is, in CSS pixels. */
export const BEVEL_DEPTH = 26;

export type PaneGeometry = { width: number; height: number; radius: number };

export type BevelEntry = { id: string; href: string };

const cache = new Map<string, BevelEntry>();
const listeners = new Set<() => void>();
let snapshot: BevelEntry[] = [];

/** Round to a bucket so a resize drag doesn't mint a map per pixel. */
function bucket(n: number): number {
  return Math.max(1, Math.round(n / 16) * 16);
}

function keyFor(g: PaneGeometry): string {
  return `${bucket(g.width)}x${bucket(g.height)}r${Math.round(g.radius)}`;
}

function encode(width: number, height: number, radius: number): string | null {
  if (typeof document === "undefined") return null;

  // Uniform downscale: the bevel has to stay in proportion when the map is
  // stretched back over the pane, so both axes take the same factor.
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));

  const field = bevelField(w, h, radius * scale, BEVEL_DEPTH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // `ImageData` wants a view over a plain ArrayBuffer; the field allocates its
  // own, so hand over a fresh view rather than the typed array itself.
  const image = ctx.createImageData(w, h);
  image.data.set(field.data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Ask for the filter matching this geometry, creating it if it is new.
 *
 * Returns the filter's id, or null before the map can be built (during SSR, or
 * if a canvas is unavailable) so the caller can leave the CSS fallback alone.
 */
export function requestBevelFilter(g: PaneGeometry): string | null {
  if (g.width < 8 || g.height < 8) return null;

  const key = keyFor(g);
  const existing = cache.get(key);
  if (existing) return existing.id;

  const href = encode(bucket(g.width), bucket(g.height), g.radius);
  if (!href) return null;

  const entry: BevelEntry = { id: `glass-bevel-${key}`, href };
  cache.set(key, entry);
  snapshot = [...cache.values()];
  for (const notify of listeners) notify();
  return entry.id;
}

export function subscribeBevelFilters(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function bevelFilterSnapshot(): BevelEntry[] {
  return snapshot;
}
