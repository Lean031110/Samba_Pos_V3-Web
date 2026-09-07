#!/usr/bin/env bash
# Smoke test for FASE 3 new endpoints
set -e

cd /home/z/my-project/sambapos_lba/samba-web-clone/backend
rm -f ../data/samba.db ../data/samba.db-wal ../data/samba.db-shm
JWT_SECRET="test-secret-32-chars-min!!" ADMIN_PIN="1234" NODE_ENV=test node scripts/run-migrations.js >/dev/null 2>&1

# Start server in background
JWT_SECRET="test-secret-32-chars-min!!" ADMIN_PIN="1234" NODE_ENV=test node src/api/server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

# Wait for server
for i in $(seq 1 15); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    echo "Server up after ${i}s"
    break
  fi
  sleep 1
done

# Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Administrator","pin":"1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Got token (len=${#TOKEN})"

echo ""
echo "=== Create customer ==="
curl -s -X POST http://localhost:3001/api/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Juan Pérez","code":"CUST001","phone":"+5355555555","email":"juan@test.com"}'

echo ""
echo "=== List customers ==="
curl -s "http://localhost:3001/api/customers?limit=5" \
  -H "Authorization: Bearer $TOKEN" | head -c 500

echo ""
echo "=== Open work period ==="
curl -s -X POST http://localhost:3001/api/work-periods/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"openingAmount":500,"description":"Test day"}'

echo ""
echo "=== Get current work period ==="
curl -s http://localhost:3001/api/work-periods/current \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== Open cash session ==="
curl -s -X POST http://localhost:3001/api/cash-sessions/open \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"terminalId":0,"openingAmount":200}'

echo ""
echo "=== Get current cash session ==="
curl -s "http://localhost:3001/api/cash-sessions/current?terminalId=0" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== Payout from cash session ==="
SESSION_ID=$(curl -s "http://localhost:3001/api/cash-sessions/current?terminalId=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['Id'])")
echo "Session ID: $SESSION_ID"
curl -s -X POST "http://localhost:3001/api/cash-sessions/$SESSION_ID/payout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":50,"note":"supplier payment","idempotencyKey":"payout-001"}'

echo ""
echo "=== Idempotent payout (same key) ==="
curl -s -X POST "http://localhost:3001/api/cash-sessions/$SESSION_ID/payout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":50,"note":"supplier payment","idempotencyKey":"payout-001"}'

echo ""
echo "=== Get cash session events (ledger) ==="
curl -s "http://localhost:3001/api/cash-sessions/$SESSION_ID/events" \
  -H "Authorization: Bearer $TOKEN" | head -c 800

echo ""
echo "=== Close cash session ==="
curl -s -X POST "http://localhost:3001/api/cash-sessions/$SESSION_ID/close" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"countedAmount":150,"note":"end of day"}'

echo ""
echo "=== Close work period ==="
curl -s -X POST http://localhost:3001/api/work-periods/close \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expectedAmount":500,"actualAmount":480,"description":"end of day"}'

echo ""
echo "=== done ==="
