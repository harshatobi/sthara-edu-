#!/usr/bin/env bash
# Sthara regression run: every automated check, in order, with one summary at the end.
# It only reads the app (the repo this qa/ folder lives in, or STHARA_APP_DIR) and drives it; it never changes it.
#
#   bash run-regression.sh            app checks + unit + traceability + workbooks + local e2e (public, api)
#   bash run-regression.sh --demo     also the demo-mode walk through every portal page (slow on a busy machine)
#   bash run-regression.sh --quick    no browser suites
#   E2E_BASE_URL=https://www.sthara.in bash run-regression.sh
#                                     the e2e suites run against that deployment instead, plus the
#                                     signed-in test-school sweep (needs e2e.env); journeys only with E2E_ALLOW_WRITES=1
set -u
QA="$(cd "$(dirname "$0")" && pwd)"
APP="${STHARA_APP_DIR:-$QA/..}"
APP="$(cd "$APP" && pwd)"
DEMO=0; QUICK=0
for a in "$@"; do case "$a" in --demo) DEMO=1 ;; --quick) QUICK=1 ;; esac; done
export STHARA_APP_DIR="$APP"
mkdir -p "$QA/reports/logs"
NAMES=(); RESULTS=()

stage() { # stage "name" command...
  local name="$1"; shift
  local log="$QA/reports/logs/$(echo "$name" | tr ' /' '__').log"
  printf '\n▶ %s\n' "$name"
  if "$@" >"$log" 2>&1; then RESULTS+=("PASS"); printf '  PASS\n'; else RESULTS+=("FAIL"); printf '  FAIL (see %s)\n' "$log"; tail -15 "$log" | sed 's/^/    /'; fi
  NAMES+=("$name")
}

echo "App under test: $APP ($(git -C "$APP" rev-parse --short HEAD 2>/dev/null) on $(git -C "$APP" branch --show-current 2>/dev/null))"
BEFORE="$(git -C "$APP" status --porcelain 2>/dev/null)"
HEAD_BEFORE="$(git -C "$APP" rev-parse --short HEAD 2>/dev/null)"

stage "App type check"             bash -c "cd '$APP' && npx tsc --noEmit -p . | grep -v '^.next/' | grep 'error TS' && exit 1 || exit 0"
stage "App lint"                   bash -c "cd '$APP' && npx eslint --quiet ."
stage "App unit tests"             bash -c "cd '$APP' && npx tsx --test --test-force-exit src/lib/**/*.test.ts"
stage "App TML engine checks"      bash -c "cd '$APP' && npx tsx --test --test-force-exit src/lib/tml/engine.test.ts"
stage "App curriculum checks"      bash -c "cd '$APP' && npx tsx src/lib/curriculum/validate.ts"
stage "App marketing site tests"   bash -c "cd '$APP' && node --test site/tests/*.test.mjs"
stage "QA regression unit tests"   bash -c "cd '$QA' && npm run --silent unit"
stage "Traceability check"         bash -c "cd '$QA' && npm run --silent check"
stage "Build test workbooks"       bash -c "cd '$QA' && npm run --silent docs"
stage "Verify workbook formulas"   bash -c "cd '$QA' && npm run --silent verify"

if [ "$QUICK" = 0 ]; then
  PROJECTS="--project=public --project=public-mobile --project=api"
  [ "$DEMO" = 1 ] && PROJECTS="$PROJECTS --project=demo"
  stage "E2E public, mobile and API" bash -c "cd '$QA' && npx playwright test $PROJECTS"
  if [ -n "${E2E_BASE_URL:-}" ] && ! echo "$E2E_BASE_URL" | grep -qE 'localhost|127\.0\.0\.1'; then
    stage "E2E test school (read-only)" bash -c "cd '$QA' && npx playwright test --project=prod-setup --project=prod"
    if [ "${E2E_ALLOW_WRITES:-}" = 1 ]; then
      stage "E2E journeys (writes)" bash -c "cd '$QA' && npx playwright test --project=prod-setup --project=journeys"
    fi
  fi
fi

# The pack never writes to the app. If the app changed during the run, someone else changed it:
# say what moved, because the results then mix two versions of the app.
AFTER="$(git -C "$APP" status --porcelain 2>/dev/null)"
HEAD_AFTER="$(git -C "$APP" rev-parse --short HEAD 2>/dev/null)"
if [ "$HEAD_BEFORE" != "$HEAD_AFTER" ]; then
  NAMES+=("App unchanged during run: HEAD moved $HEAD_BEFORE -> $HEAD_AFTER ($(git -C "$APP" branch --show-current)); re-run for one version"); RESULTS+=("WARN")
elif [ "$BEFORE" != "$AFTER" ]; then
  NAMES+=("App unchanged during run: files changed: $(echo "$AFTER" | head -5 | tr '\n' ' ')"); RESULTS+=("FAIL")
else
  NAMES+=("App unchanged during run"); RESULTS+=("PASS")
fi

echo; echo "════════ Regression summary ════════"
FAILS=0
for i in "${!NAMES[@]}"; do printf '  %-4s  %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"; [ "${RESULTS[$i]}" = FAIL ] && FAILS=$((FAILS+1)); done
echo "Reports: $QA/reports (playwright HTML: npm run report; JUnit: reports/junit)"
[ "$FAILS" = 0 ] && echo "ALL GREEN" || echo "$FAILS stage(s) failed"
exit "$FAILS"
