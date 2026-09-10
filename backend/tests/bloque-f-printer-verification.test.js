// =====================================================================
// bloque-f-printer-verification.test.js — Bloque F unit tests
// =====================================================================
// Tests the Bloque F (Fase 6: Printer Gateway) gaps from
// docs/PRODUCTION_GAP_MATRIX.md:
//
//   P0 — Gate: hardware real
//     Since we don't have a physical thermal printer in CI, we use
//     MockTcpServer to emulate one. The same ESC/POS bytes that would
//     be sent to a real printer are sent to the mock, and we assert
//     on them. This is the closest CI-able equivalent to "probar con
//     impresora térmica física".
//
//   P2 — Print templates editables
//     Tests the CRUD endpoints for PrinterTemplates + the preview
//     endpoint that renders a template with sample data.
//
// Architecture tested:
//   PrintQueue.enqueue → PrintWorker._processOne → PrinterManager.printTicket
//     → EscPosRenderer.render → TcpTransport.send → MockTcpServer (receives bytes)
//
// The mock server is started on a random port for each test to avoid
// conflicts with other tests or a real printer on port 9100.
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');

const { createApp, getPrintWorkerInstance } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const { PrinterManager, EscPosRenderer, TcpTransport } = require('../src/api/services/PrinterManager');
const { PrintQueue } = require('../src/api/services/PrintQueue');
const { PrintWorker } = require('../src/api/services/PrintWorker');
const { MockTcpServer } = require('../src/api/services/MockTcpServer');
const { PrintJob } = require('../src/domain/PrintJob');

const app = createApp();
const request = supertest(app);

let jwtToken = null;
let mockServer = null;
let mockPort = 19200;
let testPrinterId = null;
let testTemplateId = null;

async function setupFixtures() {
  // Login
  const loginRes = await request.post('/api/auth/login')
    .send({ username: 'Administrator', pin: '1234' });
  jwtToken = loginRes.body.token;
  console.log('[setup] Login OK, token present:', !!jwtToken);

  // Start mock TCP server on a unique port (avoid 9100 which may be in use)
  mockPort = 19200 + Math.floor(Math.random() * 100);
  mockServer = new MockTcpServer({ port: mockPort, host: '127.0.0.1' });
  await mockServer.start();
  console.log('[setup] MockTcpServer started on', mockServer.address());

  // Create a printer that points to the mock server
  const [pId] = await db('Printers').insert({
    Name: 'Bloque F Mock Printer',
    ShareName: `127.0.0.1:${mockPort}`,
    PrinterType: 1,
    CharsPerLine: 42,
    CodePage: 857,
    IsActive: 1,
  });
  testPrinterId = pId;
  console.log('[setup] Test printer created, Id:', testPrinterId);

  // Create a test template
  const [tId] = await db('PrinterTemplates').insert({
    Name: 'Bloque F Test Template',
    TemplateType: 'RECEIPT',
    Template: '{header}\n{ticket_number}\n{orders}\n{totals}',
    Description: 'Test template for Bloque F unit tests',
    MergeLines: 0,
    IsActive: 1,
    CreatedAt: new Date().toISOString(),
    UpdatedAt: new Date().toISOString(),
  });
  testTemplateId = tId;
  console.log('[setup] Test template created, Id:', testTemplateId);
}

