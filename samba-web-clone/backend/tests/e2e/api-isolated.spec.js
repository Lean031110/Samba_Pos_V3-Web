// =====================================================================
// api-isolated.spec.js — Suite A: API tests (fully isolated)
// =====================================================================
// Each test: own login, own data, no shared state.
// =====================================================================

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';

async function login(request) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { username: 'Administrator', pin: '1234' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

function authGet(request, token, path) {
  return request.get(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}
function authPost(request, token, path, data) {
  return request.post(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, data });
}

test.describe('Suite A: API (Isolated)', () => {

  test('A1: Login returns JWT + user', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'Administrator', pin: '1234' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.name).toBe('Administrator');
    expect(body.user.isAdmin).toBe(true);
  });

  test('A2: Login with wrong PIN returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'Administrator', pin: '9999' },
    });
    expect(res.status()).toBe(401);
  });

  test('A3: Request without token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tickets`);
    expect(res.status()).toBe(401);
  });

  test('A4: Request with invalid token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tickets`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.status()).toBe(401);
  });

  test('A5: Create ticket + close + double-close 409', async ({ request }) => {
    const token = await login(request);
    const createRes = await authPost(request, token, '/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    expect(createRes.status()).toBe(201);
    const ticketId = (await createRes.json()).data.Id;

    // Close (empty ticket = remaining 0 = can close)
    const closeRes = await authPost(request, token, `/api/tickets/${ticketId}/close`, {});
    expect(closeRes.ok()).toBeTruthy();

    // Double close = 409
    const secondClose = await authPost(request, token, `/api/tickets/${ticketId}/close`, {});
    expect(secondClose.status()).toBe(409);
  });

  test('A6: Add note to ticket', async ({ request }) => {
    const token = await login(request);
    const createRes = await authPost(request, token, '/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = (await createRes.json()).data.Id;

    const noteRes = await authPost(request, token, `/api/tickets/${ticketId}/note`, { note: 'Test note' });
    expect(noteRes.ok()).toBeTruthy();
    expect((await noteRes.json()).data.Note).toBe('Test note');
  });

  test('A7: Set tags on ticket', async ({ request }) => {
    const token = await login(request);
    const createRes = await authPost(request, token, '/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = (await createRes.json()).data.Id;

    const tagsRes = await authPost(request, token, `/api/tickets/${ticketId}/tags`, {
      tags: [{ name: 'Type', value: 'Dine-in' }],
    });
    expect(tagsRes.ok()).toBeTruthy();
    const tags = JSON.parse((await tagsRes.json()).data.TicketTags);
    expect(tags[0].TagName).toBe('Type');
  });

  test('A8: Get calculation types (DB-driven)', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/calculation-types');
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()).data;
    expect(data.length).toBeGreaterThan(0);
    expect(data.find(c => c.DecreaseAmount)).toBeTruthy();
  });

  test('A9: Get payment types (DB-driven)', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/payment-types');
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()).data;
    expect(data.find(p => p.Name.toLowerCase().includes('cash'))).toBeTruthy();
  });

  test('A10: Get kitchen stations', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/kitchen/stations');
    expect(res.ok()).toBeTruthy();
    const data = (await res.json()).data;
    expect(data.find(s => s.Code === 'KITCHEN')).toBeTruthy();
  });

  test('A11: Get inventory ingredients', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/inventory/ingredients');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });

  test('A12: Get inventory stock balances', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/inventory/stock/1');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });

  test('A13: Print preview generates ESC/POS', async ({ request }) => {
    const token = await login(request);
    const createRes = await authPost(request, token, '/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = (await createRes.json()).data.Id;

    const printRes = await authGet(request, token, `/api/tickets/${ticketId}/print`);
    expect(printRes.ok()).toBeTruthy();
    const data = (await printRes.json()).data;
    const buf = Buffer.from(data.escposBase64, 'base64');
    expect(buf[0]).toBe(0x1B);
    expect(buf[1]).toBe(0x40);
  });

  test('A14: Get printers list', async ({ request }) => {
    const token = await login(request);
    const res = await authGet(request, token, '/api/printers');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).data.length).toBeGreaterThan(0);
  });

  test('A15: Void a ticket', async ({ request }) => {
    const token = await login(request);
    const createRes = await authPost(request, token, '/api/tickets', { departmentId: 1, ticketTypeId: 1 });
    const ticketId = (await createRes.json()).data.Id;

    const voidRes = await authPost(request, token, `/api/tickets/${ticketId}/void`, {});
    expect(voidRes.ok()).toBeTruthy();
    expect((await voidRes.json()).data.IsClosed).toBe(1);
  });
});
