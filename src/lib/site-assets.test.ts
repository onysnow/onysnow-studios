/**
 * @vitest-environment jsdom
 *
 * Per-file, because the suite runs on `node` by default and this is the one
 * thing here that genuinely needs a document -- the resolution it tests reads
 * a data attribute off documentElement. Switching the whole suite to jsdom to
 * serve one file would slow every other test down for nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { assetUrl, SITE_ASSETS } from "./site-assets";
import { safeHref } from "./safe-content";

/**
 * The fallback is the part worth testing.
 *
 * An empty settings row is the NORMAL state -- it is what the site ships with
 * and what "Reset to default" leaves behind -- so every empty-ish value has to
 * resolve to the bundled file rather than to nothing. Getting this wrong does
 * not throw; it asks the browser to load the current page as a texture, and
 * the glass silently goes blank.
 */
const asset = SITE_ASSETS.glassSurface;

afterEach(() => {
  delete document.documentElement.dataset[asset.attr];
});

describe("site asset resolution", () => {
  it("uses the bundled file when nothing is configured", () => {
    expect(assetUrl(asset)).toBe(asset.fallback);
  });

  it("treats an empty or blank setting as not configured", () => {
    for (const blank of ["", "   ", "\n", "\t"]) {
      document.documentElement.dataset[asset.attr] = blank;
      expect(assetUrl(asset)).toBe(asset.fallback);
    }
  });

  it("uses the uploaded file when one is set", () => {
    const url =
      "https://example.supabase.co/storage/v1/object/public/photos/assets/glass-surface-1.jpg";
    document.documentElement.dataset[asset.attr] = url;
    expect(assetUrl(asset)).toBe(url);
  });

  it("points at a real file by default, not an empty string", () => {
    // A fallback that was itself blank would defeat the whole guard above.
    expect(asset.fallback).toMatch(/^\/\S+\.\w+$/);
  });
});

/**
 * The join between the two halves of this feature.
 *
 * CustomCss passes the stored value through `safeHref` before writing it to
 * the document -- correctly, since it is studio-editable text that ends up in
 * an <img> src. But if that filter rejected the URL shape the uploader
 * produces, the feature would fail silently and completely: the upload would
 * succeed, the setting would save, and the texture would simply never change.
 * Nothing would throw and nothing would log.
 */
describe("uploaded URLs survive the safety filter", () => {
  it("accepts a Supabase storage public URL", () => {
    const url =
      "https://abcdefgh.supabase.co/storage/v1/object/public/photos/assets/glass-surface-1790000000000.jpg";
    expect(safeHref(url)).toBe(url);
  });

  it("accepts the bundled root-relative fallback", () => {
    expect(safeHref(SITE_ASSETS.glassSurface.fallback)).toBe(SITE_ASSETS.glassSurface.fallback);
  });

  it("still refuses a scheme that could execute", () => {
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("");
  });
});
