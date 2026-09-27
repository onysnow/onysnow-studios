import { expect, test } from "./fixtures";

/**
 * One loop, and it sleeps (effects/engine/scheduler; optics plan step 5).
 *
 * Eight loops used to run, and three never slept -- the cursor follower
 * after it arrived, the shutter charge with nothing held, the refraction
 * filters polling a setting -- plus the liquid glass library, which
 * re-rendered every pane every frame. A tab with a live frame loop never lets
 * the browser idle its compositor, so a still page paid for sixty frames a
 * second. Now a page nobody is touching asks for no frames at all.
 */

async function countFrames(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__frames += 1;
      return raf(cb);
    };
  });
}

const frames = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __frames: number }).__frames);

/** Wait until the page has gone quiet: no frame asked for over `quiet` ms. */
async function settle(page: import("@playwright/test").Page, quiet: number, timeout: number) {
  await expect
    .poll(
      async () => {
        const a = await frames(page);
        await page.waitForTimeout(quiet);
        return (await frames(page)) - a;
      },
      { timeout, intervals: [0] },
    )
    .toBe(0);
}

test.describe("the scheduler", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "The effect layer runs in Chromium.");

  test("a still page asks for no frames, and a move wakes it and lets it sleep", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await countFrames(page);
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    await page.mouse.move(640, 400, { steps: 3 });
    // Still: nothing asks for a frame.
    await settle(page, 3000, 60_000);

    // A move wakes the loop (the cursor eases after it)...
    const before = await frames(page);
    await page.mouse.move(300, 500, { steps: 4 });
    await page.waitForTimeout(500);
    expect(await frames(page)).toBeGreaterThan(before);
    // ...and it sleeps again once the follower has arrived.
    await settle(page, 3000, 60_000);
  });

  test("liquid glass: a still page asks for no frames", async ({ page }) => {
    test.setTimeout(180_000);
    await countFrames(page);
    await page.goto("/?glass=raster");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-seam] .glass").first()).toHaveAttribute("data-liquid", "on", {
      timeout: 60_000,
    });
    await page.mouse.move(640, 400, { steps: 3 });
    await settle(page, 3000, 150_000);
  });
});
