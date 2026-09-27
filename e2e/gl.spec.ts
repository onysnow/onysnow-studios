import { expect, test } from "./fixtures";

/**
 * One WebGL context for the light passes (effects/engine/gl; optics plan
 * step 6).
 *
 * The light on the glass, the light through it and the lens each made their
 * own; with the liquid glass renderer that was four. Now the three passes
 * share one, and the page holds two: the shared one and the liquid glass's.
 */

type Counted = { __glCanvases: Set<HTMLCanvasElement> };

async function countContexts(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Counted;
    w.__glCanvases = new Set();
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      const ctx = (get as (...a: unknown[]) => unknown).call(this, kind, ...rest);
      if (ctx && /webgl/.test(kind)) w.__glCanvases.add(this);
      return ctx;
    } as typeof get;
  });
}

const contexts = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as Counted).__glCanvases.size);

/** Wind the shutter so every pass has drawn at least once. */
async function charge(page: import("@playwright/test").Page) {
  await page.mouse.move(420, 380, { steps: 4 });
  await page.mouse.down();
  await expect(page.locator("canvas.floor-light")).toHaveAttribute("data-dynamic", "", {
    timeout: 5000,
  });
  await page.waitForTimeout(600);
}

/** How many pixels of a 2D canvas have anything in them. */
const inked = (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext("2d");
    if (!ctx || !c.width || !c.height) return 0;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n += 1;
    return n;
  });

test.describe("the light passes share one WebGL context", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  test("liquid glass: two contexts, the shared one and the liquid renderer's", async ({ page }) => {
    await countContexts(page);
    await page.goto("/?glass=raster");
    await page.waitForLoadState("networkidle");
    await charge(page);
    // The liquid renderer starts once its scene has been captured.
    await expect.poll(() => contexts(page), { timeout: 20_000 }).toBe(2);
    await page.waitForTimeout(500);
    expect(await contexts(page)).toBe(2);
  });

  test("CSS glass: one context", async ({ page }) => {
    await countContexts(page);
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    await charge(page);
    expect(await contexts(page)).toBe(1);
  });

  test("each pass still reaches its own canvas", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    await charge(page);
    // The lens and the floor are plain 2D copies of what the shared buffer drew.
    await expect.poll(() => inked(page, "canvas.cursor-light")).toBeGreaterThan(1000);
    await expect.poll(() => inked(page, "canvas.floor-light")).toBeGreaterThan(1000);
    // And the light on the glass lands in the panes' surface layers.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll<HTMLCanvasElement>("canvas.glass__surface")].some((c) => {
            const ctx = c.getContext("2d");
            if (!ctx || !c.width || !c.height) return false;
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return true;
            return false;
          }),
        ),
      )
      .toBe(true);
    // Released, the charge bleeds away and the lens and floor go dark again.
    await page.mouse.up();
    await expect.poll(() => inked(page, "canvas.floor-light"), { timeout: 15_000 }).toBe(0);
  });

  /*
   * Step 7: the light under a pane follows THAT pane's causes. A pane that
   * stands higher off the photograph throws its light and shadow further, so
   * raising one pane's gap changes what lands under it.
   */
  test("the light under a pane follows that pane's own gap", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const band = page.locator("[data-seam] .glass").first();
    await band.scrollIntoViewIfNeeded();
    const box = (await band.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8, { steps: 4 });
    await page.mouse.down();
    const under = band.locator(':scope > canvas[data-layer="pane:under"]');
    await expect(under).toHaveCount(1, { timeout: 10_000 });
    const picture = () =>
      under.evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 97) sum += d[i]!;
        return sum;
      });
    // Held long enough to settle, then read twice to be sure it has.
    await expect
      .poll(
        async () => {
          const a = await picture();
          await page.waitForTimeout(800);
          return a > 0 && a === (await picture());
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const before = await picture();

    await band.evaluate((el) => el.setAttribute("data-gap", "260"));
    await expect.poll(picture, { timeout: 15_000 }).not.toBe(before);
    await page.mouse.up();
  });
});
