#!/usr/bin/env bash
# Run all tests (unit + e2e) and report a single line summary.
set -euo pipefail

BACKEND=/home/z/my-project/sambapos_lba/samba-web-clone/backend
cd "$BACKEND"
export JWT_SECRET="phase1-final-secret-32-chars-min!!"
export ADMIN_PIN="1234"
export NODE_ENV=test
export CI=1

PASS=0
FAIL=0

run_unit () {
  local name="$1"
  local file="$2"
  rm -f ../data/samba.db ../data/samba.db-wal ../data/samba.db-shm
  node scripts/run-migrations.js >/dev/null 2>&1
  local out
  out=$(node --test "$file" 2>&1 || true)
  local p=$(echo "$out" | grep -E "^ℹ pass" | tail -1 | awk '{print $3}')
  local f=$(echo "$out" | grep -E "^ℹ fail" | tail -1 | awk '{print $3}')
  PASS=$((PASS + p))
  FAIL=$((FAIL + f))
  printf "  %-40s pass=%3s fail=%3s\n" "$name" "$p" "$f"
}

echo "=== UNIT TESTS ==="
run_unit "api-integration"        tests/api-integration.test.js
run_unit "kds-verification"       tests/kds-verification.test.js
run_unit "inventory-verification" tests/inventory-verification.test.js
run_unit "concurrency-verification" tests/concurrency-verification.test.js
run_unit "security-verification"  tests/security-verification.test.js

echo "=== E2E (Playwright) ==="
rm -f ../data/samba.db ../data/samba.db-wal ../data/samba.db-shm
npx playwright test --reporter=line > /tmp/e2e.log 2>&1 || true
P_E2E=$(grep -cE "passed" /tmp/e2e.log | tail -1)
if echo "$P_E2E" | grep -q "passed"; then
  E2E_PASS=$(grep -oE "[0-9]+ passed" /tmp/e2e.log | awk '{print $1}')
else
  E2E_PASS=0
fi
E2E_FAIL=$(grep -oE "[0-9]+ failed" /tmp/e2e.log | awk '{print $1}' || echo 0)
PASS=$((PASS + E2E_PASS))
FAIL=$((FAIL + E2E_FAIL))
printf "  %-40s pass=%3s fail=%3s\n" "playwright E2E" "${E2E_PASS:-0}" "${E2E_FAIL:-0}"

echo
echo "=== FINAL ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "TOTAL: $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
