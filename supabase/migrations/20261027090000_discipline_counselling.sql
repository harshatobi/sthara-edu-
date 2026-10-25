-- Living Record 07: discipline and counselling. Discipline actions on a student (warning, parent meeting, detention,
-- suspension) that teachers propose and the vice principal or principal approves (a suspension is the principal's);
-- counselling referrals, cases and session notes that only the counsellor reads (the principal sees that sessions
-- happened); and child-protection cases, held by a new Safeguarding lead role (the principal until a school assigns
-- one). Free text in the counselling and safeguarding tables is encrypted by the app (STUDENT_PII_KEY), so neither
-- the audit trail nor a database copy holds it in the clear. Screens read through the server, so signed-in users get
-- no direct access to the new tables.

-- ── Role and permissions ────────────────────────────────────────────────────

ALTER TABLE public.role_grants DROP CONSTRAINT role_grants_role_key_check;
ALTER TABLE public.role_grants ADD CONSTRAINT role_grants_role_key_check CHECK (role_key IN ('school_admin', 'principal',
  'vice_principal', 'finance_head', 'accountant', 'cashier', 'admissions_officer', 'hr_manager', 'academic_coordinator',
  'counsellor', 'dpo', 'registrar', 'health_officer', 'safeguarding_lead'));

-- Counselling notes and child-protection cases are not given to the school admin or principal: only the counsellor
-- and the Safeguarding lead hold them (the principal reads child-protection cases while no lead is assigned).
INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'discipline.approve'), ('school_admin', 'discipline.suspend'), ('school_admin', 'discipline.archive'), ('school_admin', 'counselling.overview'),
  ('principal', 'discipline.approve'), ('principal', 'discipline.suspend'), ('principal', 'discipline.archive'), ('principal', 'counselling.overview'),
  ('vice_principal', 'discipline.approve'),
  ('registrar', 'discipline.archive'),
  ('counsellor', 'counselling.notes'),
  ('safeguarding_lead', 'dashboard.view'), ('safeguarding_lead', 'safeguarding.read'), ('safeguarding_lead', 'safeguarding.cases')
  ON CONFLICT DO NOTHING;

-- Who reads child-protection cases: the Safeguarding lead; while the school has none, its principal.
CREATE OR REPLACE FUNCTION app.user_cp_reader(u uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT app.user_has_perm(u, 'safeguarding.cases') OR EXISTS (
    SELECT 1 FROM public.role_grants g JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.user_id = u AND g.role_key = 'principal' AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.role_grants d JOIN public.users y ON y.id = d.user_id AND y.school_id = d.school_id AND y.role = 'admin'
        WHERE d.school_id = g.school_id AND d.role_key = 'safeguarding_lead' AND d.revoked_at IS NULL
          AND (d.expires_on IS NULL OR d.expires_on >= current_date)))
$$;
CREATE OR REPLACE FUNCTION app.cp_reader() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT app.user_cp_reader(auth.uid()) $$;
REVOKE ALL ON FUNCTION app.user_cp_reader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.cp_reader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.user_cp_reader(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.cp_reader() TO authenticated, service_role;

-- Child-protection incidents: whoever logged one, and the child-protection reader. Incident managers (vice principal,
-- school admin) no longer see them.
DROP POLICY incidents_read ON public.incidents;
CREATE POLICY incidents_read ON public.incidents FOR SELECT TO authenticated USING (
  ((school_id = (SELECT app.current_school_id())) AND (
    (logged_by = (SELECT auth.uid()))
    OR ((category = 'child_protection') AND (SELECT app.cp_reader()))
    OR ((category <> 'child_protection') AND (
      (SELECT app.has_perm('incidents.manage'))
      OR (SELECT app.has_perm('feed.read'))
      OR ((SELECT app.is_teacher()) AND (student_id IS NOT NULL) AND app.teaches_student(student_id))
      OR ((SELECT app.is_teacher()) AND (student_id IS NULL) AND (class_name IS NOT NULL) AND app.teaches_class(class_name))))))
  OR (SELECT app.is_superadmin()));

-- The feed: 'principal' items (child protection) go to the child-protection reader only.
DROP POLICY situations_read ON public.situations;
CREATE POLICY situations_read ON public.situations FOR SELECT TO authenticated USING (
  ((school_id = (SELECT app.current_school_id())) AND (
    ((audience = 'staff') AND (SELECT app.is_teacher()) AND (
      (teacher_id = (SELECT auth.uid()))
      OR ((teacher_id IS NULL) AND (student_id IS NOT NULL) AND app.teaches_student(student_id))
      OR ((teacher_id IS NULL) AND (student_id IS NULL) AND (class_name IS NOT NULL) AND app.teaches_class(class_name))))
    OR ((audience = 'staff') AND (SELECT app.has_perm('feed.read')))
    OR ((audience = 'staff') AND (SELECT app.has_perm('incidents.manage')))
    OR ((audience = 'principal') AND (SELECT app.cp_reader()))
    OR ((audience = 'safeguarding') AND (SELECT app.has_perm('safeguarding.read')))))
  OR (SELECT app.is_superadmin()));

-- ── Discipline actions ──────────────────────────────────────────────────────

CREATE TABLE public.discipline_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  kind text NOT NULL CHECK (kind IN ('warning', 'parent_meeting', 'detention', 'suspension')),
  on_date date NOT NULL,
  until_date date,
  CHECK (kind <> 'suspension' OR until_date IS NOT NULL),
  CHECK (until_date IS NULL OR until_date >= on_date),
  -- What the parent sees once approved; details stay with the school.
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 300),
  details text CHECK (details IS NULL OR length(details) <= 2000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'returned', 'cancelled')),
  return_note text CHECK (return_note IS NULL OR length(return_note) <= 300),
  CHECK (status <> 'returned' OR return_note IS NOT NULL),
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
  notify_parent boolean NOT NULL DEFAULT false,
  parent_notified_at timestamptz,
  proposed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancelled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discipline_actions_student ON public.discipline_actions (student_id, on_date DESC);
