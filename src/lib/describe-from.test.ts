import { describe, expect, it } from "vitest";
import { describeFrom } from "./image-upload";

/**
 * Every upload used to land with an empty alt and `published: true`, so the
 * default outcome was a live photograph that announces as nothing. This is the
 * first pass at a description — weak, and meant to be replaced, but not empty.
 */
describe("describeFrom", () => {
  it("makes something of a name a person typed", () => {
    expect(describeFrom("rainy-street-portrait.jpg")).toBe("Rainy street portrait");
    expect(describeFrom("Bride_and_groom_first_dance.webp")).toBe("Bride and groom first dance");
  });

  it("says nothing rather than something useless", () => {
    // A camera's own filenames describe nothing, and "Dsc 0413" as alt text is
    // worse than an empty string because it reads as a real description.
    for (const name of ["DSC_0413.jpg", "IMG-2201.JPG", "PXL_20260101_120000.jpg", "0042.png"]) {
      expect(describeFrom(name)).toBe("");
    }
  });

  it("is not confused by extensions or stray separators", () => {
    expect(describeFrom("golden --  hour.jpeg")).toBe("Golden hour");
    expect(describeFrom("a.jpg")).toBe("");
    expect(describeFrom("")).toBe("");
  });
});
