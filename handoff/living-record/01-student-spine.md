# 01 — Student spine: admission register, IDs, year-by-year enrolment

## Goal

Give every student one permanent record that's separate from their login. It carries an admission register entry
and the student's IDs, plus one enrolment row per academic year (class, section, roll number, outcome). Promotion
then adds history instead of overwriting it. Everything in 02–08 hangs off this record.

## What exists today

- **A student is a `users` row** with `role = 'student'`. Its columns: `id, school_id, name, email, role,
  student_class, branch, year, semester, custom_student_id, …, metadata, created_at, updated_at`.
  - `student_class` is free text, normalised with `normClass()`. 15 files under `src/app/api` read or write it.
  - `custom_student_id` is the school's own ID (shown as "roll number" in ops support search).
  - The roll number also lives in `metadata.roll_no` or `metadata.rollNo`; `src/lib/exams/server.ts:93` reads both.
  - "Left the school" is `metadata.left = { on, reason }` (`setLeft` in `src/lib/ops/support.ts:158`). It blocks
    sign-in and keeps the history.
- **Promotion overwrites.** `promoteClass` → `moveStudents` (`src/lib/ops/support.ts:123-149`) sets the new
  `student_class`. The reason goes to the audit log, but there's no per-year enrolment row.
- **Admissions:** `admission_applicants` (session, name, grade, date_of_birth, guardian_name/phone/email,
  previous_school, stage, …, `student_id`, `parent_id`). Once admitted, it links to the student's `users` row.
- **Per-term data is already keyed by student and term:** `exam_student_terms`, and `report_cards` (with
  `class_id`, versioned, snapshots). `attendance` stores `class_name` on each row.
- **Classes:** `classes (id, school_id, name, metadata)`. Section seems to be inside the name or metadata. Check.
- **Numbering:** `app.next_doc_no(school, kind, session)` with `doc_counters` already issues invoice and receipt
  numbers per school per session. It can probably issue admission numbers too.

## Decided with Moses

- Admission register and IDs, and year-by-year enrolment, are in the first version.

**2026-10-20, round 1 (asked in session):**
- **Shape:** a new `students` table, one row per child, with the login (`users`) linked optionally. A child can be
  admitted or imported without a login.
- **One record per school.** A transfer between two Sthara schools is a TC at the old school and a new admission at
  the new one. Records never span tenants.
- **Admission numbers:** the tenant keeps its own. Imported numbers carry over unchanged, and Sthara continues the
  school's own format (prefix and next number set per school).
- **The register must be rich enough to automate filings,** so staff only sign off and edit: **UDISE+ student DCF,
  CBSE registration / LOC, APAAR ID creation, and state scholarship / RTE returns.** The register's fields are the
  union of what those filings need. Research the current official formats and get Moses's sign-off on the list
  before building.
- **Aadhaar is stored in full**, encrypted at the app level (AES-GCM, key in Vercel env, recorded in the DR runbook).
  The database holds ciphertext plus the last 4 digits. It's shown masked, and unmasked only with a permission.
  APAAR and PEN are stored in full.
- **Corrections only, with history.** Nothing is deleted. A change keeps the old value, who changed it, when and
  why. A wrong entry is marked cancelled with a reason, and its number is never reused.
- **Academic year per tenant:** each school sets its session start month (default April) and the current session.
  `sessionOf()` reads the school's setting.
- **Grade and section are separate fields** on enrolment, plus a `class_id` link. The class name stays as the
  display label.
- **Year-end outcomes follow the report card chain:** class teacher, then principal, then office. Once next
  session's classes are set, a final update is published to the parent and student portals.
- **Roll numbers: the tenant chooses the rule** (alphabetical, by admission number, or manual), per school.
- **Mid-year changes are dated rows.** A change closes the current enrolment row (end date) and opens a new one in
  the same session.
- **`users.student_class` stays as a synced cache** of the current class. Enrolment is the source of truth, and
  readers move over in later PRs.
- **Back-fill:** the migration creates a `students` record and a current-session enrolment row for every existing
  student. Earlier years come in through the enrolment-history import, including students who have left.
- **The register import creates records only,** never logins. Logins are still issued only through the ops flow,
  and linked by admission number.

## Still open (ask Moses before building)

**Shape**
- Separate `students` table (one per child, a login linked optionally), or keep `users` as the student and add
  columns? Lay out the trade-off for him: a student who has no login yet, siblings, a parent login, reusing
  `users.id` everywhere.
- Can one person's record ever cover more than one school (a transfer between two Sthara schools)? Or is it always
  one record per school?

**Admission register**
- Which fields go in the register? Ask Moses for the fields he wants, or a real register to model on. Don't use a
  generic list.
- Admission number: does Sthara issue it (format? per session, or running forever?), or does the tenant keep the
  numbers it already has? A tenant joining mid-life arrives with existing numbers. Do they carry over unchanged
  through import?
- Which government IDs: APAAR, PEN (UDISE+), Aadhaar? For Aadhaar, store it masked, store only the last 4, or not at
  all?
- Can a register entry ever be edited or deleted? Or only corrected, with the old value kept and a reason?

**Enrolment**
- What's an academic year here (April–March?), and where is "the current session" set today?
- Section: a separate field, or part of the class name as now?
- Roll number: assigned how (alphabetical, by the office), and does it change each year?
- Outcomes at year end: promoted, detained, left, transferred out, anything else? Who confirms them?
- Mid-year moves (section change, joining late, leaving mid-year): show them as separate rows with dates?
- Back-fill: create one enrolment row for every current student from `student_class`? Import earlier years?

**Migration of existing code**
- Should `student_class` stay as a cached "current class" kept in sync, or should every reader move to the
  enrolment table in this PR? (15 API files.)

**Bulk import (on 09's mechanism)**
- Two published formats: **students / admission register** and **enrolment history** (one row per student per
  year). The columns follow the field answers above. Confirm them with Moses.
- Does the register import create logins, or only records (logins issued later)? Today the roster import
  (`CSV_TEMPLATE` in `src/lib/ops/people.ts`) creates logins. How do the two fit together?
- Importing past years: can a tenant load enrolment history for students who have already left?

## Done means

The answers are recorded above. Migrations are tested on the local stack with RLS and grants. Promotion writes
enrolment history. Existing pages still work against the new source of truth. Both import formats are published,
with templates, and work for the tenant admin and for ops. There are unit tests for promotion, leaving, numbering
and the imports. `npm run typecheck`, `lint`, `test`, `check:reads` and `check:grants` all pass.
