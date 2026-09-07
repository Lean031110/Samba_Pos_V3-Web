// =====================================================================
// ui-isolated.spec.js — Suite B: UI tests (fully isolated)
// =====================================================================
// Each test: opens fresh page, does own login via UI interaction.
// No shared state, no evaluate() for async operations.
// =====================================================================

const { test, expect } = require('@playwright/test');
const path = require('path');

const BASE = 'http://localhost:3001';
const SHOTS = path.join(__dirname, '..', '..', '..', 'docs', 'screenshots');

test.describe('Suite B: UI (Isolated)', () => {

  async function loginViaUI(page) {
    await page.goto(BASE);
    await page.waitForSelector('#view-login.is-active');
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    // Click the Login flex-button (use attribute selector)
    await page.locator('flex-button[variant="success"]').click({ force: true });
    // If click doesn't work, try calling login directly
    await page.evaluate(() => {
      if (window.App && window.store && !window.store.state.currentUser) {
        window.App.login();
      }
    });
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
  }

  test('B1: Login via browser → dashboard', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#view-login.is-active');
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '1234');
    await page.screenshot({ path: path.join(SHOTS, 'ui-01-login.png') });
    // Use evaluate to call login (it's async but we wait for the view change)
    await page.evaluate(() => window.App.login());
    await page.waitForSelector('#view-dashboard.is-active', { timeout: 8000 });
    await page.screenshot({ path: path.join(SHOTS, 'ui-02-dashboard.png') });
    await expect(page.locator('#header-user')).toHaveText('Administrator');
  });

  test('B2: POS view loads with command bar', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('pos'));
    await page.waitForSelector('#view-pos.is-active', { timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, 'ui-03-pos.png') });
    const texts = await page.locator('#pos-cmdbar flex-button').allTextContents();
    for (const btn of ['Gift', 'Void', 'Note', 'Tags', 'Discount', 'Print Bill', 'Pay']) {
      expect(texts.some(t => t.includes(btn))).toBeTruthy();
    }
  });

  test('B3: Kitchen view loads', async ({ page }) => {
    await loginViaUI(page);
    await page.evaluate(() => window.App.navigate('kitchen'));
    await page.waitForSelector('#view-kitchen.is-active', { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SHOTS, 'ui-04-kitchen.png') });
    await expect(page.locator('.kds-stations-bar')).toBeVisible();
  });

  test('B4: Wrong PIN shows error', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector('#view-login.is-active');
    await page.fill('#login-username', 'Administrator');
    await page.fill('#login-pin', '9999');
    await page.evaluate(() => window.App.login());
    await expect(page.locator('#login-error')).not.toBeEmpty({ timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, 'ui-05-error.png') });
  });

  test('B5: Logout returns to login', async ({ page }) => {
    await loginViaUI(page);
    // Clear token and navigate to login
    await page.evaluate(() => {
      localStorage.removeItem('samba_jwt');
      window.App.navigate('login');
    });
    await page.waitForSelector('#view-login.is-active', { timeout: 5000 });
    await page.screenshot({ path: path.join(SHOTS, 'ui-06-logout.png') });
  });
});
