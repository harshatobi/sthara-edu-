# 08 — Unified timeline

## Goal

One view of a student across every year: enrolment, attendance, marks and report cards, TML, homework, fees,
wellness, health, documents, certificates, co-curricular and discipline. Each viewer sees only what their role
allows. This is the screen that makes "Living Record" true.

## What exists today

- The sources, all keyed by student: `attendance` (about 310k rows in the sandbox; queries there have **timed
  out**), `report_cards` (versioned snapshots), `exam_marks`, `tml_scores` (append-only), `submissions`,
  `fee_invoices` and `fee_payments`, `wellness_logs`, `incidents`, `tutor_sessions`, plus 01–07's new tables.
- **A parent-side aggregator already exists:** `src/lib/parent/family.ts` builds a child's work, attendance and
  more for the parent portal. `src/lib/parent/askServer.ts` turns it into text for the AI. Reuse what fits.
- Known traps: the 1,000-row cap silently truncates reads (`school_attendance_summary` and `assignments_student`
  both hit it in production). Page everything, and summarise attendance per month on the server.

## Decided with Moses

- The unified timeline is in the first version.

Round 2 (2026-10-24):
- **For everyone in this PR:** office roles, teachers, parents and the student.
- **Shape: both.** A year-by-year summary on top (attendance %, results, TML band, fees, achievements, conduct);
  opening a year shows its chronological feed of events.
- **Attendance:** one line per month with the %, plus an event for any run of 3 or more school days absent.
- **Print:** a "student file" PDF of what the viewer may see, with the Powered by Sthara footer; every print is
  audited. Office roles and parents may print; teachers and students view on screen only.
- **Teachers:** the class teacher sees the teaching side (attendance, marks, TML, homework, achievements, approved
  discipline). A subject teacher sees attendance plus their own subject's marks, TML and homework.
- **Parent:** everything family-facing (attendance, results, TML, homework, fees, achievements, certificates issued,
  approved discipline, documents, health). **Student:** the same minus fees and discipline. Never counselling,
  safeguarding or staff wellness follow-ups.
- **Office roles:** each source follows the role's existing permission (fees with fees perms, health with health
  perms, discipline with discipline perms, counselling overview for principal/school admin, child protection never).
- **Wellness:** monthly mood trend for the counsellor, the principal and the student; shared notes only for those
  already allowed to read them. Not parents, teachers or other office roles.
- **Before joining:** students who came from another school get one first entry from the admission record (previous
  school, last class, TC number). No old-school marks or attendance.
- **Ask the School OS** answers from a compact year-by-year summary within the viewer's filter; never counselling or
  child protection.
- **Speed:** the summary opens in under 2 s on the sandbox; a year's feed in under 1 s. Attendance is summarised per
  month on the database server.
- No bulk import (the timeline has no data of its own).

## Still open (ask Moses before building)

- Who is it for first: office/principal, class teacher, parents, or the student?
- What does "the timeline" look like: a chronological feed of events, a year-by-year summary, or both?
- Which events are worth showing? (Every attendance mark is too much. Monthly attendance %? Only absences?)
- Should it be exportable or printable (a "student file" for inspection or transfer)?
- Should Ask the School OS answer questions from it (it already has `askServer.ts` for parents)?
- Performance target: how fast must it open for a student with 10+ years of history?

## Done means

Answers recorded. The view loads within the agreed target on the sandbox's full data, every source pages, and
access is filtered per role on the server. Tests for the per-role filtering. All checks pass.

## Built (2026-10-24, PR 36)

- Migration `20261028090000_timeline`: `public.student_attendance_timeline(school, student, from?, to?)` returns one
  row per month and every run of 3+ marked school days absent (unmarked days don't break a run), service role only.
  Measured on the live sandbox's busiest student: 3 ms to execute.
- `src/lib/timeline/rules.ts` (pure): the lenses (`officeLens` per permission, `teacherLens` class/subject,
  `parentLens`, `studentLens`), `shapeTimeline` (year summary), `yearEvents` (a year's feed), `timelineText` (the AI
  brief, name-free). Shaping re-checks the lens, so a source loaded by mistake never reaches the screen, PDF or AI.
- `src/lib/timeline/server.ts`: `timelineAccess` (office roles; class teacher / subject teacher by the student's
  current class; verified guardian; the student themself), `loadRows` (only the lens's sources, paged or bounded;
  documents by `canSeeKind`; private journal entries never counted), `recordPrint` (`timeline.printed` in audit_log).
- `GET/POST /api/timeline`: summary, `&session=` a year's events, `&print=1` the student file (office and parents);
  POST asks about the timeline (`timelineAsk`, 30 per 10 minutes, school AI switch 'ask').
- Screens: Admin › Student record › Timeline tab; a Timeline button on Admin › Counselling cases (the counsellor has
  no register access); Teacher › Student Timelines (class, then student); Parent › Timeline; Student › My Timeline.
  The student file prints from its own document (portalled to body) with the Powered by Sthara page footer.
- Parent Ask the School OS gets each child's year-by-year lines.
- Wellness on the timeline is the monthly check-in count and low days only; notes stay in the Wellness Centre.
- Health shows the kind and date of check-ups and vaccinations only; the detail stays in Health, where reads are
  recorded.
- Tests: `src/lib/timeline/rules.test.ts` (9): per-role filtering for office roles, class and subject teachers, parent
  and student; child protection never appears; the AI text stays in the lens.
