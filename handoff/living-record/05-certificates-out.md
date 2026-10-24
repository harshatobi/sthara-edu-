# 05 — Certificates out: TC, bonafide, character certificate

## Goal

Generate the certificates a school issues, from the record, with serial numbers and a permanent register of what
was issued.

## What exists today

- **Serial numbers:** `app.next_doc_no(school, kind, session)` with `doc_counters (school_id, kind, session,
  last_no)` already numbers invoices and receipts. A new `kind` per certificate type should work.
- **Printing:** report cards print from the browser (`printCards` in `src/components/exams/ReportCard.tsx`, print
  CSS in `src/styles/canon.css`). There's no server-side PDF library in `package.json`. Ask before adding one.
- **Leaving:** `setLeft` (`src/lib/ops/support.ts:158`) marks a student as left, with a date and reason. A TC
  usually goes with leaving, so decide how the two connect.
- Fees: `fee_invoices` and `fee_payments` exist, so "no dues" can be checked.

## Decided with Moses

- Certificates out are in the first version.

**2026-10-23 (asked in session):**
- **Which:** TC, bonafide, character/conduct, fee paid certificate (financial year, for 80C), and **any other certificate
  the school admin sets up**: a title and body wording with placeholders (`{student_name}`, `{class}`,
  `{date_of_birth}`, ...), whether it needs approval; same numbering, QR and register.
- **TC format:** research the official formats (CBSE Affiliation Bye-Laws appendix; state boards for TS, AP, KA, TN and
  the North Indian states) and get the field list signed off before building. Don't write fields from memory.
- **Numbering:** running forever, a prefix per kind (TC/0001, BON/0001), never reset; the school can set the prefix.
- **Approval:** the registrar prepares, the principal signs off. Nothing gets a number or prints as final until
  approved; drafts print as DRAFT.
- **Fees before a TC:** unpaid dues block it; the principal can still approve with a written reason (recorded).
- **TC and leaving:** approving a TC marks the student left on the TC's leaving date (login blocked, as Mark as left).
- **Cancel and reissue:** a cancelled certificate stays on the register as CANCELLED, with the reason. A lost TC is
  reissued as DUPLICATE with the same number and its own issue date.
- **Output:** browser print like report cards (Powered by Sthara footer), the principal's signature and school stamp as
  uploaded images, a QR to a public verify page, every printed value frozen on the register at issue, **and a stored
  PDF per certificate (Moses approved adding a PDF library).**
- **Verify page (public):** minimal: school, kind and number, student's name, issue date, VALID or CANCELLED. No date
  of birth, parents, Aadhaar or marks.
