import { describe, expect, it } from "vitest";
import { safeCustomCss, safeHref } from "./safe-content";
import { safeHtml } from "./safe-html";

describe("safeCustomCss", () => {
  it("survives the re-join trick that defeated the old filter", () => {
    // The old filter removed `</style` in a single pass, which let the two
    // halves meet: `</st` + `yle>` came out as a working `</style>`.
    const out = safeCustomCss("</st</styleyle><img src=x onerror=alert(1)>");

    expect(out).not.toContain("</style>");
    expect(out).not.toContain("<");
  });

  it("leaves no way to end the style element, however the text is folded", () => {
    for (const payload of [
      "</style><script>alert(1)</script>",
      "<<//style>",
      "</sty<</style>le>",
      "a{}</STYLE><img src=x onerror=alert(1)>",
    ]) {
      expect(safeCustomCss(payload)).not.toContain("<");
    }
  });

  it("keeps the child combinator, which is real CSS", () => {
    expect(safeCustomCss(".a > .b { color: red }")).toBe(".a > .b { color: red }");
  });

  it("blocks absolute and protocol-relative url(), which the old filter never touched", () => {
    expect(safeCustomCss("body{background:url(https://evil/beacon)}")).not.toContain("evil");
    expect(safeCustomCss("body{background:url(//evil/beacon)}")).not.toContain("evil");
    expect(safeCustomCss("body{background:url('HTTPS://evil/b')}")).not.toContain("evil");
  });

  it("keeps relative url(), which the studio has a real use for", () => {
    expect(safeCustomCss("body{background:url(/rooms/metro.jpg)}")).toContain("/rooms/metro.jpg");
  });

  it("removes @import however it is nested", () => {
    expect(safeCustomCss("@imp@import url(//evil);ort url(//evil);")).not.toContain("@import");
    expect(safeCustomCss("@import url(//evil);")).not.toContain("@import");
  });

  it("caps the length and handles nothing at all", () => {
    expect(safeCustomCss("a".repeat(30_000))).toHaveLength(20_000);
    expect(safeCustomCss(null)).toBe("");
    expect(safeCustomCss("")).toBe("");
  });
});

describe("safeHtml", () => {
  it("drops scripts and event handlers from authored rich text", () => {
    const out = safeHtml('<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(1)">');

    expect(out).toContain("<p>Hello</p>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
  });

  it("keeps what the editor actually produces", () => {
    const out = safeHtml(
      "<h2>Title</h2><p><strong>bold</strong> and <em>italic</em></p><ul><li>one</li></ul><blockquote>q</blockquote>",
    );

    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("<blockquote>q</blockquote>");
  });

  it("refuses a javascript: link but keeps an ordinary one", () => {
    expect(safeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    expect(safeHtml('<a href="https://example.com">x</a>')).toContain("https://example.com");
  });

  it("adds rel=noopener to every link that survives", () => {
    expect(safeHtml('<a href="https://example.com">x</a>')).toContain("noopener");
  });

  it("strips style attributes, which can still reach the network", () => {
    expect(safeHtml('<p style="background:url(https://evil/)">x</p>')).not.toContain("evil");
  });
});

describe("safeHref", () => {
  it("refuses the schemes that execute", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "data:text/html,<script>",
    ]) {
      expect(safeHref(bad)).toBe("");
    }
  });

  it("allows the schemes a studio actually configures", () => {
    expect(safeHref("https://instagram.com/onysnow")).toBe("https://instagram.com/onysnow");
    expect(safeHref("mailto:studio@example.com")).toBe("mailto:studio@example.com");
    expect(safeHref("tel:+15550100")).toBe("tel:+15550100");
  });

  it("allows links with no scheme to abuse", () => {
    expect(safeHref("/portfolio")).toBe("/portfolio");
    expect(safeHref("#section")).toBe("#section");
  });

  it("returns empty for nothing, so the caller can drop the link entirely", () => {
    expect(safeHref(null)).toBe("");
    expect(safeHref("   ")).toBe("");
  });
});
