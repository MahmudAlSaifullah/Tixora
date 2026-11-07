import { defineConfig } from "@playwright/test";
import { e2eEnv, E2E_PORT } from "./tests/e2e/e2e-env";

// End-to-end tests run against a production build ("npm run build" first), on a dedicated database
// that is wiped and reseeded at the start of each run. Development data is never touched.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    // Not /api/health: this starts before global setup has created the database.
    url: `http://localhost:${E2E_PORT}/icon.svg`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: e2eEnv(),
  },
});
