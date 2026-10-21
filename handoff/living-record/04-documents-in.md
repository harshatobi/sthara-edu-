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
