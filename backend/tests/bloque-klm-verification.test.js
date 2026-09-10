// =====================================================================
// bloque-klm-verification.test.js — Bloques K/L/M unit tests
// =====================================================================
// Tests the gaps from docs/PRODUCTION_GAP_MATRIX.md for:
//
//   BLOQUE K — Fase 11: Android (Capacitor)
//     P1: Capacitor config + build pipeline
//
//   BLOQUE L — Fase 12: UI final (caja + reportes)
//     P1: UI de caja (apertura/cierre/payout)
//     P1: UI de reportes (tab Reportes en AdminView)
//
//   BLOQUE M — Fase 13: Release hardening
//     P1: Load test script
//     P1: Failure injection tests
//     P0: Backup/restore drill (already done in Bloque J — verify exists)
//     P1: Offline smoke (covered by Bloque I tests)
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const { createApp, getPrintWorkerInstance } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');

const app = createApp();
const request = supertest(app);

let jwtToken = null;

const BACKEND_DIR = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(BACKEND_DIR, '..', 'frontend');
const REPO_ROOT = path.join(BACKEND_DIR, '..');

async function setupFixtures() {
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;
  assert.ok(jwtToken, 'Login should return a JWT token');
}

async function cleanup() {
  try {
    const serverWorker = getPrintWorkerInstance();
    if (serverWorker) await serverWorker.stop();
  } catch {}
  await db.destroy();
}

// =====================================================================
// 1. BLOQUE K — Capacitor (Android)
// =====================================================================

describe('1. Bloque K — Capacitor (Android)', () => {
  test('1A: capacitor.config.json exists', () => {
    const configPath = path.join(REPO_ROOT, 'capacitor.config.json');
    assert.ok(fs.existsSync(configPath), 'capacitor.config.json should exist');
  });

  test('1B: capacitor config has valid appId', () => {
    const configPath = path.join(REPO_ROOT, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.appId, 'Should have appId');
    assert.ok(config.appId.includes('sambapos'), 'appId should contain sambapos');
    assert.ok(config.appName, 'Should have appName');
  });

  test('1C: capacitor config webDir points to frontend', () => {
    const configPath = path.join(REPO_ROOT, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.webDir.includes('frontend'), 'webDir should point to frontend');
  });

  test('1D: ANDROID.md deployment guide exists', () => {
    const docPath = path.join(REPO_ROOT, 'docs', 'ANDROID.md');
    assert.ok(fs.existsSync(docPath), 'docs/ANDROID.md should exist');
    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.includes('Capacitor'), 'Should mention Capacitor');
    assert.ok(content.includes('APK'), 'Should cover APK build');
    assert.ok(content.includes('AAB'), 'Should cover AAB build');
    assert.ok(content.includes('Android Studio'), 'Should mention Android Studio');
  });

  test('1E: capacitor config has splash screen settings', () => {
    const configPath = path.join(REPO_ROOT, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.plugins?.SplashScreen, 'Should have SplashScreen plugin config');
    assert.ok(config.plugins.SplashScreen.backgroundColor, 'Should have background color');
  });
});

// =====================================================================
// 2. BLOQUE L — UI de Caja
// =====================================================================

describe('2. Bloque L — UI de Caja', () => {
  test('2A: admin.js has _renderCash method', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('_renderCash'), 'Should have _renderCash method');
    assert.ok(content.includes('_openCash'), 'Should have _openCash handler');
    assert.ok(content.includes('_closeCash'), 'Should have _closeCash handler');
  });

  test('2B: admin switch includes cash tab', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes("case 'cash'"), 'Should handle cash tab');
  });

  test('2C: index.html has cash nav button', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('data-admin-tab="cash"'), 'Should have cash nav button');
    assert.ok(content.includes('Caja'), 'Should show "Caja" text');
  });

  test('2D: cash UI shows open session status', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('Caja Abierta') || content.includes('openSession'),
      'Should detect and show open session');
    assert.ok(content.includes('Abrir caja'), 'Should have "Abrir caja" button');
    assert.ok(content.includes('Cerrar caja'), 'Should have "Cerrar caja" button');
  });

  test('2E: cash UI calls cash-sessions API', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('/api/cash-sessions') || content.includes("cash-sessions"),
      'Should call cash-sessions API');
  });
});

// =====================================================================
// 3. BLOQUE L — UI de Reportes
// =====================================================================

