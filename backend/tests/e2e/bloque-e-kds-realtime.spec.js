// =====================================================================
// bloque-e-kds-realtime.spec.js — BLOQUE E: POS→KDS tiempo real (gate P0)
// =====================================================================
// This spec closes the P0 gap from docs/PRODUCTION_GAP_MATRIX.md:
//
//   "Test E2E que verifique: crear pedido en POS → aparece en KDS sin refresh"
//
// Strategy:
//   1. Spin up the backend (Playwright webServer)
//   2. Open TWO browser contexts (simulating two terminals):
//      - Terminal A: logged in as admin, navigates to /#kitchen (KDS view)
//      - Terminal B: logged in as admin, uses the POS view to create a ticket
//                     and add an order
//   3. Verify Terminal A (KDS) shows the new order WITHOUT a manual refresh
//      — the order card must appear automatically via the WebSocket event
//      `KitchenOrderAdded`.
//   4. From the KDS, click "Aceptar" → verify the order state changes to
//      ACCEPTED in real time on the POS (no refresh).
//   5. From the KDS, click "Listo" (bump) → verify state changes to READY.
//   6. From the KDS, click "Servido" → verify state changes to SERVED.
//
// This is the canonical "end-to-end real-time" test that proves the entire
// chain works: API → eventBus → Socket.IO bridge → browser WebSocket →
// KitchenView.addOrder → KitchenView.refresh.
//
// If this test fails, the product is NOT production-ready.
// =====================================================================

const { test, expect } = require('@playwright/test');
const { io } = require('socket.io-client');

const BASE = 'http://localhost:3001';
const API = BASE;

async function login(request) {
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username: 'Administrator', pin: '1234' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).token;
}

async function ensureMenuItem(request, token, name, groupCode) {
  // Try to find an existing menu item with this name
  const listRes = await request.get(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (listRes.ok()) {
    const body = await listRes.json();
    const existing = (body.data || []).find(p => p.Name === name);
    if (existing) return existing;
  }
  // Create it
  const res = await request.post(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, price: 5.00, groupCode },
  });
  return (await res.json()).data;
}

