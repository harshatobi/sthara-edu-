# 09 — Bulk import mechanism and CSV formats

## Goal

One way to bulk-load any large dataset into one tenant, from a CSV format Sthara publishes:
- **self-serve:** the tenant's admin uploads it in the admin portal;
- **on the tenant's behalf:** Sthara staff upload it from the ops console, for tenants that can't do it themselves.

Every dataset in the table below gets a published format (a downloadable template with an example row, and a
column guide). Each Living Record brief (01–07) adds its own datasets on top of this mechanism.

## What exists today

Four separate importers, each with its own parser and conventions:

| Importer | Where | Format | Behaviour |
|---|---|---|---|
| Roster (logins) | ops console, `src/app/ops/schools/[schoolId]/parts.tsx`, `src/lib/ops/people.ts` | CSV: `role,name,email,class,roll_no,subjects,class_teacher_of,children` (`CSV_TEMPLATE`) | Paste or choose a file, "Check file", then create |
| Roster corrections | ops console, `support.tsx`, `src/lib/ops/corrections.ts` | CSV: `email,name,new_email,roll_no,class` (`CORRECTIONS_TEMPLATE`) | Preview, then apply with a reason |
| Staff master | admin People, `src/components/admin/people/ImportTab.tsx`, `POST /api/admin/people/import` | Rows posted as JSON | **Dry run without `commit`; with `commit`, saved only if no row has a problem.** Matches on employee code, then email, then unique name. Blank cells leave values alone. Max 1,000 rows. |
| Timetable | admin Schedule, `src/components/admin/schedule/ImportWizard.tsx`, `src/lib/schedule/importer.ts` | CSV, TSV, **XLSX** (own `readXlsx`, no library), aSc XML | Parse, resolve names, then apply |

CSV parsing is written four times: `parseCsv` in `src/lib/schedule/importer.ts:38` and `src/lib/exams/engine.ts:514`,
and `splitCsvLine` in `src/lib/ops/people.ts:102` (also used by `corrections.ts`). There's also a `downloadCsv`
helper for exports in `src/app/ops/_ui.tsx:33`.

Constraints that shape the design:
- Vercel request bodies are capped at **4.5 MB**, and there's a 1,000-row cap in the staff import. Attendance
  history for one school runs to hundreds of thousands of rows (about 310k in the sandbox), so large files can't go
  through one request. `handoff/scaling/06-background-jobs.md` covers background jobs. Read it.
- Imports write through service_role. See the `app` schema grant note in the README.
- Ops staff reach a tenant through access grants (`ops_access_grants`, break-glass). Check how an ops import should
  be authorised.

## Decided with Moses

- Bulk import is part of the Living Record build, for **every large dataset**, per tenant.
- Two paths: tenant admin self-serve, and Sthara ops on the tenant's behalf.
- Sthara publishes the CSV format for each dataset, so a tenant without its own export tooling can still fill a
  template.

**2026-10-20, round 1 (asked in session):**
- **Parsers:** a shared module in `src/lib/import/` for the **new** datasets only. The four existing importers stay
  as they are.
- **All-or-nothing:** a dry run checks every row. Nothing is written unless the whole file is clean. If the write
  then fails partway through, the batch rolls itself back.
- **Re-run:** upsert on the people-facing key (blank cells leave values alone). Every written row is tagged with
  its import job ID, so a whole batch can be undone from the import history.
- **Large files:** the browser uploads straight to a private bucket, and a Postgres job table (scaling/06, option A,
  no new service) processes it in chunks with progress.
- **Uploaded files are kept permanently** (changed from "until session end" on 2026-10-20, because Moses is moving to a
  larger plan, probably enterprise). They're deleted only on a DPDP erasure request, or when the tenant leaves
  Sthara (after an export). The import history row always stays.
- **Student key:** the admission number, in every file. Class is only a cross-check.
- **Unknown class, subject or assessment:** the row is rejected and the dry run lists every unknown name.
- **Who:** principal / admin roles only.
- **Ops on a tenant's behalf:** needs an active ops access grant. It shows in the tenant's import history as "by
  Sthara (name)".
- **No ops-only datasets:** the tenant can self-import everything.
- **Dates:** templates use DD-MM-YYYY. The parser also accepts ISO, and rejects anything ambiguous.
- **Files:** CSV or XLSX accepted. Templates download as XLSX with a second "Guide" sheet (needs a small XLSX
  writer next to the existing reader, no library).
- **Draft columns for existing data are approved as written,** with `admission_no` as the student key. The final
  column guide is reviewed in the PR.
- **Ops writes use a new access-window scope, `import`.** It's reasoned, 30 minutes, and shown to the school like
  the others. It allows only starting, committing and undoing imports. A job started inside the window may finish
  after it closes. `records` and `view_as` stay read-only.
- **Ops imports are director-only for now.** The Platform Manager roles get revisited in the next build:
  partner and sales handling will probably move to Salesforce, which leaves the Platform Manager as the tech
  backbone (director, tech team, support, account managers).
