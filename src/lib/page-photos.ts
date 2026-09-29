import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PHOTO_COLS, type Photo } from "@/lib/content";

/**
 * Page photos: which photograph goes in each spot on a page, and what to keep
 * in frame there.
 *
 * The pattern every established content manager uses (Sanity image fields,
 * Payload upload fields, Storyblok asset fields, the WordPress Cover block):
 * one media library -- the Photos page -- and on each page named image fields
 * that reference a photograph from it, each with its own focal point. See the
 * project doc claude/page-photos-design.md.
 *
 * The SPOTS are declared here, in code, because only the code knows which
 * elements a page has; a new spot appears in the Studio the moment it is
 * added below, no SQL. The database (public.page_photos) stores only the
 * choices. A spot with no choice falls back to what the site did before this
 * existed, so an empty table, or no table at all, changes nothing.
 */

/** A point to keep in frame, 0..1 each way from the photograph's top-left. */
export type Focus = { x: number; y: number };

/** One shape a spot is drawn at, for the Studio's crop previews. */
export type SlotPreview = { label: string; aspect: number };

export type PhotoSlot = {
  key: string;
  page: string;
  label: string;
  /** Where it shows, in a line, for someone looking at the Studio. */
  where: string;
  /**
   * The shapes the picture's box is, measured at 1440x900 and 390x844 (width
   * over height). A frame scrolls with parallax in a box 128% of its section,
   * so its preview is that box's shape.
   */
  previews: readonly SlotPreview[];
  /** What the spot shows when nothing is chosen: the site's old rule. */
  fallback: (photos: readonly Photo[], hero: Photo | undefined) => Photo | undefined;
};

export const PAGES: Record<string, string> = { home: "Home" };

export const PHOTO_SLOTS: readonly PhotoSlot[] = [
  {
    key: "home.hero",
    page: "home",
    label: "Hero",
    where: "The full-screen photograph at the very top of the home page, behind the title.",
    previews: [
      { label: "Desktop", aspect: 1.44 },
      { label: "Phone", aspect: 0.4 },
    ],
    // The old star, then the first photograph in the library.
    fallback: (photos) => photos.find((p) => p.featured) ?? photos[0],
  },
  {
    key: "home.frame-1",
    page: "home",
    label: "Full-bleed frame 1",
    where: "Under the first glass band, after “What I do”.",
    previews: [
      { label: "Desktop", aspect: 1.13 },
      { label: "Phone", aspect: 0.26 },
    ],
    fallback: (photos, hero) => photos[6] ?? photos[2] ?? hero,
  },
  {
    key: "home.frame-2",
    page: "home",
    label: "Full-bleed frame 2",
    where: "Under the second glass band, after the categories.",
    previews: [
      { label: "Desktop", aspect: 1.1 },
      { label: "Phone", aspect: 0.26 },
    ],
    fallback: (photos, hero) => photos[7] ?? photos[3] ?? hero,
  },
  {
    key: "home.frame-3",
    page: "home",
    label: "Full-bleed frame 3",
    where: "Under the third glass band, lower down the page.",
    previews: [
      { label: "Desktop", aspect: 1.25 },
      { label: "Phone", aspect: 0.36 },
    ],
    fallback: (photos, hero) => photos[8] ?? photos[5] ?? hero,
  },
  {
    key: "home.philosophy",
    page: "home",
    label: "Philosophy scene",
    where: "Behind the philosophy quote near the bottom of the home page, dimmed.",
    previews: [
      { label: "Desktop", aspect: 0.99 },
      { label: "Phone", aspect: 0.26 },
    ],
    fallback: (photos, hero) => photos[2] ?? photos[1] ?? hero,
  },
];

export const slotByKey = (key: string) => PHOTO_SLOTS.find((s) => s.key === key);

/** One choice, as stored: the photograph comes joined in (null if unpublished or deleted). */
export type PagePhotoRow = {
  key: string;
  photo_id: string | null;
  focus_x: number | null;
  focus_y: number | null;
  photo: Photo | null;
};

