-- Grants on the Living Record tables, put right — 2026-10-22.
--
-- Supabase still gives every new public table ALL privileges for anon and authenticated by default (until it stops
-- on 2026-10-30), on top of the grants the migrations write. Row level security kept rows safe (read policies only),
-- but the grants themselves were wider than intended: anon could reach every table, authenticated held write and
-- TRUNCATE privileges, and the table-wide SELECT on students exposed the Aadhaar ciphertext and hash column the
-- migration meant to leave out. Every screen reads these tables through the server (service_role).
--
-- After this: anon nothing; authenticated SELECT only (on students, the listed columns only); service_role ALL.

REVOKE ALL ON public.students, public.student_changes, public.enrolments, public.family_members, public.emergency_contacts,
  public.sibling_links, public.student_change_requests, public.student_health, public.health_events, public.import_jobs,
  public.import_changes, public.legacy_results FROM anon, authenticated;

GRANT ALL ON public.students, public.student_changes, public.enrolments, public.family_members, public.emergency_contacts,
  public.sibling_links, public.student_change_requests, public.student_health, public.health_events, public.import_jobs,
  public.import_changes, public.legacy_results TO service_role;

GRANT SELECT ON public.student_changes, public.enrolments, public.family_members, public.emergency_contacts,
  public.sibling_links, public.student_change_requests, public.student_health, public.health_events, public.import_jobs,
  public.legacy_results TO authenticated;

-- The register without aadhaar_cipher, aadhaar_hash and photo_path (photos are served through signed links).
GRANT SELECT (id, school_id, user_id, admission_no, status, full_name, aadhaar_name, gender, date_of_birth, pen, apaar_id,
  aadhaar_last4, no_aadhaar, cbse_reg_no, board_roll_no, admitted_on, admitted_grade, previous_school, previous_status,
  previous_class, previous_tc_no, rte_seat, rte_amount, medium, indian_national, left_on, leaving_reason, cancelled_at,
  cancel_reason, created_at, updated_at, mother_tongue, social_category, religion, minority, bpl, aay, ews, family_income,
  address, permanent_address, permanent_same, distance_km, family_code) ON public.students TO authenticated;

REVOKE ALL ON SEQUENCE public.student_changes_id_seq, public.import_changes_id_seq FROM anon;
