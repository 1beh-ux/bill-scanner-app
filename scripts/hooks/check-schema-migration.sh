#!/usr/bin/env bash
# Reads a list of changed file paths on stdin (one per line) and fails if
# prisma/schema.prisma is among them without a prisma/migrations/*/migration.sql
# also being among them.
#
# Two production outages (missing migrations for registration_status, then
# for participants_sheet_id) shipped before this check existed -- a schema
# field went out without its migration, so Prisma queried a column the
# database didn't have. See git log on prisma/schema.prisma.
set -euo pipefail

if [ -n "${SKIP_MIGRATION_CHECK:-}" ]; then
  exit 0
fi

changed_files="$(cat)"

if ! grep -qx "prisma/schema.prisma" <<<"$changed_files"; then
  exit 0
fi

if grep -q '^prisma/migrations/.*/migration\.sql$' <<<"$changed_files"; then
  exit 0
fi

cat >&2 <<'EOF'
error: prisma/schema.prisma changed but no prisma/migrations/*/migration.sql
was added alongside it.

This has caused production outages before (a schema field shipped
without its migration, so Prisma queried a column the database didn't
have). Run `npx prisma migrate dev --name <something>` to generate the
migration, commit it with the schema change, and try again.

If this change genuinely needs no migration (e.g. a comment-only edit),
re-run with SKIP_MIGRATION_CHECK=1.
EOF
exit 1