CREATE INDEX discipline_actions_school ON public.discipline_actions (school_id, created_at DESC);
CREATE INDEX discipline_actions_waiting ON public.discipline_actions (school_id, created_at) WHERE status = 'proposed';
CREATE INDEX discipline_actions_incident ON public.discipline_actions (incident_id) WHERE incident_id IS NOT NULL;
CREATE TRIGGER trg_touch_discipline_actions BEFORE UPDATE ON public.discipline_actions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_discipline_actions AFTER INSERT OR DELETE OR UPDATE ON public.discipline_actions FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Counselling ─────────────────────────────────────────────────────────────

CREATE TABLE public.counselling_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  -- open = ongoing; referred = passed to someone outside the school (who and why is in the notes).
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'referred')),
  opened_on date NOT NULL,
  closed_on date CHECK (closed_on IS NULL OR closed_on >= opened_on),
  CHECK ((status = 'open') = (closed_on IS NULL)),
  counsellor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counselling_cases_student ON public.counselling_cases (student_id, opened_on DESC);
CREATE INDEX counselling_cases_school ON public.counselling_cases (school_id, opened_on DESC);
CREATE TRIGGER trg_touch_counselling_cases BEFORE UPDATE ON public.counselling_cases FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_counselling_cases AFTER INSERT OR DELETE OR UPDATE ON public.counselling_cases FOR EACH ROW EXECUTE FUNCTION app.audit();

-- A note per session, written by the counsellor; corrections are a later note, never an edit.
CREATE TABLE public.counselling_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.counselling_cases(id) ON DELETE CASCADE,
  on_date date NOT NULL,
  notes_cipher text NOT NULL CHECK (notes_cipher LIKE 'v1:%'),
  counsellor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counselling_sessions_case ON public.counselling_sessions (case_id, on_date DESC);
CREATE TRIGGER trg_touch_counselling_sessions BEFORE UPDATE ON public.counselling_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_counselling_sessions AFTER INSERT OR DELETE OR UPDATE ON public.counselling_sessions FOR EACH ROW EXECUTE FUNCTION app.audit();

-- A teacher, parent or office member asks the counsellor to see a student. The referrer sees only new / seen.
CREATE TABLE public.counselling_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_kind text NOT NULL CHECK (from_kind IN ('teacher', 'parent', 'office')),
  from_user uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason_cipher text NOT NULL CHECK (reason_cipher LIKE 'v1:%'),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'declined')),
  case_id uuid REFERENCES public.counselling_cases(id) ON DELETE SET NULL,
  seen_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counselling_referrals_new ON public.counselling_referrals (school_id, created_at) WHERE status = 'new';
CREATE INDEX counselling_referrals_from ON public.counselling_referrals (from_user, created_at DESC);
CREATE INDEX counselling_referrals_student ON public.counselling_referrals (student_id);
CREATE TRIGGER trg_touch_counselling_referrals BEFORE UPDATE ON public.counselling_referrals FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_counselling_referrals AFTER INSERT OR DELETE OR UPDATE ON public.counselling_referrals FOR EACH ROW EXECUTE FUNCTION app.audit('status');