function authGet(path) { return request.get(path).set('Authorization', 'Bearer ' + jwtToken); }
function authPost(path, body) { return request.post(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }
function authPatch(path, body) { return request.patch(path).set('Authorization', 'Bearer ' + jwtToken).send(body || {}); }
function authDelete(path) { return request.delete(path).set('Authorization', 'Bearer ' + jwtToken); }

async function cleanup() {
  try {
    // Stop the server's PrintWorker so it doesn't keep the DB pool alive
    const serverWorker = getPrintWorkerInstance();
    if (serverWorker) {
      await serverWorker.stop();
    }
    if (mockServer) await mockServer.stop();
    // Clean test printer + template
    await db('PrintJobInstances').where({ PrinterId: testPrinterId }).del();
    await db('Printers').where({ Id: testPrinterId }).del();
    await db('PrinterTemplates').where({ Id: testTemplateId }).del();
    await db('AuditLogs').whereLike('Action', 'printtemplate.%').del();
  } catch (err) {
    console.error('[cleanup error]', err.message);
  }
  await db.destroy();
}

// =====================================================================
// 1. HARDWARE SIMULATION — MockTcpServer + TcpTransport (P0 gate)
// =====================================================================

describe('1. Hardware Simulation — MockTcpServer (P0 gate)', () => {
  test('1A: MockTcpServer starts, receives bytes, and exposes them for assertions', async () => {
    // Verify mock server is running
    assert.ok(mockServer, 'Mock server should be initialized');
    const initialConnections = mockServer.connectionCount();

    // Use TcpTransport to send ESC/POS bytes to the mock
    const transport = new TcpTransport('127.0.0.1', mockPort, 2000);
    const escPosBytes = Buffer.from([
      0x1B, 0x40,  // ESC @ — init
      ...Buffer.from('Hello Printer'),
      0x0A,         // LF
      0x1D, 0x56, 0x42, 0x00,  // GS V B 0 — full cut
    ]);

    const result = await transport.send(escPosBytes);
    assert.strictEqual(result.success, true, `Send should succeed (error: ${result.error})`);
    assert.strictEqual(result.bytesSent, escPosBytes.length);

    // Verify mock received the bytes
    assert.strictEqual(mockServer.totalBytesReceived(), escPosBytes.length);
    assert.strictEqual(mockServer.connectionCount(), initialConnections + 1);

    // Verify ESC/POS sequences are present
    assert.ok(mockServer.containsSequence([0x1B, 0x40]), 'Should contain ESC @ (init)');
    assert.ok(mockServer.containsSequence([0x1D, 0x56, 0x42, 0x00]), 'Should contain GS V (cut)');
    assert.ok(mockServer.receivedBytes().includes(Buffer.from('Hello Printer')), 'Should contain text');

    mockServer.clearReceivedBytes();
  });

  test('1B: TcpTransport fails gracefully when printer is offline (connection refused)', async () => {
    // Use a port that no server is listening on
    const transport = new TcpTransport('127.0.0.1', 19999, 1000);
    const result = await transport.send(Buffer.from([0x1B, 0x40]));
    assert.strictEqual(result.success, false, 'Send should fail');
    assert.ok(result.error, 'Error message should be present');
  });

  test('1C: TcpTransport test() method returns true for online printer', async () => {
    const transport = new TcpTransport('127.0.0.1', mockPort, 2000);
    const isOnline = await transport.test();
    assert.strictEqual(isOnline, true, 'Mock printer should be online');
  });

  test('1D: Offline printer simulation (connection refused — no server listening)', async () => {
    // Use a port that no server is listening on — this is the most realistic
    // simulation of an offline printer (ECONNREFUSED).
    // We DON'T use MockTcpServer.simulateOffline because that accepts the TCP
    // connection and then destroys it, which still allows the write to
    // partially succeed. A truly offline printer doesn't accept connections.
    const offlinePort = mockPort + 50;  // nothing listening here

    const transport = new TcpTransport('127.0.0.1', offlinePort, 1000);
    const result = await transport.send(Buffer.from([0x1B, 0x40]));
    assert.strictEqual(result.success, false, 'Send to offline printer should fail');
    assert.ok(result.error, 'Error message should be present');
    assert.strictEqual(result.bytesSent, 0, 'No bytes should be sent');
  });
});

// =====================================================================
// 2. FULL PRINT PIPELINE — PrintQueue → PrintWorker → TcpTransport → Mock
// =====================================================================

describe('2. Full Print Pipeline (P0 gate)', () => {
  test('2A: PrintQueue.enqueue → PrintWorker processes → bytes arrive at mock printer', async () => {
    mockServer.clearReceivedBytes();

    // Use a fresh PrintQueue + PrintWorker pointing at our mock printer
    const queue = new PrintQueue();
    const printerManager = new PrinterManager();
    // Clear the transport cache so it picks up our test printer
    printerManager.clearCache();
    const worker = new PrintWorker({
      queue,
      printerManager,
      pollIntervalMs: 50,
    });

    // Enqueue a print job
    const sampleTicket = {
      Id: 1,
      TicketNumber: 'TEST-001',
      Date: new Date().toISOString(),
      LastModifiedUserName: 'TestUser',
      TotalAmount: 10.50,
      RemainingAmount: 0,
      Orders: [
        { Quantity: 1, Price: 10.50, MenuItemName: 'Test Burger', PortionName: 'Normal', CalculatePrice: 1 },
      ],
      Payments: [{ Amount: 10.50, Name: 'Cash' }],
      TicketEntities: [{ EntityName: 'Table 5' }],
    };
    const renderer = new EscPosRenderer({ charsPerLine: 42, codePage: 857 });
    const bytes = renderer.render(sampleTicket);

    const job = await queue.enqueue({
      printerId: testPrinterId,
      jobType: PrintJob.JOB_TYPES.RECEIPT,
      payload: bytes,
      idempotencyKey: `bloque-f-test-${Date.now()}`,
      ticketId: 1,
    });
    assert.ok(job.Id, 'Job should be enqueued');

    // Start the worker and wait for it to process
    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));  // give worker time to process
    await worker.stop();

    // Verify bytes arrived at mock
    const received = mockServer.receivedBytes();
    assert.ok(received.length > 0, 'Mock should have received bytes');
    assert.ok(mockServer.containsSequence([0x1B, 0x40]), 'Should contain ESC @ (init)');
    assert.ok(mockServer.containsSequence([0x1D, 0x56, 0x42, 0x00]), 'Should contain GS V (cut)');
    assert.ok(received.includes(Buffer.from('Test Burger')), 'Should contain order item name');
    assert.ok(received.includes(Buffer.from('TEST-001')), 'Should contain ticket number');

    // Verify job status is PRINTED
    const finalJob = await queue.get(job.Id);
    assert.strictEqual(finalJob.Status, PrintJob.STATUS.PRINTED);
  });

  test('2B: Print job with idempotency key — duplicate enqueue returns same job', async () => {
    const queue = new PrintQueue();
    const idempotencyKey = `bloque-f-idem-${Date.now()}`;
    const bytes = Buffer.from([0x1B, 0x40]);

    const job1 = await queue.enqueue({
      printerId: testPrinterId,
      jobType: PrintJob.JOB_TYPES.TEST,
      payload: bytes,
      idempotencyKey,
    });
    const job2 = await queue.enqueue({
      printerId: testPrinterId,
      jobType: PrintJob.JOB_TYPES.TEST,
      payload: bytes,
      idempotencyKey,
    });

    assert.strictEqual(job1.Id, job2.Id, 'Duplicate enqueue should return same job');
  });

  test('2C: PrintWorker retries on failure (printer offline — connection refused)', async () => {
    // Use a port that NO server is listening on — this simulates a printer
    // that is powered off / unplugged (ECONNREFUSED on every attempt).
    // We DON'T use MockTcpServer.simulateOffline because that accepts the
    // connection and then destroys it, which can still let the write succeed.
    const offlinePort = mockPort + 70;  // nothing listening here

    // Create a printer pointing to the offline port
    const [flakyPrinterId] = await db('Printers').insert({
      Name: 'Bloque F Offline Printer',
      ShareName: `127.0.0.1:${offlinePort}`,
      PrinterType: 1, CharsPerLine: 42, CodePage: 857, IsActive: 1,
    });

    const queue = new PrintQueue({ maxAttempts: 2, backoffBaseMs: 100, backoffMaxMs: 500 });
    const printerManager = new PrinterManager();
    printerManager.clearCache();
    const worker = new PrintWorker({ queue, printerManager, pollIntervalMs: 50 });

    const bytes = Buffer.from([0x1B, 0x40]);
    const job = await queue.enqueue({
      printerId: flakyPrinterId,
      jobType: PrintJob.JOB_TYPES.TEST,
      payload: bytes,
      idempotencyKey: `bloque-f-flaky-${Date.now()}`,
    });

    worker.start();
    // Give worker time to: claim → fail (ECONNREFUSED) → retry → fail → FAILED
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await worker.stop();

    // The job should be in RETRYING or FAILED state (not PRINTED)
    const finalJob = await queue.get(job.Id);
    assert.notStrictEqual(finalJob.Status, PrintJob.STATUS.PRINTED,
      'Job should NOT be PRINTED (printer offline)');
    assert.ok(
      [PrintJob.STATUS.RETRYING, PrintJob.STATUS.FAILED].includes(finalJob.Status),
      `Job should be RETRYING or FAILED, got ${finalJob.Status}`
    );
    assert.ok(Number(finalJob.Attempts) >= 1, `Job should have at least 1 attempt, got ${finalJob.Attempts}`);

    await db('PrintJobInstances').where({ PrinterId: flakyPrinterId }).del();
    await db('Printers').where({ Id: flakyPrinterId }).del();
  });
});

