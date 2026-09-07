// Debug FASE 3 idempotency flow
const path = require('path');
const BACKEND_DIR = '/home/z/my-project/sambapos_lba/samba-web-clone/backend';
process.chdir(BACKEND_DIR);
process.env.JWT_SECRET = 'test-secret-32-chars-min!!';
process.env.ADMIN_PIN = '1234';
process.env.NODE_ENV = 'test';
process.env.PORT = 3095;

const { spawn, execSync } = require('child_process');
const knex = require('knex');
const config = require(path.join(BACKEND_DIR, 'src', 'infrastructure', 'db', 'knexfile.js'));

(async () => {
  // Reset DB
  execSync('rm -f /home/z/my-project/sambapos_lba/samba-web-clone/data/samba.db*');
  execSync('node ' + path.join(BACKEND_DIR, 'scripts', 'run-migrations.js'), {
    cwd: BACKEND_DIR,
    env: { ...process.env },
    stdio: 'inherit',
  });

  // Insert menu item
  const db = knex(config.development);
  const [miId] = await db('MenuItems').insert({ Name: 'Test Burger', GroupCode: 'Food', Barcode: 'TB01', Tag: null });
  const [portionId] = await db('MenuItemPortions').insert({ Name: 'Normal', MenuItemId: miId, Multiplier: 1 });
  await db('MenuItemPrices').insert({ MenuItemPortionId: portionId, PriceTag: null, Price: 5.00 });
  console.log('menuItem:', miId);
  await db.destroy();

  // Start server
  const proc = spawn('node', [path.join(BACKEND_DIR, 'src', 'api', 'server.js')], {
    cwd: BACKEND_DIR,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((resolve) => {
    proc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening on port')) resolve();
    });
  });
  await new Promise(r => setTimeout(r, 500));

  try {
    // Login
    const loginRes = await fetch('http://localhost:3095/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Administrator', pin: '1234' }),
    });
    const token = (await loginRes.json()).token;

    // Create ticket
    const t1 = await fetch('http://localhost:3095/api/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ departmentId: 1, ticketTypeId: 1 }),
    });
    const ticketId = (await t1.json()).data.Id;
    console.log('ticket id:', ticketId);

    // Add order (note: price field not in schema; remove)
    const o1 = await fetch('http://localhost:3095/api/tickets/' + ticketId + '/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ menuItemId: miId, quantity: 2 }),
    });
    const orderResp = await o1.json();
    console.log('order status:', o1.status);
    console.log('order TotalAmount:', orderResp.data?.TotalAmount);
    console.log('order RemainingAmount:', orderResp.data?.RemainingAmount);

    // Payment
    const p1 = await fetch('http://localhost:3095/api/tickets/' + ticketId + '/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ paymentTypeId: 1, amount: 5, idempotencyKey: 'pay-key-001' }),
    });
    console.log('payment status:', p1.status);
    const paymentResp = await p1.json();
    console.log('payment body:', JSON.stringify(paymentResp).slice(0, 500));
  } finally {
    proc.kill('SIGTERM');
    setTimeout(() => process.exit(0), 500);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
