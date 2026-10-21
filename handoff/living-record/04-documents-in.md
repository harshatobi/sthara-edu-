# 04 — Documents in

## Goal

Store the documents a school collects about a student (birth certificate, previous school's TC, photos, signed
forms) on the student's record, privately.

## What exists today

- **A working pattern for staff:** `staff_documents (staff_member_id, kind, title, issued_on, expires_on,
  storage_path, file_name, mime, size_bytes, uploaded_by)` with the private `staff-docs` bucket. Reuse its upload,
  signed-URL and permission code rather than writing new code.
- Private buckets today: `captures`, `submissions`, `staff-docs`, `ops-docs`, `qa-runs`, `copilot-images`.
  `question-papers` is public. Student documents must not go in a public bucket.
- Vercel function bodies are capped at 4.5 MB, so large uploads must go straight to storage. Check how
  `staff_documents` does it.

## Decided with Moses

- Documents in are in the first version.
- **Retention (2026-10-20):** student documents are kept permanently, and purged only on a DPDP erasure request or
  when the tenant leaves Sthara (after an export). Moses is moving to a larger plan, so storage cost is not a limit.

**2026-10-21 (asked in session; not built yet):**
- **Photo** is a register field (decided in 01), not a document.
- **Admission checklist:** Sthara's default set (birth certificate, Aadhaar card, transfer certificate from Class 2 on,
  previous report card, address proof, a parent ID); the school admin adds or drops kinds per grade. Caste, income,
  disability and medical documents are optional uploads.
- **Uploads:** the registrar, and parents from the portal. A parent upload is "awaiting check" until the registrar
  verifies or rejects it.
- **Verification:** the registrar marks each document "verified against the original" (who, when) or rejects it with a
  note the parent sees. The checklist counts only verified documents.
- **Viewing by kind:** register readers see identity and academic documents; medical and disability documents only the
  health officer, principal and school admin; caste and income certificates follow 02 (all register readers). Parents
  see what they or the school uploaded for their child. Every download is logged.
- **Files:** any type, up to 25 MB, no compression, straight to a private bucket. Anything that isn't a PDF or an
  image is always served as a download (never opened in the browser), so an uploaded page or script can't run.
- **Import:** the office picks the manifest (CSV/XLSX) and a folder or many files in the browser; each file uploads
  straight to storage and is matched to the manifest by file name, then the usual check and commit. A manifest row
  without its file is a problem (nothing written); a file nobody listed is reported and not stored.
- **Erasure (DPDP):** a parent asks from the portal; the registrar (or DPO) approves or declines with a reason.
  Documents the school must keep by law (TC, admission register proofs) can be declined; approved ones are deleted
  from storage and the deletion is logged.

## Still open (ask Moses before building)

- Which document kinds, and which are required at admission (a checklist showing what's missing)?
- Student photo: is it a document, or a profile field shown across the app (ID cards, report cards)?
- Who uploads (office, parents during admission?) and who can view or download?
- Should the office mark a document as verified?
- File types and size limits. Do phone photos of paper need compressing (`compressPhoto` already exists in the
  capture station)?
- Retention when the student leaves, and whether parents can ask for deletion (DPDP).
- Storage cost: about 2,000 students × several documents. Check it fits the ~$50/mo headroom.

**Bulk import (on 09's mechanism)**
- Published format: **Documents: a manifest CSV (`admission_no, kind, title, issued_on, file_name`?) plus the files**. The columns follow the field answers above. Confirm them with Moses.
- How do the files arrive: a zip next to the manifest, a folder upload, or one by one? Bulk uploads go straight to storage (4.5 MB request cap).
- What happens to manifest rows whose file is missing, and files with no manifest row?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. Table, private bucket, policies, signed-URL access, audit, and an admission checklist if agreed.
Tests for access. All checks pass.
