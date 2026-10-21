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
