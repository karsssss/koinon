// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "sim/out/", "dist/", ".convex/", "convex/_generated/", "test-results/", "playwright-report/", "src/components/ui/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["sim/**/*.ts", "shared/**/*.ts"],
    rules: {
      // Simulation and domain rules must be deterministic: no ambient randomness or wall-clock reads.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded Rng from sim/rng.ts." },
        { object: "Date", property: "now", message: "Pass time in explicitly." },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ["**/*.test.ts", "test/**/*.ts", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    // Playwright requires `({}, testInfo)` when a hook uses no fixtures.
    files: ["e2e/**/*.ts"],
    rules: { "no-empty-pattern": "off" },
  },
);
