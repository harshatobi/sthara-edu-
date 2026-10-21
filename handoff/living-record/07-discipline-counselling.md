# 07 — Discipline and counselling

## Goal

Discipline incidents and counselling notes on the student's record, with the tightest access control in the
Living Record.

## What exists today

- **Incidents already exist:** `incidents (student_id, class_name, category, severity, summary, details, location,
  occurred_at, logged_by, parent_notice*, status, outcome, closed_*)`, managed through the situational feed and
  `incidents.manage`. Find out what's already built before adding anything.
- **Wellbeing check-ins:** `wellness_logs (mood, energy, note, shared, resolved)`. Teacher follow-up goes through
  `POST /api/teacher/acknowledge-situation`, which **is broken in production** ("permission denied for schema app":
  service_role lacks USAGE on `app`, and `app.guard_wellness_update` needs it). Fix that first, or make sure it's
  fixed.
- **Permissions:** `safeguarding.read`, `wellness.read` and `incidents.manage` exist in `src/lib/admin/rbac`.
- `situations` is the feed's alert table (acknowledge, escalate).

## Decided with Moses

- Discipline and counselling are in the first version.

## Still open (ask Moses before building)

- Are discipline incidents just the existing `incidents` table shown on the record, or do they need more (warnings,
  suspensions, parent meetings)?
- Counselling: is there a counsellor role at the school? Are notes private to the counsellor, shared with the
  principal, or never shared?
- Should parents ever see any of this?
- Do serious safeguarding cases (child protection) need a separate, more restricted path?
- Does a discipline record follow the student onto a TC or character certificate (05), or never?
- Retention: when do these records get deleted or archived?

**Bulk import (on 09's mechanism)**
- Published format: **Discipline and counselling history**. The columns follow the field answers above. Confirm them with Moses.
- Should past discipline or counselling notes be importable at all? Who may run that import (it's the most sensitive data)?
- Do imported incidents land in the existing `incidents` table?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. The wellness-acknowledge bug fixed or confirmed fixed. Notes stored with server-side permission
checks, and every read of a counselling note audited. Tests proving other roles get nothing. All checks pass.