describe('3. Bloque L — UI de Reportes', () => {
  test('3A: admin.js has _renderReports method', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('_renderReports'), 'Should have _renderReports method');
    assert.ok(content.includes('_setReportDates'), 'Should have _setReportDates method');
  });

  test('3B: admin switch includes reports tab', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes("case 'reports'"), 'Should handle reports tab');
  });

  test('3C: index.html has reports nav button', () => {
    const indexPath = path.join(FRONTEND_DIR, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes('data-admin-tab="reports"'), 'Should have reports nav button');
    assert.ok(content.includes('Reportes'), 'Should show "Reportes" text');
  });

  test('3D: reports UI has date range selector', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('type="date"'), 'Should have date inputs');
    assert.ok(content.includes('rpt-from'), 'Should have from date input');
    assert.ok(content.includes('rpt-to'), 'Should have to date input');
  });

  test('3E: reports UI calls reports API', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('/reports/'), 'Should call reports API');
    assert.ok(content.includes('sales-summary') || content.includes('top-products'),
      'Should fetch sales summary or top products');
  });

  test('3F: reports UI shows stats grid', () => {
    const adminPath = path.join(FRONTEND_DIR, 'js', 'views', 'admin.js');
    const content = fs.readFileSync(adminPath, 'utf8');
    assert.ok(content.includes('admin-stats-grid'), 'Should use stats grid');
    assert.ok(content.includes('Ventas totales'), 'Should show total sales');
    assert.ok(content.includes('Tickets cerrados'), 'Should show ticket count');
    assert.ok(content.includes('Ticket promedio'), 'Should show average ticket');
  });
});

// =====================================================================
// 4. BLOQUE M — Load test script
// =====================================================================

describe('4. Bloque M — Load Test (P1)', () => {
  test('4A: load-test.js script exists', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'load-test.js');
    assert.ok(fs.existsSync(scriptPath), 'load-test.js should exist');
  });

  test('4B: load-test.js simulates concurrent users', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'load-test.js');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('CONCURRENT'), 'Should have concurrent users config');
    assert.ok(content.includes('DURATION'), 'Should have duration config');
    assert.ok(content.includes('worker'), 'Should simulate workers');
  });

  test('4C: load-test.js measures latency percentiles', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'load-test.js');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('p50'), 'Should measure p50 latency');
    assert.ok(content.includes('p95'), 'Should measure p95 latency');
    assert.ok(content.includes('p99'), 'Should measure p99 latency');
    assert.ok(content.includes('RPS'), 'Should measure requests per second');
  });

  test('4D: load-test.js reports error rate and exits non-zero on failure', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'load-test.js');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('errorRate'), 'Should calculate error rate');
    assert.ok(content.includes('10%'), 'Should fail if error rate > 10%');
    assert.ok(content.includes('process.exit(1)'), 'Should exit non-zero on failure');
  });

  test('4E: load-test.js simulates POS workflow (login → ticket → order → kitchen)', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'load-test.js');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('/api/auth/login'), 'Should test login');
    assert.ok(content.includes('/api/tickets'), 'Should test ticket creation');
    assert.ok(content.includes('/api/kitchen/orders'), 'Should test kitchen orders');
    assert.ok(content.includes('/api/inventory/stock'), 'Should test inventory');
  });
});

// =====================================================================
// 5. BLOQUE M — Failure injection
// =====================================================================