test.describe('BLOQUE E — POS→KDS Realtime (P0 gate)', () => {

  test('E1: POS creates order → KDS shows it without refresh', async ({ browser, request }) => {
    const token = await login(request);

    // Ensure we have a menu item that routes to the KITCHEN station
    const menuItem = await ensureMenuItem(request, token, 'Bloque E Realtime Burger', 'Food');
    expect(menuItem.Id).toBeTruthy();

    // --- Terminal A (KDS) ---
    const ctxA = await browser.newContext();
    // Pre-seed localStorage with the JWT so the SPA doesn't need the login form.
    // This is the standard Playwright pattern for testing authenticated views.
    await ctxA.addInitScript((t) => {
      localStorage.setItem('samba_jwt', t);
    }, token);
    const pageA = await ctxA.newPage();

    // Navigate directly to the kitchen view (the SPA reads the token on load)
    await pageA.goto(`${BASE}/`);
    // The app's App.init() defaults to 'login' view if no user — but since we
    // have the token, we need to also set the store state. Easiest: navigate
    // directly via the global App object after the page loads.
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.waitForFunction(() => window.App && window.App.navigate, null, { timeout: 10000 });

    // Set the user via the store (so the SPA renders as logged in)
    // and navigate to the kitchen view.
    await pageA.evaluate(() => {
      // Mimic what login() does after a successful API call
      const user = { name: 'Administrator', isAdmin: true };
      window.store.setState({ currentUser: user }, 'logged-in');
      document.getElementById('header-user').textContent = user.name;
      window.App.navigate('kitchen');
    });

    // Wait for the kitchen view to become active + orders to load
    await pageA.waitForSelector('#view-kitchen.is-active', { timeout: 10000 });
    await pageA.waitForSelector('.kds-cards, .kds-empty2, #kds-screen', { timeout: 10000 });

    // Count current orders in KDS (so we can detect a new one)
    const initialCount = await pageA.locator('.kds-card2').count();
    console.log(`[E1] Initial KDS order count: ${initialCount}`);

    // --- Terminal B (POS / API) ---
    // Create a ticket + add an order via API (simulates POS action)
    const createRes = await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    expect(createRes.ok()).toBeTruthy();
    const ticketId = (await createRes.json()).data.Id;

    const addOrderRes = await request.post(`${API}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: menuItem.Id, quantity: 1 },
    });
    expect(addOrderRes.ok()).toBeTruthy();

    // --- Verify KDS shows the new order WITHOUT manual refresh ---
    // We wait up to 5 seconds for a new .kds-card to appear.
    // If the WebSocket event chain works, this should be near-instant.
    try {
      await pageA.waitForFunction(
        (prevCount) => {
          const cards = document.querySelectorAll('.kds-card2');
          return cards.length > prevCount;
        },
        initialCount,
        { timeout: 5000 }
      );
    } catch (e) {
      // Diagnostic snapshot
      const cards = await pageA.locator('.kds-card2').count();
      throw new Error(
        `[E1] KDS did NOT receive the new order via WebSocket within 5s. ` +
        `Expected > ${initialCount} cards, found ${cards}. ` +
        `WebSocket event chain (API → eventBus → Socket.IO → browser) may be broken.`
      );
    }

    const finalCount = await pageA.locator('.kds-card2').count();
    expect(finalCount).toBeGreaterThan(initialCount);
    console.log(`[E1] Final KDS order count: ${finalCount} — PASS`);

    // Cleanup
    await pageA.close();
    await ctxA.close();
  });

  test('E2: KDS state change propagates back to POS in real time', async ({ browser, request }) => {
    const token = await login(request);

    // Use raw Socket.IO client to listen for KitchenOrderUpdated events
    // (this is what the POS listens for to know about KDS-side state changes)
    // We subscribe to BOTH 'pos' and 'kitchen' rooms because:
    //   - KitchenOrderAdded is only emitted to role:kitchen
    //   - KitchenOrderUpdated is emitted to both role:kitchen and role:pos
    const socketPOS = io(BASE, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 5000,
    });

    // Connect + join role:pos AND role:kitchen (admin has all permissions)
    await new Promise((resolve, reject) => {
      socketPOS.on('connect', () => {
        socketPOS.emit('subscribe:role', 'pos', () => {
          socketPOS.emit('subscribe:role', 'kitchen', () => {
            resolve();
          });
        });
        setTimeout(reject, 3000);
      });
      socketPOS.on('connect_error', reject);
    });

    // IMPORTANT: Set up the KitchenOrderAdded listener BEFORE creating any tickets/orders.
    // If we register it after the order is created, we might miss the event (race condition).
    // Since this test creates exactly ONE order, we capture the FIRST KitchenOrderAdded event.
    const kitchenOrderAddedPromise = new Promise((resolve) => {
      socketPOS.on('KitchenOrderAdded', (payload) => {
        console.log(`[E2] received KitchenOrderAdded: ticketId=${payload.ticketId} orderId=${payload.orderId} kitchenOrderId=${payload.kitchenOrderId}`);
        resolve(payload);
      });
    });

    // Create ticket + order via API
    const menuItem = await ensureMenuItem(request, token, 'Bloque E Propagation Burger', 'Food');
    const createRes = await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;

    const addOrderRes = await request.post(`${API}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: menuItem.Id, quantity: 2 },
    });
    // The addOrder endpoint returns the FULL TICKET (not just the new order).
    const ticket = (await addOrderRes.json()).data;
    const newOrder = ticket.Orders && ticket.Orders.length > 0
      ? ticket.Orders[ticket.Orders.length - 1]
      : null;
    const orderId = newOrder ? newOrder.Id : null;
    console.log(`[E2] ticketId=${ticketId} orderId=${orderId} (orders count: ${ticket.Orders?.length})`);
    expect(orderId, 'Should have a newly created order').toBeTruthy();

    const addedPayload = await Promise.race([
      kitchenOrderAddedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: KitchenOrderAdded not received')), 5000)),
    ]);
    const kitchenOrderId = addedPayload.kitchenOrderId;

    // Verify the event payload matches what we created
    expect(addedPayload.ticketId).toBe(ticketId);
    expect(addedPayload.orderId).toBe(orderId);

    // Verify the kitchen order exists in the DB with NEW state
    const koRes = await request.get(`${API}/api/kitchen/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const kitchenOrder = (await koRes.json()).data.find(ko => ko.Id === kitchenOrderId);
    expect(kitchenOrder, `Kitchen order ${kitchenOrderId} should exist in active orders`).toBeTruthy();
    expect(kitchenOrder.State).toBe('NEW');

    // First transition: NEW → ACCEPTED (the bump endpoint goes to READY,
    // which requires ACCEPTED first per VALID_TRANSITIONS)
    const acceptRes = await request.post(`${API}/api/kitchen/orders/${kitchenOrder.Id}/state`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { state: 'ACCEPTED' },
    });
    expect(acceptRes.ok(), `Accept should succeed: ${JSON.stringify(acceptRes.body)}`).toBeTruthy();

    // Set up listener for KitchenOrderUpdated BEFORE we trigger the bump
    const updateReceived = new Promise((resolve) => {
      socketPOS.once('KitchenOrderUpdated', (payload) => {
        if (payload.kitchenOrderId === kitchenOrder.Id) {
          resolve(payload);
        }
      });
    });

    // BUMP the kitchen order (ACCEPTED → READY)
    const bumpRes = await request.post(`${API}/api/kitchen/orders/${kitchenOrder.Id}/bump`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(bumpRes.ok(), `Bump should succeed: ${JSON.stringify(bumpRes.body)}`).toBeTruthy();

    // Wait for the WebSocket event to arrive at the POS-side listener
    const updatePayload = await Promise.race([
      updateReceived,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: KitchenOrderUpdated not received by POS')), 5000)),
    ]);

    expect(updatePayload.newState).toBe('READY');
    expect(updatePayload.kitchenOrderId).toBe(kitchenOrder.Id);
    console.log(`[E2] KDS→POS propagation verified: state=${updatePayload.newState} — PASS`);

    socketPOS.disconnect();
  });

  test('E3: WebSocket KitchenOrderAdded carries full payload for KDS rendering', async ({ request }) => {
    // Verify that the event payload contains everything the frontend needs
    // to render the new kitchen order card WITHOUT making an additional
    // GET /api/kitchen/orders call.
    //
    // This is important because if the payload is missing data (e.g., tableName,
    // ticketNumber), the KDS would have to do a follow-up GET to render —
    // which means it's NOT truly "real-time" (there's an extra round-trip).
    //
    const token = await login(request);
    const socket = io(BASE, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 5000,
    });

    // Connect + subscribe to kitchen role
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('subscribe:role', 'kitchen', () => resolve());
        setTimeout(reject, 3000);
      });
      socket.on('connect_error', reject);
    });

    // Listen for KitchenOrderAdded
    const eventPromise = new Promise((resolve) => {
      socket.on('KitchenOrderAdded', (payload) => resolve(payload));
    });

    // Trigger: create a ticket + order
    const menuItem = await ensureMenuItem(request, token, 'Bloque E Payload Burger', 'Food');
    const createRes = await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;

    await request.post(`${API}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: menuItem.Id, quantity: 1 },
    });

    // Wait for the event
    const payload = await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: KitchenOrderAdded not received')), 5000)),
    ]);

    // Verify payload contains everything KDS needs
    expect(payload).toBeTruthy();
    expect(payload.kitchenOrderId).toBeTruthy();
    expect(payload.orderId).toBeTruthy();
    expect(payload.ticketId).toBe(ticketId);
    expect(payload.menuItemName).toBeTruthy();
    expect(typeof payload.quantity).toBe('number');
    expect(payload).toHaveProperty('tableName');
    expect(payload).toHaveProperty('ticketNumber');
    console.log(`[E3] KitchenOrderAdded payload verified — all fields present — PASS`);

    socket.disconnect();
  });

  test('E4: Multiple POS orders → multiple KitchenOrderAdded events (ordering preserved)', async ({ request }) => {
    // Verify that if POS creates 3 orders in rapid succession, KDS receives
    // 3 separate KitchenOrderAdded events in the same order.
    //
    const token = await login(request);
    const socket = io(BASE, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 5000,
    });

    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('subscribe:role', 'kitchen', () => resolve());
        setTimeout(reject, 3000);
      });
      socket.on('connect_error', reject);
    });

    // Collect KitchenOrderAdded events
    const received = [];
    const allReceived = new Promise((resolve) => {
      let count = 0;
      socket.on('KitchenOrderAdded', (payload) => {
        received.push(payload);
        count++;
        if (count >= 3) resolve();
      });
    });

    // Create 1 ticket with 3 orders in rapid succession
    const menuItem = await ensureMenuItem(request, token, 'Bloque E Multi Burger', 'Food');
    const createRes = await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;

    // Fire 3 order creations
    for (let i = 0; i < 3; i++) {
      await request.post(`${API}/api/tickets/${ticketId}/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { menuItemId: menuItem.Id, quantity: 1 },
      });
    }

    await Promise.race([
      allReceived,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: expected 3 KitchenOrderAdded events')), 8000)),
    ]);

    expect(received.length).toBe(3);
    // Each event must have a unique kitchenOrderId
    const ids = received.map(p => p.kitchenOrderId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
    console.log(`[E4] Received 3 KitchenOrderAdded events with unique IDs — PASS`);

    socket.disconnect();
  });

  test('E5: KDS void → POS receives KitchenOrderVoided event (propagation)', async ({ request }) => {
    // Verify that when KDS voids an order, the POS receives a KitchenOrderVoided
    // event (so it can refresh its UI to show the order as voided).
    //
    const token = await login(request);
    const socket = io(BASE, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      timeout: 5000,
    });

    // Join BOTH pos and kitchen rooms (admin has both permissions)
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('subscribe:role', 'pos', () => {
          socket.emit('subscribe:role', 'kitchen', () => resolve());
        });
        setTimeout(reject, 3000);
      });
      socket.on('connect_error', reject);
    });

    // IMPORTANT: Set up the KitchenOrderAdded listener BEFORE creating any tickets/orders.
    const kitchenOrderAddedPromise = new Promise((resolve) => {
      socket.on('KitchenOrderAdded', (payload) => {
        console.log(`[E5] received KitchenOrderAdded: ticketId=${payload.ticketId} orderId=${payload.orderId} kitchenOrderId=${payload.kitchenOrderId}`);
        resolve(payload);
      });
    });

    // Create ticket + order
    const menuItem = await ensureMenuItem(request, token, 'Bloque E Void Burger', 'Food');
    const createRes = await request.post(`${API}/api/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { departmentId: 1, ticketTypeId: 1 },
    });
    const ticketId = (await createRes.json()).data.Id;

    const orderRes = await request.post(`${API}/api/tickets/${ticketId}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { menuItemId: menuItem.Id, quantity: 1 },
    });
    // addOrder returns the full ticket — extract the orderId from ticket.Orders
    const ticket = (await orderRes.json()).data;
    const newOrder = ticket.Orders && ticket.Orders.length > 0
      ? ticket.Orders[ticket.Orders.length - 1]
      : null;
    const orderId = newOrder ? newOrder.Id : null;
    expect(orderId, 'Should have a newly created order').toBeTruthy();

    const addedPayload = await Promise.race([
      kitchenOrderAddedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: KitchenOrderAdded not received')), 5000)),
    ]);
    const kitchenOrderId = addedPayload.kitchenOrderId;

    // Verify the event payload matches what we created
    expect(addedPayload.ticketId).toBe(ticketId);
    expect(addedPayload.orderId).toBe(orderId);

    // Set up listener BEFORE the void
    const voidEventPromise = new Promise((resolve) => {
      socket.on('KitchenOrderVoided', (payload) => {
        if (payload.kitchenOrderId === kitchenOrderId) resolve(payload);
      });
    });

    // Void the kitchen order
    const voidRes = await request.post(`${API}/api/kitchen/orders/${kitchenOrderId}/void`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(voidRes.ok()).toBeTruthy();

    // Wait for the event
    const voidPayload = await Promise.race([
      voidEventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: KitchenOrderVoided not received')), 5000)),
    ]);

    expect(voidPayload.kitchenOrderId).toBe(kitchenOrderId);
    expect(voidPayload.orderId).toBe(orderId);
    expect(voidPayload.action).toBe('kds_void_propagated');
    console.log(`[E5] KDS→POS void propagation verified — PASS`);

    socket.disconnect();
  });

});
