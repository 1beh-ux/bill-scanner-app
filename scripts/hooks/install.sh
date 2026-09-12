#!/usr/bin/env bash
set -euo pipefail
dir="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0 # not a git checkout (e.g. Docker build)

for hook in pre-commit pre-push; do
  cp "$dir/scripts/hooks/$hook" "$dir/.git/hooks/$hook"
  chmod +x "$dir/.git/hooks/$hook"
done
chmod +x "$dir/scripts/hooks/check-schema-migration.sh"

echo "Installed git hooks: pre-commit, pre-push (schema/migration check)"