/*
 * page_photos is newer than the generated database types, so it is reached
 * through a loosened client rather than regenerating them from here.
 */
type Loose = {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;
  };
};

/** The table does not exist yet: the SQL has not been run. */
export function isMissingTable(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (/page_photos/.test(error.message) && /(does not exist|could not find)/i.test(error.message))
  );
}

export async function fetchPagePhotos(): Promise<{ rows: PagePhotoRow[]; missing: boolean }> {
  const { data, error } = await (supabase as unknown as Loose)
    .from("page_photos")
    .select(`key,photo_id,focus_x,focus_y,photo:photos(${PHOTO_COLS})`);
  if (isMissingTable(error)) return { rows: [], missing: true };
  if (error) throw error;
  return { rows: (data as PagePhotoRow[] | null) ?? [], missing: false };
}

/**
 * Every choice, for the public site. Never throws: a spot the site cannot
 * read is simply automatic, which is what it was before.
 */
export const pagePhotosQuery = queryOptions({
  queryKey: ["page_photos"],
  staleTime: 60_000,
  queryFn: async (): Promise<PagePhotoRow[]> => {
    try {
      return (await fetchPagePhotos()).rows;
    } catch {
      return [];
    }
  },
});

/** The same, for the Studio, which needs to know whether the table exists. */
export const adminPagePhotosQuery = queryOptions({
  queryKey: ["admin", "page_photos"],
  queryFn: fetchPagePhotos,
});

export type ResolvedPhoto = {
  photo: Photo | undefined;
  /** The chosen focal point, or null: the site's own framing stands. */
  focus: Focus | null;
  /** True when this spot's photograph was chosen rather than automatic. */
  chosen: boolean;
};

const focusOf = (row: PagePhotoRow | undefined): Focus | null =>
  row && row.focus_x != null && row.focus_y != null ? { x: row.focus_x, y: row.focus_y } : null;

/**
 * What a spot shows: its chosen photograph with its focal point, or, if none
 * is chosen (or the one chosen has since been unpublished or deleted), the
 * old rule's photograph.
 */
export function resolveSlot(
  key: string,
  rows: readonly PagePhotoRow[] | undefined,
  photos: readonly Photo[] | undefined,
): ResolvedPhoto {
  const row = rows?.find((r) => r.key === key);
  if (row?.photo) return { photo: row.photo, focus: focusOf(row), chosen: true };
  const slot = slotByKey(key);
  const list = photos ?? [];
  const hero = key === "home.hero" ? undefined : resolveSlot("home.hero", rows, photos).photo;
  // A focal point set on a spot whose photograph was later removed belonged
  // to that photograph, not to whatever the fallback now shows.
  return { photo: slot?.fallback(list, hero), focus: null, chosen: false };
}

/** Where each photograph is used, for the Photos page: photo id -> spot labels. */
export function usage(rows: readonly PagePhotoRow[] | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const slot = slotByKey(row.key);
    if (!row.photo_id || !slot) continue;
    const label = `${PAGES[slot.page] ?? slot.page} — ${slot.label}`;
    out.set(row.photo_id, [...(out.get(row.photo_id) ?? []), label]);
  }
  return out;
}

type LooseWrite = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    delete: () => {
      eq: (col: string, value: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};
const writer = () => supabase as unknown as LooseWrite;

/**
 * Choose a photograph for a spot, or move its focal point.
 *
 * Choosing a different photograph clears the focal point: it was a point on
 * the old photograph, and means nothing on the new one.
 */
export async function setPagePhoto(
  key: string,
  values: { photo_id: string; focus: Focus | null },
): Promise<void> {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const { error } = await writer()
    .from("page_photos")
    .upsert(
      {
        key,
        photo_id: values.photo_id,
        focus_x: values.focus ? clamp(values.focus.x) : null,
        focus_y: values.focus ? clamp(values.focus.y) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) throw error;
}

/** Back to automatic: the spot shows what it did before anything was chosen. */
export async function clearPagePhoto(key: string): Promise<void> {
  const { error } = await writer().from("page_photos").delete().eq("key", key);
  if (error) throw error;
}
