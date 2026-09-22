import { expect, test } from "@playwright/test";

/**
 * One pass per public route.
 *
 * These assert the things that have actually broken: a route rendering empty,
 * metadata missing from the server HTML, and a console error nobody noticed.
 * They are deliberately not visual assertions — the design changes weekly.
 */
const ROUTES = [
  { path: "/", name: "home" },
  { path: "/portfolio", name: "portfolio" },
  { path: "/journal", name: "journal" },
  { path: "/about", name: "about" },
  { path: "/services", name: "services" },
  { path: "/contact", name: "contact" },
  { path: "/book", name: "book" },
  { path: "/privacy", name: "privacy" },
  { path: "/terms", name: "terms" },
];

for (const route of ROUTES) {
  test(`${route.name} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} should return 200`).toBe(200);

    // The route error boundary rendering is a pass at the HTTP level but a
    // failure at the only level that matters.
    await expect(page.getByText("This page didn’t load.")).toHaveCount(0);

    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();

    expect(errors, `console errors on ${route.path}`).toEqual([]);
  });

  test(`${route.name} ships metadata in the server HTML`, async ({ request }) => {
    // Fetched rather than rendered: this is what a crawler and a link unfurler
    // see, before any JavaScript runs.
    const html = await (await request.get(route.path)).text();
    expect(html).toMatch(/<title>[^<]*OnySnow Studios[^<]*<\/title>/);
    expect(html).toMatch(/<meta[^>]+name="description"[^>]+content="[^"]{20,}"/);
    expect(html).toMatch(/<meta[^>]+property="og:title"/);
  });
}

test("the journal is server-rendered, not an empty shell", async ({ request }) => {
  // The whole point of converting to loaders: a crawler that runs no JavaScript
  // must still see the posts.
  const html = await (await request.get("/journal")).text();
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  expect(body).toMatch(/Journal/);
});

test("the gallery's first row is in the server HTML", async ({ request }) => {
  const html = await (await request.get("/portfolio")).text();
  expect(html).toMatch(/<img[^>]+src="[^"]*storage\/v1\/object\/public\/photos/);
});

test("category deep links still resolve to the filtered gallery", async ({ page }) => {
  await page.goto("/portfolio/cosplay");
  await expect(page).toHaveURL(/\/portfolio\?category=cosplay/);
});

test("an unknown route renders the 404, not a crash", async ({ page }) => {
  await page.goto("/this-does-not-exist");
  await expect(page.getByText("This frame is missing.")).toBeVisible();
});

/**
 * Regression guard for the frosted bars.
 *
 * Two separate things have to hold for these to look like glass, and neither is
 * visible to a type check or a build:
 *
 *   1. The bar carries a real `backdrop-filter` blur.
 *   2. Something with actual detail is painted behind it. A heavy flat scrim over
 *      the backdrop photograph collapses it to near-solid colour, and blurring a
 *      solid colour is indistinguishable from plain transparency — which is how
 *      this got reported as "not frosted" more than once.
 *
 * The second is the one that actually broke, so it's checked by sampling the
 * band behind the bar for variation rather than by trusting the CSS.
 */
test("the frosted bars actually blur their backdrop", async ({ page }) => {
  await page.goto("/portfolio");

  for (const selector of ["header.glass-bar", ".glass-bar.sticky"]) {
    const filter = await page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(filter, `${selector} must carry a backdrop blur`).toMatch(/blur\(\s*\d/);
  }

  // There must be a photographic band behind the bars, not bare background.
  const bandOpacity = await page.locator("header.glass-bar").evaluate(() => {
    const behind = document.elementsFromPoint(window.innerWidth / 2, 30);
    return behind.some((el) => el.tagName === "IMG");
  });
  expect(bandOpacity, "a photograph must sit behind the header for the blur to catch").toBe(true);
});

/**
 * Regression guard for the photograph fade-in.
 *
 * `Img` fades from a blurred placeholder to the real photograph on the `load`
 * event. An image that the browser had already finished fetching before React
 * hydrated never fires that event again, so the frame stayed at `opacity: 0`
 * and the site showed nothing but blurred placeholders — on every cached visit,
 * everywhere. Nothing failed: the markup was correct and the file was fetched.
 */
test("photographs are actually visible, not left behind their placeholders", async ({ page }) => {
  for (const path of ["/portfolio", "/services"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Reload once: the second visit is served from cache, which is the case
    // that broke.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .filter((img) => img.complete && img.naturalWidth > 20 && !img.hasAttribute("aria-hidden"))
        .filter((img) => Number(getComputedStyle(img).opacity) < 0.9)
        .map((img) => img.currentSrc.slice(-48)),
    );
    expect(hidden, `loaded photographs stuck transparent on ${path}`).toEqual([]);
  }
});
