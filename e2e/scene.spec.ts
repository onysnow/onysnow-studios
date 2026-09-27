import { expect, test } from "./fixtures";

/**
 * The scene reads the page once a frame, before it writes anything
 * (effects/scene/scene.ts; optics plan step 3).
 *
 * What costs is not reading layout, it is reading layout AFTER a style write
 * in the same frame: the browser then has to resolve every style on the page
 * -- 19 backdrop-filters, dozens of blend modes -- before it can answer. The
 * old pass (lib/edge-glow) interleaved them, reading each pane's side-face
 * offsets in the middle of its writes: about six forced style flushes a
 * frame on a pointer move.
 *
 * So this counts exactly that: layout reads made by the scene while a style
 * write is pending in the same frame. The first read of a frame may find
 * something else's write pending; every read after it is answered from the
 * same resolved style. More than one a frame means reads and writes are
 * interleaved again.
 */
test.describe("the scene", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Measured in Chromium.");

  test("reads the page once a frame, before it writes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const w = window as unknown as {
        __flushes: Map<number, number>;
        __sceneFrames: number;
      };
      w.__flushes = new Map();
      let dirty = false;
      let frameTime = -1;

      // A frame renders between rAF batches, which resolves pending style.
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((time) => {
          if (time !== frameTime) {
            frameTime = time;
            dirty = false;
          }
          cb(time);
        });

      // Style writes.
      const proto = CSSStyleDeclaration.prototype;
      const setProperty = proto.setProperty;
      proto.setProperty = function (...args: Parameters<typeof setProperty>) {
        dirty = true;
        return setProperty.apply(this, args);
      };
      for (const name of ["transform", "width", "height", "borderRadius", "position"]) {
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (!d?.set) continue;
        const set = d.set;
        Object.defineProperty(proto, name, {
          ...d,
          set(v: string) {
            dirty = true;
            set.call(this, v);
          },
        });
      }

      // Layout reads made by the scene while a write is pending.
      const fromScene = () => (new Error().stack ?? "").includes("effects/scene/scene");
      (w as unknown as { __sceneReads: number }).__sceneReads = 0;
      let sampled = 0;
      const note = () => {
        // Count some reads as the scene's, cheaply: a stack is only taken for
        // every 50th read, or when a write is pending.
        if (++sampled % 50 === 0 && fromScene()) {
          (w as unknown as { __sceneReads: number }).__sceneReads += 1;
        }
        if (dirty && fromScene()) {
          w.__flushes.set(frameTime, (w.__flushes.get(frameTime) ?? 0) + 1);
        }
        dirty = false;
      };
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        note();
        return rect.call(this);
      };
      for (const name of ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const) {
        const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)!;
        const get = d.get!;
        Object.defineProperty(HTMLElement.prototype, name, {
          ...d,
          get() {
            note();
            return get.call(this);
          },
        });
      }
    });

    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      (window as unknown as { __flushes: Map<number, number> }).__flushes.clear();
    });

    for (let i = 0; i < 15; i++) {
      await page.mouse.move(300 + i * 40, 450 + (i % 5) * 30);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(300);

    const perFrame = await page.evaluate(() => [
      ...(window as unknown as { __flushes: Map<number, number> }).__flushes.values(),
    ]);
    // Never more than one forced style flush in a frame.
    expect(Math.max(0, ...perFrame)).toBeLessThanOrEqual(1);
    // And the check can see the scene at all: it read during those frames.
    const reads = await page.evaluate(
      () => (window as unknown as { __sceneReads: number }).__sceneReads,
    );
    expect(reads).toBeGreaterThan(0);
  });

  test("the lights are a list, the cursor lamp first", async ({ page }) => {
    await page.goto("/?glass=css");
    await page.waitForLoadState("networkidle");
    const ids = await page.evaluate(async () => {
      const mod = await import("/src/effects/light/lights.ts");
      return mod.lights.map((l: { id: string }) => l.id);
    });
    expect(ids[0]).toBe("cursor");
  });
});
