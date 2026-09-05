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
  // Auto-start the server before tests, stop after
  webServer: {
    command: 'node src/api/server.js',
    port: 3001,
    cwd: __dirname,
    timeout: 15000,
    reuseExistingServer: true,
  },
});
