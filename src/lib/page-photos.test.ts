import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { PHOTO_SLOTS, isMissingTable, resolveSlot, usage } = await import("./page-photos");
type Photo = import("./content").Photo;
type Row = import("./page-photos").PagePhotoRow;

const photo = (id: string, extra: Partial<Photo> = {}): Photo =>
  ({
    id,
    storage_path: `${id}.webp`,
    width: 1600,
    height: 900,
    blur_data_url: null,
    sources: null,
    alt: "",
    title: id,
    category_id: null,
    sort_order: 0,
    featured: false,
    published: true,
    ...extra,
  }) as Photo;

const library = Array.from({ length: 10 }, (_, i) => photo(`p${i}`));

describe("page photos", () => {
  it("shows what the site showed before when nothing is chosen", () => {
    const starred = library.map((p, i) => (i === 4 ? { ...p, featured: true } : p));
    expect(resolveSlot("home.hero", [], starred)).toEqual({
      photo: starred[4],
      focus: null,
      chosen: false,
    });
    // No star: the first photograph.
    expect(resolveSlot("home.hero", [], library).photo?.id).toBe("p0");
    // The frames kept their old positions in the list.
    expect(resolveSlot("home.frame-1", [], library).photo?.id).toBe("p6");
    expect(resolveSlot("home.frame-2", [], library).photo?.id).toBe("p7");
    expect(resolveSlot("home.frame-3", [], library).photo?.id).toBe("p8");
    expect(resolveSlot("home.philosophy", [], library).photo?.id).toBe("p2");
  });

  it("falls back to the hero, chosen or not, when the library is short", () => {
    const two = library.slice(0, 2);
    const chosenHero: Row[] = [
      { key: "home.hero", photo_id: "x", focus_x: null, focus_y: null, photo: photo("x") },
    ];
    expect(resolveSlot("home.frame-1", chosenHero, two).photo?.id).toBe("x");
  });

  it("uses the chosen photograph and its focal point", () => {
    const rows: Row[] = [
      { key: "home.frame-2", photo_id: "c", focus_x: 0.3, focus_y: 0.6, photo: photo("c") },
    ];
    expect(resolveSlot("home.frame-2", rows, library)).toEqual({
      photo: rows[0]!.photo,
      focus: { x: 0.3, y: 0.6 },
      chosen: true,
    });
  });

  it("goes back to automatic, focal point and all, when the chosen photograph can't be shown", () => {
    // Unpublished or deleted: the join comes back null.
    const rows: Row[] = [
      { key: "home.frame-1", photo_id: "gone", focus_x: 0.1, focus_y: 0.1, photo: null },
    ];
    expect(resolveSlot("home.frame-1", rows, library)).toEqual({
      photo: library[6],
      focus: null,
      chosen: false,
    });
  });

  it("names where each photograph is used", () => {
    const rows: Row[] = [
      { key: "home.hero", photo_id: "a", focus_x: null, focus_y: null, photo: photo("a") },
      { key: "home.frame-3", photo_id: "a", focus_x: null, focus_y: null, photo: photo("a") },
      { key: "gone.spot", photo_id: "b", focus_x: null, focus_y: null, photo: photo("b") },
    ];
    expect(usage(rows).get("a")).toEqual(["Home — Hero", "Home — Full-bleed frame 3"]);
    // A key no longer declared in code is not a place anything shows.
    expect(usage(rows).has("b")).toBe(false);
  });

  it("recognises the table not existing yet, and nothing else, as 'not set up'", () => {
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(
      isMissingTable({ code: "42P01", message: 'relation "page_photos" does not exist' }),
    ).toBe(true);
    expect(isMissingTable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });

  it("declares every spot the home page asks for, once", () => {
    const keys = PHOTO_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const page = readFileSync("src/routes/index.tsx", "utf8");
    const asked = [...page.matchAll(/spot\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(asked.length).toBeGreaterThan(0);
    for (const key of asked) expect(keys, key).toContain(key);
  });

  it("keeps every preview a real shape", () => {
    for (const slot of PHOTO_SLOTS) {
      expect(slot.previews.length, slot.key).toBeGreaterThan(0);
      for (const p of slot.previews) expect(p.aspect, slot.key).toBeGreaterThan(0.1);
    }
  });
});