// =====================================================================
// 3. PRINTER TEMPLATES CRUD (P2 — template editor)
// =====================================================================

describe('3. Printer Templates CRUD (P2)', () => {
  let createdTemplateId = null;

  test('3A: GET /api/print/templates/list — returns templates', async () => {
    const res = await authGet('/api/print/templates/list');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data, 'Should have data array');
    assert.ok(res.body.count >= 1, 'Should have at least 1 template (the seeded ones)');
  });

  test('3B: POST /api/print/templates — creates a new template', async () => {
    const res = await authPost('/api/print/templates', {
      name: 'Bloque F CRUD Test',
      templateType: 'CUSTOM',
      template: '{custom_marker}',
      description: 'Created by unit test',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.data.Id);
    assert.strictEqual(res.body.data.Name, 'Bloque F CRUD Test');
    assert.strictEqual(res.body.data.TemplateType, 'CUSTOM');
    assert.strictEqual(res.body.data.IsActive, 1);
    createdTemplateId = res.body.data.Id;
  });

  test('3C: GET /api/print/templates/:id — returns the created template', async () => {
    const res = await authGet('/api/print/templates/' + createdTemplateId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Id, createdTemplateId);
    assert.strictEqual(res.body.data.Name, 'Bloque F CRUD Test');
  });

  test('3D: PATCH /api/print/templates/:id — updates name + template', async () => {
    const res = await authPatch('/api/print/templates/' + createdTemplateId, {
      name: 'Bloque F CRUD Test (updated)',
      template: '{updated_marker}',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.Name, 'Bloque F CRUD Test (updated)');
    assert.strictEqual(res.body.data.Template, '{updated_marker}');
  });

  test('3E: PATCH validates templateType against allowed values', async () => {
    const res = await authPatch('/api/print/templates/' + createdTemplateId, {
      templateType: 'INVALID_TYPE',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /templateType must be one of/);
  });

  test('3F: POST /api/print/templates/:id/preview — renders ESC/POS bytes with sample data', async () => {
    const res = await authPost('/api/print/templates/' + createdTemplateId + '/preview');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.bytesHex, 'Should return hex bytes');
    assert.ok(res.body.data.bytesLength > 0, 'Should have non-zero byte count');
    assert.ok(res.body.data.sampleData, 'Should include sample data');
  });

  test('3G: GET /api/print/templates/list?type=KITCHEN_ORDER — filters by type', async () => {
    const res = await authGet('/api/print/templates/list?type=KITCHEN_ORDER');
    assert.strictEqual(res.status, 200);
    for (const t of res.body.data) {
      assert.strictEqual(t.TemplateType, 'KITCHEN_ORDER');
    }
  });

  test('3H: DELETE /api/print/templates/:id — soft deletes (IsActive=0)', async () => {
    const res = await authDelete('/api/print/templates/' + createdTemplateId);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.isActive, false);

    // Verify it's now inactive
    const getRes = await authGet('/api/print/templates/list?includeInactive=true');
    const template = getRes.body.data.find(t => t.Id === createdTemplateId);
    assert.ok(template, 'Template should still exist (soft delete)');
    assert.strictEqual(Number(template.IsActive), 0);
  });

  test('3I: GET /api/print/templates/list (default) excludes inactive', async () => {
    const res = await authGet('/api/print/templates/list');
    const found = res.body.data.find(t => t.Id === createdTemplateId);
    assert.strictEqual(found, undefined, 'Inactive template should not appear in default list');
  });

  // Cleanup
  after(async () => {
    if (createdTemplateId) {
      await db('PrinterTemplates').where({ Id: createdTemplateId }).del();
    }
  });
});

