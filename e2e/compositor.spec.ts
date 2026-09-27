import { expect, test } from "./fixtures";
import { layerZ, PANE_LAYERS, SIDE_LAYER_Z } from "../src/effects/engine/compositor";

/**
 * Every layer a pane has is in the compositor's slot, in the compositor's
 * order (effects/engine/compositor; optics plan step 4). The order is optics:
 * the light under the glass under the light on it, both above the liquid
 * render -- the liquid canvas once sat on top of the light layer and buried
 * it, because its library's inline z-index beat a stylesheet rule.
 */

type Layer = { name: string | null; z: number; tag: string };

async function paneLayers(page: import("@playwright/test").Page) {
  const band = page.locator("[data-seam] .glass").first();
  await band.scrollIntoViewIfNeeded();
  const box = (await band.boundingBox())!;
  // Light it, so the passes create their layers.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 4 });
  await page.mouse.down();
  await expect
    .poll(() => band.evaluate((el) => el.querySelectorAll(":scope > canvas").length), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(2);
  await page.mouse.up();
  return band.evaluate((el) => ({
    children: [...el.children].map((c) => ({
      name: c.getAttribute("data-layer"),
      z: Number.parseInt(getComputedStyle(c).zIndex, 10),
      tag: c.tagName,
    })) as Layer[],
    sideZ: Number.parseInt(getComputedStyle(el.nextElementSibling!).zIndex, 10),
  }));
}

function checkOrder(children: Layer[]) {
  const layers = children.filter((c) => c.name);
  // Each in its slot, with the compositor's z-index.
  for (const l of layers) {
    expect(PANE_LAYERS as readonly string[]).toContain(l.name);
    expect(l.z, l.name!).toBe(layerZ(l.name as (typeof PANE_LAYERS)[number]));
  }
  // In the DOM in the same order as they paint, and all before the content.
  const names = layers.map((l) => l.name);
  const expected = PANE_LAYERS.filter((n) => names.includes(n));
  expect(names).toEqual(expected);
  const firstContent = children.findIndex((c) => !c.name);
  expect(firstContent).toBe(layers.length);
  // Nothing in the pane is an unassigned canvas.
  expect(children.filter((c) => c.tag === "CANVAS" && !c.name)).toEqual([]);
  return names;
}

test.describe("the compositor", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "The effect layer runs in Chromium.");

  test("CSS glass: every pane layer in its slot and order", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const { children, sideZ } = await paneLayers(page);
    const names = checkOrder(children);
    for (const n of ["pane:bokeh", "pane:refraction", "pane:glare", "pane:under", "pane:surface"]) {
      expect(names).toContain(n);
    }
    expect(sideZ).toBe(SIDE_LAYER_Z);
  });

  test("liquid glass: the library's canvas is taken into its slot, under the light", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/?glass=raster");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-seam] .glass").first()).toHaveAttribute("data-liquid", "on", {
      timeout: 60_000,
    });
    const { children } = await paneLayers(page);
    const names = checkOrder(children);
    expect(names).toContain("pane:liquid");
    expect(names.indexOf("pane:liquid")).toBeLessThan(names.indexOf("pane:surface"));
  });
});
