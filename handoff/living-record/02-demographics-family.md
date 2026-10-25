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

**2026-10-21 (asked in session; fields from the 01 round 2 UDISE+ split):**
- **Fields:** mother tongue, social category (General, SC, ST, OBC), religion and minority status, BPL and AAY card,
  EWS / disadvantaged group, family income, both parents' education and occupation, distance from school, blood
  group stays in 03. Name, gender, date of birth and nationality are already on the register (01).
- **Sensitive fields** (category, religion and minority, BPL/AAY/EWS, income) are seen by **every register reader**
  (registrar, principal, school admin, vice principal, academic coordinator, admissions officer, finance head,
  accountant); edited by register managers. Every change keeps history.
- **Family are contacts on the record,** not only logins: mother, father, guardian and others with name, relation,
  phone, email, education, occupation and income. A contact links to a parent login when Sthara issues one, matched by
  phone or email. Logins are still issued only by Sthara (the import never creates one).
- **Siblings are suggested** from a shared parent phone or login (and from a shared family code in the import); the
  registrar confirms. Confirmed siblings show on each record, and the fee concession screen can see them; nothing
  applies a concession by itself.
- **Emergency contacts:** up to 3, in calling order. Each is a family member on the record or someone else (name,
  relation, phone).
- **Parents propose changes** to family and contact details on the portal; the registrar approves or rejects with a
  note. Nothing changes until approved; history is kept.
- **Admission copy-over:** admitting an applicant pre-fills the register and family from the admission form (name,
  date of birth, previous school, guardian name, phone and email); the registrar reviews before saving, and the
  applicant keeps a link to the record.
- **Address:** structured: house and street, locality, village or town, district, state, PIN, for the current and the
  permanent address ("same as current").
- **Import:** one format, Family and emergency contacts, with an optional `family_code` column; rows sharing a code
  are one family (siblings suggested for confirmation). Without it, siblings are suggested from shared parent phones.

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
