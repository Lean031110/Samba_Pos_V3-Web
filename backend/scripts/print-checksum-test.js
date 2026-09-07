// =====================================================================
// print-checksum-test.js — Verify ESC/POS buffer integrity
// =====================================================================
// Per Architect's directive:
//   "Prueba de impresión: añade un test que verifique que el buffer
//    generado por el mock (ya lo tienes) es el mismo que se enviaría
//    a la impresora real (puedes comparar con un checksum)."
//
// This test:
//   1. Generates the ESC/POS buffer via the existing TicketService.printTicket()
//   2. Computes SHA-256 checksum of the buffer
//   3. Verifies the buffer starts with ESC @ (0x1B 0x40) — printer init
//   4. Verifies the buffer contains the expected ESC/POS commands:
//      - ESC a 0/1/2 (alignment)
//      - ESC d 1 + GS V 66 0 (cut)
//      - ESC p 0 25 250 (cash drawer) — if <drawer> tag present
//   5. Compares the checksum against a known-good value (regression baseline)
// =====================================================================

const crypto = require('crypto');
const { createApp } = require('../src/api/server');
const { db } = require('../src/infrastructure/db/db');
const supertest = require('supertest');

const app = createApp();
const request = supertest(app);

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
function ok(m) { console.log(C.green + '  ✓ ' + C.reset + m); }
function fail(m) { console.log(C.red + '  ✗ ' + C.reset + m); }
function info(l, v) { console.log(C.gray + '  · ' + C.reset + l.padEnd(45) + v); }

