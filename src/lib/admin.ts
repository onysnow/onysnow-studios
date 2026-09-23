/* eslint-disable @typescript-eslint/no-explicit-any */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Category,
  Inquiry,
  PageContent,
  Photo,
  Post,
  Service,
  SiteSetting,
  Subscriber,
  Testimonial,
} from "@/lib/content";

/** Every table Ony can edit, including through the JSON editor. */
export const EDITABLE_TABLES = [
  "categories",
  "photos",
  "services",
  "testimonials",
  "page_content",
  "site_settings",
  "posts",
] as const;
export type EditableTable = (typeof EDITABLE_TABLES)[number];

export const TABLE_PK: Record<EditableTable, string> = {
  categories: "id",
  photos: "id",
  services: "id",
  testimonials: "id",
  page_content: "id",
  site_settings: "key",
  posts: "id",
};

/**
 * Every row of a table, bounded.
 *
 * There was no limit here at all, which is fine for the tables the studio
 * curates — categories, services, testimonials — and is not fine for the two
 * that grow on their own. `inquiries` and `subscribers` accumulate for the
 * life of the site, and the admin pages render them unvirtualised, so at a few
 * thousand rows the portal becomes a multi-megabyte fetch that blocks on
 * parse. A ceiling is not pagination, but it is the difference between slow
 * and unusable, and it makes the day pagination is needed obvious rather than
 * gradual.
 */
const MAX_ROWS = 500;

async function all<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .order(order, { ascending })
    .limit(MAX_ROWS);
  if (error) throw error;
  return (data ?? []) as T[];
}

export const adminCategoriesQuery = queryOptions({
  queryKey: ["admin", "categories"],
  queryFn: () => all<Category>("categories", "sort_order"),
});
export const adminPhotosQuery = queryOptions({
  queryKey: ["admin", "photos"],
  queryFn: () => all<Photo>("photos", "sort_order"),
});
export const adminServicesQuery = queryOptions({
  queryKey: ["admin", "services"],
  queryFn: () => all<Service>("services", "sort_order"),
});
export const adminTestimonialsQuery = queryOptions({
  queryKey: ["admin", "testimonials"],
  queryFn: () => all<Testimonial>("testimonials", "sort_order"),
});
export const adminPageContentQuery = queryOptions({
  queryKey: ["admin", "page_content"],
  queryFn: () => all<PageContent>("page_content", "page_slug"),
});
export const adminSettingsQuery = queryOptions({
  queryKey: ["admin", "site_settings"],
  queryFn: () => all<SiteSetting>("site_settings", "sort_order"),
});
export const adminPostsQuery = queryOptions({
  queryKey: ["admin", "posts"],
  queryFn: () => all<Post>("posts", "sort_order"),
});

export const adminSubscribersQuery = queryOptions({
  queryKey: ["admin", "subscribers"],
  queryFn: () => all<Subscriber>("subscribers", "created_at", false),
});

export const adminInquiriesQuery = queryOptions({
  queryKey: ["admin", "inquiries"],
  queryFn: () => all<Inquiry>("inquiries", "created_at", false),
});

export async function updateRow(table: EditableTable, id: string, patch: Record<string, unknown>) {
  const { error } = await (supabase as any).from(table).update(patch).eq(TABLE_PK[table], id);
  if (error) throw error;
}

export async function insertRow(table: EditableTable, row: Record<string, unknown>) {
  const { error } = await (supabase as any).from(table).insert(row);
  if (error) throw error;
}

export async function deleteRow(table: EditableTable, id: string) {
  const { error } = await (supabase as any).from(table).delete().eq(TABLE_PK[table], id);
  if (error) throw error;
}

/** Persist a new order for a list of rows. */
/** One row's new position. */
export type OrderPair = { id: string; sortOrder: number };

/**
 * Write an explicit position for each row.
 *
 * This used to take a bare `string[]` and assign `1..N` by array index, which
 * quietly assumed the caller was handing over EVERY row in the table. The photo
 * grid isn't — it hands over whatever the category filter left visible. So
 * reordering inside a filter renumbered that category `1..N` on top of the
 * `1..N` every other category already held, and since the public gallery orders
 * globally and paginates with `.range()`, duplicate sort keys make Postgres
 * pagination unstable: rows repeat between pages or vanish from both. There is
 * no undo for it.
 *
 * Taking pairs makes that class of mistake unexpressible — the caller has to
 * say which number each row gets, so it can no longer be inferred wrongly from
 * the length of a list that happened to be filtered.
 *
 * Rows already holding their target number are skipped, and the rest go out
 * together rather than one round trip at a time: a drag typically moves a
 * handful of rows, and the old loop cost a full round trip for all N of them
 * whether or not anything changed.
 */
export async function saveOrder(table: EditableTable, pairs: OrderPair[]) {
  const pk = TABLE_PK[table];

  const writes = pairs.map(({ id, sortOrder }) =>
    (supabase as any).from(table).update({ sort_order: sortOrder }).eq(pk, id),
  );

  const results = await Promise.all(writes);
  const failed = results.find((r: { error: unknown }) => r.error);
  if (failed) throw failed.error;
}

/**
 * Permute rows within the slots they already occupy.
 *
 * `ids` is the subset in its new visual order; `current` is every row with its
 * present position. The slots the subset already holds are collected, sorted,
 * and handed back out in the new order — so the subset rearranges among itself
 * and every row outside it keeps the number it had. With no filter applied this
 * is an ordinary full reorder; with one applied it is the only behaviour that
 * doesn't corrupt the rest of the table.
 */
export function orderWithinSlots(
  ids: string[],
  current: ReadonlyArray<{ id: string; sort_order: number }>,
): OrderPair[] {
  const position = new Map(current.map((row) => [row.id, row.sort_order]));

  const slots = ids
    .map((id) => position.get(id))
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);

  // A row with no slot of its own is newly created and not yet placed; it takes
  // the next number past the end rather than displacing anything.
  let overflow = (slots.at(-1) ?? 0) + 1;

  return ids
    .map((id, i) => ({ id, sortOrder: slots[i] ?? overflow++ }))
    .filter(({ id, sortOrder }) => position.get(id) !== sortOrder);
}

/** Invalidate both the admin views and the public site caches. */
export const CONTENT_KEYS = [
  ["admin"],
  ["categories"],
  ["photos"],
  ["services"],
  ["testimonials"],
  ["page_content"],
  ["site_settings"],
  ["posts"],
  /*
   * The per-post query is keyed ["post", slug], singular, and ["posts"] does
   * not prefix-match it. Editing a post's title refreshed the journal index
   * and left the post's own page showing the old one for the whole 60s
   * staleTime.
   */
  ["post"],
  ["subscribers"],
];
