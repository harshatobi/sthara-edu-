# 06 — Co-curricular

## Goal

Record houses, clubs, sports, achievements and competitions on the student's record across years.

## What exists today

- `exam_student_terms.coscholastic` holds per-term co-scholastic grades for report cards. Check its shape, and ask
  whether this area should feed it.
- Nothing for houses, clubs or achievements.

## Decided with Moses

- Co-curricular is in the first version.

## Still open (ask Moses before building)

- Which of these the school runs: houses, clubs, sports teams, events and competitions, certificates and awards?
- Houses: assigned once for the whole school life, or yearly? House points?
- Who records an achievement (any teacher, a coordinator, the office)? Is approval needed before it's on the record?
- Levels (school, inter-school, district, state, national) and positions (participant, 1st/2nd/3rd)?
- Attach a certificate or photo (reuse 04's storage)?
- Should achievements appear on report cards, the parent app, or a leaving profile?

**Bulk import (on 09's mechanism)**
- Published format: **Co-curricular: houses, clubs, achievements**. The columns follow the field answers above. Confirm them with Moses.
- One file, or one per kind (houses, memberships, achievements)?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. Tables with RLS and audit, entry screens for the agreed roles, and a per-student view. All checks
pass.
