import { defineConfig, devices } from "@playwright/test";

const PORT = 4183;
const CHROMIUM_PATH = process.env["PLAYWRIGHT_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./e2e",
  // A smoke suite's job is to be fast enough that nobody is tempted to skip it.
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Escape hatch for sandboxes that ship their own Chromium and can't run
        // `playwright install`. CI leaves this unset and uses the managed build.
        ...(CHROMIUM_PATH ? { launchOptions: { executablePath: CHROMIUM_PATH } } : {}),
      },
    },
  ],
  /*
   * Runs against `vite dev`, not `vite preview`.
   *
   * The production build targets a Cloudflare Worker via Nitro, so its output
   * lands in `.output/` and `vite preview` — which looks for `dist/server` —
   * cannot serve it. Previewing properly would mean running wrangler.
   *
   * Little is lost: the dev server still server-renders, and Lightning CSS still
   * runs, which is what the frosted-glass guard below depends on. Run
   * `npm run build` in CI alongside this to cover the bundling itself.
   */
  webServer: {
    command: `npx vite dev --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
