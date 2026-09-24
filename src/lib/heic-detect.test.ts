import { describe, expect, it } from "vitest";

import { prepareImage } from "./image-upload";

/**
 * The HEIC guard, checked by content rather than by filename.
 *
 * WHY THIS IS TESTED HERE AND NOT IN A BROWSER
 *
 * The guard is the FIRST thing prepareImage does, deliberately, so it runs
 * before any browser-only API is touched. That makes it reachable from a
 * plain test, which the rest of the upload path is not -- createImageBitmap
 * and canvas need a real engine.
 *
 * The case that matters is the one an extension check would miss: iOS hands
 * over a file called `.jpg` that is HEIC inside. Every fixture below is named
 * as something harmless.
 */

/** An ISO base-media header: 4 size bytes, `ftyp`, then the brand. */
function boxed(brand: string, name = "IMG_5742.jpg"): File {
  const head = new Uint8Array(12);
  head.set([0, 0, 0, 0x18], 0);
  head.set(
    [..."ftyp"].map((c) => c.charCodeAt(0)),
    4,
  );
  head.set(
    [...brand].map((c) => c.charCodeAt(0)),
    8,
  );
  return new File([head], name, { type: "image/jpeg" });
}

const heicMessage = /HEIC photo/;

describe("HEIC detection", () => {
  it("catches every HEIF brand an iPhone emits, whatever the file is called", async () => {
    for (const brand of ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"]) {
      await expect(prepareImage(boxed(brand))).rejects.toThrow(heicMessage);
    }
  });

  it("is case-insensitive about the brand", async () => {
    await expect(prepareImage(boxed("HEIC"))).rejects.toThrow(heicMessage);
  });

  it("says what to do about it, not just that it failed", async () => {
    await expect(prepareImage(boxed("heic"))).rejects.toThrow(/Most Compatible/);
  });

  it("lets a real JPEG through to the decoder", async () => {
    // SOI + JFIF APP0: not an ISO box, so the guard must not claim it.
    const jpeg = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])],
      "a.jpg",
      {
        type: "image/jpeg",
      },
    );
    // It gets past the guard and dies in the browser-only code instead, which
    // is the whole point -- the guard must not be what stops it.
    await expect(prepareImage(jpeg)).rejects.not.toThrow(heicMessage);
  });

  it("does not mistake an MP4 for a photograph format it can advise on", async () => {
    // Same `ftyp` box, different brand. Must fall through, not claim HEIC.
    await expect(prepareImage(boxed("isom", "clip.mp4"))).rejects.not.toThrow(heicMessage);
  });

  it("ignores a file too short to carry a header", async () => {
    const tiny = new File([new Uint8Array([1, 2, 3])], "x.jpg", { type: "image/jpeg" });
    await expect(prepareImage(tiny)).rejects.not.toThrow(heicMessage);
  });
});
