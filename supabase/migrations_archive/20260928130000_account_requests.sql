-- New logins are created by Sthara operators only (every account can use the AI features, which Sthara pays for).
-- A school asks; an operator approves in the ops console, and that creates the accounts.
--
-- account_requests   a school's request for logins: 'enrolment' (an admissions applicant with an offer becomes a
--                    student, with the parent's login or a link to their existing one) or 'accounts' (staff, students,
--                    parents listed by the school). Pending until an operator approves or rejects it, or the school
--                    withdraws it. `result` keeps what was created (emails and ids, never passwords).
-- classes            the class list is set up by Sthara with the school: school accounts can no longer write it
--                    (they read it as before).
--
-- Writes only through the API routes (service role). The school reads its own requests (admissions and people roles).

CREATE TABLE IF NOT EXISTS public.account_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('enrolment', 'accounts')),
  applicant_id   uuid REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  people         jsonb NOT NULL DEFAULT '[]'::jsonb,
  options        jsonb NOT NULL DEFAULT '{}'::jsonb,
  note           text CHECK (note IS NULL OR length(note) <= 1000),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  result         jsonb,
  CONSTRAINT account_requests_enrolment_applicant CHECK (kind <> 'enrolment' OR applicant_id IS NOT NULL),
  CONSTRAINT account_requests_people_array CHECK (jsonb_typeof(people) = 'array' AND jsonb_array_length(people) <= 200)
);
CREATE INDEX IF NOT EXISTS ix_account_requests_school ON public.account_requests (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_account_requests_pending ON public.account_requests (created_at) WHERE status = 'pending';
-- One open enrolment request per applicant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_requests_applicant ON public.account_requests (applicant_id) WHERE status = 'pending' AND applicant_id IS NOT NULL;

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_requests FROM anon, authenticated;
GRANT SELECT ON public.account_requests TO authenticated;
GRANT ALL ON public.account_requests TO service_role;

DROP POLICY IF EXISTS account_requests_read ON public.account_requests;
CREATE POLICY account_requests_read ON public.account_requests FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id())
          AND ((SELECT app.has_perm('admissions.read')) OR (SELECT app.has_perm('admissions.manage')) OR (SELECT app.has_perm('people.manage'))))
         OR (SELECT app.is_superadmin()));

-- The class list: read by the school as before; written by operators (and the service role) only.
DROP POLICY IF EXISTS classes_admin_write ON public.classes;
DROP POLICY IF EXISTS classes_superadmin_write ON public.classes;
CREATE POLICY classes_superadmin_write ON public.classes FOR ALL TO authenticated
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));
