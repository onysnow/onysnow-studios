import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover_photo_id: string | null;
  sort_order: number;
  published: boolean;
};

export type Photo = {
  id: string;
  storage_path: string;
  width: number;
  height: number;
  blur_data_url: string;
  sources: Record<string, string> | null;
  alt: string;
  title: string;
  category_id: string | null;
  sort_order: number;
  featured: boolean;
  published: boolean;
};

export type Service = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  included: string[];
  turnaround: string;
  price_display: string;
  sort_order: number;
  published: boolean;
};

export type Testimonial = {
  id: string;
  quote: string;
  author: string;
  context: string;
  sort_order: number;
  published: boolean;
};

export type PageContent = {
  id: string;
  page_slug: string;
  section_key: string;
  value: string;
  format: "text" | "html" | "json";
  published: boolean;
  sort_order: number;
};

export type SiteSetting = {
  key: string;
  value: string;
  label: string;
  kind: string;
  sort_order: number;
};

export type Inquiry = {
  id: string;
  name: string;
  email: string;
  kind: string;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
};

const STALE = 60_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function rows<T>(table: string, build: (q: any) => any): Promise<T[]> {
  const { data, error } = await build((supabase as any).from(table).select("*"));
  if (error) throw error;
  return (data ?? []) as T[];
}

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  staleTime: STALE,
  queryFn: () => rows<Category>("categories", (q) => q.eq("published", true).order("sort_order")),
});

export const photosQuery = queryOptions({
  queryKey: ["photos"],
  staleTime: STALE,
  queryFn: () => rows<Photo>("photos", (q) => q.eq("published", true).order("sort_order")),
});

export const servicesQuery = queryOptions({
  queryKey: ["services"],
  staleTime: STALE,
  queryFn: () => rows<Service>("services", (q) => q.eq("published", true).order("sort_order")),
});

export const testimonialsQuery = queryOptions({
  queryKey: ["testimonials"],
  staleTime: STALE,
  queryFn: () => rows<Testimonial>("testimonials", (q) => q.eq("published", true).order("sort_order")),
});

export const settingsQuery = queryOptions({
  queryKey: ["site_settings"],
  staleTime: STALE,
  queryFn: async () => {
    const list = await rows<SiteSetting>("site_settings", (q) => q.order("sort_order"));
    return Object.fromEntries(list.map((s) => [s.key, s.value])) as Record<string, string>;
  },
});

export function pageCopyQuery(pageSlug: string) {
  return queryOptions({
    queryKey: ["page_content", pageSlug],
    staleTime: STALE,
    queryFn: async () => {
      const list = await rows<PageContent>("page_content", (q) =>
        q.eq("page_slug", pageSlug).eq("published", true).order("sort_order"),
      );
      return Object.fromEntries(list.map((r) => [r.section_key, r.value])) as Record<string, string>;
    },
  });
}

/** Read a copy value with a graceful fallback so a failed query never blanks a page. */
export function copy(map: Record<string, string> | undefined, key: string, fallback = ""): string {
  const value = map?.[key];
  return value && value.trim().length > 0 ? value : fallback;
}

export function photosFor(photos: Photo[] | undefined, categoryId: string | null | undefined): Photo[] {
  if (!photos || !categoryId) return [];
  return photos.filter((p) => p.category_id === categoryId);
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

export type Subscriber = {
  id: string;
  email: string;
  source: string;
  created_at: string;
};

export const postsQuery = queryOptions({
  queryKey: ["posts"],
  staleTime: STALE,
  queryFn: () =>
    rows<Post>("posts", (q) =>
      q.eq("published", true).order("published_at", { ascending: false, nullsFirst: false }),
    ),
});

export function postQuery(slug: string) {
  return queryOptions({
    queryKey: ["post", slug],
    staleTime: STALE,
    queryFn: async () => {
      const list = await rows<Post>("posts", (q) => q.eq("slug", slug).eq("published", true).limit(1));
      return list[0] ?? null;
    },
  });
}

/** Look up a photograph by id — blocks reference photos rather than embedding them. */
export function photoById(photos: Photo[] | undefined, id: string | null | undefined): Photo | undefined {
  if (!photos || !id) return undefined;
  return photos.find((p) => p.id === id);
}
