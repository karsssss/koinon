import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "sim/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
