# Disaster recovery

How to bring Sthara back when the database, Vercel or both are gone or broken. Written 2026-10-20.

## What lives where

| Piece | Where | Rebuilt from |
|---|---|---|
| Code | GitHub `harshatobi/sthara-edu-` (`main`) | the repo |
| App hosting | Vercel, region `bom1`, domains `sthara.in` / `www.sthara.in` | the repo + env vars below |
| Database schema | Supabase project `nqwvsuyiwswnsqbyhghb` (Mumbai, `ap-south-1`, Postgres 17), **free tier** | `supabase/migrations/` (baseline + later migrations) |
| Database rows (schools, people, work, fees...) | same project | the off-site backup only |
| Login accounts (178 on 2026-10-20) | same project, `auth` schema | the off-site backup (password hashes included, so logins keep working) |
| Uploaded files (7 buckets) | Supabase Storage | the off-site backup (`storage/`) |
| Cron jobs (`hr-daily`, `request-log-prune`) | pg_cron in the database | the baseline migration |
| Auth settings (site URL, redirect URLs, email templates, OTP) | Supabase dashboard, not in the database | **this file** (section below: fill it in) |
| Secrets | Vercel env vars, `.env.local`, GitHub repo secrets | your password manager |

**The free tier keeps no backups you can download and has no point-in-time recovery.** The encrypted file written
by `scripts/db/backup.sh` is the only copy of the data outside Supabase. Run it at least weekly, and before any risky
migration. Keep the passphrase off this Mac.

## Backups

```bash
scripts/db/backup.sh
```

Writes `sthara-backup-<UTC time>.tar.enc` to `BACKUP_DIR` (default `~/Sthara Backups`; point it at a synced drive),
keeps the newest 30, and proves each file decrypts before finishing. Needs, in the shell or `.env.local`:
`SUPABASE_DB_URL` (Dashboard > Connect > Session pooler), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BACKUP_PASSPHRASE` (16+ characters), and `pg_dump` 17+ (`brew install libpq`).

To open one:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in sthara-backup-<stamp>.tar.enc | tar -xf - -C <empty folder>
# -> schema.dump  data.dump  storage/  manifest.txt
```

## Which situation is this?

**The site is down, Supabase says "project paused".** Free projects pause after 7 days without traffic. The GitHub
watchdog (`.github/workflows/watchdog.yml`) calls `/api/health`, which reads the database, every 5 minutes, so this
should not happen while the watchdog runs. If it does: Dashboard > the project > **Restore project**. Data is kept;
it takes a few minutes. Then check that the watchdog workflow is still enabled (GitHub disables scheduled workflows
after 60 days without repo activity).

**Supabase or Vercel is having an outage.** Check status.supabase.com / vercel-status.com. Nothing to restore; the
watchdog keeps a Jira issue open until `/api/health` answers again. Tell schools through WhatsApp / phone.

**A bad migration or a deleted table / rows.** No point-in-time recovery on the free tier. Restore just what was
lost from the latest backup: `pg_restore --data-only --table=<name> -f - data.dump` gives the rows as SQL; load them
into a scratch table first and copy back what is missing. Do not restore over live data blindly.

**The Supabase project is gone, or cannot be trusted.** Full rebuild, below.

**Vercel project gone.** New Vercel project from the GitHub repo, region `bom1`, the env vars below, then move the
`sthara.in` and `www.sthara.in` domains to it.

## Full rebuild on a new Supabase project

1. **New project.** Region Mumbai (`ap-south-1`), Postgres 17. Save the new database password.
2. **Schema.** Put the new Session pooler string in `.env.local` as `SUPABASE_DB_URL`, then apply the migrations in
   order (baseline first), one transaction each:
   ```bash
   for f in supabase/migrations/*.sql; do
     psql "$SUPABASE_DB_URL" -X -1 -v ON_ERROR_STOP=1 -f "$f" || break
   done
   ```
   Then record them, so later migrations apply on top: either `supabase link --project-ref <new ref>` and
   `supabase migration repair --status applied <each version>`, or insert one row per file into
   `supabase_migrations.schema_migrations (version, name, statements)`.
3. **Data.** The baseline already put in the reference rows and storage buckets; the backup has them too, so clear
   those first, then load everything with triggers off (no audit rows, no guard triggers firing on old data):
   ```bash
   psql "$SUPABASE_DB_URL" -X -1 -v ON_ERROR_STOP=1 -c "TRUNCATE public.role_permissions, public.platform_config,
     public.statutory_rates, public.learning_outcomes, public.ops_picklists, public.ops_opportunity_stages,
     public.ops_sla_policies, public.ops_territories, public.ops_commission_rules, public.ops_discount_limits,
     public.ops_canned_replies CASCADE"
   pg_restore -l data.dump | grep -vE 'TABLE DATA storage (buckets|objects)' > restore.list
   { echo "SET session_replication_role = replica;"; pg_restore --data-only -L restore.list -f - data.dump; } \
     | psql "$SUPABASE_DB_URL" -X -1 -v ON_ERROR_STOP=1
   ```
   Logins come back with their passwords. Sequences are set by the dump.
4. **Files.** Point `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at the new project, then
   `node scripts/db/restore-storage.mjs <backup folder>/storage`.
5. **Auth settings.** Re-enter them from the section below (Dashboard > Authentication).
6. **Vercel.** Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for
   Production and Preview, then redeploy. Update `.env.local`, `qa/e2e.env` and anything else that held the old keys.
7. **Check.** `curl https://www.sthara.in/api/health`; Platform Manager > Settings (migrations "in sync", RLS on
   everywhere); sign in as a test account of each role; `qa quick` against production; compare row counts with the
   backup's `manifest.txt`.

The rebuild was rehearsed on 2026-10-20 against a local Postgres 17 (Supabase `auth`/`storage` structure, cron
stubbed): the baseline applied cleanly and 4,200 of 4,201 schema objects matched live exactly (the other was the
same CHECK printed with different brackets). Steps 3-4 (data and files) have **not** been rehearsed yet: do that
once with the first backup, into a scratch database, and note the result here.

## Secrets to have somewhere other than this Mac

Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`), `TUTOR_SESSION_SECRET`, `CRON_SECRET`, `YOUTUBE_API_KEY`,
`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_NUMBER`, `WHATSAPP_TEMPLATE_OTP`, `WHATSAPP_TEMPLATE_ALERT`,
`POLICIES_APPROVED`; and any of `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` that are set.
GitHub repo secrets (watchdog): `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`.
Backups: `BACKUP_PASSPHRASE`, the Supabase database password.

`TUTOR_SESSION_SECRET` must stay the same across a rebuild or open tutor sessions stop verifying. The WhatsApp
webhook points at `https://www.sthara.in/api/whatsapp/webhook`, so it survives a database move untouched.

## Auth settings (fill in from the dashboard; they are not in any backup)

| Setting | Value |
|---|---|
| Site URL | |
| Redirect URLs | |
| Email provider / SMTP | |
| Email templates changed from default? | |
| Phone / OTP provider | |
| JWT expiry | |
| Sign-ups enabled? | |
