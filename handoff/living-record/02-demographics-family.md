# 02 — Demographics and family

## Goal

Hold who the student is and who their family is: personal details, address, guardians, siblings and emergency
contacts. One place, kept current, with a history of changes.

## What exists today

- `users` has only `name` and `email` for a student. Nothing else personal.
- `guardians (id, parent_id, student_id, relationship, verified, created_at)` links a parent **login** to a
  student. Managed in `src/lib/ops/support.ts` (`linkGuardian`, `setGuardianVerified`, `unlinkGuardian`).
  `metadata.linkedStudents` on the parent is also read (`src/contexts/AuthContext.tsx:153`, `src/lib/ops/accounts.ts`).
- `admission_applicants` captures `date_of_birth`, `guardian_name/phone/email` and `previous_school` at admission,
  but they aren't copied onto the student.
- `consents` (per student, type, granted_by, policy_version, granted/revoked) exists for DPDP consent.

## Decided with Moses

- Demographics and family are in the first version.

## Still open (ask Moses before building)

- Exact field list. Ask Moses rather than guessing (DOB, gender, category/caste, religion, nationality, mother
  tongue, address, and so on).
- Which of these are sensitive (category, religion, income) and who may see them?
- Guardians who **don't** have a Sthara login: store them as contacts on the record? (Today a guardian must be a
  login.)
- Siblings: link them automatically through shared guardians, or have the office link them by hand? Does it feed
  fees (sibling concession, `src/components/admin/fees/Concessions.tsx`)?
- Emergency contacts: how many, and is the order important?
- Who can edit: the office only, or can parents propose changes that the office approves?
- Should the admission form's data copy onto the record when the applicant is admitted?

**Bulk import (on 09's mechanism)**
- Published format: **Guardians, family and emergency contacts**. The columns follow the field answers above. Confirm them with Moses.
- Can a guardian row in the import create a parent login, or only a contact?
- Siblings: link them from the file (a shared family key?) or work it out afterwards?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. Fields, RLS and audit in place. Edits keep history. The admin student page shows and edits the
data. Tests for permissions and the admission copy-over. All checks pass.
