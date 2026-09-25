import { test as base, expect } from "@playwright/test";

/**
 * Every spec opens the site as a RETURNING visitor.
 *
 * The first hard load of a session shows the loader, and the loader now holds
 * until someone clicks "Click to enter". A test browser is always a first
 * visit, so without this every page sat behind that overlay for the whole
 * test -- and anything that hit-tests the page found the overlay instead of
 * the page. The shutter afterimage specs failed exactly that way: the flash
 * asked `elementFromPoint` what was under the pointer and got the loader.
 *
 * Setting the flag the loader itself writes is the honest precondition: it is
 * the state a real second-page visitor is in. The loader is covered by its own
 * spec, which imports the plain Playwright `test` and so meets it fresh.
 */
export const test = base.extend({
  /*
   * The callback is conventionally called `use`. It is renamed because the
   * React hooks lint rule reads any call to `use(...)` as React's `use` hook
   * and fails the file -- it cannot tell a Playwright fixture from a component.
   */
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("onysnow:loaded", "1");
      } catch {
        /* storage blocked: the loader shows, and the test will say so */
      }
    });
    await provide(page);
  },
});

export { expect };
