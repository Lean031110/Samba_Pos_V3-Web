#!/usr/bin/env bash
# Run all tests (unit + e2e) and report a single line summary.
set -euo pipefail

# Resolve the backend directory relative to this script's location
# (so the runner works no matter where the repo is checked out).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="${SCRIPT_DIR}/.."
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
run_unit "api-integration"          tests/api-integration.test.js
run_unit "kds-verification"         tests/kds-verification.test.js
run_unit "inventory-verification"   tests/inventory-verification.test.js
run_unit "concurrency-verification" tests/concurrency-verification.test.js
run_unit "idempotency-verification" tests/idempotency-verification.test.js
run_unit "idempotency-concurrency"  tests/idempotency-concurrency.test.js
run_unit "domain-verification"      tests/domain-verification.test.js
run_unit "security-verification"   tests/security-verification.test.js
run_unit "printing-verification"    tests/printing-verification.test.js
run_unit "recipes-verification"    tests/recipes-verification.test.js
run_unit "refund-verification"      tests/refund-verification.test.js
run_unit "unit-conversion"         tests/unit-conversion-verification.test.js
run_unit "domain-extended"         tests/domain-extended-verification.test.js
run_unit "bloque-d-verification"  tests/bloque-d-verification.test.js
run_unit "bloque-e-kds"            tests/bloque-e-kds-verification.test.js
run_unit "bloque-f-printer"        tests/bloque-f-printer-verification.test.js
run_unit "bloque-g-pwa"           tests/bloque-g-pwa-verification.test.js
run_unit "bloque-h-push"          tests/bloque-h-push-verification.test.js
run_unit "bloque-i-offline"       tests/bloque-i-offline-verification.test.js
run_unit "bloque-j-production"    tests/bloque-j-production-verification.test.js
run_unit "bloque-klm"            tests/bloque-klm-verification.test.js
run_unit "bloque-refund-report"  tests/bloque-refund-report-verification.test.js

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