- **Past register import:** imported certificates are full certificates (reprintable like Sthara's own), so the file
  carries every printed field. Their numbers are kept; Sthara's numbering continues past the highest imported number.

## Still open (ask Moses before building)

- Which certificates: TC, bonafide, character, others (migration, conduct, fee certificate)?
- The TC format. CBSE-affiliated schools follow a prescribed set of TC fields. Ask Moses which format(s) to
  support (one per board? configurable per tenant?) and for a reference copy. Don't write the fields from memory.
- Numbering: per session, or running forever? A prefix?
- Who can issue, and is approval needed (principal signs off)?
- Must fees be cleared before a TC? Is it a hard block, or a warning the principal can override?
- Does issuing a TC mark the student as left automatically?
- Can an issued certificate be cancelled or reissued (a duplicate TC)? Keep both on the register?
- Output: a browser print like report cards, or a stored PDF? Signature and stamp images? A QR code to verify?

**Bulk import (on 09's mechanism)**
- Published format: **Certificates already issued (the tenant's past TC/bonafide register)**. The columns follow the field answers above. Confirm them with Moses.
- Imported certificates keep their original serial numbers. Where does Sthara's own numbering continue from (`doc_counters`)?
- Are imported certificates shown as "issued before Sthara" and never reprinted?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. Certificate register table, numbering, the agreed formats, permission checks and audit. Tests for
numbering, fee checks and reissue. All checks pass.

## Research: TC formats (2026-10-23)

**CBSE.** Format is **Annexure-I of the Examination Bye-Laws** (not the Affiliation Bye-Laws). Read from the official
bye-laws PDF (cbseacademic.nic.in, consolidated to Dec 2004) and every amendment listed on cbse.gov.in up to 10 Mar 2023
(scanned ones OCR'd). No amendment changes the fields. Header: Book No, Sl. No, Admission No. Fields:
1 Name of pupil · 2 Father's/Guardian's name · 3 Nationality · 4 Whether SC or ST · 5 Date of first admission in the
school, with class · 6 Date of birth (Christian era) per the admission register, in figures and words · 7 Class last
studied, figures and words · 8 School/Board annual exam last taken, with result · 9 Whether failed, once/twice in the
same class · 10 Subjects studied · 11 Whether qualified for promotion; if so, to which class (figures and words) ·
12 Month up to which school dues paid · 13 Fee concession availed, and its nature · 14 Total working days · 15 Working
days present · 16 NCC cadet / Scout / Guide (details) · 17 Games or extra-curricular activities (achievement level) ·
18 General conduct · 19 Date of application · 20 Date of issue · 21 Reason for leaving · 22 Any other remarks.
Signed: class teacher, "checked by" (full name and designation), Principal, seal.
- Notification 11.03.2015: countersignature is no longer needed for a CBSE-to-CBSE move; TCs from other boards still
  need an education officer's countersignature.
- Affiliation Bye-Laws 2018 clause 2.4.9 (Circular 03, 05.03.2021): the school website must carry **copies of TCs
  issued**.
- Common additions on CBSE schools' TCs today (not in Annexure-I): mother's name, PEN, APAAR ID, UDISE code, affiliation
  number, religion/OBC.

**RTE Act s.5(3):** for a child in elementary education (Classes 1-8), the head-teacher "shall immediately issue the
transfer certificate", is liable to disciplinary action for delay, and a delayed TC can't be a ground to deny admission.
This conflicts with "dues block the TC" for Classes 1-8 (raised with Moses).

**State boards.**
- Tamil Nadu: state-board TCs are generated in **EMIS**; schools are told to issue only the online TC (terminal classes
  5, 8, 10, 12; others "requested by parents"). Edits limited to three.
- Karnataka: state-board TCs (Classes 1-10) are issued in **SATS** (TC Issue / bulk TC / reprint), bilingual
  Kannada-English, about 25 fields (adds sex, religion, caste, OBC, mother's name, languages, medium, scholarship,
  medically examined, last attendance month).
- Andhra Pradesh: TC services sit in the **Child Info / Student Info** portal (school logs in with its UDISE code;
  enters leaving date and TC number). Only unofficial guides found.
- Telangana: no official state TC format or portal found online.
- North Indian states: not yet researched.

**2026-10-23 sign-off after the research:**
- **CBSE TC = Annexure-I + additions:** all 22 official fields in the official order, plus mother's name, PEN, APAAR
  ID, UDISE code and affiliation number in the header. ICSE-style schools use the same layout for now.
- **RTE and dues:** Classes 1-8 are never blocked by dues (shown on the request and in field 12 only). Nursery-UKG and
  Classes 9-12: dues block, the principal can override with a reason.
- **State portals (TN EMIS, KA SATS, AP Child Info):** for state-board schools there, Sthara runs approval, the dues
  check and leaving, gives a pre-filled sheet of the portal's fields, then the registrar records the portal's TC number
  and uploads its PDF; that is the register entry. Sthara doesn't print its own TC for them.
- **Other state formats (Telangana, North India):** later, each added when a school on that board signs up and shares
  its TC.

## Built (2026-10-23, PR 36)

- Migration `20261025090000_certificates.sql`: `certificate_settings`, `certificate_types` (the four built-in kinds made
  on first use, plus the school's own; a TC always needs approval), `certificates` (the register: drafts, pending,
  issued, cancelled; a database guard keeps issued ones from changing or being deleted), `certificate_issue` (numbering
  and freezing in one step; a duplicate keeps its original's number), the private `certificates` bucket,
  `doc_counters` allowing `cert:<type>`, the `certificates.prepare/approve/setup` permissions, `import_certificates`
  and undo.
- `src/lib/certificates/`: `certs.ts` (fields, wording, words, numbers, the RTE rule), `pdf.ts` (one A4 layout for the
  preview, print and stored copy: Plus Jakarta Sans, logo, signature, stamp, QR, DRAFT/CANCELLED/DUPLICATE marks,
  Powered by Sthara), `server.ts` (prefill from the record, dues, lifecycle, PDFs, the register, verify).
- Libraries added (Moses approved the PDF library): `pdf-lib` 1.17.1, `@pdf-lib/fontkit` 1.1.1, `qrcode` 1.5.4.
- Screens: Admin › Certificates (to approve, register, set up: wording with fields, prefixes, signature, stamp,
  principal's name, UDISE code, TC by Sthara or by the state portal); the Certificates tab on the student record;
  the public `/verify/<token>` page (school, kind, number, name, date, valid or cancelled).
- Import: "Certificates already issued" (every printed field; numbers kept; Sthara continues after the highest).
- Not yet: a parent-portal view of certificates; copies of TCs on the school website (CBSE clause 2.4.9); names in
  Indian scripts don't print (the font has Latin only; the preview warns).
