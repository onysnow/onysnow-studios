import type { GlassKind } from "@/effects/optics/fracture";

/**
 * Photographs of broken glass, one list per kind of break (item 10; Ony
 * supplies them). A strike uses one of its kind's photographs as the break
 * itself (effects/optics/crack-photo); a kind with none keeps the generated
 * break (effects/optics/fracture).
 *
 * What makes a good one: the glass photographed square-on, the whole break
 * in frame with unbroken glass round it, dark behind and lit from one side so
 * the cracks glow (dark cracks on a bright sky also read), sharp, 2048 px or
 * more across. Files live in public/cracks/.
 */
export const CRACK_PHOTOS: Readonly<Record<GlassKind, readonly string[]>> = {
  annealed: [],
  tempered: [],
  laminated: [],
};

/**
 * The photograph a strike uses: `?crackphoto=<url>` tries any photograph
 * (same site) before it is added to the lists; otherwise the kind's own, a
 * different one strike by strike.
 */
export function crackPhotoFor(kind: GlassKind, seed: number): string | null {
  if (typeof window !== "undefined") {
    const tried = new URLSearchParams(window.location.search).get("crackphoto");
    if (tried && tried.startsWith("/")) return tried;
  }
  const list = CRACK_PHOTOS[kind];
  if (!list.length) return null;
  return list[Math.abs(Math.floor(seed)) % list.length]!;
}
