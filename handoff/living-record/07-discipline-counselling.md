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

Round 2 (2026-10-24):
- **Discipline = incidents + actions.** The existing `incidents` table stays the event. New: actions on a student
  (warning, parent meeting, detention, suspension with dates). Any teacher proposes, the VP or principal approves
  (`incidents.manage`); a suspension is the principal's alone.
- **Counselling notes are the counsellor's only.** The principal sees that sessions happened (dates and a status:
  ongoing / closed / referred), never the content. Every read of a note is audited.
- **Child protection gets a separate path.** A new office role **Safeguarding lead** (the school admin assigns it,
  usually one or two people). Only it sees child-protection cases; they are hidden from the normal incident list and
  the record shows others nothing.
- **Parents see approved discipline actions about their own child only.** Never counselling, safeguarding or the
  incident itself. On approval the principal chooses each time whether to notify the parent (portal + the usual
  parent notification).
- **Certificates never pull discipline automatically.** The principal may still type a conduct line by hand.
- **Retention:** warnings and detentions drop off the record and the parent view at the next session; they stay in
  an archive only the principal and registrar can open. Suspensions, counselling and safeguarding are kept.
- **Bulk import: later.** No import format in this brief.

Round 3 (2026-10-24):
- **No Safeguarding lead yet:** the principal sees child-protection cases until the school assigns one; from then
  on only the lead does. The dashboard asks whoever manages access to assign one.
- **School admin** sees the counselling overview (dates and status) like the principal, but not counselling notes
  or child-protection cases unless they also hold the Counsellor or Safeguarding lead role.
- **Tutor safety alerts** (self-harm, abuse cues) go to the counsellor, the principal and the Safeguarding lead.
- **Referrals:** teachers and parents can refer a student to the counsellor (a reason only). The counsellor opens a
  case. The referrer sees only whether it was referred and seen.

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

## Built (2026-10-24, PR 36)

- Migration `20261027090000_discipline_counselling`: role `safeguarding_lead`; permissions `discipline.approve`
  (VP, principal, school admin), `discipline.suspend` (principal, school admin), `discipline.archive` (principal,
  registrar, school admin), `counselling.overview` (principal, school admin), `counselling.notes` (counsellor only),
  `safeguarding.cases` (Safeguarding lead only). `app.cp_reader()`: the lead, else the principal while no lead holds
  an active grant. `incidents_read` and `situations_read` rewritten so child protection reaches only that reader (the
  VP and school admin lost it). Tables `discipline_actions`, `counselling_cases`, `counselling_sessions`,
  `counselling_referrals`, `safeguarding_log` (RLS on, server only). Import undo keeps a register entry that has any of
  them.
- Counselling notes, referral reasons and child-protection details are AES-GCM encrypted with STUDENT_PII_KEY
  (`sealText`), so the audit trail holds ciphertext only. Every read of notes, the referral inbox and a
  child-protection case is written to `audit_log` (`counselling.viewed`, `counselling.referrals_viewed`,
  `safeguarding.viewed`).
- Child protection never goes to the AI (Ask the School OS context) or to WhatsApp beyond "a case needs you" and an
  open-case count. The feed's Tell parents / Close buttons are replaced by Safeguarding, where the lead records the
  POCSO report, the parent informed, referral and closing.
- Screens: Admin › Discipline (to approve, the record, archive), Admin › Counselling, Admin › Safeguarding, a Conduct
  tab on the student record, Teacher › Conduct & Care (propose, refer, follow), Parent › Conduct & Care (approved
  actions, ask the counsellor). Dashboard work items, including "Assign a Safeguarding lead" for access managers.
- Local SQL scenarios (16): child-protection visibility with no lead / a lead / a lapsed lead, the VP and school admin
  shut out, the logger keeps their own incident, no direct table access, constraints, import undo.
