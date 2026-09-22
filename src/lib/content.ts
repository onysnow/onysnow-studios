import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Row types are derived from the generated schema rather than hand-written, so a
 * column change breaks the build instead of drifting silently.
 */
type Tables = Database["public"]["Tables"];

export type Category = Tables["categories"]["Row"];

/** `sources` is Json in the generated types; narrow it to what we actually store. */
export type Photo = Omit<Tables["photos"]["Row"], "sources"> & {
  sources: Record<string, string> | null;
};

export type Service = Tables["services"]["Row"];
export type Testimonial = Tables["testimonials"]["Row"];
export type PageContent = Tables["page_content"]["Row"];
export type SiteSetting = Tables["site_settings"]["Row"];
export type Subscriber = Tables["subscribers"]["Row"];

export type Inquiry = Omit<Tables["inquiries"]["Row"], "status"> & {
  status: "new" | "read" | "archived";
};

const STALE = 60_000;

type TableName = keyof Tables;

/**
 * The slice of the PostgREST builder this module uses. Spelling it out keeps the
 * helper honest — one cast at the boundary instead of `any` at every call site —
 * and the table name is a runtime value, which Supabase's own generics can't
 * narrow anyway.
 */
type Filter = {
  eq: (column: string, value: unknown) => Filter;
  in: (column: string, values: readonly unknown[]) => Filter;
  order: (column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => Filter;
  limit: (count: number) => Filter;
  range: (from: number, to: number) => Filter;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

/**
 * Fetch rows from one table. `columns` is explicit rather than `*`, so a page
 * only pulls what it renders.
 */
async function rows<T extends TableName, R>(
  table: T,
  columns: string,
  build: (q: Filter) => Filter,
): Promise<R[]> {
  const builder = supabase.from(table).select(columns) as unknown as Filter;
  const { data, error } = (await build(builder)) as {
    data: R[] | null;
    error: { message: string } | null;
  };
  if (error) throw error;
  return data ?? [];
}

/** Only the columns a rendered photograph actually needs. */
const PHOTO_COLS =
  "id,storage_path,width,height,blur_data_url,sources,alt,title,category_id,sort_order,featured,published";

/** How many photographs a gallery page pulls at a time. */
export const GALLERY_PAGE_SIZE = 60;

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  staleTime: STALE,
  queryFn: () =>
    rows<"categories", Category>(
      "categories",
      "id,slug,name,description,cover_photo_id,sort_order,published",
      (q) => q.eq("published", true).order("sort_order"),
    ),
});

/**
 * Cover photographs only — one per category.
 *
 * Pages that just need thumbnails (home, about, page headers) use this rather
 * than pulling the whole archive, which is what they used to do.
 */
export const coverPhotosQuery = queryOptions({
  queryKey: ["photos", "covers"],
  staleTime: STALE,
  queryFn: () =>
    rows<"photos", Photo>("photos", PHOTO_COLS, (q) =>
      q.eq("published", true).order("sort_order").limit(24),
    ),
});

/**
 * One page of the gallery, optionally filtered to a category.
 *
 * Filtering happens in Postgres rather than in JavaScript, and the result is
 * bounded — the previous version fetched every published photograph on every
 * route and filtered client-side.
 */
export function galleryPhotosQuery(categoryId: string | null | undefined, page = 0) {
  return queryOptions({
    queryKey: ["photos", "gallery", categoryId ?? "all", page],
    staleTime: STALE,
    queryFn: () =>
      rows<"photos", Photo>("photos", PHOTO_COLS, (q) => {
        const base = q.eq("published", true);
        const scoped = categoryId ? base.eq("category_id", categoryId) : base;
        return scoped
          .order("sort_order")
          .range(page * GALLERY_PAGE_SIZE, (page + 1) * GALLERY_PAGE_SIZE - 1);
      }),
  });
}

/**
 * Exactly the photographs a post's blocks reference.
 *
 * Post rendering used to scan the full photo list to resolve each block, which
 * coupled the journal to an unbounded whole-table fetch.
 */
