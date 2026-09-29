import { expect, test } from "./fixtures";

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
  await page.locator("#knob-ringSize").waitFor({ state: "attached" });
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

    /*
     * `ringSize` -> `--tune-ring`, which styles.css actually consumes (the
     * cursor ring's size). A cause: the ring is part of the cursor, not a
     * result of the light.
     *
     * This used to drive `grimeAmount` -> `--tune-grime`, and it passed for as
     * long as that knob existed -- while nothing in the stylesheet ever read
     * `--tune-grime`. It proved the slider wrote a variable and said nothing
     * about whether the variable went anywhere. So it asserts the consumer
     * too, so it cannot quietly go back to testing a wire to nowhere. (It then
     * drove `transmit`, until step 7 locked that as a result.)
     */
    const read = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--tune-ring").trim(),
      );

    const before = await read();
    await page.evaluate(() => {
      const el = document.getElementById("knob-ringSize") as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, "44");
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect.poll(read).not.toBe(before);
    expect(await read()).toBe("44px");

    const consumed = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((r) => r.cssText.includes("var(--tune-ring"));
        } catch {
          return false;
        }
      }),
    );
    expect(consumed, "--tune-ring must be read by some rule, or this tests nothing").toBe(true);
  });

  /*
   * Step 7: he sets causes, physics sets the effects. A result has no
   * control (RESULTS in src/lib/tuning.ts).
   */
  test("has controls for causes only", async ({ page }) => {
    await openLab(page);
    // The lens flare controls are back by request (Ony, 2026-09-29).
    for (const cause of [
      "edgeWidth",
      "coreGain",
      "shadowHeight",
      "floorGap",
      "rimGlare",
      "ghostGain",
      "haloGain",
      "edgeBloom",
    ]) {
      await expect(page.locator(`#knob-${cause}`)).toHaveCount(1);
    }
    for (const result of ["transmit", "glassFresnel", "floorLight", "restEdge"]) {
      await expect(page.locator(`#knob-${result}`)).toHaveCount(0);
    }
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

test("says whether changes are saved for every visitor", async ({ page }) => {
  await page.goto("/lab");
  await page.waitForLoadState("networkidle");
  // Signed out in a test browser: it must not pretend to publish.
  await expect(page.locator("[data-lab-save]")).toContainText("Sign in as the admin");
});