- **Undo window: 30 days.** Before-images of overwritten rows are purged by pg_cron after 30 days. Added rows stay
  findable by their job tag.
- **No database-size guard.** Moses will move to Supabase Pro before real tenants import history. The dry run
  still shows an estimated size.
- **Fee payments are insert-only.** Receipt numbers are imported as they are. A re-run skips identical receipts and
  rejects ones that differ. Undo voids them with the reason "import undone". The receipt counter continues after
  the highest imported number.
- **Marks from before Sthara go to a separate legacy-results store** (session, term, subject, marks, max, grade),
  which feeds the Living Record and timeline. Only current-session marks go into real exam sheets, and only while
  a sheet is open.
- **Audit: one summary entry per import.** The job is the audit record (who, file, counts, plus row before-images
  for 30 days). Per-row audit triggers are skipped for import writes. Ordinary edits are still audited per row.
- **Until 01 lands, `admission_no` resolves to `users.custom_student_id`.** 01 switches the resolver to the new
  register.

## Datasets that need a published format

The column lists for 01–07's data **are not decided**. They come from each brief's field questions. The columns in
the "existing data" rows below are a **draft taken from today's schema**, using people-facing keys (admission
number, class, subject) instead of internal IDs. Confirm every one with Moses before building.

**Living Record (format defined by its brief)**

| Dataset | Brief |
|---|---|
| Students / admission register | 01 |
| Enrolment history (one row per student per year) | 01 |
| Guardians, family, emergency contacts | 02 |
| Health records | 03 |
| Documents (manifest CSV plus the files) | 04 |
| Certificates already issued (past TC/bonafide register) | 05 |
| Co-curricular (houses, clubs, achievements) | 06 |
| Discipline and counselling history | 07 |

**Existing large data (draft columns, confirm)**

| Dataset | Draft columns | Lands in |
|---|---|---|
| People and logins | already defined: `CSV_TEMPLATE` above | `users`, `guardians` |
| Staff master | already defined by the staff import | HR tables |
| Timetable | already handled by the import wizard | `timetable_slots` |
| Attendance history | `admission_no, class, date, status, note` | `attendance` |
| Exam marks | `admission_no, class, assessment, subject, marks, code (AB/ML/EX)` | `exam_marks` (sheet found by assessment + class + subject) |
| Fee structures | `session, grade, annual_fee, instalments` | `fee_structures` |
| Fee invoices / opening balances | `admission_no, session, instalment_no, label, due_on, amount, concession, concession_reason` | `fee_invoices` |
| Fee payments history | `admission_no, session, instalment_no, amount, mode, reference, paid_on, receipt_no` | `fee_payments` |
| Admission applicants | `session, name, grade, date_of_birth, guardian_name, guardian_phone, guardian_email, previous_school, source, stage` | `admission_applicants` |

## Still open (ask Moses before building)

**The mechanism**
- Replace the four parsers with one shared module (CSV and XLSX), and move the existing importers onto it? Or leave
  the existing importers alone and build only the new ones on it?
- File types: CSV only, or CSV and XLSX (a reader already exists)?
- All-or-nothing per file (like the staff import), or import the good rows and report the bad ones?
- Re-running the same file: update matching rows (upsert on the people-facing key), skip them, or refuse?
- Should an import be **undoable** as a batch (every row tagged with an import job ID)?
- Large files: chunk them in the browser across several requests, or upload the file to private storage and process
  it in a background job? What's the largest file we must handle?
- Keep the uploaded file after import (for audit), and for how long? It contains personal data (DPDP).
- An import history screen per tenant (who, when, which file, rows added/updated/rejected)?

**Keys and matching**
- What identifies a student across every file: the admission number from 01, the roll number, email, or a
  combination? (This depends on 01's answers.)
- What happens when a row names a class, subject or assessment that doesn't exist yet: reject, or create it?

**Who and where**
- Which admin permission runs imports? One per dataset (fees import needs `fees.*`, health needs the health
  permission) or a single `data.import`?
- For ops on a tenant's behalf: any ops role, or only certain ones? Does it need an active access grant, and does
  the tenant see that Sthara imported data?
- Are there datasets a tenant must **not** self-import (for example historical marks after report cards are
  published, or fee payments that issue receipts)?

**Formats**
- Confirm or change each draft column list above.
- Date format in files (DD-MM-YYYY, the usual one in India, or ISO)?
- Template style: CSV with a header row and one example row, plus a column guide (on the page or as a second
  sheet)?

## Done means

Answers recorded above. One shared import module with dry-run preview, the agreed failure and re-run behaviour,
tenant scoping and audit. Downloadable templates for every existing-data dataset in the table. Admin and ops entry
points. Tested on the sandbox at full size (about 310k attendance rows). Unit tests for parsing, matching, tenant
isolation and the agreed edge cases. All checks pass.
