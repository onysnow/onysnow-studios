import { describe, expect, it } from "vitest";
import { copy, coverFor, photoById, type Category, type Photo } from "./content";

function photo(over: Partial<Photo> = {}): Photo {
  return {
    id: "p1",
    storage_path: "a.webp",
    width: 1600,
    height: 1000,
    blur_data_url: null,
    sources: null,
    alt: "",
    title: "",
    category_id: null,
    sort_order: 0,
    featured: false,
    published: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Photo;
}

describe("copy", () => {
  it("returns the stored value when present", () => {
    expect(copy({ headline: "Real light" }, "headline", "fallback")).toBe("Real light");
  });

  it("falls back when the key is missing entirely", () => {
    expect(copy({}, "headline", "fallback")).toBe("fallback");
    expect(copy(undefined, "headline", "fallback")).toBe("fallback");
  });

  it("falls back on blank and whitespace-only values", () => {
    // The portal saves "" when a field is cleared. Rendering that leaves a hole
    // in the page, so an emptied field has to behave as though it were unset.
    expect(copy({ headline: "" }, "headline", "fallback")).toBe("fallback");
    expect(copy({ headline: "   \n " }, "headline", "fallback")).toBe("fallback");
  });

  it("defaults to an empty string when no fallback is given", () => {
    expect(copy({}, "missing")).toBe("");
  });
});

describe("photoById", () => {
  const photos = [photo({ id: "a" }), photo({ id: "b" })];

  it("finds by id", () => {
    expect(photoById(photos, "b")?.id).toBe("b");
  });

  it("returns undefined for null, undefined and unknown ids", () => {
    expect(photoById(photos, null)).toBeUndefined();
    expect(photoById(photos, undefined)).toBeUndefined();
    expect(photoById(photos, "nope")).toBeUndefined();
    expect(photoById(undefined, "a")).toBeUndefined();
  });
});

describe("coverFor", () => {
  const cat = { id: "cat-1", cover_photo_id: "chosen" } as Pick<Category, "id" | "cover_photo_id">;

  it("prefers the explicitly chosen cover", () => {
    const photos = [photo({ id: "other", category_id: "cat-1" }), photo({ id: "chosen" })];
    expect(coverFor(photos, cat)?.id).toBe("chosen");
  });

  it("falls back to the first photograph in the category", () => {
    // A category with no cover picked yet should still show something rather
    // than rendering an empty frame.
    const photos = [photo({ id: "other", category_id: "cat-1" })];
    expect(coverFor(photos, cat)?.id).toBe("other");
  });

  it("returns undefined when nothing matches", () => {
    expect(coverFor([photo({ id: "x", category_id: "cat-2" })], cat)).toBeUndefined();
    expect(coverFor(undefined, cat)).toBeUndefined();
    expect(coverFor([photo()], undefined)).toBeUndefined();
  });
});
