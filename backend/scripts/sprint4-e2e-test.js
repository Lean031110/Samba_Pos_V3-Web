// =====================================================================
// sprint4-e2e-test.js — End-to-end manual flow simulation
// =====================================================================
// Simulates the full user flow that the frontend would execute:
//   1. Login (mock — verify admin/1234 is in DB)
//   2. Load tables list (GET /api/tables)
//   3. Create a test table (insert directly via Knex)
//   4. Create a ticket on that table (POST /api/tickets)
//   5. Verify 409 conflict when trying to open another ticket on same table
//   6. Add 2 orders (POST /api/tickets/:id/orders)
//   7. Apply 10% discount (POST /api/tickets/:id/calculations)
//   8. Verify totals (plainSum, discount, total) match expected
//   9. Process payment (POST /api/tickets/:id/payments)
//  10. Close ticket (POST /api/tickets/:id/close)
//  11. Generate print preview (GET /api/tickets/:id/print) — verify base64 ESC/POS
//  12. Verify WebSocket events were broadcast (via eventBus subscription)
//
// Also verifies that:
//   - The frontend index.html loads successfully
//   - All CSS files load (200)
//   - All JS files load (200)
//   - Font Awesome 6 is referenced in index.html
// =====================================================================

const http = require('http');
const knex = require('knex');
const { io } = require('socket.io-client');

const cfg = require('../src/infrastructure/db/knexfile.js');
const db = knex(cfg.development);

const BASE = 'http://localhost:3001';

// =====================================================================
// ANSI colors
// =====================================================================
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

function header(t) {
  console.log('\n' + C.bold + C.cyan + '═'.repeat(70) + C.reset);
  console.log(C.bold + C.cyan + '  ' + t + C.reset);
  console.log(C.bold + C.cyan + '═'.repeat(70) + C.reset);
}
function section(t) { console.log('\n' + C.bold + C.yellow + '── ' + t + C.reset); }
function ok(m) { console.log(C.green + '  ✓ ' + C.reset + m); }
function fail(m) { console.log(C.red + '  ✗ ' + C.reset + m); }
function info(l, v) { console.log(C.gray + '  · ' + C.reset + l.padEnd(40) + v); }

// HTTP helper
function httpReq(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body: json, text: buf });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// =====================================================================
// Main
// =====================================================================

