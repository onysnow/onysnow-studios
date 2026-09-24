/**
 * @vitest-environment jsdom
 *
 * Per-file, because the suite runs on `node` by default and this is the one
 * thing here that genuinely needs a document -- the resolution it tests reads
 * a data attribute off documentElement. Switching the whole suite to jsdom to
 * serve one file would slow every other test down for nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { assetUrl, ROOM_KEYS, SITE_ASSETS } from "./site-assets";
import { ROOMS, roomScript } from "./rooms";
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

/**
 * The room script, which is the awkward one.
 *
 * It is a STRING that becomes executable JavaScript in the document head
 * before anything paints, built from studio-editable settings. Two things
 * therefore have to hold: an unset slot must fall back rather than produce a
 * broken url(), and nothing from a settings row may be able to close the
 * string it is embedded in.
 */
describe("room reflections", () => {
  it("falls back per slot, not all or nothing", () => {
    const script = roomScript(["", "https://cdn.example/aqua.jpg", "", "", "", ""]);
    expect(script).toContain("https://cdn.example/aqua.jpg");
    // The five that were not overridden still point at the shipped files.
    expect(script).toContain("/rooms/metro.jpg");
    expect(script).toContain("/rooms/station.jpg");
  });

  it("uses every shipped room when nothing is configured at all", () => {
    const script = roomScript();
    for (const name of ROOMS) expect(script).toContain(`/rooms/${name}.jpg`);
  });

  it("has a key for every room, in the same order", () => {
    // These two lists are edited in different files and cycled by index, so a
    // mismatch would silently apply one room's upload to another room.
    expect(ROOM_KEYS).toHaveLength(ROOMS.length);
    ROOMS.forEach((name, i) => expect(ROOM_KEYS[i]).toBe(`room_${name}_url`));
  });

  it("cannot be broken out of by a quote in a stored value", () => {
    /*
     * Proved by RUNNING it, not by looking at it.
     *
     * The first version of this test asserted the payload text was absent
     * from the script, which fails for the right reason: the text IS there,
     * escaped, sitting harmlessly inside a string literal. Reading the output
     * cannot distinguish that from a real break-out. Executing it can.
     */
    const nasty = '"];globalThis.__pwned=1;var x=["';
    const script = roomScript([nasty, "", "", "", "", ""]);

    delete (globalThis as Record<string, unknown>)["__pwned"];
    // Forces slot 0, so the injected value is the one that gets used.
    try {
      localStorage.setItem("onysnow:room", "-1");
    } catch {
      /* storage blocked; the script's own fallback covers it */
    }
    new Function(script)();

    expect((globalThis as Record<string, unknown>)["__pwned"]).toBeUndefined();
    // And it was used as a URL, exactly as stored.
    expect(document.documentElement.style.getPropertyValue("--room")).toContain(nasty);
  });
});
