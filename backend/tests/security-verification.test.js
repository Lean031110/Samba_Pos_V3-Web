// =====================================================================
// security-verification.test.js
// Phase 1 security tests: CORS hardening, auth bypass, fuzzing
// =====================================================================
// Run with:
//   JWT_SECRET=test-secret-32-chars-min!! NODE_ENV=test node --test tests/security-verification.test.js
// =====================================================================

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Spawn the server with a given env, return { proc, baseUrl }.
 * Caller MUST call proc.kill() in after().
 */
function startServer(env) {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(BACKEND_DIR, 'src', 'api', 'server.js');
    const proc = spawn('node', [serverPath], {
      cwd: BACKEND_DIR,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timeout = setTimeout(() => {
      reject(new Error('Server did not start in 15s'));
      proc.kill('SIGKILL');
    }, 15000);

    proc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('listening on port')) {
        clearTimeout(timeout);
        resolve({ proc, baseUrl: `http://localhost:${env.PORT || 3001}` });
      }
    });
    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      // Capture fatal errors so tests can assert on them
      if (s.includes('[FATAL]')) {
        clearTimeout(timeout);
        // Give the process a moment to exit, then resolve with error marker
        proc.once('exit', (code) => {
          resolve({ proc: null, exited: true, code, stderr: s });
        });
      }
    });
    proc.on('error', reject);
  });
}

