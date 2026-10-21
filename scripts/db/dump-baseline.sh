#!/usr/bin/env bash
# Rebuild supabase/migrations/<version>_baseline.sql from the live database — 2026-10-20
#
# The baseline is the whole Sthara schema in one migration: our schemas (public, app, sandbox_seed) with every
# grant spelled out, the reference rows the app cannot run without, storage buckets, cron jobs and realtime.
# Supabase-managed schemas (auth, storage tables, realtime, vault, graphql) come with every new project and are
# left out. No school, student or staff data is dumped.
#
# Usage: scripts/db/dump-baseline.sh <version>      e.g. 20261018171721
# Needs SUPABASE_DB_URL (session pooler connection string) in .env.local and pg_dump >= 17 (brew install libpq).
set -euo pipefail

VERSION="${1:?usage: dump-baseline.sh <version>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/supabase/migrations/${VERSION}_baseline.sql"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/libpq/bin}"

DB_URL="${SUPABASE_DB_URL:-$(grep -sE '^SUPABASE_DB_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')}"
[ -n "$DB_URL" ] || { echo "SUPABASE_DB_URL is not set in .env.local" >&2; exit 1; }

# Reference tables whose rows are part of the product, not of any one school.
REFERENCE_TABLES=(
  public.role_permissions
  public.platform_config
  public.statutory_rates
  public.learning_outcomes
  public.ops_picklists
  public.ops_opportunity_stages
  public.ops_sla_policies
  public.ops_territories
  public.ops_commission_rules
  public.ops_discount_limits
  public.ops_canned_replies
)

# pg_dump 18 wraps plain output in \restrict / \unrestrict, which only psql understands.
strip() { grep -vE '^\\(un)?restrict ' ; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

"$PG_BIN/pg_dump" "$DB_URL" --schema-only --no-owner --quote-all-identifiers \
  --schema=public --schema=app --schema=sandbox_seed | strip |
  # A new Supabase project already has public. Default privileges are left out on purpose: every object below
  # carries its own grants, and new tables get theirs in their own migration (no auto-grant to anon).
  sed -E -e '/^CREATE SCHEMA "public";$/d' -e '/^COMMENT ON SCHEMA "public" /d' \
         -e 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' -e '/^ALTER DEFAULT PRIVILEGES /d' > "$TMP/schema.sql"

# Columns that name a person (a user or an operator). Those rows don't exist on a fresh project, so these go in as
# NULL; tables listed here are written by the query below instead of pg_dump.
PEOPLE_COLUMNS="public.platform_config:updated_by public.ops_territories:default_owner_id public.ops_canned_replies:created_by"

DATA_ARGS=()
for t in "${REFERENCE_TABLES[@]}"; do [[ " $PEOPLE_COLUMNS" == *" $t:"* ]] || DATA_ARGS+=(--table="$t"); done
"$PG_BIN/pg_dump" "$DB_URL" --data-only --no-owner --column-inserts --rows-per-insert=200 \
  "${DATA_ARGS[@]}" | strip > "$TMP/data.sql"

for pair in $PEOPLE_COLUMNS; do
  "$PG_BIN/psql" "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -v tbl="${pair%%:*}" -v col="${pair##*:}" >> "$TMP/data.sql" <<'SQL'
SELECT format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%s, %L);', :'tbl', cols, cols, :'tbl', rows)
FROM (SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) cols FROM pg_attribute
      WHERE attrelid = :'tbl'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '') c,
     (SELECT jsonb_agg(to_jsonb(t) - :'col') rows FROM ONLY :tbl t) r
WHERE rows IS NOT NULL;
SQL
done

# Buckets, cron jobs and realtime live in Supabase-managed schemas, so they are written out as statements.
"$PG_BIN/psql" "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 > "$TMP/platform.sql" <<'SQL'
SELECT format('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (%L, %L, %L, %s, %s) ON CONFLICT (id) DO NOTHING;',
              id, name, public::text, coalesce(file_size_limit::text, 'NULL'),
              coalesce(quote_literal(allowed_mime_types::text) || '::text[]', 'NULL'))
FROM storage.buckets ORDER BY id;
SELECT format('SELECT cron.schedule(%L, %L, %L);', jobname, schedule, command) FROM cron.job ORDER BY jobname;
SELECT format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I;', schemaname, tablename)
FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1;
-- Event triggers are database-wide, so pg_dump --schema leaves them out. ensure_rls turns RLS on for every new table.
SELECT format('DROP EVENT TRIGGER IF EXISTS %I; CREATE EVENT TRIGGER %I ON %s WHEN TAG IN (%s) EXECUTE FUNCTION %s();',
              e.evtname, e.evtname, e.evtevent,
              (SELECT string_agg(quote_literal(t), ', ') FROM unnest(e.evttags) t),
              format('%I.%I', n.nspname, p.proname))
FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app') ORDER BY 1;
SQL

{
  cat <<EOF
-- Sthara baseline — the whole schema as of ${VERSION}, dumped from the live database on $(date -u +%Y-%m-%d).
--
-- Every migration up to and including ${VERSION} is folded in here; the originals are kept for reference in
-- supabase/migrations_archive/. Regenerate with scripts/db/dump-baseline.sh — never hand-edit.
--
-- Grants are explicit for every table, view, sequence and function (Supabase stops granting new public tables
-- to the API roles by default on 2026-10-30), so this file rebuilds the same access on a fresh project.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

EOF
  cat "$TMP/schema.sql"
  printf '\n-- Reference rows\n'
  cat "$TMP/data.sql"
  printf '\n-- Storage buckets, cron jobs, realtime\n'
  cat "$TMP/platform.sql"
} > "$OUT"

echo "wrote $OUT ($(wc -l < "$OUT") lines)"
