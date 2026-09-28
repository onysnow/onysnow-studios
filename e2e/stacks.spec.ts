import { expect, test } from "./fixtures";

/*
 * Stacks (light step E): panes resting on panes, in /lab only. Each layer is
 * placed by the stack solver: the bottom one gets what came through the top
 * one, and a bonded pair passes more than an air-gapped pair, because the
 * surfaces between them are gone.
 */
type Placed = {
  interface: string;
  index: number;
  count: number;
  zBottom: number;
  lightIn: number[];
  throughScale: number[];
  hasAbove: boolean;
};

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "The effect layer is suppressed outside Chromium.",
);

test("the lab's stacks are placed by the stack solver", async ({ page }) => {
  const shaderErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /\b(shader|link):/i.test(m.text())) shaderErrors.push(m.text());
  });
  await page.goto("/lab?glass=css");
  await page.waitForLoadState("networkidle");
  const stacks = page.locator("[data-lab-stacks] [data-stack]");
  await expect(stacks).toHaveCount(3);
  await stacks.first().scrollIntoViewIfNeeded();
  const box = (await stacks.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });

  const placed = async () =>
    ((await page.evaluate(() => (window as unknown as { __stacks?: Placed[] }).__stacks)) ??
      []) as Placed[];
  await expect.poll(async () => (await placed()).length, { timeout: 20_000 }).toBe(6);
  const all = await placed();
  const of = (kind: string, index: number) =>
    all.find((p) => p.interface === kind && p.index === index)!;

  // Top layers get the lamp's light whole; bottom layers get it through the top.
  for (const kind of ["air", "contact", "bonded"]) {
    expect(of(kind, 1).lightIn).toEqual([1, 1, 1]);
    expect(of(kind, 0).hasAbove).toBe(true);
    expect(of(kind, 1).hasAbove).toBe(false);
  }
  expect(of("air", 0).lightIn[1]).toBeLessThan(1);
  // The upper pane stands on the lower one, plus the air between.
  expect(of("air", 1).zBottom - of("air", 0).zBottom).toBe(18 + 24);
  expect(of("contact", 1).zBottom - of("contact", 0).zBottom).toBe(18);
  // Bonded: no inner surfaces, so more gets through than across an air gap.
  expect(of("bonded", 0).throughScale[1]).toBeGreaterThan(of("air", 0).throughScale[1]!);
  expect(shaderErrors).toEqual([]);
});
