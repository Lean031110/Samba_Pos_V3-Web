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
SUITE_ERRORS=0

run_unit () {
  local name="$1"
  local file="$2"
  rm -f ../data/samba.db ../data/samba.db-wal ../data/samba.db-shm
  node scripts/run-migrations.js >/dev/null 2>&1
  # NOTE (PR #9 hardening): the old version used `|| true` and only parsed
  # the Node 22+ spec-reporter format ("^ℹ pass"), so on Node 20 (TAP format
  # "# pass N") every count parsed as empty and a failing suite could NOT
  # fail this script. Exit codes + both formats are now the source of truth.
  local out rc=0
  out=$(node --test "$file" 2>&1) || rc=$?
  # Node 20 (TAP):  "# pass 14"  / "# fail 0"
  # Node 22+ (spec): "ℹ pass 14" / "ℹ fail 0"
  local p=$(echo "$out" | grep -E '^(ℹ|#) pass' | tail -1 | grep -oE '[0-9]+' | tail -1)
  local f=$(echo "$out" | grep -E '^(ℹ|#) fail' | tail -1 | grep -oE '[0-9]+' | tail -1)
  p=${p:-0}
  f=${f:-0}
  # A non-zero exit code means the suite failed (or crashed) even when the
  # counters could not be parsed — never let that pass silently.
  if [ "$rc" -ne 0 ] && [ "$f" -eq 0 ]; then
    f=1
    echo "  !! SUITE FAILED without parseable counts (exit $rc) — forced fail" >&2
  fi
  if [ "$rc" -ne 0 ]; then
    SUITE_ERRORS=$((SUITE_ERRORS + 1))
    echo "$out" | tail -30 >&2
  fi
  PASS=$((PASS + p))
  FAIL=$((FAIL + f))
  printf "  %-40s pass=%3s fail=%3s exit=%s\n" "$name" "$p" "$f" "$rc"
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
# Only run E2E if PLAYWwright browsers are available (skip in CI if already handled separately)
if [ "${SKIP_E2E:-0}" != "1" ]; then
  rm -f ../data/samba.db ../data/samba.db-wal ../data/samba.db-shm
  # Same hardening: exit code is truth, `|| true` removed.
  E2E_RC=0
  npx playwright test --reporter=line > /tmp/e2e.log 2>&1 || E2E_RC=$?
  E2E_PASS=$(grep -oE "[0-9]+ passed" /tmp/e2e.log | tail -1 | grep -oE '[0-9]+' || echo 0)
  E2E_FAIL=$(grep -oE "[0-9]+ failed" /tmp/e2e.log | tail -1 | grep -oE '[0-9]+' || echo 0)
  if [ "$E2E_RC" -ne 0 ] && [ "${E2E_FAIL:-0}" -eq 0 ]; then
    E2E_FAIL=1
  fi
  PASS=$((PASS + E2E_PASS))
  FAIL=$((FAIL + E2E_FAIL))
  printf "  %-40s pass=%3s fail=%3s exit=%s\n" "playwright E2E" "${E2E_PASS:-0}" "${E2E_FAIL:-0}" "$E2E_RC"
else
  echo "  (skipped — SKIP_E2E=1)"
fi

echo
echo "=== FINAL ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "TOTAL: $((PASS + FAIL))"
# Machine-readable line for CI (ci.yml writes it to the job summary):
echo "UNIT_TEST_RESULTS: pass=$PASS fail=$FAIL total=$((PASS + FAIL)) suite_errors=$SUITE_ERRORS"

if [ "$FAIL" -gt 0 ] || [ "$SUITE_ERRORS" -gt 0 ]; then
  exit 1
fi
