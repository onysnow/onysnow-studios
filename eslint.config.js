import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // src/lib/liquidglass is vendored verbatim from ybouane/liquidglass (MIT).
    // It uses upstream's formatting, which disagrees with ours in 2094 places
    // and in none that matter. Linting it would mean reformatting it, and
    // reformatting it would destroy the ability to diff the directory against
    // upstream and see only what WE changed -- which is the entire reason it
    // is vendored rather than installed. See src/lib/liquidglass/NOTICE.md.
    ignores: ["dist", ".output", ".vinxi", "src/lib/liquidglass/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    /*
     * shadcn primitives export their variant helpers beside the component --
     * `buttonVariants`, `badgeVariants` and so on -- and those exports are
     * part of the API the rest of the app imports.
     *
     * react-refresh/only-export-components flags all eight of them. The fix
     * it wants is splitting every primitive into two files, which churns
     * vendored UI code, breaks the upstream shape people expect from shadcn,
     * and buys nothing but a slightly faster hot reload in dev. Turned off
     * here, and only here, rather than left as permanent noise that trains
     * everyone to ignore the warning column.
     */
    files: ["src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
