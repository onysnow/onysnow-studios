import { expect, test } from "@playwright/test";

/**
 * The first-load screen.
 *
 * Imports plain Playwright on purpose, not ./fixtures: every other spec opens
 * the site as a returning visitor so the loader stays out of its way, which
 * means this is the only place it is ever met the way a new visitor meets it.
 * Skipping it everywhere else is only safe because it is tested here.
 */
test.describe("site loader", () => {
  test("holds the first load, becomes ready, and lets you in", async ({ page }) => {
    await page.goto("/");

    const loader = page.getByRole("status", { name: "Loading" });
    await expect(loader).toBeVisible();

    // Real panes -- the same class the site's glass uses -- not a picture of them.
    expect(await loader.locator(".glass").count()).toBeGreaterThan(0);

    // It must become enterable. The hard deadline is 6s; this allows for a slow
    // machine without ever letting a stuck loader pass.
    const enter = page.getByRole("button", { name: "Click to enter" });
    await expect(enter).toBeVisible({ timeout: 12_000 });
    await enter.click();

    await expect(loader).toHaveCount(0);
  });

  test("does not come back on a second load in the same tab", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Click to enter" }).click({ timeout: 12_000 });
    await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);

    await page.reload();
    // Give it the chance to appear before asserting that it did not.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("status", { name: "Loading" })).toHaveCount(0);
  });

  test("never traps the page when images never arrive", async ({ page }) => {
    // Every image request hangs forever. A loader that waited on them would
    // make the site unreachable, which is strictly worse than no loader.
    await page.route(/\.(webp|jpe?g|png|avif)(\?|$)/, () => {
      /* never fulfilled */
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The loader's warm-up deadline is 10s from hydration; the dev server
    // takes several seconds to hydrate on a cold start, so allow for both.
    await expect(page.getByRole("button", { name: "Click to enter" })).toBeVisible({
      timeout: 25_000,
    });
  });
});
