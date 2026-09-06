// =====================================================================
// playwright.config.js
// =====================================================================
// Run with:
//   npx playwright test                  # headless (CI)
//   npx playwright test --headed         # show browser
//   npx playwright test --debug          # step-by-step
// =====================================================================

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/report', open: 'never' }],
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