function killServer(proc) {
  if (!proc) return Promise.resolve();
  return new Promise((resolve) => {
    proc.once('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, 3000);
  });
}

async function resetDb() {
  const dbPath = path.join(REPO_ROOT, 'data', 'samba.db');
  try {
    execSync(`rm -f ${dbPath} ${dbPath}-wal ${dbPath}-shm`, { stdio: 'pipe' });
  } catch {}
  const migrateScript = path.join(BACKEND_DIR, 'scripts', 'run-migrations.js');
  execSync(`node ${migrateScript}`, {
    cwd: BACKEND_DIR,
    env: { ...process.env, JWT_SECRET: 'test-secret-32-chars-min!!', ADMIN_PIN: '1234', NODE_ENV: 'test' },
    stdio: 'pipe',
  });
}

describe('Phase 1 — Security hardening', () => {
  describe('CORS protection in production', () => {
    test('1A: Server REFUSES to start in production with CORS_ORIGIN=*', async () => {
      const result = await startServer({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-secret-32-chars-min-please!',
        CORS_ORIGIN: '*',
        PORT: 3098,
      });
      assert.ok(result.exited, 'Server should exit when CORS_ORIGIN=* in production');
      assert.ok(result.code !== 0, `Expected non-zero exit code, got ${result.code}`);
      assert.ok(result.stderr.includes('CORS_ORIGIN'), `stderr should mention CORS_ORIGIN, got: ${result.stderr}`);
    });

    test('1B: Server REFUSES to start in production with empty CORS_ORIGIN', async () => {
      const result = await startServer({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-secret-32-chars-min-please!',
        CORS_ORIGIN: '',
        PORT: 3098,
      });
      assert.ok(result.exited, 'Server should exit when CORS_ORIGIN is empty in production');
      assert.ok(result.code !== 0, 'Expected non-zero exit code');
    });

    test('1C: Server STARTS in production with specific CORS_ORIGIN', async () => {
      const result = await startServer({
        NODE_ENV: 'production',
        JWT_SECRET: 'prod-secret-32-chars-min-please!',
        CORS_ORIGIN: 'https://pos.example.com',
        PORT: 3099,
      });
      if (!result.proc) {
        assert.fail(`Server should have started, but exited with: ${result.stderr}`);
      }
      assert.ok(result.proc, 'Server should start with specific CORS_ORIGIN in production');
      await killServer(result.proc);
    });
  });

  describe('Auth bypass — protected endpoints reject unauthenticated requests', () => {
    let serverHandle;
    const PORT = 3097;

    before(async () => {
      await resetDb();
      // Separate DB instance from fuzzing suite so rate-limiter doesn't carry over
      serverHandle = await startServer({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-32-chars-min!!',
        CORS_ORIGIN: '*',
        PORT,
      });
    });

    after(async () => {
      if (serverHandle?.proc) await killServer(serverHandle.proc);
    });

    const BASE = `http://localhost:${PORT}`;

    test('2A: GET /api/tickets without token → 401', async () => {
      const res = await fetch(`${BASE}/api/tickets`);
      assert.strictEqual(res.status, 401);
    });

    test('2B: GET /api/products without token → 401', async () => {
      const res = await fetch(`${BASE}/api/products`);
      assert.strictEqual(res.status, 401);
    });

    test('2C: GET /api/kitchen/orders without token → 401', async () => {
      const res = await fetch(`${BASE}/api/kitchen/orders`);
      assert.strictEqual(res.status, 401);
    });

    test('2D: POST /api/auth/login with empty body → 400', async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
    });

    test('2E: POST /api/auth/login with malformed JSON → 400', async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      assert.ok([400, 401].includes(res.status), `Expected 400 or 401, got ${res.status}`);
    });

    test('2F: Bearer with garbage token → 401', async () => {
      const res = await fetch(`${BASE}/api/tickets`, {
        headers: { Authorization: 'Bearer not-a-real-token' },
      });
      assert.strictEqual(res.status, 401);
    });

    test('2G: Bearer with malformed header (no Bearer prefix) → 401', async () => {
      const res = await fetch(`${BASE}/api/tickets`, {
        headers: { Authorization: 'weird-token-no-prefix' },
      });
      assert.strictEqual(res.status, 401);
    });

    test('2H: Login with non-existent user → 401 (no user enumeration)', async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'definitely_not_exists', pin: '0000' }),
      });
      assert.strictEqual(res.status, 401);
    });

    test('2I: Login with valid user but wrong PIN → 401', async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', pin: '9999' }),
      });
      assert.strictEqual(res.status, 401);
    });

    test('2J: Login OK with valid credentials → 200 + token', async () => {
      // Spawn a fresh server on a different port to bypass rate-limiter state
      const fresh = await startServer({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-32-chars-min!!',
        CORS_ORIGIN: '*',
        PORT: 3094,
      });
      if (!fresh.proc) assert.fail('fresh server did not start');
      try {
        const res = await fetch(`http://localhost:3094/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'Administrator', pin: '1234' }),
        });
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.ok(body.token, 'token must be present');
        assert.ok(body.token.split('.').length === 3, 'JWT must have 3 parts');
      } finally {
        await killServer(fresh.proc);
      }
    });
  });

  describe('Basic input fuzzing on login', () => {
    let serverHandle;
    const PORT = 3096;

    before(async () => {
      await resetDb();
      serverHandle = await startServer({
        NODE_ENV: 'test',
        JWT_SECRET: 'test-secret-32-chars-min!!',
        CORS_ORIGIN: '*',
        PORT,
      });
    });

    after(async () => {
      if (serverHandle?.proc) await killServer(serverHandle.proc);
    });

    const BASE = `http://localhost:${PORT}`;
    const fuzzCases = [
      { name: 'extra long username', body: { username: 'a'.repeat(10000), pin: '1234' } },
      { name: 'extra long pin', body: { username: 'admin', pin: '1'.repeat(10000) } },
      { name: 'null username', body: { username: null, pin: '1234' } },
      { name: 'null pin', body: { username: 'admin', pin: null } },
      { name: 'array username', body: { username: ['admin', 'x'], pin: '1234' } },
      { name: 'object pin', body: { username: 'admin', pin: { $gt: '' } } },
      { name: 'number username', body: { username: 12345, pin: '1234' } },
      { name: 'boolean pin', body: { username: 'admin', pin: true } },
    ];

    for (const c of fuzzCases) {
      test(`3: fuzz ${c.name} → 4xx (no 500)`, async () => {
        const res = await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c.body),
        });
        assert.ok(res.status >= 400 && res.status < 500,
          `Expected 4xx, got ${res.status} for case ${c.name}`);
      });
    }
  });
});
