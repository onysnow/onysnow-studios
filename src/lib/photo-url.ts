/** Stable public URL for a photograph stored in the "photos" bucket. */
export function photoUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return "";
  const clean = storagePath.replace(/^\/+/, "");
  return `/api/public/photo/${clean.split("/").map(encodeURIComponent).join("/")}`;
}
