import { expect, test } from "@playwright/test";

/**
 * The tuning page.
 *
 * Every knob in the effect layer was unreachable until this existed, so "it's
 * tunable" was a claim rather than a fact. The thing worth guarding is not the
 * layout but the wiring: that a control actually moves the value the effects
 * read, and that the preview is the real components rather than a swatch.
 */
/*
 * The route is `ssr: false`, so nothing of it exists until React has rendered
 * on the client — and `networkidle` can fire before that. Waiting on an
 * element that only the rendered page has is the difference between a test
 * that passes alone and one that passes in a loaded parallel run.
 */
async function openLab(page: import("@playwright/test").Page) {
  await page.goto("/lab");
  await page.locator("#knob-grimeAmount").waitFor({ state: "attached" });
}

test.describe("/lab", () => {
  test("puts every knob on a control", async ({ page }) => {
    await openLab(page);

    const sliders = page.locator("input[type=range]");
    // One per knob, and a number field beside each for typing an exact value.
    await expect(sliders.first()).toBeVisible();
    expect(await sliders.count()).toBeGreaterThan(30);
    expect(await page.locator("input[type=number]").count()).toBe(await sliders.count());
  });

  test("moving a control changes what the effects read", async ({ page }) => {
    await openLab(page);

    const read = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--tune-grime").trim(),
      );

    const before = await read();
    await page.evaluate(() => {
      const el = document.getElementById("knob-grimeAmount") as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, "1.2");
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect.poll(read).not.toBe(before);
    expect(await read()).toBe("1.2");
  });

  test("previews on the real components, not a swatch", async ({ page }) => {
    await openLab(page);

    // The pieces interact, so tuning one against a mock would be worse than not
    // tuning it at all.
    await expect(page.locator(".glass").first()).toBeVisible();
    expect(await page.locator(".transmitted").count()).toBeGreaterThan(0);
    expect(await page.locator(".photo-surface").count()).toBeGreaterThan(0);
  });

  test("stays out of the index", async ({ request }) => {
    const html = await (await request.get("/lab")).text();
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+noindex/);
  });
});
