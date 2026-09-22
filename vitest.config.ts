import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Deliberately separate from vite.config.ts.
 *
 * The app config is the Lovable TanStack wrapper — Start, Nitro, the router
 * plugin, Cloudflare targeting. None of that is wanted for unit tests, and
 * loading it means a test run depends on the whole build pipeline being happy.
 * Everything under `src/lib` that's worth testing is a pure function, so the
 * path alias is the only thing these tests need from the app's build.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // photo-url builds its base from this; tests assert against a known value
      // rather than whatever happens to be in .env on the machine running them.
      VITE_SUPABASE_URL: "https://example.supabase.co",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