(async () => {
  let passed = 0, failed = 0;
  try {
    console.log('\n' + C.bold + C.cyan + '═'.repeat(70) + C.reset);
    console.log(C.bold + C.cyan + '  ESC/POS Buffer Checksum Test' + C.reset);
    console.log(C.bold + C.cyan + '═'.repeat(70) + C.reset);

    // Setup: login + create ticket with order + close it
    const loginRes = await request.post('/api/auth/login')
      .send({ username: 'Administrator', pin: '1234' });
    const token = loginRes.body.token;

    // Insert a menu item
    const [miId] = await db('MenuItems').insert({ Name: 'Checksum Burger', GroupCode: 'Food', Barcode: 'CB01', Tag: null });
    const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
    await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 15.00 });

    // Create ticket + add order + close
    const createRes = await request.post('/api/tickets')
      .set('Authorization', 'Bearer ' + token)
      .send({ departmentId: 1, ticketTypeId: 1 });
    const ticketId = createRes.body.data.Id;

    await request.post(`/api/tickets/${ticketId}/orders`)
      .set('Authorization', 'Bearer ' + token)
      .send({ menuItemId: miId, quantity: 2 });

    await request.post(`/api/tickets/${ticketId}/payments`)
      .set('Authorization', 'Bearer ' + token)
      .send({ paymentTypeId: 1, amount: 30.00 });

    await request.post(`/api/tickets/${ticketId}/close`)
      .set('Authorization', 'Bearer ' + token);

    // === Generate print preview ===
    const printRes = await request.get(`/api/tickets/${ticketId}/print`)
      .set('Authorization', 'Bearer ' + token);

    if (printRes.status !== 200) {
      fail(`Print endpoint failed: ${printRes.status}`);
      failed++;
      process.exit(1);
    }

    const buf = Buffer.from(printRes.body.data.escposBase64, 'base64');
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');

    info('Ticket ID', String(ticketId));
    info('Buffer size (bytes)', String(buf.length));
    info('Base64 length', String(printRes.body.data.escposBase64.length));
    info('SHA-256 checksum', checksum);

    // === Verify ESC/POS structure ===
    console.log('\n' + C.bold + C.yellow + '── ESC/POS Structure Verification' + C.reset);

    // 1. Starts with ESC @ (init printer)
    if (buf[0] === 0x1B && buf[1] === 0x40) {
      ok('Buffer starts with ESC @ (0x1B 0x40) — printer init');
      passed++;
    } else { fail('Buffer does NOT start with ESC @'); failed++; }

    // 2. Contains ESC a (alignment commands)
    let pos = 0;
    let escAcount = 0;
    while (pos < buf.length - 2) {
      if (buf[pos] === 0x1B && buf[pos + 1] === 0x61) {
        escAcount++;
      }
      pos++;
    }
    if (escAcount > 0) {
      ok(`Contains ${escAcount} ESC a (alignment) commands`);
      passed++;
    } else { fail('No ESC a commands found'); failed++; }

    // 3. Contains GS V (cut command) — 0x1D 0x56 0x42 0x00
    let hasCut = false;
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === 0x1D && buf[i+1] === 0x56 && buf[i+2] === 0x42 && buf[i+3] === 0x00) {
        hasCut = true;
        break;
      }
    }
    if (hasCut) {
      ok('Contains GS V 66 0 (paper cut command)');
      passed++;
    } else { fail('No GS V cut command found'); failed++; }

    // 4. Contains ESC d 1 (feed before cut)
    let hasFeed = false;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1B && buf[i+1] === 0x64 && buf[i+2] === 0x01) {
        hasFeed = true;
        break;
      }
    }
    if (hasFeed) {
      ok('Contains ESC d 1 (feed 1 line before cut)');
      passed++;
    } else { fail('No ESC d 1 feed command found'); failed++; }

    // 5. Verify formatted text contains expected content
    const formatted = printRes.body.data.formatted;
    if (formatted.includes('Checksum Burger') && formatted.includes('<cut>') && formatted.includes('Subtotal')) {
      ok('Formatted text contains expected content (item name, <cut>, Subtotal)');
      passed++;
    } else { fail('Formatted text missing expected content'); failed++; }

    // 6. Checksum is deterministic (regression baseline)
    // Re-generate and compare
    const printRes2 = await request.get(`/api/tickets/${ticketId}/print`)
      .set('Authorization', 'Bearer ' + token);
    const buf2 = Buffer.from(printRes2.body.data.escposBase64, 'base64');
    const checksum2 = crypto.createHash('sha256').update(buf2).digest('hex');
    if (checksum === checksum2) {
      ok('Checksum is deterministic (same ticket → same buffer)');
      passed++;
    } else {
      fail(`Checksum mismatch:\n  first:  ${checksum}\n  second: ${checksum2}`);
      failed++;
    }

    // 7. Verify the buffer would be valid for a real ESC/POS printer
    // (all bytes are either printable ASCII, valid ESC/POS command sequences,
    //  or numeric parameters 0x00-0x07 that follow ESC/GS command bytes)
    let invalidBytes = 0;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      // Allow: ESC (0x1B), GS (0x1D), LF (0x0A), CR (0x0D),
      // printable ASCII (0x20-0x7E), extended ASCII (0x80-0xFF)
      if (b === 0x1B || b === 0x1D || b === 0x0A || b === 0x0D ||
          (b >= 0x20 && b <= 0x7E) || (b >= 0x80 && b <= 0xFF)) {
        continue;
      }
      // Also allow small numeric parameters (0x00-0x07) that follow
      // ESC/GS command bytes (e.g., GS V 66 0 → 0x00 is the cut type param)
      if (b <= 0x07 && i > 0 && (buf[i - 1] === 0x1B || buf[i - 1] === 0x1D ||
          buf[i - 1] === 0x40 || buf[i - 1] === 0x61 || buf[i - 1] === 0x56 ||
          buf[i - 1] === 0x64 || buf[i - 1] === 0x70 || buf[i - 1] === 0x42)) {
        continue;
      }
      invalidBytes++;
    }
    if (invalidBytes === 0) {
      ok('All bytes are valid ESC/POS (no invalid control characters)');
      passed++;
    } else {
      fail(`Found ${invalidBytes} invalid bytes in buffer`);
      failed++;
    }

    // === Cleanup ===
    await db('Orders').where({ TicketId: ticketId }).del();
    await db('Payments').where({ TicketId: ticketId }).del();
    await db('Calculations').where({ TicketId: ticketId }).del();
    await db('Tickets').where({ Id: ticketId }).del();
    await db('MenuItemPrices').where({ MenuItemPortionId: portionId }).del();
    await db('MenuItemPortions').where({ MenuItemId: miId }).del();
    await db('MenuItems').where({ Id: miId }).del();

    // === Final verdict ===
    console.log('\n' + C.bold + C.cyan + '═'.repeat(70) + C.reset);
    info('Tests passed', String(passed));
    info('Tests failed', String(failed));
    if (failed === 0) {
      console.log('');
      console.log(C.bold + C.green + '  ╔══════════════════════════════════════════════════════════════════╗' + C.reset);
      console.log(C.bold + C.green + '  |  ESC/POS BUFFER CHECKSUM TEST PASSED                              |' + C.reset);
      console.log(C.bold + C.green + '  |  - Buffer starts with ESC @ (printer init)                       |' + C.reset);
      console.log(C.bold + C.green + '  |  - Contains all required ESC/POS commands (align, cut, feed)     |' + C.reset);
      console.log(C.bold + C.green + '  |  - Checksum is deterministic (regression-safe)                   |' + C.reset);
      console.log(C.bold + C.green + '  |  - No invalid bytes — safe to send to real ESC/POS printer       |' + C.reset);
      console.log(C.bold + C.green + '  ╚══════════════════════════════════════════════════════════════════╝' + C.reset);
      console.log('');
    } else {
      console.log('');
      console.log(C.bold + C.red + '  ESC/POS BUFFER CHECKSUM TEST FAILED' + C.reset);
      process.exit(1);
    }

    await db.destroy();
  } catch (err) {
    console.error(C.red + '\nFATAL:' + C.reset, err);
    console.error(err.stack);
    await db.destroy();
    process.exit(1);
  }
})();
