# 06 — Co-curricular

## Goal

Record houses, clubs, sports, achievements and competitions on the student's record across years.

## What exists today

- `exam_student_terms.coscholastic` holds per-term co-scholastic grades for report cards. Check its shape, and ask
  whether this area should feed it.
- Nothing for houses, clubs or achievements.

## Decided with Moses

- Co-curricular is in the first version.

**2026-10-23 (asked in session):**
- **What:** houses (with house points), clubs and teams (incl. NCC / Scouts / Guides, with roles such as captain),
  achievements, and a participation log (every event, prize or not).
- **Name:** the achievements area is called **Kirti** (renown, remembered deeds): "Kirti: Asha's achievements".
- **Houses, flexible:** each school picks the rule: a house for the whole school life, or reassigned every session.
  Either way a move is dated with a reason and history is kept; siblings can be kept together; Sthara can auto-balance
  new students across houses. House points per event, totalled per session.
- **Recording:** any teacher (or the activity in-charge) records; the academic coordinator or principal approves before
  it shows anywhere. House points need approval too.
- **Clubs and teams:** the coordinator sets them up and names a teacher in-charge, who manages members and records
  participation.
- **Levels:** class, house, school, inter-school, zone/cluster, district, state, national, international.
  **Positions:** participant, 1st, 2nd, 3rd, special mention, other (typed).
- **Attachments:** a certificate or photo is uploaded with the achievement and kept as a student document (brief 04).
- **Shows on:** TC fields 16 (NCC/Scouts/Guides) and 17 (games and activities, with level), the parent portal and the
  student portal (approved entries only). Not on report cards.
- **Import:** three formats: house placements, club/team memberships, Kirti (achievements and participation).

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

## Built (2026-10-23, PR 36)

- Migration `20261026090000_co_curricular.sql`: `houses`, `house_members` (dated, one open placement per student),
  `cc_groups` (clubs, teams, NCC, Scouts/Guides, with a teacher in charge), `cc_memberships` (per session, with a role),
  `kirti_entries` (pending/approved/rejected; house points go to the house of the day on approval; an optional
  certificate kept as a student document), `house_points` (a whole house), the `cocurricular.manage/approve`
  permissions (academic coordinator, principal, school admin), three import writers and undo (undo closes and reopens
  house placements in the right order).
- `src/lib/cocurricular/`: `kirti.ts` (levels, positions, categories, checks, TC fields 16-17, house balancing) and
  `server.ts`.
- Screens: Admin › Co-curricular (Kirti and house points to approve, houses and standings with the school's rule,
  balancing and the whole-school reassign, clubs and teams, Kirti log); the Kirti tab on the student record (place or
  move house); Teacher › Kirti (record for one student or a whole class or team, attach a certificate, propose house
  points, keep a club's members); Student › Kirti and Parent › Kirti (approved only).
- TC fields 16 and 17 now pre-fill from approved memberships and Kirti.
- Imports: house placements, club and team members, Kirti (imported entries count as approved).
- Known limit: a Kirti import works out the session from the date assuming an April start.
