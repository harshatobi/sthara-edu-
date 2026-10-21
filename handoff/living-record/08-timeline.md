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
