/**
 * End-to-end tests (Phase 12) against a running app with the demo data:
 *   npm run e2e            (builds, starts the app, runs all browsers' tests)
 *   E2E_BASE_URL=https://staging.example npm run e2e:remote   (an existing deployment)
 * Requires: MySQL with migrations + `npm run db:seed:curriculum && npm run db:seed:demo`,
 * DEMO_PASSWORD set to the password used when seeding, and Chromium
 * (`npx playwright install chromium`). See docs/TESTING.md.
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // tests share one demo database; keep them ordered and predictable
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "en-GB", timezoneId: "Asia/Riyadh" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium" }, grep: /@tablet/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run build && npm run start:standalone", url: `${baseURL}/api/health`, timeout: 240_000, reuseExistingServer: true },
});
