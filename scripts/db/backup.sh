#!/usr/bin/env bash
# Off-site backup of everything Sthara keeps in Supabase — 2026-10-20
#
# Writes one encrypted file, sthara-backup-<UTC stamp>.tar.enc, to BACKUP_DIR (point it at a Google Drive or
# other synced folder that is not Supabase). Inside:
#   schema.dump   our schemas (public, app, sandbox_seed), structure + grants      pg_dump custom format
#   data.dump     all rows in our schemas, plus auth users/identities and the storage file index
#   storage/      every file in every storage bucket, as <bucket>/<path>
#   manifest.txt  when, from which project, row counts per table
#
# Restore steps are in docs/disaster-recovery.md. The passphrase is the only key: keep it outside this machine.
#
# Usage: scripts/db/backup.sh
# Needs in .env.local: SUPABASE_DB_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_PASSPHRASE,
# and optionally BACKUP_DIR (default ~/Sthara Backups) and BACKUP_KEEP (newest files kept, default 30).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/libpq/bin}"
env_get() { local v="${!1:-}"; [ -n "$v" ] && { echo "$v"; return; }; grep -sE "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }

DB_URL="$(env_get SUPABASE_DB_URL)"
export BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-$(env_get BACKUP_PASSPHRASE)}"
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-$HOME/Sthara Backups}"
BACKUP_KEEP="${BACKUP_KEEP:-$(env_get BACKUP_KEEP)}"; BACKUP_KEEP="${BACKUP_KEEP:-30}"
[ -n "$DB_URL" ] || { echo "SUPABASE_DB_URL is not set in .env.local" >&2; exit 1; }
[ ${#BACKUP_PASSPHRASE} -ge 16 ] || { echo "BACKUP_PASSPHRASE must be set and at least 16 characters" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/b/storage" "$BACKUP_DIR"

echo "schema..."
"$PG_BIN/pg_dump" "$DB_URL" --format=custom --schema-only --no-owner \
  --schema=public --schema=app --schema=sandbox_seed --file="$WORK/b/schema.dump"

echo "data..."
"$PG_BIN/pg_dump" "$DB_URL" --format=custom --data-only --no-owner \
  --schema=public --schema=app --schema=sandbox_seed \
  --table=auth.users --table=auth.identities --table=auth.mfa_factors \
  --table=storage.buckets --table=storage.objects \
  --file="$WORK/b/data.dump"

echo "storage files..."
node "$ROOT/scripts/db/backup-storage.mjs" "$WORK/b/storage"

{
  echo "Sthara backup $STAMP"
  echo "project: $(env_get NEXT_PUBLIC_SUPABASE_URL)"
  echo "git: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo
  "$PG_BIN/psql" "$DB_URL" -X -A -t -F $'\t' -c "
    SELECT schemaname || '.' || relname, n_live_tup FROM pg_stat_user_tables
    WHERE schemaname IN ('public', 'app', 'sandbox_seed', 'auth') ORDER BY 1"
} > "$WORK/b/manifest.txt"

OUT="$BACKUP_DIR/sthara-backup-$STAMP.tar.enc"
tar -C "$WORK/b" -cf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$OUT"

# Prove the file opens before calling it a backup.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$OUT" | tar -tf - | grep -q 'data.dump'

ls -1t "$BACKUP_DIR"/sthara-backup-*.tar.enc | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do rm -f "$old"; done
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
