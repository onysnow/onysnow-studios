import { expect, test } from "./fixtures";

/**
 * The glass has to be glass: see what is behind it, and light up when the
 * shutter is wound -- including when it is wound by holding still.
 *
 * Each of these was broken without any error anywhere. The page rendered, the
 * layers were all present, and the pane was still a dark rectangle. Found only
 * by switching layers off one at a time in a screenshot, so they are guarded
 * here by the structural facts that caused them rather than by pixels.
 */
test.describe("glass", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  test("a band bends what is behind it in its own backdrop pass", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");

    const band = page.locator("main .glass").first();
    await band.scrollIntoViewIfNeeded();
    // The bevel map is fitted after the route hydrates.
    await expect
      .poll(() => band.evaluate((el) => getComputedStyle(el).backdropFilter))
      .toContain("url(");

    const facts = await band.evaluate((el) => ({
      isolation: getComputedStyle(el).isolation,
      // A child backdrop-filter cannot see past an isolated pane; the bend
      // has to be on the pane, and nothing inside may try to do it instead.
      childBackdrops: [...el.children]
        .filter((k) => getComputedStyle(k).display !== "none")
        .map((k) => getComputedStyle(k).backdropFilter)
        .filter((f) => f && f !== "none"),
    }));
    expect(facts.isolation).toBe("isolate");
    expect(facts.childBackdrops).toEqual([]);
  });

  test("holding still lights the glass, not just the ring", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(600);

    const band = page.locator("main .glass").first();
    const box = await band.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.4, { steps: 5 });

    const lit = () =>
      band.evaluate((el) => {
        const cv = el.querySelector<HTMLCanvasElement>("canvas.glass__surface");
        if (!cv) return 0;
        const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4 * 101) sum += d[i]! + d[i + 1]! + d[i + 2]!;
        return sum;
      });

    const before = await lit();
    // No pointer movement from here on: this is the hold trigger on its own.
    await page.mouse.down();
    await page.waitForTimeout(2800);
    const during = await lit();
    await page.mouse.up();

    expect(during).toBeGreaterThan(before * 1.5 + 1000);
  });

  test("a band sits over the join, with both photographs running on under it", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const seam = page.locator("[data-seam]").first();
    await expect
      .poll(() => seam.evaluate((el) => (el as HTMLElement).style.marginTop))
      .not.toBe("");

    const g = await seam.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const up = el.previousElementSibling!.getBoundingClientRect();
      const down = el.nextElementSibling!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, upBottom: up.bottom, downTop: down.top };
    });
    // The photographs meet behind the middle of the glass.
    const middle = (g.top + g.bottom) / 2;
    expect(Math.abs(g.upBottom - middle)).toBeLessThan(2);
    expect(Math.abs(g.downTop - middle)).toBeLessThan(2);
  });

  test("liquid glass actually renders a nested pane", async ({ page }) => {
    await page.goto("/?glass=raster");
    await page.waitForLoadState("networkidle");
    // The library only draws once a pane is initialised and has rendered a
    // frame; its scene canvas stays at the 300x150 canvas default until then.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const inst = (
              window as unknown as { __liquidglass?: { _sceneCanvas: HTMLCanvasElement }[] }
            ).__liquidglass?.[0];
            return inst ? inst._sceneCanvas.width : 0;
          }),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(300);
  });
});