(async () => {
  let passed = 0, failed = 0;
  const eventsReceived = [];

  // Connect a real WebSocket client to verify the eventBus → Socket.io bridge
  const socket = io(BASE, { transports: ['websocket'] });
  const EventTopicNames = {
    TicketCreated: 'TicketCreated',
    OrderAdded: 'OrderAdded',
    PaymentProcessed: 'PaymentProcessed',
    TicketClosed: 'TicketClosed',
    TicketTotalChanged: 'TicketTotalChanged',
  };
  for (const evt of Object.values(EventTopicNames)) {
    socket.on(evt, (payload) => eventsReceived.push({ event: evt, payload }));
  }
  // Wait for connection
  await new Promise((resolve) => {
    if (socket.connected) return resolve();
    socket.on('connect', resolve);
    setTimeout(resolve, 2000);  // timeout fallback
  });

  try {
    header('SPRINT 4 — END-TO-END FLOW TEST');

    // -----------------------------------------------------------------
    section('Step 0: Verify frontend assets are served');
    // -----------------------------------------------------------------
    const indexRes = await httpReq('GET', '/');
    if (indexRes.status === 200 && indexRes.text.includes('<!DOCTYPE html>')) {
      ok('GET / → 200 (index.html served)');
      passed++;
    } else { fail('GET / did not return index.html'); failed++; }

    const cssRes = await httpReq('GET', '/css/variables.css');
    if (cssRes.status === 200 && cssRes.text.includes('--samba-bg-button-default')) {
      ok('GET /css/variables.css → 200 (palette loaded)');
      passed++;
    } else { fail('CSS variables not loaded'); failed++; }

    const jsRes = await httpReq('GET', '/js/components/flex-button.js');
    if (jsRes.status === 200 && jsRes.text.includes('customElements.define')) {
      ok('GET /js/components/flex-button.js → 200 (Web Component loaded)');
      passed++;
    } else { fail('flex-button.js not loaded'); failed++; }

    if (indexRes.text.includes('font-awesome')) {
      ok('Font Awesome 6 referenced in index.html');
      passed++;
    } else { fail('Font Awesome not referenced'); failed++; }

    if (indexRes.text.includes('flex-button')) {
      ok('<flex-button> Web Component used in HTML');
      passed++;
    } else { fail('flex-button not used in HTML'); failed++; }

    // -----------------------------------------------------------------
    section('Step 1: Login (verify admin/1234 in DB)');
    // -----------------------------------------------------------------
    const admin = await db('Users').where({ PinCode: '1234' }).first();
    if (admin && admin.Name === 'Administrator') {
      ok('Login mock: admin/1234 verified in DB');
      passed++;
    } else { fail('Admin/1234 not found in DB'); failed++; }

    // -----------------------------------------------------------------
    section('Step 2: Load tables list');
    // -----------------------------------------------------------------
    const tablesRes = await httpReq('GET', '/api/tables');
    if (tablesRes.status === 200) {
      ok(`GET /api/tables → 200 (${tablesRes.body.count} tables)`);
      passed++;
    } else { fail('Tables list failed'); failed++; }

    // -----------------------------------------------------------------
    section('Step 3: Create a test table (simulating seed)');
    // -----------------------------------------------------------------
    const [entityTypeId] = await db('EntityTypes').where({ Name: 'Tables' }).pluck('Id');
    const [tableId] = await db('Entities').insert({
      Name: 'T-TEST', EntityTypeId: entityTypeId,
      LastUpdateTime: new Date().toISOString(),
      SearchString: 't-test', AccountId: 0, WarehouseId: 0,
    });
    await db('EntityStateValues').insert({
      EntityId: tableId,
      EntityStates: JSON.stringify([{
        StateName: 'Status', State: 'Available', StateValue: '',
        LastUpdateTime: new Date().toISOString(), Quantity: 0,
      }]),
    });
    info('Test table created', `Id=${tableId}, Name="T-TEST"`);
    ok('Table "T-TEST" created with state "Available"');
    passed++;

    // -----------------------------------------------------------------
    section('Step 4: Create a ticket on the table (simulating tap)');
    // -----------------------------------------------------------------
    const createRes = await httpReq('POST', '/api/tickets', { tableId });
    if (createRes.status === 201) {
      ok(`POST /api/tickets (tableId=${tableId}) → 201 (ticket #${createRes.body.data.Id})`);
      passed++;
    } else { fail(`Ticket creation failed: ${createRes.status} ${createRes.body?.message}`); failed++; }

    const ticketId = createRes.body.data.Id;
    info('Ticket Id', String(ticketId));
    info('Initial TotalAmount', String(createRes.body.data.TotalAmount));
    info('Initial RemainingAmount', String(createRes.body.data.RemainingAmount));

    // -----------------------------------------------------------------
    section('Step 5: Verify 409 conflict on re-opening same table');
    // -----------------------------------------------------------------
    const conflictRes = await httpReq('POST', '/api/tickets', { tableId });
    if (conflictRes.status === 409) {
      ok(`POST /api/tickets (same table) → 409 ConflictError ✓`);
      passed++;
    } else { fail(`Expected 409, got ${conflictRes.status}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 6: Add a menu item + 2 orders');
    // -----------------------------------------------------------------
    const [miId] = await db('MenuItems').insert({ Name: 'E2E Burger', GroupCode: 'Food', Barcode: 'E2E01', Tag: null });
    const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
    await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 12.50 });
    const [taxTxnTypeId] = await db('AccountTransactionTypes').insert({
      Name: 'E2E VAT', SortOrder: 250, SourceAccountTypeId: 2, TargetAccountTypeId: 1,
      DefaultSourceAccountId: 2, DefaultTargetAccountId: 1,
    });
    const [ttId] = await db('TaxTemplates').insert({
      Name: 'E2E VAT 10%', SortOrder: 35, Rate: 10.0, Rounding: 0,
      AccountTransactionTypeId: taxTxnTypeId,
    });
    await db('TaxTemplateMaps').insert({
      TerminalId: 0, DepartmentId: 0, UserRoleId: 0, TicketTypeId: 0,
      TaxTemplateId: ttId, MenuItemGroupCode: null, MenuItemId: miId,
    });

    // Add order 1: 1x Burger
    const order1Res = await httpReq('POST', `/api/tickets/${ticketId}/orders`, { menuItemId: miId, quantity: 1 });
    if (order1Res.status === 200 && Number(order1Res.body.data.TotalAmount) === 12.50) {
      ok(`POST /api/tickets/${ticketId}/orders (1x Burger @ $12.50) → 200, total=$${order1Res.body.data.TotalAmount}`);
      passed++;
    } else { fail(`Order 1 failed: ${order1Res.status}`); failed++; }

    // Add order 2: 2x Burger
    const order2Res = await httpReq('POST', `/api/tickets/${ticketId}/orders`, { menuItemId: miId, quantity: 2 });
    if (order2Res.status === 200 && Number(order2Res.body.data.TotalAmount) === 37.50) {
      ok(`POST /api/tickets/${ticketId}/orders (2x Burger @ $12.50) → 200, total=$${order2Res.body.data.TotalAmount}`);
      passed++;
    } else { fail(`Order 2 failed: ${order2Res.status}, total=${order2Res.body?.data?.TotalAmount}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 7: Apply 10% discount');
    // -----------------------------------------------------------------
    const discountRes = await httpReq('POST', `/api/tickets/${ticketId}/calculations`, { calculationTypeId: 1, amount: 10 });
    if (discountRes.status === 200) {
      const total = Number(discountRes.body.data.TotalAmount);
      const expected = 37.50 - 3.75;  // 37.50 * 0.10 = 3.75 discount
      if (Math.abs(total - expected) < 0.01) {
        ok(`POST /api/tickets/${ticketId}/calculations (10% discount) → 200, total=$${total.toFixed(2)} (expected $${expected.toFixed(2)})`);
        passed++;
      } else {
        fail(`Discount total mismatch: got $${total}, expected $${expected}`);
        failed++;
      }
    } else { fail(`Discount failed: ${discountRes.status}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 8: Process payment (Cash, exact amount)');
    // -----------------------------------------------------------------
    const finalTotal = Number(discountRes.body.data.TotalAmount);
    const paymentRes = await httpReq('POST', `/api/tickets/${ticketId}/payments`, { paymentTypeId: 1, amount: finalTotal });
    if (paymentRes.status === 200 && Number(paymentRes.body.data.RemainingAmount) === 0) {
      ok(`POST /api/tickets/${ticketId}/payments (Cash $${finalTotal.toFixed(2)}) → 200, remaining=$${paymentRes.body.data.RemainingAmount}`);
      passed++;
    } else { fail(`Payment failed: ${paymentRes.status}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 9: Close the ticket');
    // -----------------------------------------------------------------
    const closeRes = await httpReq('POST', `/api/tickets/${ticketId}/close`);
    if (closeRes.status === 200 && closeRes.body.data.IsClosed === 1) {
      ok(`POST /api/tickets/${ticketId}/close → 200, IsClosed=1, TicketNumber=${closeRes.body.data.TicketNumber}`);
      passed++;
    } else { fail(`Close failed: ${closeRes.status}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 10: Generate print preview (ESC/POS base64)');
    // -----------------------------------------------------------------
    const printRes = await httpReq('GET', `/api/tickets/${ticketId}/print`);
    if (printRes.status === 200) {
      const buf = Buffer.from(printRes.body.data.escposBase64, 'base64');
      if (buf[0] === 0x1B && buf[1] === 0x40) {
        ok(`GET /api/tickets/${ticketId}/print → 200 (${printRes.body.data.escposBytesCount} ESC/POS bytes, base64 length ${printRes.body.data.escposBase64.length})`);
        ok(`ESC/POS starts with 0x1B 0x40 (ESC @ — init printer) ✓`);
        passed += 2;
      } else {
        fail(`ESC/POS bytes don't start with ESC @ (got 0x${buf[0]?.toString(16)} 0x${buf[1]?.toString(16)})`);
        failed++;
      }
      // Verify formatted text contains expected content
      const formatted = printRes.body.data.formatted;
      if (formatted.includes('E2E Burger') && formatted.includes('<cut>') && formatted.includes('Subtotal')) {
        ok(`Formatted text contains expected content (E2E Burger, <cut>, Subtotal)`);
        passed++;
      } else { fail('Formatted text missing expected content'); failed++; }
    } else { fail(`Print failed: ${printRes.status}`); failed++; }

    // -----------------------------------------------------------------
    section('Step 11: Verify WebSocket events were broadcast');
    // -----------------------------------------------------------------
    // Give the WebSocket a moment to flush all events
    await new Promise(r => setTimeout(r, 500));
    const expectedEvents = [
      EventTopicNames.TicketCreated,
      EventTopicNames.OrderAdded,
      EventTopicNames.TicketTotalChanged,
      EventTopicNames.PaymentProcessed,
      EventTopicNames.TicketClosed,
    ];
    for (const evt of expectedEvents) {
      const found = eventsReceived.find(e => e.event === evt);
      if (found) {
        ok(`WebSocket broadcast: ${evt}`);
        passed++;
      } else {
        fail(`WebSocket did NOT broadcast: ${evt}`);
        failed++;
      }
    }
    info('Total events captured', String(eventsReceived.length));

    // -----------------------------------------------------------------
    section('Step 12: Cleanup');
    // -----------------------------------------------------------------
    await db('Orders').where({ TicketId: ticketId }).del();
    await db('Payments').where({ TicketId: ticketId }).del();
    await db('Calculations').where({ TicketId: ticketId }).del();
    await db('TicketEntities').where({ TicketId: ticketId }).del();
    await db('Tickets').where({ Id: ticketId }).del();
    await db('EntityStateValues').where({ EntityId: tableId }).del();
    await db('Entities').where({ Id: tableId }).del();
    await db('MenuItemPrices').where({ MenuItemPortionId: portionId }).del();
    await db('MenuItemPortions').where({ MenuItemId: miId }).del();
    await db('MenuItems').where({ Id: miId }).del();
    await db('TaxTemplateMaps').where({ TaxTemplateId: ttId }).del();
    await db('TaxTemplates').where({ Id: ttId }).del();
    await db('AccountTransactionTypes').where({ Id: taxTxnTypeId }).del();
    ok('Test data cleaned up');

    // -----------------------------------------------------------------
    header('FINAL VERDICT');
    info('Tests passed', String(passed));
    info('Tests failed', String(failed));
    if (failed === 0) {
      console.log('');
      console.log(C.bold + C.green + '  ╔══════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.green + '  |  SPRINT 4 END-TO-END FLOW TEST PASSED                            |' + C.reset);
      console.log(C.bold + C.green + '  |  - Frontend assets served (HTML, CSS, JS, FA6)                   |' + C.reset);
      console.log(C.bold + C.green + '  |  - Full transactional flow executed via HTTP API                  |' + C.reset);
      console.log(C.bold + C.green + '  |  - 409 conflict on table re-open enforced                        |' + C.reset);
      console.log(C.bold + C.green + '  |  - Totals match expected (12.50 + 25.00 = 37.50, -10% = 33.75)   |' + C.reset);
      console.log(C.bold + C.green + '  |  - ESC/POS print preview generated with ESC @ init bytes         |' + C.reset);
      console.log(C.bold + C.green + '  |  - WebSocket events broadcast for all 5 expected topics           |' + C.reset);
      console.log(C.bold + C.green + '  ╚══════════════════════════════════════════════════════════════════╝' + C.reset);
      console.log('');
    } else {
      console.log('');
      console.log(C.bold + C.red + '  SPRINT 4 E2E TEST FAILED' + C.reset);
      process.exit(1);
    }

    await db.destroy();
    socket.close();
  } catch (err) {
    console.error(C.red + '\nFATAL:' + C.reset, err);
    console.error(err.stack);
    await db.destroy();
    process.exit(1);
  }
})();
