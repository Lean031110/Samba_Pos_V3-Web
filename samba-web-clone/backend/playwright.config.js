// =====================================================================
// playwright.config.js
// =====================================================================
// Run with:
//   npx playwright test                       # headless (local)
//   npx playwright test --headed              # show browser
//   npx playwright test --debug               # step-by-step
//   npx playwright test --repeat-each=3       # detect flaky tests
//
// CI behavior:
//   - retries: 2          (auto-retry failed tests once)
//   - failOnFlakyTests: true  (any retry-pass = CI FAIL)
// =====================================================================

const { defineConfig } = require('@playwright/test');

const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  // In CI: retry once so flaky tests surface via failOnFlakyTests.
  // Locally: no retries — fail fast for debugging.
  retries: isCI ? 2 : 0,
  // If a test passes after retry in CI, treat the whole run as failed.
  failOnFlakyTests: isCI,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/report', open: 'never' }],
    // In CI, emit a JUnit XML for test-result integrations.
    ...(isCI ? [['junit', { outputFile: 'tests/e2e/results.xml' }]] : []),
  ],
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5000,
    navigationTimeout: 10000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  // Run seed before all tests (migrations run automatically in server startup)
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  webServer: {
    command: 'node src/api/server.js',
    port: 3001,
    cwd: __dirname,
    timeout: 30000,
    reuseExistingServer: true,  // Always reuse — globalSetup handles seed
    env: {
      JWT_SECRET: process.env.JWT_SECRET || 'playwright-test-secret-32-chars-min!!',
      ADMIN_PIN: process.env.ADMIN_PIN || '1234',
      NODE_ENV: 'test',
    },
  },
});
