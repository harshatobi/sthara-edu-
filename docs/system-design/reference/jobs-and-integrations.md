# Jobs, storage and integrations

> Generated 2026-10-29 from the code on this branch and the 18 migrations in `supabase/migrations/` (replayed into a scratch Postgres 16 with Supabase stubs). Scheduled work, storage buckets, realtime, and the routes called by machines rather than people. Do not hand-edit; see [../README.md](../README.md#how-this-was-produced).

## pg_cron jobs (in the database)

Schedules are cron expressions in UTC (pg_cron default). India is UTC+5:30, so `35 18 * * *` is 00:05 IST.

| Job | Schedule (UTC) | Runs | Tables |
|---|---|---|---|
| `hr-daily` | `35 18 * * *` | `hr_daily()` |  |
| `request-log-prune` | `15 19 * * *` | `DELETE FROM public.request_log WHERE at < now() - interval '7 days'` | `request_log` |
| `import-undo-purge` | `45 19 * * *` | `DELETE FROM public.import_changes c USING public.import_jobs j` | `import_changes` |
| `import-worker` | `* * * * *` | `SELECT net.http_post(` | `import_jobs` |
| `health-retention` | `30 20 * * *` | `health_retention_purge()` |  |
| `admission-sweep` | `45 18 * * *` | `admission_sweep()` |  |

<details><summary>Job commands</summary>

**hr-daily**

```sql
SELECT public.hr_daily()
```

**request-log-prune**

```sql
DELETE FROM public.request_log WHERE at < now() - interval '7 days'
```

**import-undo-purge**

```sql
DELETE FROM public.import_changes c USING public.import_jobs j
  WHERE c.job_id = j.id AND j.committed_at < now() - interval '30 days'
```

**import-worker**

```sql
SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'import_worker_url'),
    headers := jsonb_build_object('content-type', 'application/json',
      'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'import_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 5000)
  WHERE EXISTS (SELECT 1 FROM public.import_jobs WHERE status IN ('checking', 'committing', 'undoing'))
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'import_worker_url')
```

**health-retention**

```sql
SELECT public.health_retention_purge()
```

**admission-sweep**

```sql
SELECT public.admission_sweep()
```

</details>

## Routes called by machines

| Route | Caller |
|---|---|
| `/api/admin/subjects` | No caller found in src/, site/ or qa/ |
| `/api/attendance/device` | Biometric attendance devices (per-school device token) |
| `/api/contact` | Marketing site enquiry form (site/enquiry-form.js) |
| `/api/cron/attendance` | No scheduler configured in the repo (route doc: "pending setup"); the same check also runs when the cover or attendance board is opened |
| `/api/health` | GitHub Actions watchdog (.github/workflows/watchdog.yml → scripts/watchdog.mjs), every 5 min |
| `/api/import/worker` | pg_cron job "import-worker" via pg_net, every minute while a job waits; In-process kick() from the import routes (lib/import/server.ts) |
| `/api/qa/runs` | QA test pack uploader (qa/tools/publish.ts) |
| `/api/qa/runs/[id]/complete` | QA test pack uploader (qa/tools/publish.ts) |
| `/api/whatsapp/webhook` | Meta WhatsApp Cloud API webhook |

## Storage buckets

| Bucket | Public | Size limit | MIME types | Used by routes |
|---|---|---|---|---|
| `captures` | no | 3145728 | image/jpeg | `/api/grading/pages`, `/api/homework/grade`, `/api/student/upload-submission`, `/api/teacher/capture`, `/api/teacher/submissions` |
| `copilot-images` | no | 5242880 | image/png, image/jpeg, image/webp | `/api/teacher/copilot/image` |
| `ops-docs` | no | 10485760 | application/pdf, image/jpeg, image/png, image/webp | `/api/ops/schools/[id]/crm` |
| `qa-runs` | no | 15728640 | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json, application/xml, text/xml, text/plain | `/api/ops/qa`, `/api/qa/runs`, `/api/qa/runs/[id]/complete` |
| `question-papers` | **yes** |  |  |  |
| `staff-docs` | no | 10485760 | application/pdf, image/jpeg, image/png, image/webp | `/api/admin/people/documents` |
| `submissions` | no |  |  |  |
| `imports` | no | 52428800 | text/csv, text/plain, text/tab-separated-values, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream | `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]` |
| `student-photos` | no | 5242880 | image/jpeg, image/png, image/webp | `/api/admin/students/[id]` |
| `student-docs` | no | 26214400 |  | `/api/admin/admissions/documents`, `/api/admin/cocurricular`, `/api/admin/health`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students`, `/api/admin/students/[id]/documents`, `/api/admin/students/requests`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/documents`, `/api/teacher/kirti` |
| `certificates` | no | 26214400 | application/pdf, image/jpeg, image/png | `/api/admin/certificates` |

## Storage policies



## Realtime

Tables in the `supabase_realtime` publication: `notifications`, `situations`, `student_chats`.