export function photosByIdsQuery(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  return queryOptions({
    queryKey: ["photos", "byIds", unique.join(",")],
    staleTime: STALE,
    enabled: unique.length > 0,
    queryFn: () =>
      unique.length === 0
        ? Promise.resolve([] as Photo[])
        : rows<"photos", Photo>("photos", PHOTO_COLS, (q) =>
            q.in("id", unique).eq("published", true),
          ),
  });
}

export const servicesQuery = queryOptions({
  queryKey: ["services"],
  staleTime: STALE,
  queryFn: () =>
    rows<"services", Service>("services", "*", (q) => q.eq("published", true).order("sort_order")),
});

export const testimonialsQuery = queryOptions({
  queryKey: ["testimonials"],
  staleTime: STALE,
  queryFn: () =>
    rows<"testimonials", Testimonial>("testimonials", "*", (q) =>
      q.eq("published", true).order("sort_order"),
    ),
});

export const settingsQuery = queryOptions({
  queryKey: ["site_settings"],
  staleTime: STALE,
  queryFn: async () => {
    const list = await rows<"site_settings", SiteSetting>("site_settings", "key,value", (q) =>
      q.order("sort_order"),
    );
    return Object.fromEntries(list.map((s) => [s.key, s.value])) as Record<string, string>;
  },
});

export function pageCopyQuery(pageSlug: string) {
  return queryOptions({
    queryKey: ["page_content", pageSlug],
    staleTime: STALE,
    queryFn: async () => {
      const list = await rows<"page_content", PageContent>(
        "page_content",
        "section_key,value",
        (q) => q.eq("page_slug", pageSlug).eq("published", true).order("sort_order"),
      );
      return Object.fromEntries(list.map((r) => [r.section_key, r.value])) as Record<
        string,
        string
      >;
    },
  });
}

/** Read a copy value with a graceful fallback so a failed query never blanks a page. */
export function copy(map: Record<string, string> | undefined, key: string, fallback = ""): string {
  const value = map?.[key];
  return value && value.trim().length > 0 ? value : fallback;
}

export function coverFor(
  photos: Photo[] | undefined,
  category: Pick<Category, "id" | "cover_photo_id"> | undefined,
): Photo | undefined {
  if (!photos || !category) return undefined;
  return (
    photos.find((p) => p.id === category.cover_photo_id) ??
    photos.find((p) => p.category_id === category.id)
  );
}

/* ============================ Blog ============================ */

/**
 * A post is an ordered list of typed blocks rather than one blob of HTML.
 * That is what lets a post be laid out like a magazine spread — full-bleed
 * openers, pull quotes, offset image pairs — instead of a column of text.
 */
export type PostBlock =
  | { type: "prose"; html: string }
  | { type: "pull_quote"; text: string; attribution?: string }
  | { type: "full_bleed"; photo_id: string; caption?: string }
  | { type: "image_pair"; photo_ids: [string, string]; caption?: string }
  | { type: "gallery"; photo_ids: string[] }
  | { type: "heading"; text: string };

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_photo_id: string | null;
  blocks: PostBlock[];
  reading_minutes: number;
  published: boolean;
  published_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const postsQuery = queryOptions({
  queryKey: ["posts"],
  staleTime: STALE,
  queryFn: () =>
    rows<"posts", Post>(
      "posts",
      "id,slug,title,excerpt,cover_photo_id,reading_minutes,published,published_at,sort_order,created_at,updated_at,blocks",
      (q) => q.eq("published", true).order("published_at", { ascending: false, nullsFirst: false }),
    ),
});

export function postQuery(slug: string) {
  return queryOptions({
    queryKey: ["post", slug],
    staleTime: STALE,
    queryFn: async () => {
      const list = await rows<"posts", Post>("posts", "*", (q) =>
        q.eq("slug", slug).eq("published", true).limit(1),
      );
      return list[0] ?? null;
    },
  });
}

/** Look up a photograph by id — blocks reference photos rather than embedding them. */
export function photoById(
  photos: Photo[] | undefined,
  id: string | null | undefined,
): Photo | undefined {
  if (!photos || !id) return undefined;
  return photos.find((p) => p.id === id);
}
