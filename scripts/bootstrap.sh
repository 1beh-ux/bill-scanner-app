#!/usr/bin/env bash
# npm run bootstrap (audit2 DEP1): a fresh or existing DB gets every base row and translation. Idempotent.
# Order: prisma/seed.ts (default organization, base texts) -> every translation seed in the order it was added
# to git (a later seed may re-word an earlier key, so alphabetical order would be wrong) -> app templates.
set -euo pipefail
cd "$(dirname "$0")/.."
npx prisma migrate deploy
npx tsx prisma/seed.ts
for f in $(for s in scripts/seed-*-i18n.ts scripts/seed-*-translations.ts; do echo "$(git log --diff-filter=A --format=%at -1 -- "$s" 2>/dev/null || echo 0) $s"; done | sort -n | cut -d' ' -f2); do
  echo "== $f"; npx tsx "$f" | tail -1
done
npx tsx scripts/create-app-templates.ts --apply | tail -3
