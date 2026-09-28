import { expect, test } from "./fixtures";

/**
 * The performance readout (effects/engine/perf): off unless asked for with
 * ?perf=1, and when on it times the frame, each task and each GL pass --
 * without keeping the page awake.
 */
type Snap = Record<string, { avg: number; n: number }>;

test.describe("the performance readout", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The effect layer is suppressed outside Chromium.",
  );

  test("is off by default", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-perf-panel]")).toHaveCount(0);
    expect(await page.evaluate(() => typeof (window as { __perf?: unknown }).__perf)).toBe(
      "undefined",
    );
  });

  test("with ?perf=1, times the frame, the tasks and the passes while lit", async ({ page }) => {
    await page.goto("/?glass=css&perf=1");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-perf-panel]")).toHaveCount(1);
    await page.mouse.move(420, 380, { steps: 4 });
    await page.mouse.down();
    const snap = () => page.evaluate(() => (window as unknown as { __perf: () => Snap }).__perf());
    await expect
      .poll(
        async () => {
          const s = await snap();
          return ["frame", "cpu:glass-light", "cpu:floor-light", "gpu:glass", "gpu:floor"].every(
            (k) => (s[k]?.n ?? 0) > 0,
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(page.locator("[data-perf-panel]")).toContainText("GPU");
    await page.mouse.up();
  });
});
