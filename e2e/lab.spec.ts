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

/** The site in the lab's preview, once it has rendered. */
async function previewFrame(page: import("@playwright/test").Page) {
  const handle = await page.locator("iframe[data-lab-preview]").elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.locator(".glass").first().waitFor({ state: "attached", timeout: 60_000 });
  return frame!;
}

async function setKnob(page: import("@playwright/test").Page, key: string, value: string) {
  await page.evaluate(
    ([key, value]) => {
      const el = document.getElementById(`knob-${key}`) as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [key, value] as const,
  );
}

test.describe("/lab", () => {
  test("picks what the preview's pointer holds (25h)", async ({ page }) => {
    await openLab(page);
    const frame = await previewFrame(page);
    // The magnifier is drawn only while it is held.
    await expect(frame.locator(".magnifier")).toHaveCount(0);
    await page.locator("[data-lab-tool]").selectOption("magnifier");
    await expect(frame.locator(".magnifier")).toHaveCount(1, { timeout: 15_000 });
    // And back: put down, it is gone.
    await page.locator("[data-lab-tool]").selectOption("lamp");
    await expect(frame.locator(".magnifier")).toHaveCount(0);
  });

  test("takes the preview into the red room (item 39)", async ({ page }) => {
    await openLab(page);
    await previewFrame(page);
    await page.locator("[data-lab-redroom]").click();
    // The frame reloads with the red room switched on, then goes straight in.
    await expect
      .poll(
        async () => {
          const handle = await page.locator("iframe[data-lab-preview]").elementHandle();
          const frame = await handle?.contentFrame();
          return frame ? await frame.locator(".red-room__leave").count() : 0;
        },
        { timeout: 60_000 },
      )
      .toBe(1);
  });

  test("puts every knob on a control", async ({ page }) => {
    await openLab(page);

    const sliders = page.locator("input[type=range]");
    // One per knob, and a number field beside each for typing an exact value.
    await expect(sliders.first()).toBeVisible();
    expect(await sliders.count()).toBeGreaterThan(30);
    expect(await page.locator("input[type=number]").count()).toBe(await sliders.count());
  });

  test("moving a control changes the page in the preview, live", async ({ page }) => {
    await openLab(page);
    const frame = await previewFrame(page);

    /*
     * `ringSize` -> `--tune-ring`, which styles.css actually consumes (the
     * cursor ring's size). A cause: the ring is part of the cursor, not a
     * result of the light.
     *
     * Read in the PREVIEW, which is a separate window with its own copy of
     * every module: the editor's own document changing would prove only that
     * the slider wrote a variable in a page nobody is looking at.
     */
    const read = () =>
      frame.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--tune-ring").trim(),
      );

    expect(await read()).not.toBe("44px");
    await setKnob(page, "ringSize", "44");
    await expect.poll(read).toBe("44px");

    const consumed = await frame.evaluate(() =>
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

  test("keeps a change as a draft until it is saved, and Discard drops it", async ({ page }) => {
    await openLab(page);
    const status = page.locator("[data-lab-save]");
    await expect(status).toHaveAttribute("data-lab-dirty", "no");

    await setKnob(page, "ringSize", "44");
    await expect(status).toHaveAttribute("data-lab-dirty", "yes");

    // A reload does not lose it: the draft is kept in this browser.
    await page.reload();
    await page.locator("#knob-ringSize").waitFor({ state: "attached" });
    await expect(page.locator("#knob-ringSize")).toHaveValue("44");
    await expect(status).toHaveAttribute("data-lab-dirty", "yes");

    await page.getByRole("button", { name: "Discard" }).click();
    await expect(status).toHaveAttribute("data-lab-dirty", "no");
    await expect(page.locator("#knob-ringSize")).not.toHaveValue("44");
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
    const frame = await previewFrame(page);

    // The pieces interact, so tuning one against a mock would be worse than not
    // tuning it at all. The preview is the site itself.
    await expect(frame.locator(".glass").first()).toBeVisible();
    await expect.poll(() => frame.locator(".floor-light").count()).toBeGreaterThan(0);
    await expect.poll(() => frame.locator(".photo-surface").count()).toBeGreaterThan(0);
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
