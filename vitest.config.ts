import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    projects: [
      { test: { name: "domain", include: ["shared/**/*.test.ts", "sim/**/*.test.ts", "scripts/**/*.test.ts"], environment: "node" } },
      { test: { name: "convex", include: ["convex/**/*.test.ts"], environment: "edge-runtime" } },
    ],
  },
});