-- ── Child protection ────────────────────────────────────────────────────────

-- The steps on a child-protection incident: notes, the POCSO report to the police or the Child Welfare Committee,
-- informing the parent, referral, closing.
CREATE TABLE public.safeguarding_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note', 'reported_police', 'reported_cwc', 'parent_informed', 'referred', 'closed')),
  on_date date NOT NULL,
  -- The FIR, DD or CWC reference, when there is one.
  ref text CHECK (ref IS NULL OR length(ref) <= 80),
  details_cipher text CHECK (details_cipher IS NULL OR details_cipher LIKE 'v1:%'),
  by_user uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safeguarding_log_incident ON public.safeguarding_log (incident_id, on_date);
CREATE TRIGGER trg_audit_safeguarding_log AFTER INSERT OR DELETE OR UPDATE ON public.safeguarding_log FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.discipline_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.discipline_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.discipline_actions TO service_role;
ALTER TABLE public.counselling_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counselling_cases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.counselling_cases TO service_role;
ALTER TABLE public.counselling_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counselling_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.counselling_sessions TO service_role;
ALTER TABLE public.counselling_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counselling_referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.counselling_referrals TO service_role;
ALTER TABLE public.safeguarding_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.safeguarding_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.safeguarding_log TO service_role;

-- ── Import undo: a register entry with discipline or counselling records stays ──
CREATE OR REPLACE FUNCTION public.import_undo(p_job uuid, p_limit int DEFAULT 5000)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  j public.import_jobs;
  t text;
  v_cols text;
  v_n int;
  v_restored int := 0; v_removed int := 0; v_kept int := 0;
