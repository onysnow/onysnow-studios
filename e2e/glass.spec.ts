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

  test("holding still sends light through the glass, not onto its face", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const band = page.locator("[data-seam] .glass").first();
    await band.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const box = await band.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.4, { steps: 5 });

    const sum = (selector: string) =>
      band.evaluate((el, sel) => {
        const cv = el.querySelector<HTMLCanvasElement>(sel);
        if (!cv || !cv.width) return 0;
        const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
        let total = 0;
        for (let i = 0; i < d.length; i += 4 * 101) total += d[i + 3]!;
        return total;
      }, selector);

    const before = await sum("canvas.glass__under");
    // No pointer movement from here on: this is the hold trigger on its own.
    await page.mouse.down();
    await page.waitForTimeout(2800);
    const under = await sum("canvas.glass__under");
    await page.mouse.up();

    // The pool of light and shadow lands under the pane...
    expect(under).toBeGreaterThan(before + 1000);
    // ...and it is drawn beneath the glass's text, not over it.
    const z = await band.evaluate(
      (el) => getComputedStyle(el.querySelector("canvas.glass__under")!).zIndex,
    );
    expect(Number(z)).toBeLessThan(0);
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

  test("the light through the glass switches on with the charge and off without it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const floor = page.locator("canvas.floor-light");
    await expect(floor).toHaveAttribute("data-dynamic", "idle");
    await page.mouse.move(400, 400, { steps: 3 });
    await page.mouse.down();
    await expect(floor).toHaveAttribute("data-dynamic", "", { timeout: 5000 });
    await page.mouse.up();
    // Released, the charge bleeds away and the layer parks again.
    await expect(floor).toHaveAttribute("data-dynamic", "idle", { timeout: 15_000 });
  });
});

test.describe("the pane's edge", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  /*
   * The side faces absorb what is seen through them, which only a layer
   * OUTSIDE the pane can do: a pane is a stacking context, and a multiply
   * layer inside one paints its colour flat instead of absorbing. So they are
   * siblings, laid on the pane's edges by the pass that measures it.
   */
  test("its side faces sit on its top and bottom edges, outside it, absorbing", async ({
    page,
  }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const band = page.locator("[data-seam] .glass").first();
    await band.scrollIntoViewIfNeeded();
    const facts = async () =>
      band.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = el.nextElementSibling as HTMLElement;
        const bottom = top.nextElementSibling as HTMLElement;
        const t = top.getBoundingClientRect();
        const b = bottom.getBoundingClientRect();
        return {
          classes: [top.className, bottom.className],
          topAt: Math.round(t.top - r.top),
          bottomAt: Math.round(r.bottom - b.bottom),
          widths: [Math.round(t.width - r.width), Math.round(b.width - r.width)],
          heights: [t.height, b.height],
          blend: getComputedStyle(top).mixBlendMode,
          inside: el.querySelector(".glass-side") !== null,
        };
      });
    await expect.poll(async () => (await facts()).heights[0]).toBeGreaterThan(0);
    const f = await facts();
    expect(f.classes[0]).toContain("glass-side--top");
    expect(f.classes[1]).toContain("glass-side--bottom");
    expect(f.topAt).toBe(0);
    expect(f.bottomAt).toBe(0);
    expect(f.widths).toEqual([0, 0]);
    expect(f.blend).toBe("multiply");
    expect(f.inside).toBe(false);
  });
});

test.describe("every pane is one described piece of glass", () => {
  // Optics plan step 2: <Pane> declares what each pane is, on the element
  // every pass measures. Today's panes are all frosted float.
  test("each pane carries its material, and its side faces follow it", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const panes = await page.$$eval("header.glass, main .glass:not(.glass-toggle)", (els) =>
      els.map((el) => ({
        material: el.getAttribute("data-material"),
        sides: el.nextElementSibling?.classList.contains("glass-side--top") ?? false,
      })),
    );
    expect(panes.length).toBeGreaterThan(2);
    for (const pane of panes) {
      expect(pane.material).toBe("frosted-float");
      expect(pane.sides).toBe(true);
    }
  });
});

test.describe("plastic on the glass", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  test("the orange button passes orange light behind it, thrown away from the lamp", async ({
    page,
  }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const button = page.locator("main .glass .plastic").first();
    await button.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const box = (await button.boundingBox())!;

    // No generic drop shadow: what lands behind it is light, not darkness.
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
    const light = () =>
      button.evaluate((el) => {
        const cs = getComputedStyle(el, "::before");
        const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform);
        return { x: m.m41, opacity: Number(cs.opacity), blend: cs.mixBlendMode };
      });
    // Unlit: nothing passes through a lamp that is off.
    expect((await light()).opacity).toBe(0);

    const litFrom = async (x: number, y: number) => {
      await page.mouse.move(x, y, { steps: 4 });
      await page.mouse.down();
      await page.waitForTimeout(2200);
      const l = await light();
      await page.mouse.up();
      await page.waitForTimeout(600);
      return l;
    };

    const fromLeft = await litFrom(box.x - 80, box.y + box.height / 2);
    expect(fromLeft.blend).toBe("plus-lighter");
    expect(fromLeft.opacity).toBeGreaterThan(0);
    expect(fromLeft.x).toBeGreaterThan(0.5);
    expect((await litFrom(box.x + box.width + 80, box.y + box.height / 2)).x).toBeLessThan(-0.5);
  });
});
