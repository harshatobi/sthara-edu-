-- Signed-out visitors (anon) held SELECT on 18 tables, left over from the original schema — 2026-10-20
--
-- RLS kept them out (no policy applies to anon, so every read returned no rows); the grant itself goes now, so a
-- missing or loosened policy can never expose these tables to the public key. Every read of them in the app happens
-- after sign-in (authenticated), and no function anon can call reads them with the caller's rights.
REVOKE ALL ON
  public.assignments, public.classes, public.engagement_scores, public.learning_outcomes, public.materials,
  public.notifications, public.schools, public.situations, public.student_chats, public.student_memory,
  public.submission_items, public.submissions, public.superadmins, public.syllabus, public.tml_scores,
  public.tutor_sessions, public.users, public.wellness_logs
FROM anon;
