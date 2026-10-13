import { defineConfig, devices } from "@playwright/test";

// E2E runs the PRODUCTION build (vite preview) against the local Convex backend in demo mode.
// Prerequisite once per machine: `npm run demo:setup` (sets DEMO_MODE and keys on the local deployment).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // one shared backend; each spec resets the demo data
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    { command: "npx convex dev --tail-logs disable", url: "http://127.0.0.1:3210/version", reuseExistingServer: true, timeout: 180_000 },
    { command: "npm run build && npm run preview -- --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 180_000 },
  ],
});
