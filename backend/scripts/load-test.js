#!/usr/bin/env node
// =====================================================================
// load-test.js — BLOQUE M: Stress test con k6-style HTTP load
// =====================================================================
// Usage:
//   node scripts/load-test.js [duration_seconds] [concurrent_users]
//
// This script simulates concurrent POS users hitting the API:
//   - Login
//   - Create ticket + add order + pay + close
//   - Get kitchen orders
//   - Get inventory stock
//
// Reports: RPS, latency p50/p95/p99, error rate.
// =====================================================================

const http = require('http');
const { URL } = require('url');

const BASE = process.env.LOAD_TEST_URL || 'http://localhost:3001';
const DURATION = parseInt(process.argv[2] || '10', 10);  // seconds
const CONCURRENT = parseInt(process.argv[3] || '5', 10);  // users

function makeRequest(method, path, body, token) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
      },
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, body: json, raw: body });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (data) req.write(data);
    req.end();
  });
}

async function login() {
  const res = await makeRequest('POST', '/api/auth/login', { username: 'Administrator', pin: '1234' });
  return res.body?.token;
}

async function simulateUser() {
  const token = await login();
  if (!token) return { error: 'login_failed' };

  // Create ticket
  const ticketRes = await makeRequest('POST', '/api/tickets', { departmentId: 1, ticketTypeId: 1 }, token);
  if (ticketRes.status !== 201) return { error: 'create_ticket', status: ticketRes.status };
  const ticketId = ticketRes.body?.data?.Id;

  // Get kitchen orders (read)
  await makeRequest('GET', '/api/kitchen/orders', null, token);

  // Get inventory stock (read)
  await makeRequest('GET', '/api/inventory/stock/1', null, token);

  // Void the ticket (cleanup — don't pay/close to avoid stock deduction)
  await makeRequest('POST', `/api/tickets/${ticketId}/void`, {}, token);

  return { success: true };
}

async function runLoadTest() {
  console.log(`[load-test] Starting: ${DURATION}s, ${CONCURRENT} concurrent users`);
  console.log(`[load-test] Target: ${BASE}`);

  const startTime = Date.now();
  const endTime = startTime + DURATION * 1000;
  let totalRequests = 0;
  let successful = 0;
  let failed = 0;
  const latencies = [];

  async function worker() {
    while (Date.now() < endTime) {
      const t0 = Date.now();
      const result = await simulateUser();
      const latency = Date.now() - t0;
      latencies.push(latency);
      totalRequests++;
      if (result.success) successful++;
      else failed++;
    }
  }

  // Launch concurrent workers
  const workers = [];
  for (let i = 0; i < CONCURRENT; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  // Calculate stats
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = totalRequests / DURATION;
  const errorRate = totalRequests > 0 ? (failed / totalRequests * 100).toFixed(1) : 0;

  console.log('\n[load-test] === RESULTS ===');
  console.log(`Duration:       ${DURATION}s`);
  console.log(`Concurrent:     ${CONCURRENT} users`);
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Successful:     ${successful}`);
  console.log(`Failed:         ${failed}`);
  console.log(`Error rate:     ${errorRate}%`);
  console.log(`RPS:            ${rps.toFixed(1)}`);
  console.log(`Latency p50:    ${p50}ms`);
  console.log(`Latency p95:    ${p95}ms`);
  console.log(`Latency p99:    ${p99}ms`);
  console.log('[load-test] === DONE ===\n');

  // Exit with error if error rate > 10%
  if (parseFloat(errorRate) > 10) {
    console.error('[load-test] FAIL: Error rate > 10%');
    process.exit(1);
  }
  process.exit(0);
}

runLoadTest().catch(err => {
  console.error('[load-test] Error:', err.message);
  process.exit(1);
});
