# Living Record handoff

Briefs for terminal Claude Code sessions. Each file stands on its own: open a session in the repo root and say
"Work through `handoff/living-record/<file>`".

## Why

Sthara promises to be a **Living Record of each student**: one permanent record that follows a student from
admission to leaving, across every year, at every institution that signs with us (a **tenant**: a school, college
or any other institution, one row in `schools`).

Today it isn't. A student is only a login account: a row in `users` with a free-text `student_class`, an optional
`custom_student_id`, and a `metadata` blob. Attendance, marks, TML, fees and submissions all point at that row, so the
history exists, but nothing holds it together year by year. Promotion overwrites the class.

A new tenant also arrives with years of existing data. Some can export it and import it themselves, and some
can't. **Sthara must be able to bulk-import every large dataset for any tenant, through the tenant's own admin or
through our own ops console on their behalf**, using CSV formats that Sthara publishes.

## Decided with Moses (2026-10-20)

**All nine Living Record areas are in the first version:**

| Area | Brief |
|---|---|
| Admission register and IDs | 01 |
| Year-by-year enrolment | 01 |
| Demographics and family | 02 |
| Health record | 03 |
| Documents in | 04 |
| Certificates out (TC, bonafide, character) | 05 |
| Co-curricular | 06 |
| Discipline and counselling | 07 |
| Unified timeline | 08 |

**Bulk import is part of the build (brief 09):**
- Every large dataset gets a **published CSV format**: the Living Record data from 01–07, and the existing large
  data (people, staff, timetable, attendance, marks, fees, admissions). The full list is in 09.
- Imports are **per tenant**. A tenant's admin can run them, and Sthara can run them for the tenant from the ops
  console when the tenant can't.
- Each data brief (01–07) ships its CSV format and importer, built on 09's shared mechanism. A brief isn't done
  until its data can be bulk-imported.

Later answers are recorded in each brief's "Decided" section (01 and 09 on 2026-10-20). Otherwise nothing else has been decided. **Every brief has a "Still open" list. Ask Moses those questions and get answers
before you write a migration, a screen or a CSV column.** Don't fill gaps with what other school software usually
does: ask.

## Order (proposed, confirm with Moses)

| # | Brief | Depends on | Touches |
|---|---|---|---|
| 01 | [Student spine: register, IDs, enrolment](01-student-spine.md) | none | new tables, `src/lib/ops/support.ts`, every reader of `student_class` |
| 09 | [Bulk import mechanism and CSV formats](09-bulk-import.md) | none (can run alongside 01) | new `src/lib/import/`, import jobs table, admin and ops import screens |
| 02 | [Demographics and family](02-demographics-family.md) | 01, 09 | spine tables, `guardians`, admin student page |
| 03 | [Health record](03-health.md) | 01, 09 | new table, admin student page |
| 04 | [Documents in](04-documents-in.md) | 01, 09 | new table, new private bucket |
| 05 | [Certificates out](05-certificates-out.md) | 01, 02, 09 | new table, `app.next_doc_no`, print view |
| 06 | [Co-curricular](06-co-curricular.md) | 01, 09 | new tables |
| 07 | [Discipline and counselling](07-discipline-counselling.md) | 01, 09 | `incidents`, `wellness_logs`, new table, RBAC |
| 08 | [Unified timeline](08-timeline.md) | 01, and whichever of 02–07 have landed | read-only view over everything |

**Confirmed 2026-10-20:** one session, 09 first, then 01 on top of it (two PRs). 01 and 09 touch different files, so they could also run in parallel sessions. 01's own importer (students
and enrolment) lands once 09's mechanism is merged. After that, 02, 03, 04, 06 and 07 touch different tables and
can run in parallel. 05 needs 02's fields (date of birth, parents' names). 08 goes last.

## Rules for every session

- Read `AGENTS.md`. This is Next 16.2: check `node_modules/next/dist/docs/` before using any Next API.
- **Ask Moses first.** Work through the brief's "Still open" list with him before building. If something comes up
  that the brief doesn't cover, stop and ask. Write his answers into the brief's "Decided" section in the same PR.
- **Tenant isolation.** Every row carries `school_id`. Every read, write and import is scoped to one tenant and
  checked on the server. An import can never touch another tenant's data.
- Branch from `main`, named `living-record/<nn>-<slug>`. One PR per brief.
- **Never run `npm run db:push`.** Write migrations under `supabase/migrations/`, test them on the local stack, and
  leave applying them to Moses. With the Supabase MCP, read only (`list_tables`, read-only `execute_sql`).
- Every school in production is a sandbox (Vidya Niketan is the load-test school, Sthara Test School is the QA
  school). Row counts there say nothing about real use. Vidya Niketan's size (about 2,000 students, about 310k
  attendance rows) is a fair test for imports.
- Local dev needs the Supabase keys: `vercel env pull .env.local` (ask Moses first). Without them, Admin and Teacher
  show the demo portals.
- New tables: RLS on, school-scoped policies, and grants that pass `npm run check:grants`. Server routes use
  `createAdminClient()` (service_role). Note that **service_role has no USAGE on schema `app`**, which breaks
  any trigger whose body calls `app.*` on a service-role write (see the wellness-acknowledge bug). Bulk imports
  write through service_role, so this matters doubly. Make guard functions `SECURITY DEFINER` with a fixed
  `search_path`, or fix the grant first.
- Personal data (health, Aadhaar, counselling) falls under DPDP. Every change to the record goes to `audit_log`,
  imports included, and sensitive reads are permission-checked on the server (`accessOf(...).can(...)` in
  `src/lib/admin/rbac`), never only in the UI.
- Every new read of a growing table must page (`all()`, `pageAll()`). `npm run check:reads` fails the PR otherwise.
- No new paid services without asking Moses. Infra headroom is about $50/mo.
- Before opening the PR, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:reads` and
  `npm run check:grants`.
