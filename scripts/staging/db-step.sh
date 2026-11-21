#!/usr/bin/env bash
# Staging only (docs/staging/plan.md): migrations + translation scripts against the STAGING database.
# Runs inside Cloud Build (cloudbuild.staging.yaml) with STAGING_DB_URL from Secret Manager `staging-db-url`.
# Refuses to touch anything that isn't the staging instance.
set -euo pipefail
INSTANCE="prvni-beh-filesaver:europe-west3:bill-scanner-staging-db"
PORT=55440

case "${STAGING_DB_URL:-}" in
  *"/cloudsql/${INSTANCE}") ;;
  *) echo "refusing: STAGING_DB_URL does not point at ${INSTANCE}"; exit 1 ;;
esac

curl -sSfLo /tmp/cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
chmod +x /tmp/cloud-sql-proxy
/tmp/cloud-sql-proxy --port "$PORT" "$INSTANCE" > /tmp/proxy.log 2>&1 &
for _ in $(seq 1 30); do grep -q "ready for new connections" /tmp/proxy.log && break; sleep 1; done
grep -q "ready for new connections" /tmp/proxy.log || { cat /tmp/proxy.log; exit 1; }

export DATABASE_URL="$(printf '%s' "$STAGING_DB_URL" | sed -E "s#@/billscanner\?host=.*#@127.0.0.1:${PORT}/billscanner#")"
export APP_ENV=staging
npx prisma generate > /dev/null
npx prisma migrate deploy

# Translation scripts: a failure is reported, not fatal (on a brand-new DB some old scripts update
# keys that only exist after scripts/staging/seed-staging.ts has run).
failed=0
while read -r name args; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  # shellcheck disable=SC2086
  if ! out=$(npx tsx "scripts/${name}.ts" $args 2>&1); then failed=$((failed + 1)); echo "  FAILED ${name}: $(tail -1 <<<"$out")"; fi
done < scripts/staging/translation-scripts.txt
echo "translation scripts done, ${failed} failed"
