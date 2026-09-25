import { expect, test } from "./fixtures";

/**
 * The flash afterimage.
 *
 * Three claims worth guarding, all of which have been broken at least once:
 * the ghosts get built from the real photograph rather than its placeholder,
 * each gets its own copy of it, and they do not move when the page does.
 *
 * Fired through the window event rather than the cursor gesture, because the
 * gesture needs a charged shutter and a hit on a photograph, and none of that
 * is what this is testing.
 */
const GHOSTS = [".afterimage--positive", ".afterimage--negative", ".afterimage--residue"];

test.describe("shutter afterimage", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  test("builds a ghost of the photograph, one copy per channel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const photo = page.locator("img").first();
    await expect(photo).toBeVisible();
    const box = await photo.boundingBox();
    expect(box).not.toBeNull();

    await page.evaluate(
      (at) => window.dispatchEvent(new CustomEvent("onysnow:shutter", { detail: at })),
      { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) },
    );

    for (const selector of GHOSTS) {
      const ghost = page.locator(selector);
      await expect(ghost).toHaveAttribute("data-firing", "");

      // Exactly one child, and not the shared node the other two also wanted:
      // appending one element to three parents leaves two of them empty.
      const paint = ghost.locator(":scope > *");
      await expect(paint).toHaveCount(1);

      // `Img` renders a base64 placeholder before the photograph. Burning that
      // into the retina instead of the picture is the bug this catches.
      const src = await paint.getAttribute("src");
      if (src !== null) expect(src, `${selector} captured the placeholder`).not.toMatch(/^data:/);
    }
  });

  test("stays where you were looking when the page scrolls", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("onysnow:shutter", { detail: { x: 640, y: 400 } })),
    );

    const read = () =>
      page.evaluate(
        (sel) => sel.map((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().top)),
        GHOSTS,
      );

    const before = await read();
    // Bypass the page's smooth scrolling: this asserts about the ghost, not
    // about how the scroll was animated.
    await page.evaluate(() => document.documentElement.scrollTo({ top: 600, behavior: "instant" }));
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // An afterimage is on the retina. It does not scroll with the page.
    expect(await read()).toEqual(before);
  });

  test("clears itself and leaves no layer behind", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("onysnow:shutter", { detail: { x: 640, y: 400 } })),
    );
    await expect(page.locator(".afterimage--residue")).toHaveAttribute("data-firing", "");

    for (const selector of [...GHOSTS, ".afterimage-veil"]) {
      await expect(page.locator(selector)).not.toHaveAttribute("data-firing", "", {
        timeout: 8000,
      });
      await expect(page.locator(selector)).toHaveCSS("opacity", "0");
    }
  });
});