// =====================================================================
// 4. TEMPLATE PREVIEW — verifies ESC/POS output for each type
// =====================================================================

describe('4. Template Preview by Type', () => {
  test('4A: KITCHEN_ORDER template preview contains KITCHEN ORDER header', async () => {
    // Find the seeded Kitchen Order template
    const listRes = await authGet('/api/print/templates/list?type=KITCHEN_ORDER');
    const koTemplate = listRes.body.data[0];
    if (!koTemplate) {
      console.warn('[4A] No KITCHEN_ORDER template found — skipping');
      return;
    }
    const previewRes = await authPost('/api/print/templates/' + koTemplate.Id + '/preview');
    assert.strictEqual(previewRes.status, 200);
    const bytes = Buffer.from(previewRes.body.data.bytesHex, 'hex');
    assert.ok(bytes.includes(Buffer.from('KITCHEN ORDER')), 'Should contain KITCHEN ORDER header');
    assert.ok(bytes.includes(Buffer.from('Mesa 5')), 'Should contain sample table name');
  });

  test('4B: RECEIPT template preview contains ticket number + totals', async () => {
    const listRes = await authGet('/api/print/templates/list?type=RECEIPT');
    const receiptTemplate = listRes.body.data[0];
    if (!receiptTemplate) {
      console.warn('[4B] No RECEIPT template found — skipping');
      return;
    }
    const previewRes = await authPost('/api/print/templates/' + receiptTemplate.Id + '/preview');
    assert.strictEqual(previewRes.status, 200);
    const bytes = Buffer.from(previewRes.body.data.bytesHex, 'hex');
    assert.ok(bytes.includes(Buffer.from('SAMPLE-001')), 'Should contain sample ticket number');
    assert.ok(bytes.includes(Buffer.from('Subtotal')), 'Should contain Subtotal line');
  });

  test('4C: TEST template preview contains TEST PRINT', async () => {
    const listRes = await authGet('/api/print/templates/list?type=TEST');
    const testTemplate = listRes.body.data[0];
    if (!testTemplate) {
      console.warn('[4C] No TEST template found — skipping');
      return;
    }
    const previewRes = await authPost('/api/print/templates/' + testTemplate.Id + '/preview');
    assert.strictEqual(previewRes.status, 200);
    const bytes = Buffer.from(previewRes.body.data.bytesHex, 'hex');
    assert.ok(bytes.includes(Buffer.from('TEST PRINT')), 'Should contain TEST PRINT');
  });
});

// =====================================================================
// Setup / Teardown
// =====================================================================

before(async () => { await setupFixtures(); });
after(async () => { await cleanup(); });
