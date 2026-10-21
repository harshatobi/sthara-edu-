-- Old photo-answer bucket goes private — 2026-09-28
--
-- Before 2026-09-28 typed-homework photo answers were uploaded to a public
-- "submissions" bucket (created by the upload route, never by a migration),
-- so students' work was readable by anyone holding the URL. New uploads go to
-- the private "captures" bucket. This closes the old one; the app now signs the
-- stored public URLs (src/lib/grading/server.ts, legacyPath) instead of
-- showing them directly. Apply together with that release.

UPDATE storage.buckets SET public = false WHERE id = 'submissions';