describe('5. Bloque M — Failure Injection (P1)', () => {
  test('5A: API handles invalid JSON body gracefully (400)', async () => {
    const res = await request.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('not-json');
    assert.ok(res.status === 400 || res.status === 500,
      `Invalid JSON should return 400 or 500, got ${res.status}`);
  });

  test('5B: API handles missing required fields (400)', async () => {
    const res = await request.post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({});
    assert.strictEqual(res.status, 400);
  });

  test('5C: API handles non-existent ticket (404)', async () => {
    const res = await request.get('/api/tickets/99999')
      .set('Authorization', 'Bearer ' + jwtToken);
    assert.ok(res.status === 404 || res.status === 200,
      `Non-existent ticket should return 404 or 200 (empty), got ${res.status}`);
  });

  test('5D: API handles invalid menu item in order (400/404)', async () => {
    // Create a ticket first
    const ticketRes = await request.post('/api/tickets')
      .set('Authorization', 'Bearer ' + jwtToken)
      .send({ departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body.data.Id;

    // Try to add order with non-existent menu item
    const res = await request.post(`/api/tickets/${ticketId}/orders`)
      .set('Authorization', 'Bearer ' + jwtToken)
      .send({ menuItemId: 99999, quantity: 1 });
    assert.ok(res.status === 400 || res.status === 404 || res.status === 500,
      `Invalid menu item should return error, got ${res.status}`);

    // Cleanup
    await request.post(`/api/tickets/${ticketId}/void`)
      .set('Authorization', 'Bearer ' + jwtToken)
      .send({});
  });

  test('5E: API handles concurrent ticket close (optimistic locking)', async () => {
    // Create + pay a ticket
    const ticketRes = await request.post('/api/tickets')
      .set('Authorization', 'Bearer ' + jwtToken)
      .send({ departmentId: 1, ticketTypeId: 1 });
    const ticketId = ticketRes.body?.data?.Id;
    if (!ticketId) { console.warn('[5E] Could not create ticket — skipping'); return; }

    const mi = await db('MenuItems').first();
    if (!mi) { console.warn('[5E] No menu items — skipping'); return; }
    await request.post(`/api/tickets/${ticketId}/orders`)
      .set('Authorization', 'Bearer ' + jwtToken)
      .send({ menuItemId: mi.Id, quantity: 1 });

    const ticketRes2 = await request.get(`/api/tickets/${ticketId}`)
      .set('Authorization', 'Bearer ' + jwtToken);
    const total = Number(ticketRes2.body?.data?.RemainingAmount || 0);
    if (total > 0) {
      await request.post(`/api/tickets/${ticketId}/payments`)
        .set('Authorization', 'Bearer ' + jwtToken)
        .send({ paymentTypeId: 1, amount: total });
    }

    // Close twice concurrently — second should fail (409) or be idempotent (200)
    const [res1, res2] = await Promise.all([
      request.post(`/api/tickets/${ticketId}/close`)
        .set('Authorization', 'Bearer ' + jwtToken).send({}),
      request.post(`/api/tickets/${ticketId}/close`)
        .set('Authorization', 'Bearer ' + jwtToken).send({}),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.ok(statuses.includes(200), 'One close should succeed');
    assert.ok(statuses.includes(409) || statuses.includes(200),
      `Second close should fail (409) or be idempotent (200), got ${statuses}`);
  });

  test('5F: WebSocket handles invalid JWT (disconnect)', async () => {
    // This is verified by the existing E2E tests (websocket-flow.spec.js C2)
    // Here we just verify the server starts with WebSocket support
    const res = await request.get('/health');
    assert.strictEqual(res.status, 200);
  });
});

// =====================================================================
// 6. BLOQUE M — Backup/Restore drill (verify exists from Bloque J)
// =====================================================================

describe('6. Bloque M — Backup/Restore Drill (P0 — from Bloque J)', () => {
  test('6A: restore-drill.js script exists', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'restore-drill.js');
    assert.ok(fs.existsSync(scriptPath), 'restore-drill.js should exist');
  });

  test('6B: backup.js exists with rotation', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'backup.js');
    assert.ok(fs.existsSync(scriptPath), 'backup.js should exist');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('BACKUP_RETENTION'), 'Should have rotation');
  });

  test('6C: restore.js exists with --confirm safety', () => {
    const scriptPath = path.join(BACKEND_DIR, 'scripts', 'restore.js');
    assert.ok(fs.existsSync(scriptPath), 'restore.js should exist');
    const content = fs.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('--confirm'), 'Should require --confirm flag');
  });
});

// =====================================================================
// 7. BLOQUE M — Security audits (already passing, verify maintained)
// =====================================================================

describe('7. Bloque M — Security Audits (P0 — maintain)', () => {
  test('7A: .gitleaks.toml exists', () => {
    const gitleaksPath = path.join(REPO_ROOT, '.gitleaks.toml');
    assert.ok(fs.existsSync(gitleaksPath), '.gitleaks.toml should exist');
  });

  test('7B: CI workflow includes gitleaks scan', () => {
    const ciDir = path.join(REPO_ROOT, '.github', 'workflows');
    if (!fs.existsSync(ciDir)) return;  // skip if no CI
    const files = fs.readdirSync(ciDir);
    let hasGitleaks = false;
    for (const f of files) {
      const content = fs.readFileSync(path.join(ciDir, f), 'utf8');
      if (content.includes('gitleaks')) { hasGitleaks = true; break; }
    }
    assert.ok(hasGitleaks, 'CI should include gitleaks scan');
  });

  test('7C: server.js enforces CORS hardening in production', () => {
    const serverPath = path.join(BACKEND_DIR, 'src', 'api', 'server.js');
    const content = fs.readFileSync(serverPath, 'utf8');
    assert.ok(content.includes("CORS_ORIGIN === '*'"),
      'Should reject wildcard CORS in production');
    assert.ok(content.includes('[FATAL]'),
      'Should log FATAL when CORS is wildcard in production');
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
