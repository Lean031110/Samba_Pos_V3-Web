// =====================================================================
// playwright.pages.config.js — Pages demo smoke test
// =====================================================================
// Runs against a LOCAL preview of the GitHub Pages artifact (built with
// the config.demo.js overlay), served under the real sub-path
// /Samba_Pos_V3-Web/ by scripts/serve-pages.js.
//
//   node scripts/build-pages-demo.js            (build _site)
//   node scripts/serve-pages.js _site /Samba_Pos_V3-Web/ 8080 &
//   PAGES_BASE_URL=http://localhost:8080/Samba_Pos_V3-Web/ \
//     npx playwright test -c playwright.pages.config.js
//
// This suite NEVER touches a production backend: the demo overlay
// (DEMO_MODE=true) routes every API call to the in-browser Mock API.
// =====================================================================

const { defineConfig } = require('@playwright/test');

const baseURL = process.env.PAGES_BASE_URL || 'http://localhost:8080/Samba_Pos_V3-Web/';

module.exports = defineConfig({
  testDir: './tests/pages-smoke',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: './tests/pages-smoke/.results',
});