BEGIN
  SELECT * INTO j FROM public.import_jobs WHERE id = p_job FOR UPDATE;
  IF j.id IS NULL OR j.committed_at IS NULL THEN RAISE EXCEPTION 'import % has not been committed', p_job; END IF;
  PERFORM set_config('sthara.import_job', p_job::text, true);

  -- 0. House placements this import opened go first (unless changed since), so the ones it closed can reopen:
  --    a student has one open placement at a time.
  WITH del AS (DELETE FROM public.house_members x WHERE x.import_job_id = p_job AND x.to_date IS NULL AND x.updated_at <= j.committed_at
      AND NOT EXISTS (SELECT 1 FROM public.import_changes i WHERE i.job_id = p_job AND i.table_name = 'house_members' AND i.row_id = x.id)
    RETURNING x.id)
  SELECT count(*) INTO v_n FROM del;
  v_removed := v_removed + v_n;

  -- 1. Overwritten rows: restore the before-image, unless the row changed after the import.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students',
    'enrolments', 'family_members', 'student_health', 'emergency_contacts', 'student_documents', 'certificates', 'house_members', 'cc_memberships', 'kirti_entries'] LOOP
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO v_cols FROM pg_attribute
      WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped AND attname NOT IN ('id', 'updated_at');
    EXECUTE format($q$
      WITH c AS (SELECT id, row_id, %s AS before FROM public.import_changes i WHERE job_id = $1 AND table_name = %L ORDER BY id LIMIT $2),
      done AS (
        UPDATE public.%I x SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, c.before))
        FROM c WHERE x.id = c.row_id AND x.updated_at <= $3 %s
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) FROM gone$q$,
      -- A primary contact the import took over from comes back as primary only after step 2 (one primary per student).
      CASE WHEN t = 'family_members' THEN 'CASE WHEN EXISTS (SELECT 1 FROM public.import_changes m WHERE m.job_id = $1
        AND m.table_name = ''family_primary'' AND m.row_id = i.row_id) THEN i.before || ''{"is_primary": false}'' ELSE i.before END' ELSE 'i.before' END,
      t, t, v_cols, v_cols, t,
      CASE t
        WHEN 'exam_marks' THEN 'AND EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- Another open placement since (opened by hand after the import): the closed one stays closed.
        WHEN 'house_members' THEN 'AND NOT ((c.before ->> ''to_date'') IS NULL AND EXISTS (SELECT 1 FROM public.house_members o
          WHERE o.student_id = x.student_id AND o.to_date IS NULL AND o.id <> x.id))'
        -- Someone else made primary since: this member is kept as it is.
        WHEN 'family_members' THEN 'AND NOT ((c.before ->> ''is_primary'')::boolean AND EXISTS (SELECT 1 FROM public.family_members o
          WHERE o.student_id = x.student_id AND o.is_primary AND o.id <> x.id))'
        ELSE '' END)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_restored := v_restored + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', 0);
    END IF;
  END LOOP;

  -- 2. Added rows: remove them (unless changed since, or still referenced), untagging what is kept.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'health_events', 'student_health', 'student_documents',
    'certificates', 'kirti_entries', 'cc_memberships', 'house_members', 'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
    EXECUTE format($q$
      WITH c AS (SELECT id, updated_at FROM public.%I WHERE import_job_id = $1 LIMIT $2),
      keep AS (
        UPDATE public.%I x SET import_job_id = NULL FROM c
        WHERE x.id = c.id AND (c.updated_at > $3 %s)
        RETURNING x.id),
      del AS (DELETE FROM public.%I x USING c WHERE x.id = c.id AND x.id NOT IN (SELECT id FROM keep) RETURNING x.id)
      SELECT (SELECT count(*) FROM del), (SELECT count(*) FROM keep)$q$,
      t, t,
      CASE t
        WHEN 'exam_marks' THEN 'OR NOT EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- A receipt (even a voided one) holds its invoice, and a concession request would go with it.
        WHEN 'fee_invoices' THEN 'OR EXISTS (SELECT 1 FROM public.fee_payments p WHERE p.invoice_id = x.id)
          OR EXISTS (SELECT 1 FROM public.fee_concession_requests r WHERE r.invoice_id = x.id)'
        -- An applicant since enrolled, or with a login request, has a life of its own now.
        WHEN 'admission_applicants' THEN 'OR x.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.account_requests r WHERE r.applicant_id = x.id)'
        -- A register entry with a login, or with records from anywhere but this import (they would cascade away), stays.
        WHEN 'students' THEN 'OR x.user_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.enrolments e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.family_members f WHERE f.student_id = x.id AND f.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.emergency_contacts e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_health h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.health_events h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_documents d WHERE d.student_id = x.id AND d.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = x.id AND c.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.house_members h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.cc_memberships m WHERE m.student_id = x.id AND m.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.kirti_entries k WHERE k.student_id = x.id AND k.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.discipline_actions a WHERE a.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_cases c WHERE c.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_referrals r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.student_change_requests r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.sibling_links l WHERE (l.a = x.id OR l.b = x.id) AND l.status <> ''suggested'')'
        -- A family member linked to a parent login since stays.
        WHEN 'family_members' THEN 'OR x.user_id IS NOT NULL'
        ELSE '' END,
      t)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_removed := v_removed + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
    END IF;
    -- The primary contacts the import took over from, once the members it added are gone (one primary per student).
    IF t = 'family_members' THEN
      WITH c AS (SELECT id, row_id FROM public.import_changes WHERE job_id = p_job AND table_name = 'family_primary' ORDER BY id LIMIT p_limit),
      done AS (
        UPDATE public.family_members f SET is_primary = true FROM c
        WHERE f.id = c.row_id AND NOT f.is_primary AND f.updated_at <= j.committed_at
          AND NOT EXISTS (SELECT 1 FROM public.family_members o WHERE o.student_id = f.student_id AND o.is_primary)
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) INTO v_n, v_kept FROM gone;
      v_restored := v_restored + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
      -- Members the import made primary that were kept (changed since) also keep that, so the old primary stays as it is.
    END IF;
    -- Receipts first, so the invoices they belong to can go.
    IF t = 'admission_applicants' THEN
      WITH c AS (SELECT id FROM public.fee_payments WHERE import_job_id = p_job AND voided_at IS NULL LIMIT p_limit),
      kept AS (UPDATE public.fee_payments p SET import_job_id = NULL FROM c WHERE p.id = c.id AND app.day_closed(p.school_id, p.paid_on) RETURNING p.id),
      v AS (UPDATE public.fee_payments p SET voided_at = now(), void_reason = 'import undone',
            voided_by = (SELECT u.id FROM public.users u WHERE u.id = j.undone_by)
            FROM c WHERE p.id = c.id AND p.id NOT IN (SELECT id FROM kept) RETURNING p.id)
      SELECT (SELECT count(*) FROM v), (SELECT count(*) FROM kept) INTO v_n, v_kept;
      v_removed := v_removed + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
  RETURN jsonb_build_object('done', true, 'restored', v_restored, 'removed', v_removed);
END $$;
REVOKE ALL ON FUNCTION public.import_undo(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_undo(uuid, int) TO service_role;
