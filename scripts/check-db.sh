#!/usr/bin/env bash
# check-db.sh — Fail fast if the live database is out of sync with prisma/schema.prisma.
#
# Why: editing schema.prisma without pushing/migrating leaves the DB missing
# tables/columns. The app then 500s at runtime with Prisma P2021
# ("The table ... does not exist"). This check catches that BEFORE build/deploy.
#
# Usage:  bash scripts/check-db.sh          # verify only (exit 2 on drift)
#         bash scripts/check-db.sh --fix     # verify, and `prisma db push` if drift
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT/packages/db"
SCHEMA="$DB_DIR/prisma/schema.prisma"

# Load DATABASE_URL from the env file (strip quotes; keep query string for prisma).
# Secrets live in secrets/.env (gitignored); fall back to legacy root .env.
ENV_FILE=""
for f in "$ROOT/secrets/.env" "$ROOT/.env"; do
  [[ -f "$f" ]] && { ENV_FILE="$f"; break; }
done
if [[ -z "${DATABASE_URL:-}" && -n "$ENV_FILE" ]]; then
  export DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL not set (looked in $ROOT/secrets/.env and $ROOT/.env)"; exit 1
fi

cd "$DB_DIR"

echo "🔎 Checking DB schema is in sync with $SCHEMA ..."
# Compare the live DB (datasource) against the Prisma datamodel.
# --exit-code: 0 = in sync, 2 = drift detected.
if npx prisma migrate diff \
      --from-schema-datasource "$SCHEMA" \
      --to-schema-datamodel "$SCHEMA" \
      --exit-code >/tmp/vsme-db-drift.txt 2>&1; then
  echo "✅ Database is in sync with the Prisma schema."
  exit 0
fi

echo "⚠️  Database is OUT OF SYNC with prisma/schema.prisma. Pending changes:"
echo "------------------------------------------------------------------"
cat /tmp/vsme-db-drift.txt
echo "------------------------------------------------------------------"

if [[ "${1:-}" == "--fix" ]]; then
  echo "🛠  Applying with: prisma db push"
  npx prisma db push
  npx prisma generate
  echo "✅ Schema pushed. Re-run build/deploy."
  exit 0
fi

echo "❌ Aborting. Run 'pnpm db:check:fix' (or 'pnpm --filter @vsme/db db:push') before deploying."
exit 2
