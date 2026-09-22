/**
 * Photograph URLs.
 *
 * The "photos" bucket is public, so images are served straight from Supabase
 * Storage's public endpoint — no proxy, no per-request signing, and the CDN in
 * front of it can cache them properly.
 */

const BASE = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined)?.replace(/\/+$/, "") ?? "";

/** The widths we generate at upload time. Keep in sync with lib/image-upload.ts. */
export const VARIANT_WIDTHS = [640, 1280, 2560] as const;

/** Stable public URL for a stored object. */
export function photoUrl(storagePath: string | null | undefined): string {
  if (!storagePath || !BASE) return "";
  const clean = storagePath.replace(/^\/+/, "");
  const encoded = clean.split("/").map(encodeURIComponent).join("/");
  return `${BASE}/storage/v1/object/public/photos/${encoded}`;
}

/** Map of rendered width → storage path, as stored on `photos.sources`. */
export type PhotoSources = Record<string, string>;

/**
 * Build a `srcset` from the stored variants. Falls back to the single original
 * for photographs uploaded before responsive variants existed, so older rows
 * keep working rather than breaking.
 */
export function photoSrcSet(
  storagePath: string | null | undefined,
  sources: PhotoSources | null | undefined,
  intrinsicWidth?: number | null,
): string | undefined {
  const entries = Object.entries(sources ?? {})
    .map(([w, path]) => [Number(w), path] as const)
    .filter(([w, path]) => Number.isFinite(w) && w > 0 && typeof path === "string" && path.length > 0)
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) return undefined;

  const parts = entries.map(([w, path]) => `${photoUrl(path)} ${w}w`);

  // Include the original as the largest candidate when it is genuinely bigger.
  const widest = entries[entries.length - 1]![0];
  if (intrinsicWidth && intrinsicWidth > widest && storagePath) {
    parts.push(`${photoUrl(storagePath)} ${intrinsicWidth}w`);
  }
  return parts.join(", ");
}
