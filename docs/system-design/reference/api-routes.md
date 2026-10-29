# API routes

> Generated 2026-10-29 from the code on this branch and the 18 migrations in `supabase/migrations/` (replayed into a scratch Postgres 16 with Supabase stubs). One section per route handler file: methods, the `action` values its handlers switch on, how the caller is authenticated, who calls it, and every table, SQL function, storage bucket and external service its code can reach (all branches, through called functions, with the logging plumbing left out). Do not hand-edit; see [../README.md](../README.md#how-this-was-produced).

## Contents

- [School office (`/api/admin`)](#area-admin) (54)
- [`/api/attendance`](#area-attendance) (1)
- [`/api/auth`](#area-auth) (1)
- [`/api/contact`](#area-contact) (1)
- [`/api/cron`](#area-cron) (1)
- [`/api/errors`](#area-errors) (1)
- [`/api/feed`](#area-feed) (1)
- [`/api/grading`](#area-grading) (1)
- [`/api/health`](#area-health) (1)
- [`/api/homework`](#area-homework) (1)
- [`/api/import`](#area-import) (1)
- [Signed-in self (`/api/me`)](#area-me) (4)
- [Platform Manager (`/api/ops`)](#area-ops) (39)
- [`/api/paper-gen`](#area-paper-gen) (1)
- [Parent (`/api/parent`)](#area-parent) (9)
- [`/api/platform`](#area-platform) (1)
- [`/api/portal`](#area-portal) (1)
- [`/api/qa`](#area-qa) (2)
- [`/api/quiz`](#area-quiz) (2)
- [Staff: teachers and office (`/api/staff`)](#area-staff) (4)
- [Student (`/api/student`)](#area-student) (7)
- [Teacher (`/api/teacher`)](#area-teacher) (23)
- [`/api/timeline`](#area-timeline) (1)
- [`/api/tml`](#area-tml) (1)
- [`/api/tutor`](#area-tutor) (1)
- [`/api/whatsapp`](#area-whatsapp) (2)
- [`/api/youtube`](#area-youtube) (1)

## How to read the guard column

| Guard | Meaning (from the code) |
|---|---|
| `requireAdmin` | `src/lib/admin/serverAuth.ts`: verified JWT, `users.role = admin` with a school, office roles from `role_grants`; a permission (`lib/admin/rbac`) can be required per route or per action. |
| `requireStaff` | `src/lib/teacher/serverAuth.ts`: verified JWT, teacher or admin with a school; teaching scope from `users.assignments`. |
| `requireFeedCaller` | `src/lib/feed/access.ts`: teacher or office staff, with office roles where relevant. |
| `requireParent` | `src/lib/parent/serverAuth.ts`: verified JWT, `users.role = parent`; children only through verified `guardians` rows. |
| `verifyApiToken` | `src/lib/auth/verifyToken.ts`: any signed-in user; the route checks role itself. Also applies school suspension and trial expiry (`schoolAccessBlock`). |
| `operatorFor` | `src/lib/ops/auth.ts`: an active `ops_operators` row or a superadmin; everyone else gets 404. Capability per route (`lib/ops/roles`), territory reach per school. |
| `requireGrant` | `src/lib/ops/access.ts`: an open break-glass window (reason, 30 minutes, read-only except imports) on that school. |
| `CRON_SECRET / worker-secret / qa-upload-token / device-token` | Shared secrets for machine callers. |
| `meta-signature / meta-hub-verify-token` | WhatsApp webhook: `x-hub-signature-256` HMAC with the app secret; GET handshake with the verify token. |
| `rate-limit` | In-memory sliding window per server instance (`src/lib/rateLimit.ts`), limits in `src/lib/settings/limits.ts`. |
| `public` | No caller identity required. |

## Area admin

School office (`/api/admin`). 54 route files.

### `/api/admin/access`

- **File:** `src/app/api/admin/access/route.ts`
- **Methods:** `GET` · `POST` · `PATCH`
- **Guard:** `requireAdmin` · permission `access.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/access`
- **Tables:** `notifications` insert, `ops_access_events` select, `ops_access_grants` select, `role_grants` select/insert/update, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Office roles (access.manage).
  POST  { userId, role, expiresOn?, note? }   give a role, optionally until a date (e.g. acting principal)
  PATCH { id }                                 take it away (soft: the grant stays on record as revoked)
The database refuses roles for non-office accounts and removing a school's last school admin.
  GET                                          every time someone at Sthara opened this school's records:
                                               who, when, for how long, why, and how many records
```

</details>

### `/api/admin/account-requests`

- **File:** `src/app/api/admin/account-requests/route.ts`
- **Methods:** `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `people.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/directory`
- **Tables:** `account_requests` insert/select/update, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Ask Sthara for new logins (people.manage: school admin, principal). Logins are created by Sthara operators only,
so the school lists who needs one and an operator approves the request in the ops console.
  POST   { people: [{ role, name, email, className?, rollNo?, children? }], note? }
  DELETE { id }   withdraw a pending request
```

</details>

### `/api/admin/admissions`

- **File:** `src/app/api/admin/admissions/route.ts`
- **Methods:** `POST` · `PATCH`
- **Guard:** `requireAdmin` · permission `admissions.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `admission_applicants` insert/select/update; in SQL: select/update, `admission_documents` select, `admission_events` insert; in SQL: insert, `admission_offers` select; in SQL: select/update, `admission_seats` in SQL: select, `admission_stages` select; in SQL: insert/select, `enrolments` select, `family_members` select, `guardians` select, `notifications` in SQL: insert, `role_grants` select, `schools` select, `staff_members` select, `students` select, `users` select
- **SQL functions (rpc and nested):** `admission_ensure_stages()`, `admission_move()`, `admission_promote()`, `app.admission_close_offer()`, `app.admission_issue()`, `app.admission_lock_grade()`, `app.admission_rank()`, `app.admission_seats_left()`, `app.admission_today()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Admissions pipeline (school admins only).
  POST  { name, grade, session?, dob?, guardianName?, guardianPhone?, guardianEmail?, previousSchool?, source?, notes? }
  PATCH { id, from, to, note? }                  move stage (forward one of the school's own, reject, withdraw, reopen)
  PATCH { id, fields: {...} }              edit details
  PATCH { id, form: {...} }                save the application (register fields, address, family; lib/admin/application)
Leaving a stage that requires checks (documents, age) is refused until they pass.
Every stage move writes an admission_events row with who and why.
```

</details>

### `/api/admin/admissions/application`

- **File:** `src/app/api/admin/admissions/application/route.ts`
- **Methods:** `GET`
- **Guard:** `requireAdmin` · permission `admissions.read`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `admission_applicants` select, `admission_documents` select, `enrolments` select, `family_members` select, `guardians` select, `role_grants` select, `schools` select, `staff_members` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
One applicant's application for the office (admissions.read): the form, documents with it, the checks (age for
the class, the document checklist, siblings at the school, staff in the family) and what is still missing.
  GET ?id=<applicant>
```

</details>

### `/api/admin/admissions/documents`

- **File:** `src/app/api/admin/admissions/documents/route.ts`
- **Methods:** `POST` (actions: `upload-url`, `upload-done`, `open`, `verify|reject`, `remove`)
- **Guard:** `requireAdmin` · permission `[admissions.read, admissions.manage]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `admission_applicants` select, `admission_documents` insert/select/update/delete, `audit_log` insert, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Documents with an application. The file goes straight from the browser to the private bucket through a one-time
link; the record is written once it has arrived. Medical kinds need the health roles, as on the student record.
  POST { action: 'upload-url', applicantId, kind, fileName, fileBytes }               admissions.manage
  POST { action: 'upload-done', applicantId, path, kind, fileName, title?, document_no?, issued_on?, valid_until?, verified? }
  POST { action: 'open', id }                                                           admissions.read
  POST { action: 'verify' | 'reject', id, note? }                                       admissions.manage (reject needs a note)
  POST { action: 'remove', id, reason }                                                 admissions.manage
```

</details>

### `/api/admin/admissions/enrol`

- **File:** `src/app/api/admin/admissions/enrol/route.ts`
- **Methods:** `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `admissions.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `account_requests` select/insert/update, `admission_applicants` select, `admission_offers` select, `classes` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Ask Sthara to enrol an applicant who has an offer (admissions.manage). Logins are created by Sthara operators
only, so this files a request; approving it in the ops console creates the student's login and the parent's
(or links their existing account), adds the guardian link, bills the grade's instalments (billFees) and moves
the applicant to Enrolled.
  POST   { applicantId, className, rollNo, studentEmail?, parentEmail?, billFees? }
  DELETE { applicantId }   withdraw the pending request
```

</details>

### `/api/admin/admissions/offers`

- **File:** `src/app/api/admin/admissions/offers/route.ts`
- **Methods:** `POST` (actions: `propose`, `approve|return`, `accept|decline`, `cancel`)
- **Guard:** `requireAdmin` · permission `[admissions.manage, admissions.approve]`, `admissions.manage`, `admissions.approve`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `admission_applicants` select; in SQL: select/update, `admission_documents` select, `admission_events` in SQL: insert, `admission_offers` in SQL: select/insert/update, `admission_seats` in SQL: select, `admission_stages` select; in SQL: select, `enrolments` select, `family_members` select, `guardians` select, `notifications` in SQL: insert, `role_grants` select, `schools` select, `staff_members` select, `students` select, `users` select
- **SQL functions (rpc and nested):** `admission_offer_cancel()`, `admission_offer_decide()`, `admission_offer_propose()`, `admission_offer_respond()`, `admission_promote()`, `app.admission_close_offer()`, `app.admission_issue()`, `app.admission_lock_grade()`, `app.admission_rank()`, `app.admission_seats_left()`, `app.admission_today()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Offers (maker-checker). The admissions office proposes; the principal approves, which issues the offer when the
grade has a seat and puts the applicant on the waitlist when it doesn't; the office records the family's answer.
  POST { action: 'propose', applicantId, note?, respondBy? }   admissions.manage
  POST { action: 'approve' | 'return', offerId, note? }         admissions.approve (never the proposer; return needs a note)
  POST { action: 'accept' | 'decline', offerId, note? }         admissions.manage (decline needs a note)
  POST { action: 'cancel', offerId, note? }                     admissions.manage (only before the offer goes out)
The rules and the seat count are in the database functions (admission_offer_*), under a lock per grade.
```

</details>

### `/api/admin/admissions/setup`

- **File:** `src/app/api/admin/admissions/setup/route.ts`
- **Methods:** `POST`
- **Guard:** `requireAdmin` · permission `admissions.setup`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/admissions`
- **Tables:** `admission_applicants` in SQL: select/update, `admission_events` in SQL: insert, `admission_offers` in SQL: select/update, `admission_seats` upsert/delete; in SQL: select, `admission_stages` in SQL: select/insert/update, `audit_log` insert, `notifications` in SQL: insert, `role_grants` select, `schools` select/update, `users` select
- **SQL functions (rpc and nested):** `admission_ensure_stages()`, `admission_promote()`, `admission_set_stages()`, `app.admission_issue()`, `app.admission_lock_grade()`, `app.admission_seats_left()`, `app.admission_today()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Admissions set-up (admissions.setup).
  POST { kind: 'stages', own: [{ key?, label, active, requires? }], offer: { label, respondDays }, enrolled: { label } }
       the school's stages in order; Offer and Enrolled can be renamed, not moved or removed; requires: the checks
       ('documents', 'age') an applicant must pass before leaving the stage
  POST { kind: 'age', cutoff: 'MM-DD', min: { grade: years }, max: { grade: years } }
       the age for each class on the cut-off date of the admission year (blank min: Class 1 at 6, a year a class)
  POST { kind: 'seats', session?, seats: [{ grade, capacity | null }] }
       seats for new admissions per grade (null: no limit); more seats fill from the waitlist at once
```

</details>

### `/api/admin/attendance`

- **File:** `src/app/api/admin/attendance/route.ts`
- **Methods:** `PUT` · `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.workforce`, `[schedule.workforce, schedule.academic]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `academic_events` select, `attendance_devices` select/insert/update; maybe: delete, `attendance_month_reviews` select/delete/insert; maybe: delete, `attendance_settings` upsert/select; maybe: delete, `bell_schedules` select, `leave_requests` select/insert; maybe: delete, `notifications` insert, `role_grants` select, `role_permissions` select, `schools` select, `shift_overrides` delete/insert/select; maybe: delete, `shifts` update/insert/select; maybe: delete, `staff_absences` select, `staff_day_marks` delete/insert/select; maybe: delete, `staff_members` select; maybe: delete, `staff_noshow_alerts` select/insert, `staff_punches` select/insert, `staff_shift_plans` select/update/insert; maybe: delete, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Staff attendance and shifts (schedule.workforce: the HR manager and principal).
  PUT    { entity: 'settings', ... }                                  hours, grace, rules (each switchable), geofence, no-show alerts
  PUT    { entity: 'shift', id?, name, startsAt, endsAt, active? }
  PUT    { entity: 'plan', person, mode, shiftId?, rotation?, offMode, offDays?, offCycle?, anchorDate?, worksHolidays?, rulesExempt?, graceMin?, note? }
  PUT    { entity: 'override', person, date, kind: 'shift' | 'off' | 'work', shiftId?, reason }
  PUT    { entity: 'swap', date, reason, a: { person, kind, shiftId? }, b: { person, kind, shiftId? } }   two overrides, one swap
  PUT    { entity: 'mark', person, date, status, inAt?, outAt?, source: 'register' | 'override', reason? }   an override needs a reason
  PUT    { entity: 'leave', staffMemberId, type, from, to, halfDay?, reason }   leave for staff with no login (pending, approved as usual)
  POST   { entity: 'import', punches: [{ code, at, direction }] }    a biometric export, matched by employee code
  POST   { entity: 'device', name, vendor? }                          a push device; the token is shown once
  POST   { entity: 'review', person, month, waived: string[], note? } confirm a month (loss of pay after waivers)
  POST   { entity: 'noshow_check' }                                    run the no-show check now (also run by the scheduler)
  DELETE { entity: 'shift' | 'override' | 'mark' | 'device' | 'review', id }
```

</details>

### `/api/admin/certificates`

- **File:** `src/app/api/admin/certificates/route.ts`
- **Methods:** `GET` · `POST` (actions: `prepare`, `save`, `submit`, `approve`, `send-back`, `cancel`, `duplicate`, `pdf`, `portal-url`, `portal-record`, `type-save`, `settings-save`)
- **Guard:** `requireAdmin` · permission `[students.read, certificates.prepare, certificates.approve, certificates.setup]`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/certificates`, `/admin/students/[id]`
- **Tables:** `attendance` select, `audit_log` insert, `cc_memberships` select, `certificate_settings` select/upsert, `certificate_types` select/insert/update; in SQL: select, `certificates` select/insert/update/delete; in SQL: select/update, `class_subjects` select, `classes` in SQL: select, `doc_counters` in SQL: insert, `enrolments` select/update; in SQL: select/update/insert, `family_members` select, `fee_invoices` select, `fee_payments` select, `house_members` select, `kirti_entries` select, `report_card_settings` select, `role_grants` select, `schools` select; in SQL: select, `student_changes` insert, `students` select/update; in SQL: select, `users` select/update
- **SQL functions (rpc and nested):** `app.grade_from_class()`, `app.grade_of()`, `app.move_enrolment()`, `app.norm_class()`, `app.section_from_class()`, `app.session_of()`, `app.session_start_month()`, `certificate_issue()`, `student_move()`
- **Auth / Storage:** `auth.admin.updateUserById`, `auth.getUser`, `storage:certificates`

<details><summary>Route doc comment</summary>

```text
Certificates out (brief 05).
  GET ?studentId=&status=&q=                  the register (students.read or any certificates permission), the kinds, settings
  GET ?id=                                    one certificate with its values and the dues check
  POST { action }:
    prepare { studentId, typeId, purpose?, conduct?, fyStart? }   certificates.prepare: a draft filled from the record
    save { id, data } | submit { id }                             certificates.prepare
    approve { id, override? } | send-back { id, note }            certificates.approve
    cancel { id, reason } | duplicate { id }                      certificates.approve (a draft: whoever prepares)
    pdf { id }                                                    a two-minute link (recorded); a draft is a DRAFT preview
    portal-url { id, ext } | portal-record { id, ref, path? }     certificates.prepare: a state-board TC from the portal
    type-save { id?, title?, body?, prefix, needsApproval?, active? } | settings-save { ... }   certificates.setup
```

</details>

### `/api/admin/cocurricular`

- **File:** `src/app/api/admin/cocurricular/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `[cocurricular.manage, cocurricular.approve, students.read]`, `[cocurricular.manage, cocurricular.approve]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/cocurricular`, `/admin/students/[id]`
- **Tables:** `cc_groups` select/update/insert, `cc_memberships` select/upsert/update, `house_members` select/update/insert/delete, `house_points` select/update/insert, `houses` select/update/insert, `kirti_entries` select/update/insert, `role_grants` select, `schools` select/update, `sibling_links` select, `student_documents` update/insert/select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Co-curricular for the office (brief 06).
  GET                        houses, standings, clubs and teams, settings, what waits for approval, teachers (cocurricular.*)
  GET ?studentId=            one student's houses, memberships and Kirti (also students.read)
  GET ?groupId=&session=     a club's or team's members
  GET ?view=log&session=     approved and rejected Kirti of a session
  POST { action }:
    house-save | group-save | settings-save                      cocurricular.manage
    place { studentId, houseId, from, reason } | balance { all }  cocurricular.manage
    members-add { groupId, studentIds, role } | member-update { groupId, memberId, role?, leave? }   cocurricular.manage
    decide-kirti { ids, approve, note } | decide-points { ids, approve, note } | award-points { houseId, points, reason, onDate }
    record { studentIds, entry, groupId? }                       cocurricular.approve
```

</details>

### `/api/admin/counselling`

- **File:** `src/app/api/admin/counselling/route.ts`
- **Methods:** `GET` · `POST` (actions: `refer`)
- **Guard:** `requireAdmin` · permission `[counselling.notes, counselling.overview, students.read]`, `[counselling.notes, students.read]`, `counselling.notes`, `students.read`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/counselling`, `/admin/students/[id]`
- **Tables:** `audit_log` insert, `counselling_cases` select/insert/update, `counselling_referrals` select/insert/update, `counselling_sessions` select/insert, `notifications` insert, `role_grants` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Counselling (brief 07).
  GET                       counsellor: the referral inbox and every case; principal / school admin: cases only (dates
                            and status, never notes); anyone else in the office: what they referred
  GET ?caseId=              one case with its notes (counselling.notes; every look recorded)
  GET ?q=                   students to open a case for (counselling.notes)
  POST { action }:
    refer { studentId, reason }                         any office member with students.read
    open { studentId } | open { referralId }             counselling.notes
    note { caseId, onDate, notes } | status { caseId, status } | seen { referralId }   counselling.notes
```

</details>

### `/api/admin/delete-user`

- **File:** `src/app/api/admin/delete-user/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/directory`
- **Tables:** `role_grants` select, `schools` select, `users` select/delete
- **Auth / Storage:** `auth.admin.deleteUser`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/admin/delete-user
Body: { userId, schoolId }
Deletes a user from auth AND the users table using service role (bypasses RLS).
Requires the requester to be an admin of that school.
```

</details>

### `/api/admin/discipline`

- **File:** `src/app/api/admin/discipline/route.ts`
- **Methods:** `GET` · `POST` (actions: `record`, `propose`, `approve`, `return`, `cancel`)
- **Guard:** `requireAdmin` · permission `[...READ, students.read, counselling.overview, counselling.notes]`, `[...READ]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/discipline`, `/admin/students/[id]`
- **Tables:** `counselling_cases` select, `counselling_sessions` select, `discipline_actions` select/insert/update, `guardians` select, `incidents` select, `notifications` insert, `role_grants` select, `schools` select, `students` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Discipline (brief 07), for the office.
  GET                         waiting for a decision (approvers) and the current record
  GET ?archive=1              past sessions' warnings and detentions (discipline.archive)
  GET ?studentId=             one student: actions (archive with discipline.archive), counselling dates and status
                              (counselling.overview / counselling.notes), incidents to link
  POST { action }:
    record { studentId, kind, onDate, untilDate?, reason, details?, incidentId?, notify? }   an approver records it approved
    propose { ... same }                    the registrar (or another discipline role) proposes it
    approve { id, notify? } | return { id, note }   the approver of its kind (a suspension is the principal's)
    cancel { id, reason }
```

</details>

### `/api/admin/exams`

- **File:** `src/app/api/admin/exams/route.ts`
- **Methods:** `GET` · `POST` (actions: `hold|release`, `hold`, `publish|reopen|review`, `review`, `reopen`, `settings`, `preset`, `scheme`, `scheme_delete`, `term`, `term_delete`, `assessment`, `assessment_delete`, `open`, `return_sheet`)
- **Guard:** `requireAdmin` · permission `[...READ]`, `[exams.publish, fees.collect]`, `[...READ, fees.collect]`, `exams.publish`, `exams.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/exams`
- **Tables:** `attendance` in SQL: select, `audit_log` insert, `class_subjects` select, `classes` select, `exam_assessments` select/insert/update/delete, `exam_class_terms` select/update/insert, `exam_marks` select, `exam_schemes` select/insert/delete/update, `exam_sheets` select/update/delete/upsert, `exam_student_terms` select, `exam_terms` select/insert/update/delete, `fee_invoices` in SQL: select, `fee_payments` in SQL: select, `guardians` select, `notifications` insert, `report_card_settings` select/upsert, `report_cards` select/update/insert, `role_grants` select, `schools` select, `student_subjects` select, `teacher_subjects` select, `tml_scores` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **SQL functions (rpc and nested):** `exam_attendance()`, `exam_fee_dues()`
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
The exam cell (exams.manage: academic coordinator, principal, school admin) and publishing (exams.publish:
principal, school admin). exams.read sees everything without changing it.
  GET ?session=                         schemes, terms, assessments, classes and the progress board
  GET ?session=&term=&class=            one class's term: sheets, readiness, every student's standing
  GET ?session=&term=&class=&preview=   a student's card as it would publish now (or "all" for the class)
  GET ?session=&term=&class=&cards=1    the published cards (latest versions), for printing
  GET ?held=1                           cards held now, with fees overdue (exams.publish or fees.collect)
  POST { action } :
    preset { preset, session, grades? }                                    exams.manage
    scheme { id, name, grades, grading, rules, status }                     exams.manage
    scheme_delete { id }                                                    exams.manage (only with no marks)
    term { id?, schemeId, name, seq, startsOn, endsOn, weight, components, subjectWeights }   exams.manage
    term_delete { id }                                                      exams.manage (only with no marks)
    assessment { id?, schemeId, termId, code, name, kind, maxMarks, subjects, heldFrom, heldTo }   exams.manage
    assessment_delete { id }                                                exams.manage (only with no marks)
    open { assessmentIds }                                                   exams.manage: create the marks sheets
    return_sheet { sheetId, note }                                          exams.manage: send a submitted sheet back
    review { termId, classId }                                              exams.publish (a class with no class teacher)
    publish { termId, classIds }                                            exams.publish
    reopen { termId, classId, reason, classSubjectIds }                     exams.publish
    hold { cardId, reason } | release { cardId }                            exams.publish or fees.collect
    settings { accent, affiliation, address, signatures, logo?, holdOnDues, holdMinAmount }   exams.manage
```

</details>

### `/api/admin/fees`

- **File:** `src/app/api/admin/fees/route.ts`
- **Methods:** `POST` (actions: `structure`, `raise`, `payment`, `void_payment`, `concession`, `concession_decide`, `void_invoice`, `remind`, `day_close`, `day_reopen`)
- **Guard:** `requireAdmin` · permission `fees.read`
- **Permission per action:** `structure` → `fees.bill`, `raise` → `fees.bill`, `payment` → `fees.collect`, `void_payment` → `fees.void`, `void_invoice` → `fees.void`, `concession` → `fees.concession.request`, `concession_decide` → `fees.concession.approve`, `remind` → `fees.remind`, `day_close` → `fees.dayclose`, `day_reopen` → `fees.void`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/fees`, `/admin/probe`
- **Tables:** `doc_counters` in SQL: insert, `fee_concession_requests` insert/select; in SQL: select/update, `fee_day_closes` update/select; in SQL: select/insert, `fee_invoices` select/update; in SQL: select/insert/update, `fee_payments` update/select; in SQL: select/insert, `fee_reminders` select/insert, `fee_structures` upsert/select; in SQL: select, `guardians` select, `notifications` insert, `role_grants` select; in SQL: select, `role_permissions` in SQL: select, `schools` select, `superadmins` in SQL: select, `users` select; in SQL: select, `whatsapp_links` select, `whatsapp_log` select/insert
- **SQL functions (rpc and nested):** `admin_close_day()`, `admin_decide_concession()`, `admin_raise_invoices()`, `admin_record_payment()`, `app.day_closed()`, `app.grade_of()`, `app.next_doc_no()`, `app.perm_holders()`, `app.user_has_perm()`
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Fee ledger actions (school admins only; school from the caller's own row).
  POST { action: 'structure', grade, annualFee, schedule: [{no,label,dueOn,share}], note? }
  POST { action: 'raise', instalment }                       raise one instalment for every eligible student
  POST { action: 'payment', invoiceId, amount, mode, reference?, paidOn }
  POST { action: 'void_payment', paymentId, reason }
  POST { action: 'concession', invoiceId, amount, reason }   a request; applied once someone else approves it
  POST { action: 'concession_decide', requestId, approve, note? }
  POST { action: 'void_invoice', invoiceId, reason }
  POST { action: 'remind', studentIds: [] }                  in-app notice to verified parents, tone from history
  POST { action: 'day_close', day, cashCounted, note? }      totals computed in the database
  POST { action: 'day_reopen', day, reason }
Each action checks its own permission (lib/admin/rbac). Amounts are rupees.
Balances are always recomputed from receipts in the database.
```

</details>

### `/api/admin/filings`

- **File:** `src/app/api/admin/filings/route.ts`
- **Methods:** `PUT` · `POST`
- **Guard:** `requireAdmin` · permission `wellness.file`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/wellness`
- **Tables:** `consents` select, `role_grants` select, `school_filings` select/upsert/update, `schools` select, `users` select, `wellness_logs` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
CBSE wellness report for the current session (school admins only).
  PUT  { dueOn?, data: { interventions?, counsellorReferrals?, trainingHours?, signatoryName?, signatoryTitle? } }   save draft
  POST { file: true }    freeze the auto-populated figures (computed here, from the database) and mark filed
A filed report can't be edited.
```

</details>

### `/api/admin/health`

- **File:** `src/app/api/admin/health/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `health.read`, `health.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/health`
- **Tables:** `audit_log` insert, `consents` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` select/update/insert/delete, `enrolments` select, `family_members` select/update/insert, `role_grants` select, `schools` select/update; in SQL: select, `student_change_requests` select/update, `student_changes` in SQL: insert, `student_documents` select/delete, `student_health` select/update/insert, `students` select; in SQL: select/update, `users` select
- **SQL functions (rpc and nested):** `app.admission_floor()`, `health_consented()`, `student_correct()`
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Admin › Health (health.read): every current student with alerts, special needs and consent, the parents' requested
changes, and the retention setting.
  POST (health.manage) { action: 'retention', days } | { action: 'decide', id, approve, note }
```

</details>

### `/api/admin/heatmap-data`

- **File:** `src/app/api/admin/heatmap-data/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/heatmap`
- **Tables:** `assignments` select, `role_grants` select, `schools` select, `submissions` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/admin/heatmap-data
Returns the admin heatmap for a school: each class's average per subject over every
approved submission (see buildHeatmap). Bypasses RLS via service role.
```

</details>

### `/api/admin/import`

- **File:** `src/app/api/admin/import/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `data.import`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/import`
- **Tables:** `account_requests` in SQL: select, `audit_log` insert, `cc_groups` select, `cc_memberships` in SQL: select, `certificate_types` select/insert, `certificates` in SQL: select, `class_subjects` select, `classes` select, `counselling_cases` in SQL: select, `counselling_referrals` in SQL: select, `discipline_actions` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` in SQL: select, `enrolments` in SQL: select, `exam_assessments` select, `exam_schemes` select, `exam_sheets` select; in SQL: select, `family_members` in SQL: select/update, `fee_concession_requests` in SQL: select, `fee_day_closes` in SQL: select, `fee_payments` in SQL: select/update, `health_events` in SQL: select, `house_members` in SQL: delete/select, `houses` select, `import_changes` in SQL: select/delete, `import_jobs` select/update/insert; in SQL: update/select, `kirti_entries` in SQL: select, `role_grants` select, `schools` select, `sibling_links` in SQL: select, `student_change_requests` in SQL: select, `student_documents` select; in SQL: select, `student_health` in SQL: select, `students` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `app.day_closed()`, `import_claim()`, `import_receipt_floor()`, `import_undo()`
- **Auth / Storage:** `auth.getUser`, `storage:imports`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Bulk import for the school's own office (data.import: principal and school admin).
  GET                                    the school's import history
  POST { dataset, fileName, fileBytes }  start an import; upload the file to the returned URL, then
                                         POST /api/admin/import/:id { action: 'uploaded' }
```

</details>

### `/api/admin/import/[id]`

- **File:** `src/app/api/admin/import/[id]/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `data.import`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/import`
- **Tables:** `account_requests` in SQL: select, `audit_log` insert, `cc_groups` select, `cc_memberships` in SQL: select, `certificate_types` select/insert, `certificates` in SQL: select, `class_subjects` select, `classes` select, `counselling_cases` in SQL: select, `counselling_referrals` in SQL: select, `discipline_actions` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` in SQL: select, `enrolments` in SQL: select, `exam_assessments` select, `exam_schemes` select, `exam_sheets` select; in SQL: select, `family_members` in SQL: select/update, `fee_concession_requests` in SQL: select, `fee_day_closes` in SQL: select, `fee_payments` in SQL: select/update, `health_events` in SQL: select, `house_members` in SQL: delete/select, `houses` select, `import_changes` in SQL: select/delete, `import_jobs` select/update; in SQL: update/select, `kirti_entries` in SQL: select, `role_grants` select, `schools` select, `sibling_links` in SQL: select, `student_change_requests` in SQL: select, `student_documents` select; in SQL: select, `student_health` in SQL: select, `students` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `app.day_closed()`, `import_claim()`, `import_receipt_floor()`, `import_undo()`
- **Auth / Storage:** `auth.getUser`, `storage:imports`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
GET one import (progress, problems, whether it can be undone).
```

</details>

### `/api/admin/leave`

- **File:** `src/app/api/admin/leave/route.ts`
- **Methods:** `PATCH`
- **Guard:** `requireAdmin` · permission `leave.approve`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/staff`
- **Tables:** `comp_off_grants` select, `leave_policies` select, `leave_requests` select/update, `notifications` insert, `role_grants` select, `schools` select, `staff_members` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Decide a leave request (school admins only).
  PATCH { id, decision: 'approve' | 'reject', note?, override? }   a rejection needs a note the teacher will see;
  approving beyond the teacher's entitlement needs override: true and a note (it's recorded on the request)
Only pending requests can be decided; the teacher is notified either way.
```

</details>

### `/api/admin/leave-policy`

- **File:** `src/app/api/admin/leave-policy/route.ts`
- **Methods:** `PUT`
- **Guard:** `requireAdmin` · permission `leave.policy`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/staff`
- **Tables:** `leave_policies` upsert/delete, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Leave entitlements for a session (leave.policy).
  PUT { session?, days: { casual: 12, sick: 10, ... } }   a blank or missing type removes its cap
```

</details>

### `/api/admin/payroll`

- **File:** `src/app/api/admin/payroll/route.ts`
- **Methods:** `GET` · `POST` (actions: `settings`, `seed_items`, `item`, `item_delete`, `template`, `template_delete`, `salary`, `salary_delete`, `pay_setting`, `adjustment`, `adjustment_delete`, `loan`, `loan_close`, `declaration`, `rate_override|rate_override_delete`, `rate_override_delete`)
- **Guard:** `requireAdmin` · permission `[...READ]`, `payroll.prepare`, `payroll.approve`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/payroll`
- **Tables:** `audit_log` insert/select, `hr_departments` select, `hr_grades` select, `loan_recoveries` select, `pay_adjustments` select/insert/delete, `pay_items` select/insert/update/delete, `pay_run_lines` select, `pay_runs` select, `payroll_settings` select/upsert, `role_grants` select, `salary_templates` select/update/insert/delete, `schools` select, `staff_exits` select, `staff_loans` select/insert/update, `staff_members` select, `staff_pay_settings` select/upsert, `staff_salaries` select/update/insert/delete, `statutory_overrides` select/delete/upsert, `statutory_rates` select, `tax_declarations` select/upsert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The standard set a school starts from; everything can be renamed, changed or switched off.
```

</details>

### `/api/admin/payroll/export`

- **File:** `src/app/api/admin/payroll/export/route.ts`
- **Methods:** `GET`
- **Guard:** `requireAdmin` · permission `[payroll.prepare, payroll.approve]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/payroll`
- **Tables:** `audit_log` insert, `pay_run_lines` select, `pay_runs` select, `role_grants` select, `schools` select, `staff_statutory` select, `statutory_overrides` select, `statutory_rates` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Exports that carry account or identity numbers, built on the server and recorded in the audit trail.
  GET ?run=&kind=bank | ecr | esi | tds        from an approved run (payroll.prepare or .approve)
  GET ?fy=2026-27&kind=tax                      the year's salary and tax statement
The register, professional tax statement and journal carry no such numbers and are made in the browser.
```

</details>

### `/api/admin/payroll/run`

- **File:** `src/app/api/admin/payroll/run/route.ts`
- **Methods:** `GET` · `POST` (actions: `compute`, `settlement`, `submit|recall|delete`, `delete`, `recall`, `send_back`, `approve`)
- **Guard:** `requireAdmin` · permission `[payroll.read, payroll.prepare, payroll.approve]`, `[payroll.prepare, payroll.approve]`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/payroll`
- **Tables:** `academic_events` select, `attendance_month_reviews` select, `audit_log` insert, `bell_periods` select, `bell_schedules` select, `comp_off_grants` select, `cover_assignments` select, `duty_assignments` select, `duty_posts` select, `duty_roster` select, `hr_departments` select, `hr_grades` select, `leave_requests` select, `loan_recoveries` select; in SQL: insert/select, `notifications` insert, `pay_adjustments` select, `pay_items` select, `pay_run_lines` select/delete/insert, `pay_runs` select/insert/update/delete; in SQL: select/update, `payroll_settings` select, `role_grants` select, `rooms` select, `sched_wings` select, `schools` select, `staff_absences` select, `staff_day_marks` select, `staff_exits` select, `staff_loans` select; in SQL: select/update, `staff_members` select, `staff_pay_settings` select, `staff_profiles` select, `staff_punches` select, `staff_salaries` select, `staff_statutory` select, `statutory_overrides` select, `statutory_rates` select, `tax_declarations` select, `timetable_slots` select, `timetable_versions` select, `users` select, `visit_sessions` select, `whatsapp_log` select/insert
- **SQL functions (rpc and nested):** `payroll_approve_run()`
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Pay runs: a month's payroll, or one person's full and final settlement.
  GET ?id=            a run with every line (payroll.read, .prepare or .approve); recorded in the audit trail
  POST { action }
    compute           { month }                 payroll.prepare. Works the month out from what is on record and saves it
                                                as a draft; run it again any time until the run is submitted.
    settlement        { exitId, leaveDays, noticeShortDays, gratuity: 'auto' | 'none' | amount }   payroll.prepare
    submit            { id }                    payroll.prepare. Sends the draft for approval.
    recall            { id }                    payroll.prepare. Takes a submitted run back to draft.
    send_back         { id, note }              payroll.approve. Back to draft, with the reason.
    approve           { id }                    payroll.approve, and not the person who submitted it. Freezes the run,
                                                books loan recoveries and tells staff their payslip is ready.
    delete            { id }                    payroll.prepare. A draft only.
```

</details>

### `/api/admin/people`

- **File:** `src/app/api/admin/people/route.ts`
- **Methods:** `GET` · `POST` (actions: `hire`, `basics`, `job`, `renewal`, `job_delete`, `probation`, `exit_start`, `exit_check|exit_withdraw|exit_complete`, `exit_check`, `exit_withdraw`, `rehire`, `link_login`, `issue_codes`, `profile|statutory|reveal`, `reveal`, `profile`)
- **Guard:** `requireAdmin` · permission `[workforce.read, hr.manage]`, `hr.manage`, `hr.sensitive`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`
- **Tables:** `audit_log` insert, `cover_assignments` in SQL: update, `hr_departments` select/update; in SQL: select; maybe: upsert, `hr_grades` select; maybe: upsert, `hr_posts` select; maybe: upsert, `hr_settings` select; in SQL: insert/update, `leave_requests` in SQL: update, `notifications` insert; maybe: upsert, `role_grants` select, `role_permissions` select, `sched_requirements` in SQL: update, `sched_wings` select; maybe: upsert, `schools` select, `staff_documents` select; in SQL: select; maybe: upsert, `staff_events` select/insert; in SQL: select; maybe: upsert, `staff_exits` select/insert/update; in SQL: select; maybe: upsert, `staff_jobs` select/update/insert/delete/upsert; in SQL: select/insert; maybe: upsert, `staff_members` select/insert/update; in SQL: select/update/delete; maybe: upsert, `staff_profiles` select; in SQL: select; maybe: upsert, `staff_qualifications` select; in SQL: select; maybe: upsert, `staff_statutory` select; in SQL: select; maybe: upsert, `timetable_slots` in SQL: update, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `app.school_today()`, `app.sync_staff_job()`, `hr_link_login()`, `hr_next_employee_code()`, `hr_reassign_reports()`, `hr_sync_jobs()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The employee master.
  GET                 the directory and the school's structure (workforce.read or hr.manage). People who only
                      hold workforce.read get names, roles and departments; hr.manage adds lifecycle, exits,
                      expiring documents and upcoming job changes; hr.sensitive adds what each record lacks.
  GET ?id=            one employee's record (hr.manage): job history, lifecycle, qualifications, documents;
                      with hr.sensitive also personal details and statutory details with numbers masked.
  POST { action }     hr.manage unless noted:
    hire              { name, category, designation, departmentId, gradeId, managerId, employment, contractFrom,
                        contractTo, joinedOn, phone, wingId, employeeCode? (blank issues the next code), probationMonths }
    basics            { id, name?, phone, employeeCode, issueCode?, joinedOn }
    job               { id, effectiveFrom, kind, reason, authority, ...job fields }     a dated job change
    job_delete        { jobId }                              undo a future-dated or the latest change
    probation         { id, op: 'set' | 'confirm', until?, on?, note }
    exit_start        { id, kind, noticeOn, lastDay, reason }
    exit_check        { exitId, key, done }
    exit_withdraw     { exitId, note }
    exit_complete     { exitId, reportsTo? }                 on or after the last day; flags the login for removal.
                                                             With direct reports, reportsTo (an employee id, or null for
                                                             nobody) says who they move to
    link_login        { id, userId }                         someone with no login was given one: join the two
    rehire            { id, on }
    issue_codes       {}                                     gives every active employee without a code the next one
    profile           { id, ...personal fields }             hr.sensitive
    statutory         { id, ...statutory fields }            hr.sensitive
    reveal            { id }                                 hr.sensitive; unmasked statutory details, audited
```

</details>

### `/api/admin/people/documents`

- **File:** `src/app/api/admin/people/documents/route.ts`
- **Methods:** `GET` · `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `hr.manage`, `hr.sensitive`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`
- **Tables:** `audit_log` insert, `role_grants` select, `schools` select, `staff_documents` select/insert/delete, `staff_members` select, `staff_qualifications` select/update/insert/delete, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:staff-docs`

<details><summary>Route doc comment</summary>

```text
What a file really is, from its first bytes (the name and the browser's type can say anything).
```

</details>

### `/api/admin/people/import`

- **File:** `src/app/api/admin/people/import/route.ts`
- **Methods:** `POST`
- **Guard:** `requireAdmin` · permission `hr.manage`, `hr.sensitive`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`
- **Tables:** `hr_departments` select/insert; maybe: upsert, `hr_grades` select/insert; maybe: upsert, `role_grants` select, `schools` select, `staff_jobs` select/update, `staff_members` select/update/insert; maybe: upsert, `staff_profiles` maybe: upsert, `staff_statutory` maybe: upsert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Bulk load of the employee master from a sheet (hr.manage; personal, statutory or bank columns need hr.sensitive).
  POST { rows: [{ line, name, employeeCode?, ... }], commit?: boolean }
Without `commit` nothing is written: every row comes back with who it matches, what it would do and what is
wrong with it. With `commit` the file is saved only if no row has a problem. A row updates the person it matches
(employee code, then login email, then a name only one person has) and otherwise adds a new person with no login.
Blank cells leave existing values alone. Logins are never created here.
```

</details>

### `/api/admin/people/structure`

- **File:** `src/app/api/admin/people/structure/route.ts`
- **Methods:** `PUT` · `DELETE`
- **Guard:** `requireAdmin` · permission `hr.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`
- **Tables:** `hr_departments` insert/select; maybe: update/delete, `hr_grades` insert/select; maybe: update/delete, `hr_posts` insert/select/delete; maybe: update/delete, `hr_settings` upsert; maybe: update/delete, `role_grants` select, `schools` select, `staff_jobs` select; maybe: update/delete, `staff_members` select; maybe: update/delete, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The school's structure (hr.manage): departments, grades with pay bands, sanctioned posts, and HR settings.
  PUT    { entity: 'department', id?, name, kind, headId?, active? }
         { entity: 'grade', id?, name, category?, payMin?, payMax?, sort?, active? }     pay bands need hr.sensitive
         { entity: 'post', id?, departmentId, gradeId?, sanctioned, note? }
         { entity: 'settings', codePrefix, codeWidth, probationMonths, noticeDays, alertDays }
  DELETE { entity: 'department' | 'grade' | 'post', id }
         A department or grade people have held is retired (kept for their history), not deleted.
```

</details>

### `/api/admin/probe`

- **File:** `src/app/api/admin/probe/route.ts`
- **Methods:** `POST` (actions: `ack|snooze`, `snooze`, `unack`, `nudge_teacher`, `request_consent`)
- **Guard:** `requireAdmin` · permission `probe.view`, `workforce.read`, `compliance.act`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/compliance`, `/admin/probe`
- **Tables:** `consents` select, `guardians` select, `notifications` select/insert, `probe_acks` upsert/delete, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Probe workflow (probe.view, plus each action's own permission).
  POST { action: 'ack', key, fingerprint, note? }                 hide until the finding gets worse
  POST { action: 'snooze', key, fingerprint, until, note? }       hide until a date
  POST { action: 'unack', key }
  POST { action: 'nudge_teacher', teacherId, message }            workforce.read; one nudge per teacher per day
  POST { action: 'request_consent', consentType, studentIds }     compliance.act; only families still missing it
```

</details>

### `/api/admin/safeguarding`

- **File:** `src/app/api/admin/safeguarding/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `[safeguarding.cases, incidents.manage, dashboard.view]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/safeguarding`
- **Tables:** `audit_log` insert, `incidents` select/update, `role_grants` select, `safeguarding_log` select/insert, `schools` select, `situations` update, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Child protection (brief 07): the Safeguarding lead's cases, or the principal's while the school has no lead.
  GET            the school's child-protection cases
  GET ?id=       one case and its steps (every look recorded)
  POST { action: 'step', id, kind, onDate, ref?, details? }
```

</details>

### `/api/admin/schedule/calendar`

- **File:** `src/app/api/admin/schedule/calendar/route.ts`
- **Methods:** `PUT` · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.academic`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `academic_events` update/select/insert/delete, `bell_schedules` select, `role_grants` select, `sched_wings` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The academic calendar (schedule.academic).
  PUT    { id?, title, kind, startsOn, endsOn, wingIds?: string[], bellScheduleId?, suspendsClasses?, staffScope?, startsAt?, endsAt?, notes? }
  DELETE { id }
A holiday suspends classes unless told otherwise; an event with a variant bell schedule swaps it in for those days.
```

</details>

### `/api/admin/schedule/compoff`

- **File:** `src/app/api/admin/schedule/compoff/route.ts`
- **Methods:** `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.workforce`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `comp_off_grants` select/insert/update, `notifications` insert, `role_grants` select, `schools` select, `staff_members` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Compensatory days, granted case by case from a duty record (schedule.workforce).
  POST   { person, days: 0.5 | 1, dutyOn, source: 'roster' | 'duty' | 'cover' | 'other', sourceId?, note }
  DELETE { id }   revoke (kept for the record; an unused day comes off the balance)
For staff with a login the days add to their Compensatory leave balance.
```

</details>

### `/api/admin/schedule/cover`

- **File:** `src/app/api/admin/schedule/cover/route.ts`
- **Methods:** `POST` (actions: `absent|release`, `absent`, `confirm|cancel`, `confirm`) · `PUT` (actions: `not_needed`) · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.academic`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `academic_events` select, `bell_periods` select, `bell_schedules` select, `comp_off_grants` select, `cover_assignments` select/delete/upsert, `duty_assignments` select, `duty_posts` select, `duty_roster` select, `leave_requests` select, `notifications` insert, `role_grants` select, `rooms` select, `sched_wings` select, `schools` select, `staff_absences` insert/select/update, `staff_members` select, `timetable_slots` select, `timetable_versions` select, `users` select, `visit_sessions` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Cover for absent teachers (schedule.academic).
  POST   { action: 'absent', person, date, portion: 'full' | 'am' | 'pm', reason? }    someone is off today
  POST   { action: 'release', person, date, periods: number[], reason }             free a teacher for some periods
  POST   { action: 'confirm' | 'cancel', id }                                         an absence (WhatsApp reports need confirming)
  PUT    { action: 'assign', date, slotIds, sub, overCap? }                           a substitute for one lesson (all sections of a combined one)
  PUT    { action: 'not_needed', date, slotIds }                                      no cover needed (half-day leave, class away)
  DELETE { date, slotIds }                                                            undo an assignment
`person` and `sub` are person keys: an account id, or "s:" + a register id. Every assignment is re-checked
here against the day's needs and who is free; the substitute is told in the app and on WhatsApp.
```

</details>

### `/api/admin/schedule/duties`

- **File:** `src/app/api/admin/schedule/duties/route.ts`
- **Methods:** `PUT` · `DELETE` · `POST`
- **Guard:** `requireAdmin` · permission `[schedule.workforce, schedule.academic]`, `schedule.workforce`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `academic_events` select, `bell_periods` select, `bell_schedules` select, `comp_off_grants` select, `cover_assignments` select, `duty_assignments` select/update/insert/delete, `duty_posts` update/select/insert/delete, `duty_roster` delete/select/insert, `leave_requests` select, `notifications` insert, `role_grants` select, `rooms` select, `sched_wings` select, `schools` select, `staff_absences` select, `staff_members` select, `timetable_slots` select, `timetable_versions` select, `users` select, `visit_sessions` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Duties.
  PUT    { entity: 'post', id?, name, kind, weekdays, startsAt, endsAt, location?, needed?, active? }        schedule.workforce
  DELETE { entity: 'post', id }                                                                          schedule.workforce
  PUT    { entity: 'roster', postId, weekday, people: PersonKey[], force? }                               schedule.workforce
         the fixed weekly roster for one post on one weekday; refuses someone teaching then unless force
  PUT    { entity: 'duty', id?, date, startsAt, endsAt, kind, title, eventId?, roomId?, person, note?, force? }
         a dated duty: invigilation needs schedule.academic, event and other duties schedule.workforce
  DELETE { entity: 'duty', id }
  POST   { entity: 'notify', weekOf }   send each person their duties for that week (WhatsApp / in-app)  schedule.workforce
```

</details>

### `/api/admin/schedule/setup`

- **File:** `src/app/api/admin/schedule/setup/route.ts`
- **Methods:** `PUT` · `POST` · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.academic`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `academic_events` select; maybe: delete, `bell_periods` delete/insert; maybe: delete, `bell_schedules` select/update/insert; maybe: delete, `role_grants` select, `rooms` update/insert; maybe: delete, `sched_wings` select/update/insert; maybe: delete, `schools` select, `timetable_slots` select; maybe: delete, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Wings, bell schedules and rooms (schedule.academic).
  PUT    { entity: 'wing', id?, name, gradeFrom, gradeTo }
  PUT    { entity: 'bell', id?, name, wingId?, kind: 'regular' | 'variant', weekdays: number[], periods: BellPeriod[] }
         the periods replace the schedule's rows wholesale
  PUT    { entity: 'room', id?, name, kind, capacity?, homeClass?, active? }
  POST   { entity: 'starter' }   a typical CBSE day (Mon-Fri 8 periods, Saturday half day) when the school has no bells yet
  DELETE { entity, id }
```

</details>

### `/api/admin/schedule/solver`

- **File:** `src/app/api/admin/schedule/solver/route.ts`
- **Methods:** `PUT` · `POST` (actions: `fill`, `save`) · `DELETE`
- **Guard:** `requireAdmin` · permission `[schedule.academic, schedule.workforce]`, `schedule.academic`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/schedule`
- **Tables:** `bell_schedules` select, `role_grants` select, `rooms` select, `sched_requirements` update/insert/select/delete, `sched_solver_settings` upsert, `sched_wings` select, `schools` select, `staff_members` select, `teacher_load_rules` select/update/insert/delete, `timetable_slots` insert, `timetable_versions` insert/select/delete, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The auto-solver's inputs, and saving what it built.
  PUT  { entity: 'settings', defaultTargetPerWeek, defaultMaxPerDay, defaultMaxConsecutive, classTeacherFirst, subjectSpread }  (schedule.academic)
  PUT  { entity: 'requirement', id?, session?, class, subject, groupLabel?, teacher?, periodsPerWeek, doubles?, roomKind?, roomId?, maxPerDay?, combinedKey?, notes? }  (schedule.academic)
  PUT  { entity: 'rule', person, targetPerWeek?, maxPerDay?, maxPerWeek?, maxConsecutive?, unavailable? }  (schedule.academic or schedule.workforce)
  POST { action: 'fill', session?, rows: [requirement...], replace?: boolean }   a whole sheet at once (replace clears the session's first)
  POST { action: 'save', name, session?, lessons: Slot[] (with locked), report }  the solver's timetable as a new draft
  DELETE { entity: 'requirement' | 'rule', id }
The solver itself runs in the browser; the server checks what it saves (staff, rooms, clashes) like any import.
```

</details>

### `/api/admin/schedule/staff`

- **File:** `src/app/api/admin/schedule/staff/route.ts`
- **Methods:** `PUT` · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.workforce`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `role_grants` select, `sched_wings` select, `schools` select, `staff_members` update/select/insert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The staff register (schedule.workforce): everyone who works at the school, including
support staff with no login. A row can link a teacher or office account for its details.
  PUT    { id?, userId?, name, category, designation?, wingId?, phone?, employeeCode?, joinedOn?, active?,
           employment?: 'permanent' | 'contract' | 'visiting', contractFrom?, contractTo?, whatsappOptIn? }
         WhatsApp consent is only for staff with no login (accounts link WhatsApp themselves) and needs a phone.
  DELETE { id }   takes someone off the active register (kept for the record)
```

</details>

### `/api/admin/schedule/timetable`

- **File:** `src/app/api/admin/schedule/timetable/route.ts`
- **Methods:** `POST` (actions: `create`, `import`, `publish`, `archive`) · `PATCH` · `PUT` (actions: `cell`, `lock`, `swap`) · `DELETE`
- **Guard:** `requireAdmin` · permission `schedule.academic`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `bell_schedules` select, `course_plans` select/update/insert, `notifications` insert, `role_grants` select, `rooms` select/insert, `sched_wings` select, `schools` select, `staff_members` select, `timetable_slots` select/insert/delete/update, `timetable_versions` select/insert/delete/update, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Timetable versions and their lessons (schedule.academic).
  POST   { action: 'create', name, session?, copyFrom? }          a new draft, empty or copied from another version
  POST   { action: 'import', name, slots: Slot[] (room_name for new rooms), newRooms: [{ name, kind }] }
  POST   { action: 'publish', id, effectiveFrom }                  refuses while there are clashes; sets pacing; tells each teacher
  POST   { action: 'archive', id }                                 retire a published timetable
  PATCH  { action: 'rename', id, name, notes? }
  PUT    { action: 'cell', versionId, class, weekday, period_no, lessons: [{ group_label, subject, teacher_id, room_id, combined }] }
         replaces what one section has in one period (lessons: [] clears it)
  PUT    { action: 'swap', versionId, class, a: { weekday, period_no }, b: { weekday, period_no } }   drag and drop within a section
  PUT    { action: 'lock', versionId, class, weekday, period_no, locked }  keep a period's lessons where they are when re-solving
  DELETE { id }                                                    a draft only
Lessons live only in drafts; a published timetable changes by copying it to a new draft.
```

</details>

### `/api/admin/schedule/visits`

- **File:** `src/app/api/admin/schedule/visits/route.ts`
- **Methods:** `PUT` · `DELETE`
- **Guard:** `requireAdmin` · permission `[schedule.academic, schedule.workforce]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`
- **Tables:** `role_grants` select, `schools` select, `staff_members` select, `timetable_slots` select, `users` select, `visit_sessions` select/update/insert/delete
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
A visiting teacher's sessions (schedule.academic or schedule.workforce), for per-session pay.
  PUT    { staffMemberId, date, slotId, status: 'taken' | 'missed', note? }   confirm one timetabled session
  DELETE { id }                                                              undo a confirmation
```

</details>

### `/api/admin/students`

- **File:** `src/app/api/admin/students/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `students.read`, `students.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/students`
- **Tables:** `admission_applicants` select, `admission_documents` select/update, `audit_log` insert, `classes` select; in SQL: select, `doc_counters` in SQL: insert, `enrolments` select; in SQL: select/update/insert, `family_members` insert, `role_grants` select, `schools` select; in SQL: select, `student_documents` insert/select, `students` select/insert; in SQL: select, `users` select
- **SQL functions (rpc and nested):** `app.grade_from_class()`, `app.grade_of()`, `app.move_enrolment()`, `app.next_admission_no()`, `app.norm_class()`, `app.section_from_class()`, `app.session_of()`, `app.session_start_month()`, `student_move()`, `student_next_admission_no()`
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
The student register (Admin › Students).
  GET ?search=&cls=&status=active|left|cancelled|all&page=   the register with each student's class this session (students.read)
  POST { fields, admissionNo?, aadhaar?, noAadhaar?, className, applicantId? }   admit a student (students.manage)
```

</details>

### `/api/admin/students/[id]`

- **File:** `src/app/api/admin/students/[id]/route.ts`
- **Methods:** `GET` · `POST` (actions: `reveal`)
- **Guard:** `requireAdmin` · permission `students.read`, `[students.manage, students.aadhaar]`, `students.aadhaar`, `students.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/students/[id]`
- **Tables:** `audit_log` insert, `classes` select; in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` select/update/insert/delete, `enrolments` select/update; in SQL: select/update/insert, `family_members` select/update/insert/delete, `role_grants` select, `schools` select; in SQL: select, `sibling_links` select/update/insert, `student_change_requests` select, `student_changes` select/insert; in SQL: insert, `students` select/update; in SQL: select/update, `users` select/update
- **SQL functions (rpc and nested):** `app.admission_floor()`, `app.grade_from_class()`, `app.grade_of()`, `app.move_enrolment()`, `app.norm_class()`, `app.section_from_class()`, `app.session_of()`, `app.session_start_month()`, `student_correct()`, `student_move()`
- **Auth / Storage:** `auth.admin.updateUserById`, `auth.getUser`, `storage:student-photos`

<details><summary>Route doc comment</summary>

```text
One student's record.
  GET                                   register entry (Aadhaar masked), enrolment history, corrections (students.read)
  POST { action }:
    correct { fields, admissionNo?, aadhaar?, noAadhaar?, reason }    students.manage
    cancel { reason }                                                 students.manage (entries without a login)
    left { on?, reason } | rejoin { className, on? }                  students.manage
    move { className, from, reason }                                  students.manage (mid-year)
    roll { rollNo }                                                   students.manage
    photo-url { ext } | photo-set { path }                            students.manage
    reveal { why }                                                    students.aadhaar (recorded)
    family-save { member, memberId? } | family-remove { memberId }     students.manage
    emergency { list: [{ familyMemberId } | { name, relation, phone }] } up to 3, in calling order
    sibling { otherId, decision: confirmed | rejected }               students.manage
```

</details>

### `/api/admin/students/[id]/documents`

- **File:** `src/app/api/admin/students/[id]/documents/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `[students.read, health.read]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/health`, `/admin/students/[id]`, `/admin/students`
- **Tables:** `audit_log` insert, `enrolments` select, `role_grants` select, `schools` select, `student_documents` select/insert/update/delete, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
One student's documents (brief 04). Register readers see every kind but medical and disability ones, which need
health.read. The registrar (students.manage) adds, checks and removes them; the health officer (health.manage)
the medical ones.
  GET                                                    documents, the checklist for the student's class
  POST { action }:
    upload-url { kind, fileName, fileBytes }             a one-time upload link (up to 25 MB, any type)
    upload-done { path, kind, title?, document_no?, issued_on?, valid_until?, fileName, verified? }
                                                         verified: the office saw the original
    open { docId }                                       a two-minute link (recorded)
    verify { docId } | reject { docId, note }            the check against the original
    remove { docId, reason }                             an upload made by mistake (recorded)
```

</details>

### `/api/admin/students/[id]/health`

- **File:** `src/app/api/admin/students/[id]/health/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `[health.read, students.read]`, `health.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/health`, `/admin/students/[id]`
- **Tables:** `audit_log` insert, `consents` in SQL: select, `health_events` select/insert/delete, `role_grants` select, `schools` select, `student_health` select/update/insert, `students` select; in SQL: select, `users` select
- **SQL functions (rpc and nested):** `health_consented()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
One student's health record.
  GET    health.read: the whole record (the look is recorded); students.read: the UDISE+ part only
  POST   health.manage { action }:
    card { blood_group, height_cm, ..., allergies, conditions, medication }   consented parts need the parent's consent
    event-add { kind, on_date, data, note } | event-remove { eventId }
    flags { keep?, hold? }   keep after leaving / legal hold (stop the retention erasure)
```

</details>

### `/api/admin/students/applicants`

- **File:** `src/app/api/admin/students/applicants/route.ts`
- **Methods:** `GET`
- **Guard:** `requireAdmin` · permission `students.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/students`
- **Tables:** `admission_applicants` select, `admission_documents` select, `role_grants` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET — applicants marked enrolled who aren't on the register yet, to pre-fill an admission (students.manage).
```

</details>

### `/api/admin/students/requests`

- **File:** `src/app/api/admin/students/requests/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireAdmin` · permission `[students.read, compliance.act, health.read]`, `[students.manage, compliance.act]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/health`, `/admin/students`
- **Tables:** `audit_log` insert, `consents` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` select/update/insert/delete, `family_members` select/update/insert, `role_grants` select, `schools` select; in SQL: select, `student_change_requests` select/update, `student_changes` in SQL: insert, `student_documents` select/delete, `student_health` select/update/insert, `students` select; in SQL: select/update, `users` select
- **SQL functions (rpc and nested):** `app.admission_floor()`, `health_consented()`, `student_correct()`
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Which requests this person decides: the registrar all of them; the DPO the erasure requests.
```

</details>

### `/api/admin/students/settings`

- **File:** `src/app/api/admin/students/settings/route.ts`
- **Methods:** `GET` · `POST` (actions: `numbering`, `session-start`, `open-session`, `checklist`)
- **Guard:** `requireAdmin` · permission `[students.read, session.manage]`, `[students.manage, session.manage]`, `students.manage`, `session.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/students`
- **Tables:** `audit_log` insert, `doc_counters` select, `enrolments` select; in SQL: select, `role_grants` select, `schools` select/update; in SQL: select, `students` in SQL: select, `users` select; in SQL: update
- **SQL functions (rpc and nested):** `app.current_session()`, `app.school_today()`, `app.session_of()`, `app.session_start_month()`, `app.sync_student_login()`, `student_sync_school()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Register settings.
  GET                                         numbering, roll-number rule, session (students.read); what blocks the next session (session.manage)
  POST { action }:
    numbering { prefix, pad, rollRule }       students.manage
    session-start { month }                   session.manage (school admin)
    open-session { override? }                session.manage: every class promoted, or a reason
    checklist { list: [{ kind, from, to }] }  session.manage: the documents asked for at admission, per class
```

</details>

### `/api/admin/students/siblings`

- **File:** `src/app/api/admin/students/siblings/route.ts`
- **Methods:** `GET`
- **Guard:** `requireAdmin` · permission `[students.read, fees.concession.request]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/fees`
- **Tables:** `role_grants` select, `schools` select, `sibling_links` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET ?user=<student login id> — the student's confirmed siblings at this school (for fee concessions).
```

</details>

### `/api/admin/students/year`

- **File:** `src/app/api/admin/students/year/route.ts`
- **Methods:** `GET` · `POST` (actions: `approve|return`)
- **Guard:** `requireAdmin` · permission `[students.read, outcomes.approve]`, `[outcomes.approve, students.manage]`, `outcomes.approve`, `students.manage`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/students`
- **Tables:** `audit_log` insert, `classes` select; in SQL: select, `enrolments` select/update; in SQL: select/update/insert, `report_cards` select, `role_grants` select, `schools` select; in SQL: select, `students` in SQL: select/update, `users` select
- **SQL functions (rpc and nested):** `app.grade_from_class()`, `app.grade_of()`, `app.move_enrolment()`, `app.norm_class()`, `app.section_from_class()`, `app.session_ends()`, `app.session_of()`, `app.session_start_month()`, `app.session_starts()`, `student_promote()`, `student_renumber()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Year end in the office.
  GET                 every class this session and where its outcomes stand (students.read or outcomes.approve)
  GET ?cls=           one class, student by student, with each report card result
  POST { action, cls }:
    approve { items: [{ id }] } | return { items, note }            outcomes.approve (principal)
    finalise { items: [{ id, outcome?, note? }] } | reopen { items } students.manage (registrar); a changed outcome needs a note
    promote { toClass, sameClass? }                                 students.manage: every outcome final
    publish                                                         students.manage: to the student and parent portals
```

</details>

### `/api/admin/subjects`

- **File:** `src/app/api/admin/subjects/route.ts`
- **Methods:** `GET` · `POST` (actions: `electives`, `leads`)
- **Guard:** `requireAdmin` · permission `[academics.read, people.manage]`, `[people.manage, schedule.academic]`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** No caller found in src/, site/ or qa/
- **Tables:** `assignments` maybe: select, `audit_log` insert; maybe: select, `class_subjects` select; maybe: select, `classes` select; maybe: select, `course_plans` maybe: select, `lesson_plans` maybe: select, `role_grants` select, `schools` select, `student_subjects` select/delete/upsert; maybe: select, `subject_leads` select/delete/insert; maybe: select, `syllabus_progress` maybe: select, `teacher_subjects` select; maybe: select, `timetable_slots` maybe: select, `users` select; maybe: select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The school's subject links, for its own office.
  GET  what each class offers, who teaches it, electives, leads (academics.read or people.manage)
  POST { action: 'electives', classId, choices } | { action: 'leads', subjectKey, userIds }
       (people.manage or schedule.academic: school admin, principal, academic coordinator)
What a class offers stays with Sthara (set up in ops with the class list); the school
chooses electives per student and names subject leads.
```

</details>

### `/api/admin/support`

- **File:** `src/app/api/admin/support/route.ts`
- **Methods:** `GET` · `POST` (actions: `new`, `reply`, `close`)
- **Guard:** `requireAdmin`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/support`
- **Tables:** `ops_accounts` select, `ops_case_messages` select/insert, `ops_cases` select/insert/update, `ops_operators` select, `ops_picklists` select, `ops_sla_policies` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Help and support for a school's office: raise a case with Sthara and follow it. Any office account may use it,
and everyone in the office sees the school's cases (so a colleague can pick one up). Sthara's internal notes
and deadlines are never included.
  GET            the school's cases, newest first, with what the form needs
  GET ?id=       one case with its conversation
  POST { action: 'new', subject, description, category, urgency }
       { action: 'reply', id, body }
       { action: 'close', id }        the school confirms a resolved case is done
```

</details>

### `/api/admin/users`

- **File:** `src/app/api/admin/users/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/directory`
- **Tables:** `guardians` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/admin/users?schoolId=xxx
Fetches all users for a school using service role (bypasses RLS).
Requires admin role.
```

</details>

### `/api/admin/users/assignments`

- **File:** `src/app/api/admin/users/assignments/route.ts`
- **Methods:** `PUT`
- **Guard:** `requireAdmin` · permission `people.manage`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/directory`
- **Tables:** `assignments` in SQL: update, `audit_log` insert, `class_subjects` select; in SQL: select, `classes` select; in SQL: select, `course_plans` in SQL: update/select, `cover_assignments` in SQL: update, `lesson_plans` in SQL: update, `materials` in SQL: update, `role_grants` select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `schools` select, `situations` in SQL: update, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select, `teacher_subjects` select/delete/upsert; in SQL: select, `timetable_slots` in SQL: update, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select/update; in SQL: select/update, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `app.norm_class()`, `app.relabel_timetable_subject()`, `app.sync_teacher_assignments()`, `ops_rename_class_subject()`, `ops_resync_teacher()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
A teacher's classes and subjects, set by the school (people.manage: school admin, principal).
  PUT { userId, subjects: [{ class, subject }], classTeacherOf? }
Only sections already on the school's class list (Sthara sets those up with the school, in ops); a section that
isn't there is refused with the names, so the school can ask Sthara to add it.
```

</details>

## Area attendance

1 route files.

### `/api/attendance/device`

- **File:** `src/app/api/attendance/device/route.ts`
- **Methods:** `POST`
- **Guard:** `rate-limit` + `device-token`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`, Biometric attendance devices (per-school device token)
- **Tables:** `attendance_devices` select/update, `staff_members` select, `staff_punches` select/insert

<details><summary>Route doc comment</summary>

```text
Biometric devices push punches here (set up per school under Schedule > Attendance > Devices).
  POST  Authorization: Bearer <device token>
        { punches: [{ code: "E104", at: "2026-10-05 07:52" | ISO timestamp, direction?: "in" | "out" }] }   up to 1000
Times without a zone are school-local (IST). Codes are matched to employee codes on the staff register.
NOTE (cloud setup, pending): most Indian devices (eSSL, ZKTeco, Realtime) push through their vendor cloud or the
ZKTeco "ADMS" protocol (GET/POST /iclock/cdata with tab-separated ATTLOG lines), not this JSON. When a school's
vendor cloud is chosen, add a small adapter route that translates its webhook (or ADMS ATTLOG lines) into this
shape and calls importPunches. Until then schools upload the device's export on the attendance board.
```

</details>

## Area auth

1 route files.

### `/api/auth/verify-school`

- **File:** `src/app/api/auth/verify-school/route.ts`
- **Methods:** `POST`
- **Guard:** `rate-limit` + `public`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/login`
- **Tables:** `schools` select

<details><summary>Route doc comment</summary>

```text
POST /api/auth/verify-school — the first step of sign-in.
Body: { schoolCode }
Returns { valid: true, schoolId, name, type } or { valid: false, error }.
Looks the code up in schools.settings->>'code'. A suspended school is
refused here, before anyone types a password. Rate limited per IP so codes
can't be enumerated quickly.
```

</details>

## Area contact

1 route files.

### `/api/contact`

- **File:** `src/app/api/contact/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `turnstile` + `public`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 30`
- **Called by:** Marketing site enquiry form (site/enquiry-form.js)
- **Tables:** none

<details><summary>Route doc comment</summary>

```text
Enquiry form on the marketing site (site/). Reuses the site's own handler
(site/api/contact.mjs, covered by site/tests): same-origin check, honeypot,
validation, per-instance rate limit. Each enquiry is saved to public.enquiries
(Sthara's database) and worked in /ops/enquiries. Cloudflare Turnstile and
email via Resend switch on by themselves once their env variables are set
(site/.env.example); a saved enquiry succeeds even if that email fails.
This file only bridges Next's Request to the handler's Node-style API.
```

</details>

## Area cron

1 route files.

### `/api/cron/attendance`

- **File:** `src/app/api/cron/attendance/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `CRON_SECRET`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** No scheduler configured in the repo (route doc: "pending setup"); the same check also runs when the cover or attendance board is opened
- **Tables:** none

<details><summary>Route doc comment</summary>

```text
The no-show check for every school, for a scheduler to call every 15 minutes on school mornings.
  GET/POST  Authorization: Bearer <CRON_SECRET>
Scheduling (pending setup): Vercel Cron needs a Pro plan for more than one run a day; alternatively Supabase
pg_cron + pg_net can call this URL. Until one is set up, the check runs whenever someone opens the cover board
or the attendance board, so alerts still go out once the office is in.
```

</details>

## Area errors

1 route files.

### `/api/errors`

- **File:** `src/app/api/errors/route.ts`
- **Methods:** `POST`
- **Guard:** `rate-limit` + `session-cookie(optional)`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher (layout)`
- **Tables:** `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/errors — errors from the browser (window errors, unhandled promise rejections, error boundaries).
  { kind: 'client' | 'render' | 'unhandled', message, stack?, path?, digest? }
Same-origin only, size-capped and rate-limited per address. The signed-in user (from the session cookie) and
their school are attached when there is one. Always answers 204, so a page never learns more than "sent".
```

</details>

## Area feed

1 route files.

### `/api/feed`

- **File:** `src/app/api/feed/route.ts`
- **Methods:** `POST` (actions: `scan`, `ack`)
- **Guard:** `requireFeedCaller`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/ask`, `/admin/feed`, `/teacher/ask`, `/teacher/feed`
- **Tables:** `academic_events` select, `assignments` select, `attendance` select, `bell_periods` select, `bell_schedules` select, `comp_off_grants` select, `cover_assignments` select, `duty_assignments` select, `duty_posts` select, `duty_roster` select, `incidents` select, `leave_requests` select, `notifications` insert, `proctor_alerts` select, `role_grants` select, `rooms` select, `sched_wings` select, `school_threads` select, `schools` select, `situations` select/upsert/update, `staff_absences` select, `staff_members` select, `staff_punches` select, `submissions` select, `timetable_slots` select, `timetable_versions` select, `tml_scores` select, `users` select, `visit_sessions` select, `wellness_logs` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
POST /api/feed
  { action: 'scan' }             run the school's detectors and due escalations (throttled; idempotent)
  { action: 'ack', id, note? }   acknowledge an item you can see, with an optional note
Reads go through row-level security on public.situations from the client.
```

</details>

## Area grading

1 route files.

### `/api/grading/pages`

- **File:** `src/app/api/grading/pages/route.ts`
- **Methods:** `POST` · `GET`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/homework/[id]`, `/teacher/homework`, `/teacher/quiz`
- **Tables:** `assignments` select, `guardians` select, `schools` select, `submissions` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:(bucket)`, `storage:captures`

<details><summary>Route doc comment</summary>

```text
POST /api/grading/pages  (multipart: file, assignmentId, studentId, n)
One photographed page into the private "captures" bucket. The student
uploads their own; a teacher of the class uploads for any student on the
roster. The browser has already compressed it to a JPEG. Returns { path }.
```

</details>

## Area health

1 route files.

### `/api/health`

- **File:** `src/app/api/health/route.ts`
- **Methods:** `GET`
- **Guard:** `public`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** GitHub Actions watchdog (.github/workflows/watchdog.yml → scripts/watchdog.mjs), every 5 min
- **Tables:** `schools` select

<details><summary>Route doc comment</summary>

```text
GET /api/health
Uptime/availability probe for external monitoring (Vercel, UptimeRobot,
a status page, etc). Checks the app server itself plus a lightweight
Supabase round-trip, so a paused/unreachable database shows up here
instead of only surfacing as scattered "Failed to fetch" errors downstream.
```

</details>

## Area homework

1 route files.

### `/api/homework/grade`

- **File:** `src/app/api/homework/grade/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/student/homework/[id]`
- **Tables:** `assignments` select, `platform_config` select, `schools` select, `submission_items` delete, `submissions` select/insert/update, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:captures`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/homework/grade { assignmentId, pages: [path] }
A student hands in photographed work (pages uploaded first via
/api/grading/pages). The AI reads it and suggests marks for the teacher;
the student sees "submitted" until the teacher confirms.
```

</details>

## Area import

1 route files.

### `/api/import/worker`

- **File:** `src/app/api/import/worker/route.ts`
- **Methods:** `POST`
- **Guard:** `worker-secret`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** pg_cron job "import-worker" via pg_net, every minute while a job waits, In-process kick() from the import routes (lib/import/server.ts)
- **Tables:** `account_requests` in SQL: select, `audit_log` insert, `cc_groups` select, `cc_memberships` in SQL: select, `certificate_types` select/insert, `certificates` in SQL: select, `class_subjects` select, `classes` select, `counselling_cases` in SQL: select, `counselling_referrals` in SQL: select, `discipline_actions` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` in SQL: select, `enrolments` in SQL: select, `exam_assessments` select, `exam_schemes` select, `exam_sheets` select; in SQL: select, `family_members` in SQL: select/update, `fee_concession_requests` in SQL: select, `fee_day_closes` in SQL: select, `fee_payments` in SQL: select/update, `health_events` in SQL: select, `house_members` in SQL: delete/select, `houses` select, `import_changes` in SQL: select/delete, `import_jobs` update; in SQL: update/select, `kirti_entries` in SQL: select, `schools` select, `sibling_links` in SQL: select, `student_change_requests` in SQL: select, `student_documents` select; in SQL: select, `student_health` in SQL: select, `students` select, `users` in SQL: select
- **SQL functions (rpc and nested):** `app.day_closed()`, `import_claim()`, `import_receipt_floor()`, `import_undo()`
- **Auth / Storage:** `storage:imports`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
POST /api/import/worker — moves waiting bulk imports one step. Called once a minute by pg_cron + pg_net while a
job waits (see the bulk_import migration), with the shared secret in x-worker-secret (IMPORT_WORKER_SECRET).
Requests from the app kick the worker in-process instead, so imports run even before the secret is set.
```

</details>

## Area me

Signed-in self (`/api/me`). 4 route files.

### `/api/me/attendance`

- **File:** `src/app/api/me/attendance/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/schedule`, `/teacher/schedule`
- **Tables:** `attendance_settings` select, `role_grants` select, `schools` select, `staff_punches` insert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
A position fix rougher than this (or the campus radius, if larger) can't say whether someone is on campus.
```

</details>

### `/api/me/employee`

- **File:** `src/app/api/me/employee/route.ts`
- **Methods:** `GET`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`, `/teacher/record`
- **Tables:** `hr_departments` select, `hr_grades` select, `role_grants` select, `schools` select, `staff_documents` select, `staff_events` select, `staff_jobs` select; in SQL: select, `staff_members` select; in SQL: select/update, `staff_profiles` select, `staff_qualifications` select, `staff_statutory` select, `users` select
- **SQL functions (rpc and nested):** `app.school_today()`, `app.sync_staff_job()`, `hr_sync_jobs()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
My record: what the school holds about the signed-in teacher or office account. Read-only (HR keeps the
record); account and bank numbers come back masked to their last four characters.
```

</details>

### `/api/me/payslips`

- **File:** `src/app/api/me/payslips/route.ts`
- **Methods:** `GET`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/people`, `/teacher/record`
- **Tables:** `pay_run_lines` select, `role_grants` select, `schools` select, `staff_members` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
My payslips: the signed-in teacher's or office account's own approved pay lines, newest first, and one in full
with ?id=. Nobody else's, and nothing from a run that isn't approved.
```

</details>

### `/api/me/report-cards`

- **File:** `src/app/api/me/report-cards/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/results`, `/student/results`
- **Tables:** `guardians` select, `report_cards` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/me/report-cards — published report cards for a student (their own) or a parent (each verified child).
Only the latest version of each term's card. A card the school is holding comes back without its content.
```

</details>

## Area ops

Platform Manager (`/api/ops`). 39 route files.

### `/api/ops/audit`

- **File:** `src/app/api/ops/audit/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/audit`
- **Tables:** `audit_log` select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `settings_changes` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/audit?source=console|data&school=&from=YYYY-MM-DD&to=YYYY-MM-DD&q=&page=&export=1
  console: every change made in this console (settings_changes), with who and why.
  data:    the database audit trail (audit_log): grades, roles, consent, guardians, fees, settings.
Newest first, 200 a page with the total matching. `q` searches setting, reason and who (console) or table,
action, record id, role and the name or email of who made it (data). export=1 returns every matching row (up to
20,000, with capped: true when there were more) for the CSV.
Dates are IST days, inclusive.
```

</details>

### `/api/ops/delivery`

- **File:** `src/app/api/ops/delivery/route.ts`
- **Methods:** `GET` · `POST` (actions: `run`, `resend`)
- **Guard:** `operatorFor` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/delivery`
- **Tables:** `academic_events` select, `ai_usage` select, `attendance_devices` select, `attendance_month_reviews` select, `attendance_settings` select, `audit_log` insert, `bell_schedules` select, `fee_reminders` select, `leave_requests` select, `notifications` select/insert, `ops_accounts` select, `ops_job_runs` select/insert, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `role_grants` select, `role_permissions` select, `schools` select, `shift_overrides` select, `shifts` select, `staff_absences` select, `staff_day_marks` select, `staff_members` select, `staff_noshow_alerts` select/insert, `staff_punches` select, `staff_shift_plans` select, `superadmins` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **SQL functions (rpc and nested):** `ops_jobs()`, `ops_migrations()`
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
GET /api/ops/delivery?since=15m|1h|6h|24h|7d&school= — what the platform sent and ran:
  ai        every model call in the period by feature (failures, rate limits, latency) and the latest failures
  whatsapp  the message log without message text: direction, kind, status, error, the number's last four digits
  inApp     in-app notifications and fee reminders by kind
  jobs      the database scheduler's jobs and runs, and the app's own jobs
  platform  the release this server runs and the migrations the database has
```

</details>

### `/api/ops/desk`

- **File:** `src/app/api/ops/desk/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/desk`
- **Tables:** `ops_accounts` select, `ops_case_messages` insert, `ops_cases` select/insert, `ops_operators` select, `ops_picklists` select, `ops_sla_policies` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/desk?queue=mine|unassigned|open|breaching|waiting|resolved|all&school=&q=
The service desk: the cases in a queue (most pressing first), how many sit in each queue, and what the
forms need (categories, operators who work the desk, the schools in sight). Operators who work a territory
get its schools' cases only.
```

</details>

### `/api/ops/desk/[id]`

- **File:** `src/app/api/ops/desk/[id]/route.ts`
- **Methods:** `GET` · `PATCH` · `POST` (actions: `message`, `link`, `unlink`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/desk/[id]`
- **Tables:** `notifications` insert, `ops_access_grants` select, `ops_accounts` select, `ops_canned_replies` select, `ops_case_links` select/insert/delete, `ops_case_messages` select/insert, `ops_cases` select/update, `ops_contacts` select, `ops_operators` select, `ops_picklists` select, `ops_sla_policies` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The case, if it exists and its school is in the operator's sight.
```

</details>

### `/api/ops/desk/settings`

- **File:** `src/app/api/ops/desk/settings/route.ts`
- **Methods:** `GET` · `POST` (actions: `canned`, `canned-remove`, `sla`, `pick`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/desk/settings`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_canned_replies` select/update/insert/delete, `ops_operators` select, `ops_picklists` select/upsert, `ops_sla_policies` select/upsert, `ops_territories` select, `ops_territory_members` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/desk/settings — deadlines per priority, the two configurable lists, and the canned replies.
```

</details>

### `/api/ops/enquiries`

- **File:** `src/app/api/ops/enquiries/route.ts`
- **Methods:** `GET` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/enquiries`
- **Tables:** `audit_log` insert, `enquiries` select/update, `ops_accounts` select, `ops_campaigns` select, `ops_operators` select, `ops_opportunities` select, `ops_territories` select, `ops_territory_members` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/enquiries — website enquiries, newest first, with their territory and owner.
Operators who work a territory get the enquiries placed in it (or owned by them or their reports);
enquiries nobody has placed yet reach only the roles that see everything.
```

</details>

### `/api/ops/errors`

- **File:** `src/app/api/ops/errors/route.ts`
- **Methods:** `GET` · `POST` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/errors`
- **Tables:** `app_error_groups` select/update, `app_errors` select; in SQL: select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **SQL functions (rpc and nested):** `ops_error_stats()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/errors?range=24h&status=open&source=server  — error groups seen in the range, busiest first, each with
  its hourly counts over the last 24 hours and how many schools and people it reached in the range.
GET /api/ops/errors?fingerprint=…  — one group and its latest 50 occurrences (stack, route, school, person, browser).
Operators only (404 for everyone else).
```

</details>

### `/api/ops/health`

- **File:** `src/app/api/ops/health/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/health`
- **Tables:** `audit_log` in SQL: select, `classes` in SQL: select, `ops_accounts` select, `ops_activities` in SQL: select, `ops_cases` in SQL: select, `ops_contacts` in SQL: select, `ops_operators` select, `ops_tasks` in SQL: select, `ops_territories` select, `ops_territory_members` select, `platform_config` select, `role_grants` select, `schools` select; in SQL: select, `superadmins` select; in SQL: select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `ops_platform_health()`, `ops_registry_counts()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/health — every load-bearing check (keys, runtime, database, schools, limits) and its status.
```

</details>

### `/api/ops/marketing`

- **File:** `src/app/api/ops/marketing/route.ts`
- **Methods:** `GET` · `POST` (actions: `campaign`, `spend`, `spend-remove`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/marketing`, `/ops/pipeline/[id]`
- **Tables:** `audit_log` insert; maybe: select, `enquiries` select; maybe: select, `ops_accounts` select, `ops_campaigns` select/update/insert; maybe: select, `ops_marketing_spend` select/insert/delete; maybe: select, `ops_operators` select, `ops_opportunities` select; maybe: select, `ops_opportunity_stages` select, `ops_territories` select, `ops_territory_members` select, `schools` select; maybe: select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/marketing — every campaign with what was spent, the leads and deals it brought, what a lead and a won
school cost, and the value won per rupee; the spend log; and leads and wins by source. Company-wide figures:
they are not cut by territory.
```

</details>

### `/api/ops/me`

- **File:** `src/app/api/ops/me/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `operatorFor` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/account`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `superadmins` select, `users` select/update
- **Auth / Storage:** `auth.admin.updateUserById`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/me — the signed-in operator: email, role, and whether they are still on a temporary password.
```

</details>

### `/api/ops/operators`

- **File:** `src/app/api/ops/operators/route.ts`
- **Methods:** `GET` · `POST` (actions: `reset-password`) · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/operators`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_operators` select/insert/update, `ops_territories` select/update, `ops_territory_members` select/delete/insert, `superadmins` select, `users` select/update/insert/delete
- **Auth / Storage:** `auth.admin.createUser`, `auth.admin.deleteUser`, `auth.admin.getUserById`, `auth.admin.updateUserById`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/operators — everyone who can open this console: role, reporting line, territories and sign-in activity.
Directors come from users.role = 'superadmin' / public.superadmins; every other role from public.ops_operators.
```

</details>

### `/api/ops/overview`

- **File:** `src/app/api/ops/overview/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops`
- **Tables:** `account_requests` select, `admission_events` in SQL: select, `ai_usage` in SQL: select, `app_error_groups` select, `app_errors` in SQL: select, `assignments` in SQL: select, `attendance` in SQL: select, `audit_log` in SQL: select, `class_subjects` in SQL: select, `classes` select; in SQL: select, `consents` in SQL: select, `enquiries` select, `fee_invoices` in SQL: select, `fee_payments` in SQL: select, `fee_structures` in SQL: select, `guardians` in SQL: select, `incidents` in SQL: select, `leave_requests` in SQL: select, `lesson_plans` in SQL: select, `materials` in SQL: select, `ops_accounts` select, `ops_activities` in SQL: select, `ops_cases` select; in SQL: select, `ops_contacts` in SQL: select, `ops_discount_limits` select, `ops_operators` select, `ops_opportunities` select, `ops_opportunity_stages` select, `ops_quotes` select, `ops_tasks` in SQL: select, `ops_territories` select, `ops_territory_members` select, `platform_config` select, `role_grants` select, `school_messages` in SQL: select, `schools` select; in SQL: select, `settings_changes` select, `situations` in SQL: select, `student_chats` in SQL: select, `student_subjects` in SQL: select, `students` in SQL: select, `subject_leads` in SQL: select, `submission_items` in SQL: select, `submissions` in SQL: select, `superadmins` select; in SQL: select, `syllabus_progress` in SQL: select, `teacher_subjects` in SQL: select, `timetable_versions` in SQL: select, `tml_scores` in SQL: select, `tutor_sessions` in SQL: select, `users` select; in SQL: select, `wellness_logs` in SQL: select
- **SQL functions (rpc and nested):** `app.norm_class()`, `ops_ai_usage()`, `ops_error_stats()`, `ops_norm_class()`, `ops_platform_health()`, `ops_registry_counts()`, `ops_school_metrics()`, `ops_subject_metrics()`, `ops_tml_stale()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/overview — the Platform Manager's front page in one call. Schools, enquiries and login requests
are cut to what the operator can see; AI cost, errors, system health and the change journal only reach the roles
that may open those sections.
```

</details>

### `/api/ops/partners`

- **File:** `src/app/api/ops/partners/route.ts`
- **Methods:** `GET` · `POST` (actions: `partner`, `rule`, `commission`, `commission-move`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/partners`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_commission_rules` select/upsert, `ops_commissions` select/insert/update, `ops_operators` select, `ops_opportunities` select, `ops_opportunity_stages` select, `ops_partners` select/update/insert, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/partners — the partners with what each has brought and is owed; the commission ledger for the deals in
sight (everything, for those who approve and pay); and Sthara's own commission rules.
```

</details>

### `/api/ops/people`

- **File:** `src/app/api/ops/people/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/people`
- **Tables:** `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
"Mathematics: Class 10-A, Class 9-B · class teacher Class 10-A", or that they teach nothing yet.
```

</details>

### `/api/ops/pipeline`

- **File:** `src/app/api/ops/pipeline/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/pipeline`
- **Tables:** `enquiries` select/update, `ops_accounts` select, `ops_campaigns` select, `ops_discount_limits` select, `ops_operators` select, `ops_opportunities` select/insert, `ops_opportunity_events` insert, `ops_opportunity_stages` select, `ops_partners` select, `ops_picklists` select, `ops_quotes` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/pipeline?whose=mine|team|all — the deals in sight with their stage, value, owner and latest quote; the
forecast over them; the quotes waiting on this operator's approval; and what the forms need.
```

</details>

### `/api/ops/pipeline/[id]`

- **File:** `src/app/api/ops/pipeline/[id]/route.ts`
- **Methods:** `GET` · `PATCH` · `POST` (actions: `log`, `task`, `quote`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/pipeline/[id]`, `/ops/pipeline`
- **Tables:** `enquiries` select, `ops_accounts` select, `ops_campaigns` select, `ops_commission_rules` select, `ops_commissions` select/update/insert, `ops_discount_limits` select, `ops_marketing_spend` select, `ops_operators` select, `ops_opportunities` select/update, `ops_opportunity_events` select/insert, `ops_opportunity_stages` select, `ops_partners` select, `ops_picklists` select, `ops_quote_approvals` select/insert, `ops_quotes` select/insert/update, `ops_tasks` select/insert, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/pipeline/:id — a deal in full: its fields, history, quotes with their approvals, follow-ups, and what the controls need.
```

</details>

### `/api/ops/pipeline/settings`

- **File:** `src/app/api/ops/pipeline/settings/route.ts`
- **Methods:** `GET` · `POST` (actions: `stage`, `reason`, `limit`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/pipeline/settings`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_discount_limits` select/upsert, `ops_operators` select, `ops_opportunities` select, `ops_opportunity_stages` select/upsert, `ops_picklists` select/upsert, `ops_territories` select, `ops_territory_members` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/pipeline/settings — the stages, the loss reasons, and the discount each role may give alone.
```

</details>

### `/api/ops/qa`

- **File:** `src/app/api/ops/qa/route.ts`
- **Methods:** `GET` · `POST` (actions: `pin|unpin`, `pin`, `delete`, `token`, `revoke`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/quality`
- **Tables:** `audit_log` insert, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `qa_runs` select/update/delete, `qa_upload_tokens` select/insert/update, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:qa-runs`

<details><summary>Route doc comment</summary>

```text
Platform Manager > Quality: the test pack's runs.
  GET                  recent runs (newest first, 200), upload tokens (qa.manage), what the caller may do.
  GET ?run=<id>        one run with its failing tests and a download link per file (two minutes).
  POST { action } qa.manage:
    pin { id, note } | unpin { id } | delete { id }
    token { label } -> { token } shown once | revoke { id }
Operators only (404 for everyone else); qa.read to look, qa.manage to change.
```

</details>

### `/api/ops/requests`

- **File:** `src/app/api/ops/requests/route.ts`
- **Methods:** `GET` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/requests`
- **Tables:** `account_requests` select/update, `admission_applicants` select/update, `admission_events` insert, `admission_offers` select/update, `assignments` in SQL: update, `audit_log` insert, `class_subjects` select; in SQL: select, `classes` select; in SQL: select, `course_plans` in SQL: update/select, `cover_assignments` in SQL: update, `doc_counters` in SQL: insert, `fee_invoices` in SQL: select/insert, `fee_structures` in SQL: select, `guardians` upsert, `lesson_plans` in SQL: update, `materials` in SQL: update, `notifications` insert, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `schools` select, `situations` in SQL: update, `superadmins` select, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select, `teacher_subjects` select/delete/upsert; in SQL: select, `timetable_slots` in SQL: update, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select/insert/update; in SQL: select/update, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `admin_invoice_student()`, `app.grade_of()`, `app.next_doc_no()`, `app.norm_class()`, `app.relabel_timetable_subject()`, `app.sync_teacher_assignments()`, `ops_rename_class_subject()`, `ops_resync_teacher()`
- **Auth / Storage:** `auth.admin.createUser`, `auth.admin.deleteUser`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/requests?school=  — login requests from schools: every pending one, and the last 100 decided.
Operators only (404 for everyone else).
```

</details>

### `/api/ops/schools`

- **File:** `src/app/api/ops/schools/route.ts`
- **Methods:** `GET` · `PATCH` · `POST`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/audit`, `/ops/people`, `/ops/schools`
- **Tables:** `admission_events` in SQL: select, `ai_usage` in SQL: select, `app_errors` in SQL: select, `assignments` in SQL: select, `attendance` in SQL: select, `audit_log` insert; in SQL: select, `classes` select; in SQL: select, `consents` in SQL: select, `enquiries` select/update, `fee_invoices` in SQL: select, `fee_payments` in SQL: select, `fee_structures` in SQL: select, `guardians` in SQL: select, `incidents` in SQL: select, `leave_requests` in SQL: select, `lesson_plans` in SQL: select, `materials` in SQL: select, `ops_accounts` select/upsert/insert, `ops_activities` in SQL: select, `ops_cases` in SQL: select, `ops_contacts` in SQL: select, `ops_operators` select, `ops_tasks` in SQL: select, `ops_territories` select, `ops_territory_members` select, `platform_config` select, `role_grants` select, `school_messages` in SQL: select, `schools` select/insert; in SQL: select, `situations` in SQL: select, `student_chats` in SQL: select, `submissions` in SQL: select, `superadmins` select, `syllabus_progress` in SQL: select, `timetable_versions` in SQL: select, `tutor_sessions` in SQL: select, `users` select; in SQL: select, `wellness_logs` in SQL: select
- **SQL functions (rpc and nested):** `ops_norm_class()`, `ops_registry_counts()`, `ops_school_metrics()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools — the tenant registry: each school's policy, head counts and setup, with where it sits
and who owns it. Operators with a territory get the schools in it (or owned by them or their reports).
```

</details>

### `/api/ops/schools/[id]`

- **File:** `src/app/api/ops/schools/[id]/route.ts`
- **Methods:** `GET` · `DELETE`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `admission_events` in SQL: select, `ai_usage` in SQL: select, `app_errors` in SQL: select, `assignments` in SQL: select, `attendance` in SQL: select, `audit_log` select; in SQL: select, `class_subjects` in SQL: select, `classes` select; in SQL: select, `consents` in SQL: select, `fee_invoices` in SQL: select, `fee_payments` in SQL: select, `fee_structures` in SQL: select, `guardians` select; in SQL: select, `incidents` in SQL: select, `leave_requests` in SQL: select, `lesson_plans` in SQL: select, `materials` in SQL: select, `ops_accounts` select, `ops_activities` in SQL: select, `ops_cases` in SQL: select, `ops_contacts` in SQL: select, `ops_operators` select, `ops_tasks` in SQL: select, `ops_territories` select, `ops_territory_members` select, `role_grants` select, `school_messages` in SQL: select, `schools` select; in SQL: select/delete, `settings_changes` select; in SQL: insert, `situations` in SQL: select, `student_chats` in SQL: select, `student_subjects` in SQL: select, `students` in SQL: select, `subject_leads` in SQL: select, `submissions` in SQL: select, `superadmins` select, `syllabus_progress` in SQL: select, `teacher_subjects` in SQL: select, `timetable_versions` in SQL: select, `tutor_sessions` in SQL: select, `users` select; in SQL: select/delete, `wellness_logs` in SQL: select
- **SQL functions (rpc and nested):** `app.norm_class()`, `ops_delete_school()`, `ops_norm_class()`, `ops_registry_counts()`, `ops_school_ai()`, `ops_school_metrics()`, `ops_subject_metrics()`
- **Auth / Storage:** `auth.admin.deleteUser`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Subject-link counts sit with the other data-quality counts.
```

</details>

### `/api/ops/schools/[id]/access`

- **File:** `src/app/api/ops/schools/[id]/access/route.ts`
- **Methods:** `POST` · `DELETE`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `audit_log` insert, `ops_access_grants` select/insert/update, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/ops/schools/:id/access — { reason, caseRef?, scope? }: open a 30-minute, read-only window onto the
school's own records. The school's administrators see who opened it and why.
```

</details>

### `/api/ops/schools/[id]/account`

- **File:** `src/app/api/ops/schools/[id]/account/route.ts`
- **Methods:** `GET` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `audit_log` insert, `ops_access_events` select, `ops_access_grants` select, `ops_accounts` select/upsert, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools/:id/account — where the school sits (state, district, territory), who owns it,
and its break-glass history: every window opened on its records, and the caller's open one.
```

</details>

### `/api/ops/schools/[id]/classes`

- **File:** `src/app/api/ops/schools/[id]/classes/route.ts`
- **Methods:** `PUT`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `assignments` in SQL: update, `audit_log` insert, `class_subjects` select/insert/update/delete, `classes` select/update/insert, `course_plans` in SQL: update/select, `cover_assignments` in SQL: update, `lesson_plans` in SQL: update, `materials` in SQL: update, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `schools` select, `situations` in SQL: update, `student_subjects` select, `superadmins` select, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select, `teacher_subjects` select, `timetable_slots` in SQL: update, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select; in SQL: select, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `app.norm_class()`, `app.relabel_timetable_subject()`, `ops_rename_class_subject()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
PUT /api/ops/schools/:id/classes — { classes: [{ name, grade, section, subjects: (string | {name, kind})[] }], confirmRemove? }
Creates classes that don't exist (matched by normalised name, so "10-A" and "Class 10A" are the same
class) and sets each class's subjects. Subjects must be official curriculum subjects for the class's
level; they're linked (class_subjects), and every teacher module is renamed to the official name.
Classes Sthara has no curriculum for yet keep their subject names as plain text.
Removing a subject that has teachers or electives needs confirmRemove (409 says what's affected).
Never deletes classes: removing a class with students would orphan them.
```

</details>

### `/api/ops/schools/[id]/controls`

- **File:** `src/app/api/ops/schools/[id]/controls/route.ts`
- **Methods:** `GET` · `PATCH` · `POST`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `classes` in SQL: select, `guardians` in SQL: select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select; in SQL: select/update, `settings_changes` in SQL: insert, `superadmins` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `ops_login_check()`, `ops_norm_class()`, `ops_school_diagnostics()`, `ops_update_school()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools/:id/controls — the school's kill switches, its sign-in picture by role, the staff who
cannot or have not signed in, and its data-integrity checks (counts with a few sample ids).
```

</details>

### `/api/ops/schools/[id]/crm`

- **File:** `src/app/api/ops/schools/[id]/crm/route.ts`
- **Methods:** `GET` · `POST` (actions: `contact`, `activity`, `task`, `task-status`, `doc-remove`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `audit_log` insert, `ops_access_grants` select, `ops_accounts` select, `ops_activities` select/insert, `ops_cases` select, `ops_commissions` select, `ops_contacts` select/update/insert, `ops_documents` select/insert/delete, `ops_marketing_spend` select, `ops_operators` select, `ops_opportunities` select, `ops_opportunity_stages` select, `ops_picklists` select, `ops_tasks` select/update/insert, `ops_territories` select, `ops_territory_members` select, `schools` select, `settings_changes` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:ops-docs`

<details><summary>Route doc comment</summary>

```text
What a file really is, from its first bytes (the name and the browser's type can say anything).
```

</details>

### `/api/ops/schools/[id]/import`

- **File:** `src/app/api/ops/schools/[id]/import/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `operatorFor` + `requireGrant`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `account_requests` in SQL: select, `audit_log` insert, `cc_groups` select, `cc_memberships` in SQL: select, `certificate_types` select/insert, `certificates` in SQL: select, `class_subjects` select, `classes` select, `counselling_cases` in SQL: select, `counselling_referrals` in SQL: select, `discipline_actions` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` in SQL: select, `enrolments` in SQL: select, `exam_assessments` select, `exam_schemes` select, `exam_sheets` select; in SQL: select, `family_members` in SQL: select/update, `fee_concession_requests` in SQL: select, `fee_day_closes` in SQL: select, `fee_payments` in SQL: select/update, `health_events` in SQL: select, `house_members` in SQL: delete/select, `houses` select, `import_changes` in SQL: select/delete, `import_jobs` select/update/insert; in SQL: update/select, `kirti_entries` in SQL: select, `ops_access_events` insert, `ops_access_grants` select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `sibling_links` in SQL: select, `student_change_requests` in SQL: select, `student_documents` select; in SQL: select, `student_health` in SQL: select, `students` select, `superadmins` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `app.day_closed()`, `import_claim()`, `import_receipt_floor()`, `import_undo()`
- **Auth / Storage:** `auth.getUser`, `storage:imports`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Bulk import on a school's behalf, for schools that cannot do it themselves.
  GET   the school's import history (who, when, which file, counts; no rows)
  POST  { dataset, fileName, fileBytes } start an import. Directors only, inside an open 'import' access
        window; the school sees the import as done by Sthara, with the operator's name.
```

</details>

### `/api/ops/schools/[id]/import/[jobId]`

- **File:** `src/app/api/ops/schools/[id]/import/[jobId]/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `operatorFor` + `requireGrant`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `account_requests` in SQL: select, `audit_log` insert, `cc_groups` select, `cc_memberships` in SQL: select, `certificate_types` select/insert, `certificates` in SQL: select, `class_subjects` select, `classes` select, `counselling_cases` in SQL: select, `counselling_referrals` in SQL: select, `discipline_actions` in SQL: select, `doc_counters` in SQL: insert, `emergency_contacts` in SQL: select, `enrolments` in SQL: select, `exam_assessments` select, `exam_schemes` select, `exam_sheets` select; in SQL: select, `family_members` in SQL: select/update, `fee_concession_requests` in SQL: select, `fee_day_closes` in SQL: select, `fee_payments` in SQL: select/update, `health_events` in SQL: select, `house_members` in SQL: delete/select, `houses` select, `import_changes` in SQL: select/delete, `import_jobs` select/update; in SQL: update/select, `kirti_entries` in SQL: select, `ops_access_events` insert, `ops_access_grants` select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select, `sibling_links` in SQL: select, `student_change_requests` in SQL: select, `student_documents` select; in SQL: select, `student_health` in SQL: select, `students` select, `superadmins` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `app.day_closed()`, `import_claim()`, `import_receipt_floor()`, `import_undo()`
- **Auth / Storage:** `auth.getUser`, `storage:imports`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
One import's detail names rows of the school's data, so it needs the import window too.
```

</details>

### `/api/ops/schools/[id]/inspect`

- **File:** `src/app/api/ops/schools/[id]/inspect/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor` + `requireGrant`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `audit_log` select, `ops_access_events` insert, `ops_access_grants` select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `superadmins` select, `users` select
- **SQL functions (rpc and nested):** `app.ops_inspect_links()`, `app.ops_inspectable()`, `ops_inspect_find()`, `ops_inspect_list()`, `ops_inspect_meta()`, `ops_inspect_row()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools/:id/inspect — the record inspector. Every call needs the 'breakglass' capability and an
open access window on this school, and is noted under that window (the school sees how many records were opened).
  ?meta=1                          the inspectable tables: columns, what rows point to, what points at them
  ?find=<uuid>                     which tables hold a row with this id
  ?find=<text>                     accounts whose name, email or roll number match
  ?table=T                         the school's newest 50 rows of T, summarised
  ?table=T&column=C&value=<uuid>   rows of T whose C is that id (a record's related rows)
  ?table=T&row=<uuid>              one row in full (secret fields hidden), its related-row counts and change history
```

</details>

### `/api/ops/schools/[id]/people`

- **File:** `src/app/api/ops/schools/[id]/people/route.ts`
- **Methods:** `POST`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `assignments` in SQL: update, `audit_log` insert, `class_subjects` select; in SQL: select, `classes` select; in SQL: select, `course_plans` in SQL: update/select, `cover_assignments` in SQL: update, `guardians` upsert, `lesson_plans` in SQL: update, `materials` in SQL: update, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `schools` select, `situations` in SQL: update, `superadmins` select, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select, `teacher_subjects` select/delete/upsert; in SQL: select, `timetable_slots` in SQL: update, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select/insert/update; in SQL: select/update, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `app.norm_class()`, `app.relabel_timetable_subject()`, `app.sync_teacher_assignments()`, `ops_rename_class_subject()`, `ops_resync_teacher()`
- **Auth / Storage:** `auth.admin.createUser`, `auth.admin.deleteUser`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Rows per request, so a large roster never hits the function time limit. The console sends batches.
```

</details>

### `/api/ops/schools/[id]/people/[userId]`

- **File:** `src/app/api/ops/schools/[id]/people/[userId]/route.ts`
- **Methods:** `PATCH` · `POST` · `DELETE`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/people`, `/ops/schools/[schoolId]`
- **Tables:** `assignments` in SQL: update, `audit_log` insert, `class_subjects` select; in SQL: select, `classes` select; in SQL: select, `course_plans` in SQL: update/select, `cover_assignments` in SQL: update, `fee_invoices` in SQL: select, `fee_payments` in SQL: select, `lesson_plans` in SQL: update, `materials` in SQL: update, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `role_grants` in SQL: select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `settings_changes` in SQL: insert, `situations` in SQL: update, `superadmins` select, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select, `teacher_subjects` select/delete/upsert; in SQL: select, `timetable_slots` in SQL: update, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select/update; in SQL: select/update/delete, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `app.norm_class()`, `app.relabel_timetable_subject()`, `app.sync_teacher_assignments()`, `ops_delete_account()`, `ops_rename_class_subject()`, `ops_resync_teacher()`
- **Auth / Storage:** `auth.admin.deleteUser`, `auth.admin.updateUserById`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
PATCH — { subjects: [{class, subject}], classTeacherOf } : replace a teacher's assignments.
```

</details>

### `/api/ops/schools/[id]/settings`

- **File:** `src/app/api/ops/schools/[id]/settings/route.ts`
- **Methods:** `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 300`
- **Called by:** `/ops`, `/ops/pipeline/[id]`, `/ops/schools/[schoolId]`
- **Tables:** `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` select; in SQL: select/update, `settings_changes` in SQL: insert, `superadmins` select, `users` select
- **SQL functions (rpc and nested):** `ops_update_school()`
- **Auth / Storage:** `auth.admin.getUserById`, `auth.admin.updateUserById`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The journal's view of a field: what the operator saw before and after.
```

</details>

### `/api/ops/schools/[id]/subjects`

- **File:** `src/app/api/ops/schools/[id]/subjects/route.ts`
- **Methods:** `GET` · `POST` (actions: `link-school`, `set-class`, `drop-legacy`, `electives`, `leads`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `assignments` in SQL: update; maybe: select, `audit_log` insert; maybe: select, `class_subjects` select/insert/update/delete; in SQL: select; maybe: select, `classes` select/update; in SQL: select; maybe: select, `course_plans` in SQL: update/select; maybe: select, `cover_assignments` in SQL: update, `lesson_plans` in SQL: update; maybe: select, `materials` in SQL: update, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `sched_requirements` in SQL: update/select, `school_threads` in SQL: update, `schools` select, `situations` in SQL: update, `student_subjects` select/delete/upsert; maybe: select, `subject_leads` select/delete/insert; maybe: select, `superadmins` select, `syllabus` in SQL: update/select, `syllabus_progress` in SQL: update/select; maybe: select, `teacher_subjects` select/delete/upsert; in SQL: select; maybe: select, `timetable_slots` in SQL: update; maybe: select, `tml_scores` in SQL: update, `tutor_sessions` in SQL: update, `users` select/update; in SQL: select/update; maybe: select, `visit_sessions` in SQL: update
- **SQL functions (rpc and nested):** `app.norm_class()`, `app.relabel_timetable_subject()`, `app.sync_teacher_assignments()`, `ops_rename_class_subject()`, `ops_resync_teacher()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools/:id/subjects — offerings, teachers, enrolments, leads, and the linking plan for legacy names.
```

</details>

### `/api/ops/schools/[id]/support`

- **File:** `src/app/api/ops/schools/[id]/support/route.ts`
- **Methods:** `GET` · `POST` (actions: `corrections-preview`, `link`, `verify|unverify`, `unlink`, `move`, `promote`, `left|returned`, `corrections-apply`)
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/ops/schools/[schoolId]`
- **Tables:** `audit_log` insert, `classes` select, `guardians` select/upsert/update/delete, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `role_grants` select, `schools` select, `superadmins` select, `users` select/update
- **Auth / Storage:** `auth.admin.updateUserById`, `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/schools/:id/support — students with their guardian links, and the school's parents.
```

</details>

### `/api/ops/settings`

- **File:** `src/app/api/ops/settings/route.ts`
- **Methods:** `GET` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/settings`
- **Tables:** `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `platform_config` select; in SQL: select/insert, `settings_changes` select; in SQL: insert, `superadmins` select, `users` select
- **SQL functions (rpc and nested):** `ops_set_platform_config()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/settings — the platform-wide controls and the platform change journal.
(Checks moved to /api/ops/health; per-school settings to /api/ops/schools/:id.)
Operators only; 404 for everyone else.
```

</details>

### `/api/ops/tasks`

- **File:** `src/app/api/ops/tasks/route.ts`
- **Methods:** `GET` · `PATCH`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/tasks`
- **Tables:** `ops_accounts` select, `ops_cases` select, `ops_operators` select, `ops_tasks` select/update, `ops_territories` select, `ops_territory_members` select, `schools` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/tasks?view=mine|team|all — open follow-ups across the schools in sight (and the last 30 finished):
mine, those of the people who report to me, or everyone's. Overdue first.
```

</details>

### `/api/ops/territories`

- **File:** `src/app/api/ops/territories/route.ts`
- **Methods:** `GET` · `POST` · `PATCH` · `DELETE`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/enquiries`, `/ops/operators`, `/ops/territories`
- **Tables:** `audit_log` insert, `enquiries` select/update, `ops_accounts` select/update, `ops_operators` select, `ops_territories` select/update/insert/delete, `ops_territory_members` select, `superadmins` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/territories — the territory tree with who works each one and how many schools and open
enquiries sit in it, plus the active operators (for owner pickers). Any operator: the counts only cover
what that operator can see.
```

</details>

### `/api/ops/traffic`

- **File:** `src/app/api/ops/traffic/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/traffic`
- **Tables:** `ai_usage` select, `app_errors` select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `platform_config` select, `request_log` select; in SQL: select, `schools` select, `superadmins` select, `users` select
- **SQL functions (rpc and nested):** `ops_request_stats()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/traffic?since=15m|1h|6h|24h|7d&school=&user=<id or email>&route=<contains>&minMs=&page=
The request explorer: signed-in API requests that match (route, role, school, duration, release), newest first,
200 a page with the total, each with the AI calls and logged errors that happened inside it; per-route volume and
latency for the period; and the database reads browsers make directly (not through /api) that failed or came back
cut at the 1,000-row ceiling, as reported by lib/supabase/watch.ts.
Users appear as ids and roles, never names.
```

</details>

### `/api/ops/usage`

- **File:** `src/app/api/ops/usage/route.ts`
- **Methods:** `GET`
- **Guard:** `operatorFor`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/ops/usage`
- **Tables:** `ai_usage` in SQL: select, `ops_accounts` select, `ops_operators` select, `ops_territories` select, `ops_territory_members` select, `schools` in SQL: select, `superadmins` select, `users` select; in SQL: select
- **SQL functions (rpc and nested):** `ops_ai_usage()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/ops/usage?range=7d|30d|90d|mtd|lastmonth  (or ?from=YYYY-MM-DD&to=YYYY-MM-DD, IST days)
AI token usage and cost for the window, plus the price list it was costed with.
Operators only; 404 for everyone else.
```

</details>

## Area paper-gen

1 route files.

### `/api/paper-gen`

- **File:** `src/app/api/paper-gen/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/paper-gen`
- **Tables:** `platform_config` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

## Area parent

Parent (`/api/parent`). 9 route files.

### `/api/parent/ask`

- **File:** `src/app/api/parent/ask/route.ts`
- **Methods:** `POST`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/parent/ask`
- **Tables:** `academic_events` select, `assignments` select, `attendance` select; in SQL: select, `bell_schedules` select, `certificates` select, `consents` select, `counselling_cases` select, `discipline_actions` select, `enrolments` select, `fee_invoices` select, `fee_payments` select, `guardians` select, `health_events` select, `incidents` select, `kirti_entries` select, `notifications` select, `platform_config` select, `report_cards` select, `role_grants` select, `sched_wings` select, `school_messages` select, `school_threads` select, `schools` select, `student_documents` select, `students` select, `submissions` select, `timetable_slots` select, `timetable_versions` select, `tml_scores` select, `users` select, `wellness_logs` select, `whatsapp_links` select
- **SQL functions (rpc and nested):** `student_attendance_timeline()`
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/parent/ask { messages: [{ role: 'parent' | 'os', text }] }
Ask the School OS: answers from this family's own records (see askServer.ts).
```

</details>

### `/api/parent/conduct`

- **File:** `src/app/api/parent/conduct/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireParent`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/conduct`
- **Tables:** `counselling_referrals` select/insert, `discipline_actions` select, `guardians` select, `notifications` insert, `role_grants` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Discipline and counselling for parents (brief 07).
  GET   for each verified child: the discipline actions the school approved (warnings and detentions of earlier
        sessions left out), and whether the parent's requests to see the counsellor were seen. Never counselling
        notes, incidents or child protection.
  POST  { action: 'refer', studentId (the child's login id), reason }   ask for the counsellor to see the child
```

</details>

### `/api/parent/desk`

- **File:** `src/app/api/parent/desk/route.ts`
- **Methods:** `GET`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent (layout)`
- **Tables:** `academic_events` select, `assignments` select, `attendance` select, `bell_schedules` select, `consents` select, `fee_invoices` select, `fee_payments` select, `guardians` select, `notifications` select, `sched_wings` select, `school_messages` select, `school_threads` select, `schools` select, `submissions` select, `timetable_slots` select, `timetable_versions` select, `tml_scores` select, `users` select, `wellness_logs` select, `whatsapp_links` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/parent/desk — the family view (verified children only) and what Probe noticed.
```

</details>

### `/api/parent/documents`

- **File:** `src/app/api/parent/documents/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/documents`
- **Tables:** `audit_log` insert, `enrolments` select, `guardians` select, `schools` select, `student_change_requests` select/insert, `student_documents` select/insert/update, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Documents on the parent's verified children's records (brief 04). A parent's upload waits for the registrar's check.
  GET                                                          each child: documents, the admission checklist, my erasure requests
  POST { studentId, action }:
    upload-url { kind, fileName, fileBytes } | upload-done { path, kind, title?, issued_on?, valid_until?, fileName }
    open { docId }                                             a two-minute link (recorded)
    erase { docId, note? }                                     ask the school to erase it (the registrar decides)
```

</details>

### `/api/parent/family`

- **File:** `src/app/api/parent/family/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/family`
- **Tables:** `consents` in SQL: select, `emergency_contacts` select, `family_members` select, `guardians` select, `schools` select, `student_change_requests` select/insert, `students` select; in SQL: select, `users` select
- **SQL functions (rpc and nested):** `health_consented()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Family and contact details for the parent's verified children.
  GET                                                       each child: address, family, emergency contacts, my requests
  POST { studentId, kind, proposed, targetId?, note? }     propose a change; the school office approves it
    kind address { address, permanent_same, permanent_address } | family { relation, name, phone, ... } | emergency { list }
```

</details>

### `/api/parent/health`

- **File:** `src/app/api/parent/health/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/health`
- **Tables:** `consents` in SQL: select, `family_members` select, `guardians` select, `health_events` select, `schools` select, `student_change_requests` select/insert, `student_health` select, `students` select; in SQL: select, `users` select
- **SQL functions (rpc and nested):** `health_consented()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The health card of the parent's verified children (the UDISE+ part always; allergies, conditions, medication,
check-ups and vaccinations once health consent is given).
  POST { studentId, proposed: { blood_group?, allergies?, conditions?, medication? }, note? }   the health officer approves
```

</details>

### `/api/parent/kirti`

- **File:** `src/app/api/parent/kirti/route.ts`
- **Methods:** `GET`
- **Guard:** `requireParent`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/kirti`
- **Tables:** `cc_memberships` select, `guardians` select, `house_members` select, `kirti_entries` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET: each verified child's house, clubs and teams, and approved Kirti (brief 06).
```

</details>

### `/api/parent/messages`

- **File:** `src/app/api/parent/messages/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireParent` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/ask`, `/parent/messages`
- **Tables:** `guardians` select, `notifications` insert, `role_grants` select, `school_messages` select/insert, `school_threads` select/update/insert, `schools` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
GET /api/parent/messages?thread=<id> — one conversation, and marks it read.
```

</details>

### `/api/parent/whatsapp`

- **File:** `src/app/api/parent/whatsapp/route.ts`
- **Methods:** `POST` · `DELETE`
- **Guard:** `requireParent`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent/settings`
- **Tables:** `schools` select, `users` select, `whatsapp_links` select/upsert/update/delete, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
POST /api/parent/whatsapp
  { action: 'start', phone, consent: true }   send a 6-digit code to the number
  { action: 'verify', code }                 confirm it: the number is linked and opted in
  { action: 'prefs', prefs: {...} }          which updates to push
  { action: 'optin' | 'optout' }             pause / resume everything
DELETE /api/parent/whatsapp                  unlink the number
```

</details>

## Area platform

1 route files.

### `/api/platform/public`

- **File:** `src/app/api/platform/public/route.ts`
- **Methods:** `GET`
- **Guard:** `public`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin (layout)`, `/login`, `/ops (layout)`, `/ops/schools`, `/parent (layout)`, `/student (layout)`, `/teacher (layout)`
- **Tables:** `platform_config` select

<details><summary>Route doc comment</summary>

```text
GET /api/platform/public — the platform settings anyone may see: the sign-in
notice, and the default pilot length (the operator's new-school form starts from it). Nothing else from
platform_config is exposed here.
```

</details>

## Area portal

1 route files.

### `/api/portal/year-end`

- **File:** `src/app/api/portal/year-end/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/parent`, `/student`
- **Tables:** `enrolments` select, `guardians` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/portal/year-end — the published year-end result: a student's own, or each verified child's for a parent.
Nothing shows until the school publishes it (after next session's classes are set).
```

</details>

## Area qa

2 route files.

### `/api/qa/runs`

- **File:** `src/app/api/qa/runs/route.ts`
- **Methods:** `POST`
- **Guard:** `qa-upload-token`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** QA test pack uploader (qa/tools/publish.ts)
- **Tables:** `qa_runs` insert/select/update, `qa_upload_tokens` select/update
- **Auth / Storage:** `storage:qa-runs`

<details><summary>Route doc comment</summary>

```text
The test pack (qa/) uploads a run here at the end of run-regression.sh.
  POST  x-qa-token: <upload token>
        { startedAt, finishedAt, machine, git: { commit, branch, dirty }, target, stages, totals, failures, files: [{ name, size }] }
  ->    { id, uploads: [{ name, url }] }  one signed upload URL per file (PUT the bytes there, valid two hours),
        then POST /api/qa/runs/<id>/complete.
The files go straight to private storage, so a run's size is not limited by this request.
```

</details>

### `/api/qa/runs/[id]/complete`

- **File:** `src/app/api/qa/runs/[id]/complete/route.ts`
- **Methods:** `POST`
- **Guard:** `qa-upload-token`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** QA test pack uploader (qa/tools/publish.ts)
- **Tables:** `qa_runs` select/update, `qa_upload_tokens` select/update
- **Auth / Storage:** `storage:qa-runs`

<details><summary>Route doc comment</summary>

```text
POST /api/qa/runs/<id>/complete  (x-qa-token, the same token that started the run)
After the files are uploaded: checks they arrived, keeps their real sizes, and marks the run passed or failed.
Files that never arrived are dropped from the run's list (and reported back).
```

</details>

## Area quiz

2 route files.

### `/api/quiz/generate`

- **File:** `src/app/api/quiz/generate/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Called by:** no caller found
- **Tables:** `platform_config` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

### `/api/quiz/grade`

- **File:** `src/app/api/quiz/grade/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Called by:** no caller found
- **Tables:** `platform_config` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

## Area staff

Staff: teachers and office (`/api/staff`). 4 route files.

### `/api/staff/ask`

- **File:** `src/app/api/staff/ask/route.ts`
- **Methods:** `POST`
- **Guard:** `requireFeedCaller`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/ask`, `/teacher/ask`
- **Tables:** `admission_applicants` select, `admission_events` select, `admission_offers` select, `admission_seats` select, `admission_stages` select, `assignments` select; in SQL: select, `attendance` select, `audit_log` select, `consents` select, `fee_concession_requests` select, `fee_day_closes` select, `fee_invoices` select, `fee_payments` select, `fee_reminders` select, `fee_structures` select, `guardians` select, `incidents` select, `leave_policies` select, `leave_requests` select, `lesson_plans` select, `platform_config` select, `probe_acks` select, `proctor_alerts` select, `role_grants` select; in SQL: select, `role_permissions` in SQL: select, `school_filings` select, `school_messages` select, `school_threads` select, `schools` select, `situations` select, `staff_members` select, `submission_items` select, `submissions` select; in SQL: select, `superadmins` in SQL: select, `tml_scores` select, `users` select; in SQL: select, `wellness_logs` select; in SQL: select
- **SQL functions (rpc and nested):** `admin_teacher_work()`, `app.current_school_id()`, `app.grade_of()`, `app.has_perm()`, `app.is_superadmin()`, `app.user_has_perm()`, `school_wellness_report()`
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/staff/ask { messages: [{ role: 'me' | 'os', text }] }
Ask the School OS for teachers (their classes) and school leadership (the school,
within their office roles). See lib/staff/askServer.ts.
```

</details>

### `/api/staff/incidents`

- **File:** `src/app/api/staff/incidents/route.ts`
- **Methods:** `POST` · `PATCH` (actions: `notify|decline`, `close`)
- **Guard:** `requireFeedCaller`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/feed`, `/teacher/feed`
- **Tables:** `guardians` select, `incidents` insert/select/update, `notifications` insert, `role_grants` select, `schools` select, `situations` select/upsert/update, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
What parents get: the category and summary only; details stay with the school.
```

</details>

### `/api/staff/messages`

- **File:** `src/app/api/staff/messages/route.ts`
- **Methods:** `GET` · `POST` · `PATCH`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/ask`, `/admin/messages`, `/teacher/ask`, `/teacher/messages`
- **Tables:** `guardians` select, `notifications` insert, `role_grants` select, `school_messages` select/insert, `school_threads` select/update, `schools` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Teachers see their own conversations; office staff need messages.office.
```

</details>

### `/api/staff/whatsapp`

- **File:** `src/app/api/staff/whatsapp/route.ts`
- **Methods:** `GET` · `POST` · `DELETE`
- **Guard:** `requireFeedCaller`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/admin/ask`, `/teacher/ask`
- **Tables:** `role_grants` select, `schools` select, `users` select, `whatsapp_links` select/upsert/update/delete, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
GET: link status and the switches this account has.
```

</details>

## Area student

Student (`/api/student`). 7 route files.

### `/api/student/exam-track`

- **File:** `src/app/api/student/exam-track/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/tutor`
- **Tables:** `schools` select, `users` select/update
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
The student's competitive exam track.
  GET  -> { available: [{ id, exam, cycle, track }], chosen: string[] }
  POST { exams: string[] } -> { chosen }
A student can only pick exams their school has switched on (ops school
settings, examTracks) and that draw on their class. Stored on
users.metadata.targetExams.
```

</details>

### `/api/student/kirti`

- **File:** `src/app/api/student/kirti/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/kirti`
- **Tables:** `cc_memberships` select, `house_members` select, `kirti_entries` select, `schools` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET: the student's own house, clubs and teams, and approved Kirti (brief 06).
```

</details>

### `/api/student/proctor-alert`

- **File:** `src/app/api/student/proctor-alert/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/homework/[id]`
- **Tables:** `assignments` select, `notifications` insert, `proctor_alerts` insert, `role_grants` select, `schools` select, `situations` select/upsert/update, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
POST /api/student/proctor-alert
Called by the student client when a tab switch is detected during a proctored quiz.
Stores the alert and optionally sends a real-time notification to the teacher.
```

</details>

### `/api/student/subjects`

- **File:** `src/app/api/student/subjects/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/tutor`
- **Tables:** `classes` select, `schools` select, `student_subjects` select, `teacher_subjects` select, `tml_scores` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/student/subjects — the subjects this student takes (their class's core
subjects and chosen electives), each with its official chapters and micro-topics.
The tutor's topic picker lists exactly these, so what a student can pick is what
the tutor will accept. Class and enrolment come from the database.
```

</details>

### `/api/student/submit-typed`

- **File:** `src/app/api/student/submit-typed/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/homework/[id]`
- **Tables:** `assignments` select, `engagement_scores` select, `proctor_alerts` select, `schools` select, `submission_items` insert/select, `submissions` select/insert, `tml_scores` insert, `tutor_sessions` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/student/submit-typed — { assignmentId, answers: Record<index, value> }
Typed homework submission. Grading happens here, against the answer key in
the assignment row, because the database no longer lets a browser write
scores (grade integrity, migration 20260923120000). MCQ-only work is graded
instantly and counts as teacher-confirmed; anything with written answers is
stored ungraded for teacher review.
```

</details>

### `/api/student/upload-submission`

- **File:** `src/app/api/student/upload-submission/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/homework/[id]`
- **Tables:** `assignments` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:captures`

<details><summary>Route doc comment</summary>

```text
POST /api/student/upload-submission  (multipart: file, assignmentId, pageIndex)
A student's photo answer to one question of a typed assignment. Stored in the
private "captures" bucket like photographed work (minors' work is never on a
public URL); staff see it through short-lived links from /api/grading/pages.
The browser has already compressed it to a JPEG.
Returns { url: "captures:<path>" }, the value kept in submissions.answers.
```

</details>

### `/api/student/work`

- **File:** `src/app/api/student/work/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/homework/[id]`
- **Tables:** `assignments` select, `schools` select, `submission_items` select, `submissions` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET /api/student/work?assignment=<id> — what a student may see about their own graded work:
the marks their teacher confirmed per question, and the MCQ answer key once the whole class is
graded (lib/student/answerKey). Their answers and photos come from their own submission row
and /api/grading/pages; this route only adds what the student-facing view of the assignment hides.
```

</details>

## Area teacher

Teacher (`/api/teacher`). 23 route files.

### `/api/teacher/acknowledge-situation`

- **File:** `src/app/api/teacher/acknowledge-situation/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/wellness`
- **Tables:** `role_grants` select, `schools` select, `users` select; maybe: update, `wellness_logs` select; maybe: update
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/acknowledge-situation
Body: { id, schoolId, table: 'wellness_logs', field: 'resolved', value }
Marks a low-energy check-in as followed up. Only the student's own teachers
(or office staff with wellness.read) may. Feed items are acknowledged
through /api/feed instead.
```

</details>

### `/api/teacher/assignments`

- **File:** `src/app/api/teacher/assignments/route.ts`
- **Methods:** `POST` · `PATCH` · `DELETE`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `assignments` insert/select/update/delete, `role_grants` select, `schools` select, `submissions` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Teacher assignment & quiz lifecycle.
  POST   create   { title, type, class, subject, dueDate, description?, chapter?, questions,
                    submissionMode, proctored, status: 'draft'|'published', assignedStudentIds? }
  PATCH  update   { id, ...any of the above }  (post a draft, withdraw, edit)
  DELETE remove   { id }
School, teacher and scope come from the caller's own row (requireStaff); a
teacher can only set work for a class + subject they teach, and only touch
their own assignments. Admins can act on any assignment in their school.
```

</details>

### `/api/teacher/attendance`

- **File:** `src/app/api/teacher/attendance/route.ts`
- **Methods:** `POST`
- **Guard:** `requireFeedCaller`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/attendance`
- **Tables:** `assignments` select, `attendance` select/upsert, `guardians` select, `notifications` insert, `role_grants` select, `schools` select, `situations` select/upsert/update, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/attendance
{ className, day: 'YYYY-MM-DD', marks: [{ studentId, status, note? }] }
The class teacher marks their class (see lib/feed/attendance.ts for the rules).
Saving runs the absence-streak and exam-day checks for the class at once.
```

</details>

### `/api/teacher/capture`

- **File:** `src/app/api/teacher/capture/route.ts`
- **Methods:** `POST` · `PATCH`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `assignments` select, `platform_config` select, `role_grants` select, `schools` select, `submission_items` delete, `submissions` select/update/insert, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:captures`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/capture { assignmentId, studentId, pages: [path] }
A teacher photographed a student's notebook: the AI reads it and suggests
marks per question. Saved as the student's submission, waiting for review.
```

</details>

### `/api/teacher/conduct`

- **File:** `src/app/api/teacher/conduct/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/conduct`, `/teacher/timeline`
- **Tables:** `counselling_referrals` select/insert, `discipline_actions` select/insert/update, `enrolments` select, `guardians` select, `incidents` select, `notifications` insert, `role_grants` select, `schools` select, `students` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Discipline and counselling for teachers (brief 07): any teacher proposes a discipline action (the vice principal or
principal approves) and refers a student to the counsellor. Teachers see their own proposals and whether their
referrals were seen, nothing more.
  GET                       what I proposed and referred, my classes, whether the school has a counsellor
  GET ?cls= | ?q=           students to pick
  GET ?incidentsFor=        incidents about a student (register id) to link an action to
  POST { action }:
    propose { studentId, kind, onDate, untilDate?, reason, details?, incidentId? }
    withdraw { id, reason }   my own proposal, before it is approved
    refer { studentId, reason }
```

</details>

### `/api/teacher/copilot`

- **File:** `src/app/api/teacher/copilot/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 300`
- **Called by:** `/teacher/ai-assistant`
- **Tables:** `assignments` select, `lab_runs` select, `lesson_plans` select, `platform_config` select, `role_grants` select, `schools` select, `submissions` select, `syllabus_progress` select, `tml_scores` select, `tutor_sessions` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/copilot
{ class, subject, chapter?, studio?: { kind, count?, difficulty?, durationMin? },
  messages: [{ role: 'teacher' | 'copilot', text }] }
Grounds every answer in the teacher's own class data (roster TML by chapter,
assignments and results, syllabus coverage, upcoming lessons, the official
curriculum). Students are sent to the model as [[S1]]…[[Sn]] tokens and the
names are restored in the reply — no student name ever leaves the server.
```

</details>

### `/api/teacher/copilot/image`

- **File:** `src/app/api/teacher/copilot/image/route.ts`
- **Methods:** `POST` · `GET`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 90`
- **Called by:** `/teacher/ai-assistant`
- **Tables:** `platform_config` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:copilot-images`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
Copilot illustrations.
  POST { class, subject, prompt }  generate one image (costs money: the teacher asks for it), store it privately
                                    -> { path, url }
  GET  ?path=<school>/<teacher>/<id>.png   a fresh signed link (10 minutes), staff of that school only
Labels are never drawn by the model (image models misspell them); diagrams with labels are the SVG kind.
```

</details>

### `/api/teacher/course`

- **File:** `src/app/api/teacher/course/route.ts`
- **Methods:** `PUT`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/syllabus`
- **Tables:** `course_plans` select/upsert, `role_grants` select, `schools` select, `syllabus_progress` select/upsert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Syllabus coverage and pacing for one class + subject.
  PUT  { class, subject, plan?: { termStart, termEnd, periodsPerWeek, periodMinutes },
         items?: [{ chapterKey, topic ('' = the chapter row), status?, taughtOn?, plannedStart?, plannedEnd?, note? }] }
Only fields present on an item are changed. Coverage is shared by every
teacher of the class + subject; each write records who made it.
```

</details>

### `/api/teacher/cover`

- **File:** `src/app/api/teacher/cover/route.ts`
- **Methods:** `PUT`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/schedule`
- **Tables:** `cover_assignments` update/select, `notifications` insert, `role_grants` select, `role_permissions` select, `schools` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
A substitute flags a problem with a cover they've been given (they can't decline it).
  PUT { coverId, note }   the coordinator is alerted; the cover stays assigned until they change it
```

</details>

### `/api/teacher/exams`

- **File:** `src/app/api/teacher/exams/route.ts`
- **Methods:** `GET` · `POST` (actions: `marks|submit|return`, `return`, `submit`, `extras|review`, `extras`)
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/exams`, `/teacher/lab/practicals`
- **Tables:** `assignments` select, `attendance` in SQL: select, `audit_log` insert, `class_subjects` select, `classes` select, `exam_assessments` select, `exam_class_terms` select/update/insert, `exam_marks` select/upsert/delete, `exam_schemes` select, `exam_sheets` select/update, `exam_student_terms` select/upsert, `exam_terms` select, `report_card_settings` select, `role_grants` select, `schools` select, `student_subjects` select, `submissions` select, `teacher_subjects` select, `tml_scores` select, `users` select
- **SQL functions (rpc and nested):** `exam_attendance()`
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Marks entry and the class teacher's review.
  GET                          my marks sheets (the class-subjects I teach) and my class's terms (class teacher)
  GET ?sheet=                  one sheet: the students, their marks, and Sthara tests that can fill it
  GET ?sheet=&from=            marks proposed from a Sthara test or scanned scripts (an assignment), scaled
  GET ?review=                 my class's term (class teacher): sheets, readiness, students
  GET ?review=&preview=        a student's report card as it would publish now
  POST { action }:
    marks { sheetId, rows: [{ studentId, value, questions? }], source?, sourceRef? }   the subject teacher
    submit { sheetId }                                                                 the subject teacher
    return { sheetId, note }                                                           the class teacher
    extras { termId, rows: [{ studentId, remark?, coscholastic? }] }                    the class teacher
    review { termId }                                                                  the class teacher
The exam cell (exams.manage) can do what a subject teacher does on any open sheet, for corrections before
submission. Nobody changes a submitted or locked sheet: it is returned or reopened first.
```

</details>

### `/api/teacher/health-alerts`

- **File:** `src/app/api/teacher/health-alerts/route.ts`
- **Methods:** `GET`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/attendance`
- **Tables:** `enrolments` select, `role_grants` select, `schools` select, `student_health` select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
GET ?cls= — allergy and condition alerts for a class the caller teaches (or is class teacher of): the student and
one alert line each. Nothing else from the health record.
```

</details>

### `/api/teacher/homework-gen`

- **File:** `src/app/api/teacher/homework-gen/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `platform_config` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

### `/api/teacher/kirti`

- **File:** `src/app/api/teacher/kirti/route.ts`
- **Methods:** `GET` · `POST` (actions: `members-add|member-update`)
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/kirti`
- **Tables:** `cc_groups` select, `cc_memberships` select/upsert/update, `enrolments` select, `house_points` insert, `houses` select, `kirti_entries` select/insert, `role_grants` select, `schools` select, `student_documents` insert/select, `students` select, `users` select
- **Auth / Storage:** `auth.getUser`, `storage:student-docs`

<details><summary>Route doc comment</summary>

```text
Kirti for teachers (brief 06): any teacher records achievements and participation (they wait for the academic
coordinator's approval); a club's or team's teacher in charge keeps its members.
  GET                       my clubs and teams, houses, what I recorded
  GET ?cls= | ?q=           students to pick: a class roster this session, or a search by name or admission number
  GET ?groupId=             members of a group I run
  POST { action }:
    record { studentIds, entry, groupId?, attachment? } | attach-url { studentId, fileName, fileBytes }
    points { houseId, points, reason, onDate }          house points for the coordinator to approve
    members-add { groupId, studentIds, role } | member-update { groupId, memberId, role?, leave? }   in charge only
```

</details>

### `/api/teacher/lab`

- **File:** `src/app/api/teacher/lab/route.ts`
- **Methods:** `POST` · `PATCH` · `DELETE`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/lab/build`, `/teacher/lab`
- **Tables:** `lab_scenes` select/insert/update/delete, `lesson_plans` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Live Lab saved demos.
  POST   { class, subject, scene, lessonPlanId? }   save a new demo
  PATCH  { id, scene?, lessonPlanId? }              change your own demo
  DELETE { id }                                     remove your own demo
A scene is re-checked by its engine here, so a stored demo can never be one the simulation would refuse.
Teachers save for classes they teach. Reading is direct (row-level security: staff of the same school), so any
teacher can reuse a colleague's demo (components/lab/useSavedScenes.ts).
```

</details>

### `/api/teacher/lab/runs`

- **File:** `src/app/api/teacher/lab/runs/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/lab/present`
- **Tables:** `lab_runs` select/update/insert, `lab_scenes` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Live Lab class predictions.
  POST { id, class, subject, scene, answers, sceneId? }   save (or update) one lesson's run
The presenter calls this in the background at every reveal with the same id, so a run grows as the lesson goes.
Only the class's counts are kept from the request: every question, option and right answer is rebuilt from the
engine (lib/lab/runs.ts). Reading is direct (row-level security: staff of the same school).
```

</details>

### `/api/teacher/leave`

- **File:** `src/app/api/teacher/leave/route.ts`
- **Methods:** `POST` · `PATCH`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/leave`
- **Tables:** `comp_off_grants` select, `leave_policies` select, `leave_requests` select/insert/update, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
A staff member's own leave.
  POST  { type, from, to, halfDay?, reason }   apply
  PATCH { id, cancel: true }                   withdraw a request that's still pending, or approved and not yet started
```

</details>

### `/api/teacher/lessons`

- **File:** `src/app/api/teacher/lessons/route.ts`
- **Methods:** `POST` · `PATCH` · `DELETE`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/ai-assistant`, `/teacher/syllabus`
- **Tables:** `assignments` select, `lesson_plans` insert/select/update/delete, `role_grants` select, `schools` select, `syllabus_progress` upsert, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Lesson plans.
  POST   create  { class, subject, chapterKey, chapterName, title, ...fields }
  PATCH  update  { id, ...fields }   (status 'taught' also marks its topics taught)
  DELETE remove  { id }
A teacher edits their own plans for classes they teach; admins any in school.
```

</details>

### `/api/teacher/lessons/draft`

- **File:** `src/app/api/teacher/lessons/draft/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/teacher/syllabus`
- **Tables:** `platform_config` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/lessons/draft
{ class, subject, chapterKey, topics?: string[], durationMin?, focus? }
Drafts a lesson plan grounded in the official curriculum entry for the
chapter (its topics, learning outcomes and exclusions). Returns plan fields;
nothing is saved — the teacher edits and saves.
```

</details>

### `/api/teacher/outcomes`

- **File:** `src/app/api/teacher/outcomes/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/outcomes`
- **Tables:** `audit_log` insert, `enrolments` select/update, `report_cards` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Year-end outcomes for the class teacher (their own class only).
  GET                                         my class, student by student, with each report card result and a suggestion
  POST { items: [{ id, outcome, note? }] }    propose outcomes (again after a return); the principal approves next
```

</details>

### `/api/teacher/practicals`

- **File:** `src/app/api/teacher/practicals/route.ts`
- **Methods:** `POST` (actions: `assess`)
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/lab/practicals`
- **Tables:** `audit_log` insert, `class_subjects` select, `classes` select, `exam_assessments` select, `exam_marks` upsert/delete, `exam_sheets` select, `practical_assessment` upsert/delete, `practical_progress` select/upsert, `role_grants` select, `schools` select, `student_subjects` select, `teacher_subjects` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
Live Lab practicals tracker.
  POST { class, subject, rows: [{ studentId, practical, done?, record?, viva? }] }   save progress (upsert)
Each field present is set; null clears it. `done` is a date (YYYY-MM-DD), `record` none | submitted | checked,
`viva` 0-5. Teachers save for classes they teach; every practical must be one of that class's and every student
on its roster. Reading is direct (row-level security: staff of the same school). The Subject Enrichment mark
itself is saved through /api/teacher/exams (source 'practical'), into the open marks sheet.
  POST { action: 'assess', class, subject, sheetId, rows: [{ studentId, parts: { key: marks } | null }] }
Class 11-12: the practical scored by its CBSE components (src/lib/lab/practicals/marks.ts). The parts are kept
in practical_assessment and their total goes into the open PR sheet in Exams (source 'practical'), scaled if the
school set that sheet to another maximum; null clears both. Submitted and locked sheets refuse, as in Exams.
```

</details>

### `/api/teacher/quiz-gen`

- **File:** `src/app/api/teacher/quiz-gen/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `platform_config` select, `role_grants` select, `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

### `/api/teacher/review-submission`

- **File:** `src/app/api/teacher/review-submission/route.ts`
- **Methods:** `POST`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `assignments` select, `engagement_scores` select, `guardians` select, `notifications` insert, `proctor_alerts` select, `role_grants` select, `schools` select, `submission_items` delete/insert/select, `submissions` select/update, `tml_scores` insert/select, `tutor_sessions` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
POST /api/teacher/review-submission
{ submissionId, questionScores?: (number)[], score?: number, note?: string }
The teacher's confirmed grade. Typed work is marked per question
(questionScores, one entry per question, each 0..marks); handwritten work
gets one overall score (0..max). Either way the submission becomes
teacher-approved, its evidence rows (submission_items) are rewritten to
match what the teacher confirmed, TML is recomputed, and the student is
notified. Re-reviewing an approved submission is an amendment (audited by
the database trigger on submissions).
```

</details>

### `/api/teacher/submissions`

- **File:** `src/app/api/teacher/submissions/route.ts`
- **Methods:** `PATCH` · `DELETE`
- **Guard:** `requireStaff`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/teacher/homework`, `/teacher/quiz`
- **Tables:** `assignments` select, `engagement_scores` select, `guardians` select, `notifications` insert, `proctor_alerts` select, `role_grants` select, `schools` select, `submission_items` select/delete, `submissions` select/update/delete, `tml_scores` insert, `tutor_sessions` select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`, `storage:captures`
- **External:** WhatsApp Cloud API

<details><summary>Route doc comment</summary>

```text
Appends a reversal to the submission's history (kept in ai_result, so the trail survives reopen / re-read).
```

</details>

## Area timeline

1 route files.

### `/api/timeline`

- **File:** `src/app/api/timeline/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/counselling`, `/admin/students/[id]`, `/parent/timeline`, `/student/timeline`, `/teacher/timeline`
- **Tables:** `assignments` select, `attendance` in SQL: select, `audit_log` insert, `certificates` select, `counselling_cases` select, `discipline_actions` select, `enrolments` select, `fee_invoices` select, `fee_payments` select, `guardians` select, `health_events` select, `incidents` select, `kirti_entries` select, `platform_config` select, `report_cards` select, `role_grants` select, `schools` select, `student_documents` select, `students` select, `submissions` select, `tml_scores` select, `users` select, `wellness_logs` select
- **SQL functions (rpc and nested):** `student_attendance_timeline()`
- **Auth / Storage:** `auth.getUser`
- **External:** Gemini

<details><summary>Route doc comment</summary>

```text
The unified timeline (Living Record brief 08), for everyone who may see a student: office roles, the class teacher,
subject teachers, the parent and the student. What each sees is decided here on the server (lib/timeline).
  GET ?studentId=<register id> | ?login=<the child's or my own login id>
      the year-by-year summary
    &session=2026-27      that year's events
    &print=1              the student file: every year's events (office and parents; recorded in the audit log)
  POST { studentId | login, messages: [{ role: 'me' | 'os', text }] }   ask about the timeline (AI)
```

</details>

## Area tml

1 route files.

### `/api/tml/compute`

- **File:** `src/app/api/tml/compute/route.ts`
- **Methods:** `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/mastery`
- **Tables:** `engagement_scores` select, `proctor_alerts` select, `schools` select, `submission_items` select, `submissions` select, `tml_scores` insert, `tutor_sessions` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
POST /api/tml/compute
Body: { studentId: string, subject?: string }
Computes True Mastery Level (TML) scores for a student based on per-item evidence
and persists an append-only snapshot entry into tml_scores table.
```

</details>

## Area tutor

1 route files.

### `/api/tutor/session`

- **File:** `src/app/api/tutor/session/route.ts`
- **Methods:** `POST` (actions: `start`, `answer`, `reveal`)
- **Guard:** `verifyApiToken` + `rate-limit`
- **Route config:** `dynamic = 'force-dynamic'`
- **Called by:** `/student/tutor`
- **Tables:** `classes` select, `engagement_scores` select, `notifications` insert, `platform_config` select, `proctor_alerts` select, `role_grants` select, `schools` select, `situations` select/upsert/update, `student_subjects` select, `submission_items` select, `submissions` select, `teacher_subjects` select, `tml_scores` select/insert, `tutor_guard_events` insert/select, `tutor_session_turns` delete/insert/update/select, `tutor_sessions` insert/select, `users` select, `whatsapp_links` select, `whatsapp_log` select/insert
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API, Gemini

<details><summary>Route doc comment</summary>

```text
POST /api/tutor/session — one structured Socratic session on a micro-topic
(the mockup's AI Tutor view): question → hint → answer, never the answer first.
Grounded: a topic must sit in the student's own syllabus (their subjects, an
earlier-class chapter of one, or their exam track). Picked chapters are matched
directly; typed topics go through the grounding classifier. Off-topic is refused,
profanity warned, and a safety cue is never answered by the AI (see lib/tutor).
Body: { action: 'start', subject, topic }
    | { action: 'answer', token, answer, history? }
    | { action: 'reveal', token, history? }
Scoring state (step, hints, revealed, the question being answered) lives in
a server-signed token; on completion one tutor_sessions row is written and
TML is recomputed for the subject, so the D ("tutor depth") component moves.
```

</details>

## Area whatsapp

2 route files.

### `/api/whatsapp/simulate`

- **File:** `src/app/api/whatsapp/simulate/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `verifyApiToken`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** `/admin/ask`, `/parent/settings`, `/teacher/ask`
- **Tables:** `academic_events` select, `admission_applicants` select, `admission_events` select, `admission_offers` select, `admission_seats` select, `admission_stages` select, `assignments` select; in SQL: select, `attendance` select/upsert; in SQL: select, `audit_log` select, `bell_periods` select, `bell_schedules` select, `certificates` select, `comp_off_grants` select, `consents` select, `counselling_cases` select, `cover_assignments` select, `discipline_actions` select, `duty_assignments` select, `duty_posts` select, `duty_roster` select, `enrolments` select, `fee_concession_requests` select, `fee_day_closes` select, `fee_invoices` select, `fee_payments` select, `fee_reminders` select, `fee_structures` select, `guardians` select, `health_events` select, `incidents` select, `kirti_entries` select, `leave_policies` select, `leave_requests` select/insert, `lesson_plans` select, `notifications` insert/select, `platform_config` select, `probe_acks` select, `proctor_alerts` select, `report_cards` select, `role_grants` select; in SQL: select, `role_permissions` select; in SQL: select, `rooms` select, `sched_wings` select, `school_filings` select, `school_messages` insert/select, `school_threads` select/update/insert, `schools` select, `situations` select/update/upsert, `staff_absences` select/insert, `staff_members` select/update, `staff_punches` insert/select, `student_documents` select, `students` select, `submission_items` select, `submissions` select; in SQL: select, `superadmins` in SQL: select, `timetable_slots` select, `timetable_versions` select, `tml_scores` select, `users` select; in SQL: select, `visit_sessions` select, `wellness_logs` select; in SQL: select, `whatsapp_links` select/update, `whatsapp_log` select/insert/update
- **SQL functions (rpc and nested):** `admin_teacher_work()`, `app.current_school_id()`, `app.grade_of()`, `app.has_perm()`, `app.is_superadmin()`, `app.user_has_perm()`, `school_wellness_report()`, `student_attendance_timeline()`
- **Auth / Storage:** `auth.getUser`
- **External:** WhatsApp Cloud API, Gemini

<details><summary>Route doc comment</summary>

```text
Test mode only (no WhatsApp Business line connected yet): lets a signed-in user
with a linked number "send" a WhatsApp message from the app. It goes through the
real inbound handler exactly as a webhook delivery would, and the replies logged
for them come back. Returns 404 once the channel is live.
GET   the recent conversation (both directions) for the caller's number
POST  { text }   send one message as if from their phone
```

</details>

### `/api/whatsapp/webhook`

- **File:** `src/app/api/whatsapp/webhook/route.ts`
- **Methods:** `GET` · `POST`
- **Guard:** `meta-signature` + `meta-hub-verify-token`
- **Route config:** `dynamic = 'force-dynamic'`, `maxDuration = 60`
- **Called by:** Meta WhatsApp Cloud API webhook
- **Tables:** `academic_events` select, `admission_applicants` select, `admission_events` select, `admission_offers` select, `admission_seats` select, `admission_stages` select, `assignments` select; in SQL: select, `attendance` select/upsert; in SQL: select, `audit_log` select, `bell_periods` select, `bell_schedules` select, `certificates` select, `comp_off_grants` select, `consents` select, `counselling_cases` select, `cover_assignments` select, `discipline_actions` select, `duty_assignments` select, `duty_posts` select, `duty_roster` select, `enrolments` select, `fee_concession_requests` select, `fee_day_closes` select, `fee_invoices` select, `fee_payments` select, `fee_reminders` select, `fee_structures` select, `guardians` select, `health_events` select, `incidents` select, `kirti_entries` select, `leave_policies` select, `leave_requests` select/insert, `lesson_plans` select, `notifications` insert/select, `platform_config` select, `probe_acks` select, `proctor_alerts` select, `report_cards` select, `role_grants` select; in SQL: select, `role_permissions` select; in SQL: select, `rooms` select, `sched_wings` select, `school_filings` select, `school_messages` insert/select, `school_threads` select/update/insert, `schools` select, `situations` select/update/upsert, `staff_absences` select/insert, `staff_members` select/update, `staff_punches` insert/select, `student_documents` select, `students` select, `submission_items` select, `submissions` select; in SQL: select, `superadmins` in SQL: select, `timetable_slots` select, `timetable_versions` select, `tml_scores` select, `users` select; in SQL: select, `visit_sessions` select, `wellness_logs` select; in SQL: select, `whatsapp_links` select/update, `whatsapp_log` insert/select/update
- **SQL functions (rpc and nested):** `admin_teacher_work()`, `app.current_school_id()`, `app.grade_of()`, `app.has_perm()`, `app.is_superadmin()`, `app.user_has_perm()`, `school_wellness_report()`, `student_attendance_timeline()`
- **External:** WhatsApp Cloud API, Gemini

<details><summary>Route doc comment</summary>

```text
Meta's one-time webhook verification handshake.
```

</details>

## Area youtube

1 route files.

### `/api/youtube`

- **File:** `src/app/api/youtube/route.ts`
- **Methods:** `GET`
- **Guard:** `verifyApiToken`
- **Called by:** no caller found
- **Tables:** `schools` select, `users` select
- **Auth / Storage:** `auth.getUser`

<details><summary>Route doc comment</summary>

```text
TTL-based cache: { value, expiresAt }
```

</details>

