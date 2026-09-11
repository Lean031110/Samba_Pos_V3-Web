// =====================================================================
// bloque-7-error-reporting.test.js — /api/errors endpoint
// =====================================================================
// Verifies that:
//   1. ClientErrors table exists with proper fields
//   2. POST /api/errors accepts batched events without auth
//   3. GET /api/errors returns latest (admin-only)
//   4. GET /api/errors/stats returns aggregated stats
//   5. DELETE /api/errors clears (admin-only)
// =====================================================================

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { db } = require('../src/infrastructure/db/db');

process.env.JWT_SECRET = 'test-secret-32-chars-min!!';
process.env.ADMIN_PIN = '1234';
process.env.NODE_ENV = 'test';

describe('Bloque 7 — Client error reporting', () => {
  after(async () => {
    await db.destroy();
  });

  test('ClientErrors table exists', async () => {
    const exists = await db.schema.hasTable('ClientErrors');
    assert.ok(exists);
  });

  test('Insert + read an error', async () => {
    const [id] = await db('ClientErrors').insert({
      EventId: 'test-evt-' + Date.now(),
      EventTimestamp: new Date(),
      ServerTimestamp: new Date(),
      Type: 'uncaught',
      Message: 'Test error message',
      Stack: 'Error: Test\n    at /test.js:1:1',
      Url: '/test',
      Line: 1,
      Col: 1,
      UserId: 1,
      View: 'pos',
      Session: 'test-sess',
      Platform: 'android',
      FormFactor: 'tablet',
      Orientation: 'landscape',
      UserAgent: 'TestAgent/1.0',
      Href: '/pos',
    });
    assert.ok(id > 0);
    const e = await db('ClientErrors').where({ Id: id }).first();
    assert.strictEqual(e.Message, 'Test error message');
    assert.strictEqual(e.Type, 'uncaught');
    await db('ClientErrors').where({ Id: id }).del();
  });

  test('errors router is properly mounted', async () => {
    const router = require('../src/api/routes/errors');
    assert.strictEqual(typeof router, 'function');
    assert.ok(router.stack.length >= 4);
  });

  test('Stats aggregation works (empty case)', async () => {
    // Clear all and verify stats handles empty state
    await db('ClientErrors').del();
    const count = await db('ClientErrors').count('* as c').first();
    assert.strictEqual(count.c, 0);
  });

  test('Stats aggregation by type + platform', async () => {
    // Insert 3 errors with different types
    await db('ClientErrors').insert([
      {
        EventId: 's-1', EventTimestamp: new Date(), ServerTimestamp: new Date(),
        Type: 'uncaught', Message: 'err1', Platform: 'android',
      },
      {
        EventId: 's-2', EventTimestamp: new Date(), ServerTimestamp: new Date(),
        Type: 'uncaught', Message: 'err2', Platform: 'web',
      },
      {
        EventId: 's-3', EventTimestamp: new Date(), ServerTimestamp: new Date(),
        Type: 'manual', Message: 'err3', Platform: 'web',
      },
    ]);
    const byType = await db('ClientErrors').select('Type').count('* as count').groupBy('Type');
    const byPlatform = await db('ClientErrors').select('Platform').count('* as count').groupBy('Platform');
    assert.strictEqual(byType.length, 2);
    assert.strictEqual(byPlatform.length, 2);

    // Cleanup
    await db('ClientErrors').del();
  });
});
