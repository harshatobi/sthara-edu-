# Archived migrations

Folded into `supabase/migrations/20261018171721_baseline.sql` on 2026-10-20. Kept so the reasoning behind each
change stays readable; nothing here is applied again.

- The `.sql` files are the repo copies. Their timestamps never matched the live history, and two applied
  migrations (`ops_foundation_guard_fix`, `ops_foundation_guard_inline`) were missing until they were recovered from
  the live database on 2026-10-20.
- `live_history_2026-10-20.json` is the live `supabase_migrations.schema_migrations` table as it stood (62 rows,
  with the SQL each one ran). It is also what to restore if the history ever needs to go back.
- The schema from before 2026-09-23 (the original tables) was never written as a migration; the baseline is the
  first place it is.
