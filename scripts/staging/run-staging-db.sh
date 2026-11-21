#!/usr/bin/env bash
# Runs a command with DATABASE_URL pointing at the STAGING database (docs/staging/plan.md) through a
# Cloud SQL proxy on :55440. Never the production instance (prod helpers use :55433 / :55434).
#   bash scripts/staging/run-staging-db.sh npx tsx scripts/staging/seed-staging.ts
set -euo pipefail
cd "$(dirname "$0")/../.."
P=prvni-beh-filesaver
INSTANCE="$P:europe-west3:bill-scanner-staging-db"
[ "$(gcloud sql instances describe bill-scanner-staging-db --project=$P --format='value(settings.activationPolicy)')" = ALWAYS ] \
  || { echo "staging DB is stopped: gcloud sql instances patch bill-scanner-staging-db --project=$P --activation-policy=ALWAYS"; exit 1; }
LOG=$(mktemp)
~/cloud-sql-proxy --gcloud-auth --port 55440 "$INSTANCE" > "$LOG" 2>&1 &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true; rm -f "$LOG"' EXIT
for _ in $(seq 1 20); do grep -q "ready for new connections" "$LOG" && break; sleep 1; done
grep -q "ready for new connections" "$LOG" || { cat "$LOG"; exit 1; }
URL="$(gcloud secrets versions access latest --secret=staging-db-url --project=$P)"
case "$URL" in *"/cloudsql/$INSTANCE") ;; *) echo "refusing: staging-db-url doesn't name $INSTANCE"; exit 1 ;; esac
export DATABASE_URL="$(printf '%s' "$URL" | sed -E 's#@/billscanner\?host=.*#@127.0.0.1:55440/billscanner#')"
export APP_ENV=staging
"$@"
