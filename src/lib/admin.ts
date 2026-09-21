/* eslint-disable @typescript-eslint/no-explicit-any */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Category, Inquiry, PageContent, Photo, Service, SiteSetting, Testimonial } from "@/lib/content";

/** Every table Ony can edit, including through the JSON editor. */
export const EDITABLE_TABLES = [
  "categories",
  "photos",
  "services",
  "testimonials",
  "page_content",
  "site_settings",
] as const;
export type EditableTable = (typeof EDITABLE_TABLES)[number];

export const TABLE_PK: Record<EditableTable, string> = {
  categories: "id",
  photos: "id",
  services: "id",
  testimonials: "id",
  page_content: "id",
  site_settings: "key",
};

async function all<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const { data, error } = await (supabase as any).from(table).select("*").order(order, { ascending });
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
export async function saveOrder(table: EditableTable, ids: string[]) {
  const pk = TABLE_PK[table];
  for (let i = 0; i < ids.length; i++) {
    const { error } = await (supabase as any).from(table).update({ sort_order: i + 1 }).eq(pk, ids[i]);
    if (error) throw error;
  }
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
];
