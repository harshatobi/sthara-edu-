-- School administration ERP — 2026-09-24
--
-- Fees        fee_structures  what each grade is billed for a session, and when
--             fee_invoices    one per student per instalment (the demand)
--             fee_payments    receipts against an invoice (never edited; voided with a reason)
--             fee_reminders   every reminder sent to a family, with its tone
-- Admissions  admission_applicants + admission_events (every stage move, with who and why)
-- Workforce   leave_requests  a teacher applies; an admin approves or rejects with a reason
-- Compliance  school_filings  regulator filings (CBSE wellness report) — manual fields + sign-off
--
-- Reads: admins of the school (RLS); parents read their own children's invoices,
-- payments and reminders; teachers read their own leave. Writes: only through the
-- admin/teacher API routes (service role), which check role and school from the DB.
-- Money-moving steps (raising invoices, recording and voiding a payment) are
-- SECURITY DEFINER functions callable only by the service role, so numbering is
-- gapless and an overpayment can't slip in between a read and a write.
-- Every table here is audited into audit_log.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- "Class 10-A" -> 10, "10a" -> 10, "Grade 9" -> 9; NULL when there's no number.
CREATE OR REPLACE FUNCTION app.grade_of(t text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT nullif(substring(coalesce(t, '') from '(\d{1,2})'), '')::int
$$;

-- Gapless per-school document numbers (invoices, receipts), per session.
CREATE TABLE IF NOT EXISTS public.doc_counters (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind      text NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  session   text NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, kind, session)
);

CREATE OR REPLACE FUNCTION app.next_doc_no(p_school uuid, p_kind text, p_session text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, p_kind, p_session, 1)
  ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN (CASE p_kind WHEN 'invoice' THEN 'INV' ELSE 'RCT' END) || '/' || p_session || '/' || lpad(n::text, 5, '0');
END $$;

-- ---------------------------------------------------------------------------
-- Fees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session      text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  grade        int  NOT NULL CHECK (grade BETWEEN 1 AND 12),
  annual_fee   numeric(12, 2) NOT NULL CHECK (annual_fee >= 0),
  -- [{no, label, due_on (date), share (0..1)}]; shares sum to 1 (checked by the API).
  schedule     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(schedule) = 'array'),
  note         text CHECK (note IS NULL OR char_length(note) <= 500),
  updated_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, session, grade)
);

CREATE TABLE IF NOT EXISTS public.fee_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  session       text NOT NULL,
  instalment_no int  NOT NULL CHECK (instalment_no BETWEEN 1 AND 12),
  label         text NOT NULL,
  invoice_no    text NOT NULL,
  due_on        date NOT NULL,
  amount        numeric(12, 2) NOT NULL CHECK (amount >= 0),
  concession    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (concession >= 0),
  concession_reason text,
  voided_at     timestamptz,
  void_reason   text,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (concession <= amount),
  CHECK (concession = 0 OR concession_reason IS NOT NULL),
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL),
  UNIQUE (school_id, invoice_no),
  UNIQUE (student_id, session, instalment_no)
);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_school ON public.fee_invoices (school_id, session, due_on);

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE RESTRICT,
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount      numeric(12, 2) NOT NULL CHECK (amount > 0),
  mode        text NOT NULL CHECK (mode IN ('upi', 'bank_transfer', 'card', 'cheque', 'cash', 'dd')),
  reference   text CHECK (reference IS NULL OR char_length(reference) <= 120),
  paid_on     date NOT NULL,
  receipt_no  text NOT NULL,
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  voided_at   timestamptz,
  void_reason text,
  voided_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (voided_at IS NULL OR void_reason IS NOT NULL),
  UNIQUE (school_id, receipt_no)
);
CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice ON public.fee_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON public.fee_payments (school_id, paid_on DESC);

CREATE TABLE IF NOT EXISTS public.fee_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invoice_ids uuid[] NOT NULL DEFAULT '{}',
  outstanding numeric(12, 2) NOT NULL,
  tone        text NOT NULL CHECK (tone IN ('gentle', 'firm', 'final')),
  channel     text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'whatsapp', 'email', 'sms')),
  recipients  int NOT NULL DEFAULT 0,
  sent_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_reminders_student ON public.fee_reminders (student_id, sent_at DESC);

-- Raise one instalment for every student of the school whose grade has a
-- structure for the session. Students already invoiced for it are skipped.
CREATE OR REPLACE FUNCTION public.admin_raise_invoices(p_school uuid, p_session text, p_instalment int, p_actor uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n int := 0; v_share numeric; v_label text; v_due date;
BEGIN
  FOR r IN
    SELECT u.id AS student_id, fs.annual_fee, fs.schedule
    FROM public.users u
    JOIN public.fee_structures fs
      ON fs.school_id = u.school_id AND fs.session = p_session AND fs.grade = app.grade_of(u.student_class)
    WHERE u.school_id = p_school AND u.role = 'student'
      AND NOT EXISTS (SELECT 1 FROM public.fee_invoices i
                      WHERE i.student_id = u.id AND i.session = p_session AND i.instalment_no = p_instalment)
    ORDER BY u.student_class, u.name
  LOOP
    SELECT (e ->> 'share')::numeric, e ->> 'label', (e ->> 'due_on')::date INTO v_share, v_label, v_due
    FROM jsonb_array_elements(r.schedule) e WHERE (e ->> 'no')::int = p_instalment;
    CONTINUE WHEN v_share IS NULL OR v_due IS NULL;
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, r.student_id, p_session, p_instalment, coalesce(v_label, 'Instalment ' || p_instalment),
            app.next_doc_no(p_school, 'invoice', p_session), v_due, round(r.annual_fee * v_share, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Record a receipt. Locks the invoice so two cashiers can't both take the last rupee.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_school uuid, p_invoice uuid, p_amount numeric, p_mode text, p_reference text, p_paid_on date, p_actor uuid)
RETURNS public.fee_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inv public.fee_invoices; v_paid numeric; v public.fee_payments;
BEGIN
  SELECT * INTO inv FROM public.fee_invoices WHERE id = p_invoice AND school_id = p_school FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;
  IF inv.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This invoice was voided' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.fee_payments WHERE invoice_id = p_invoice AND voided_at IS NULL;
  IF p_amount > inv.amount - inv.concession - v_paid THEN
    RAISE EXCEPTION 'Payment exceeds the balance due (%)', inv.amount - inv.concession - v_paid USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fee_payments (school_id, invoice_id, student_id, amount, mode, reference, paid_on, receipt_no, recorded_by)
  VALUES (p_school, p_invoice, inv.student_id, p_amount, p_mode, nullif(trim(p_reference), ''), p_paid_on,
          app.next_doc_no(p_school, 'receipt', inv.session), p_actor)
  RETURNING * INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.admin_raise_invoices(uuid, text, int, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, date, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_raise_invoices(uuid, text, int, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, date, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Admissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admission_applicants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session          text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  grade            int  NOT NULL CHECK (grade BETWEEN 1 AND 12),
  date_of_birth    date,
  guardian_name    text CHECK (guardian_name IS NULL OR char_length(guardian_name) <= 120),
  guardian_phone   text CHECK (guardian_phone IS NULL OR char_length(guardian_phone) <= 20),
  guardian_email   text CHECK (guardian_email IS NULL OR char_length(guardian_email) <= 160),
  previous_school  text CHECK (previous_school IS NULL OR char_length(previous_school) <= 160),
  source           text NOT NULL DEFAULT 'walk_in'
                   CHECK (source IN ('walk_in', 'website', 'referral', 'sibling', 'event', 'advertisement', 'other')),
  stage            text NOT NULL DEFAULT 'enquiry'
                   CHECK (stage IN ('enquiry', 'application', 'assessment', 'offer', 'enrolled', 'rejected', 'withdrawn')),
  -- The furthest stage reached before closing (so funnel conversion stays honest after a rejection).
  furthest_stage   text NOT NULL DEFAULT 'enquiry'
                   CHECK (furthest_stage IN ('enquiry', 'application', 'assessment', 'offer', 'enrolled')),
  assessment_on    date,
  notes            text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admission_applicants_school ON public.admission_applicants (school_id, session, stage);

CREATE TABLE IF NOT EXISTS public.admission_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  from_stage   text,
  to_stage     text NOT NULL,
  note         text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admission_events_applicant ON public.admission_events (applicant_id, at);

-- ---------------------------------------------------------------------------
-- Workforce: leave
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  leave_type    text NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'duty', 'maternity', 'paternity', 'unpaid')),
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  half_day      boolean NOT NULL DEFAULT false,
  reason        text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 1000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date),
  CHECK (NOT half_day OR to_date = from_date),
  CHECK (status <> 'rejected' OR decision_note IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_school ON public.leave_requests (school_id, status, from_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON public.leave_requests (staff_id, from_date DESC);

-- ---------------------------------------------------------------------------
-- Compliance filings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_filings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('cbse_wellness')),
  session    text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  due_on     date,
  -- Manually entered sections: {interventions, counsellorReferrals, trainingHours, signatoryName, signatoryTitle}
  data       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  -- Auto-populated figures frozen at the moment of filing.
  snapshot   jsonb,
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed')),
  filed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  filed_at   timestamptz,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR (filed_at IS NOT NULL AND snapshot IS NOT NULL)),
  UNIQUE (school_id, kind, session)
);

-- ---------------------------------------------------------------------------
-- School-wide wellness for the CBSE report (anonymised, admin only)
-- ---------------------------------------------------------------------------
-- Weekly school-wide energy and per-grade averages. Same privacy rules as
-- school_wellness_aggregates: no notes, and any bucket with fewer than 5
-- distinct students is suppressed (returned with NULL averages).
CREATE OR REPLACE FUNCTION public.school_wellness_report(p_since date)
RETURNS TABLE (bucket text, key text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH w AS (
    SELECT w.student_id, w.energy, w.created_at, app.grade_of(s.student_class) AS grade
    FROM public.wellness_logs w
    JOIN public.users s ON s.id = w.student_id
    WHERE (app.is_admin() OR app.is_superadmin())
      AND w.school_id = app.current_school_id()
      AND w.energy IS NOT NULL
      AND w.created_at >= greatest(p_since, (now() - interval '400 days')::date)
  ), agg AS (
    SELECT 'week'::text AS bucket, to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS key,
           count(DISTINCT student_id) AS students, count(*) AS checkins,
           avg(energy) AS e, avg((energy <= 2)::int) AS l
    FROM w GROUP BY 2
    UNION ALL
    SELECT 'grade', grade::text, count(DISTINCT student_id), count(*), avg(energy), avg((energy <= 2)::int)
    FROM w WHERE grade IS NOT NULL GROUP BY 2
    UNION ALL
    SELECT 'school', 'all', count(DISTINCT student_id), count(*), avg(energy), avg((energy <= 2)::int) FROM w
    HAVING count(*) > 0
  )
  SELECT bucket, key, students, checkins,
         CASE WHEN students >= 5 THEN round(e::numeric, 2) END,
         CASE WHEN students >= 5 THEN round(l::numeric, 2) END
  FROM agg
$$;
REVOKE ALL ON FUNCTION public.school_wellness_report(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.school_wellness_report(date) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.doc_counters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reminders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_filings       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.doc_counters, public.fee_structures, public.fee_invoices, public.fee_payments, public.fee_reminders,
  public.admission_applicants, public.admission_events, public.leave_requests, public.school_filings FROM anon;
REVOKE ALL ON public.doc_counters FROM authenticated;
GRANT SELECT ON public.fee_structures, public.fee_invoices, public.fee_payments, public.fee_reminders,
  public.admission_applicants, public.admission_events, public.leave_requests, public.school_filings TO authenticated;
GRANT ALL ON public.doc_counters, public.fee_structures, public.fee_invoices, public.fee_payments, public.fee_reminders,
  public.admission_applicants, public.admission_events, public.leave_requests, public.school_filings TO service_role;

DROP POLICY IF EXISTS fee_structures_read ON public.fee_structures;
CREATE POLICY fee_structures_read ON public.fee_structures FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_invoices_read ON public.fee_invoices;
CREATE POLICY fee_invoices_read ON public.fee_invoices FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_payments_read ON public.fee_payments;
CREATE POLICY fee_payments_read ON public.fee_payments FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_reminders_read ON public.fee_reminders;
CREATE POLICY fee_reminders_read ON public.fee_reminders FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS admission_applicants_read ON public.admission_applicants;
CREATE POLICY admission_applicants_read ON public.admission_applicants FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS admission_events_read ON public.admission_events;
CREATE POLICY admission_events_read ON public.admission_events FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS leave_requests_read ON public.leave_requests;
CREATE POLICY leave_requests_read ON public.leave_requests FOR SELECT TO authenticated
  USING (staff_id = (SELECT auth.uid())
         OR ((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS school_filings_read ON public.school_filings;
CREATE POLICY school_filings_read ON public.school_filings FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- ---------------------------------------------------------------------------
-- Triggers: updated_at + audit
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_structures', 'fee_invoices', 'admission_applicants', 'leave_requests', 'school_filings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['fee_structures', 'fee_invoices', 'fee_payments', 'fee_reminders', 'admission_applicants',
                           'leave_requests', 'school_filings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.audit()', t);
  END LOOP;
END $$;

-- Receipts are never edited except to void them.
CREATE OR REPLACE FUNCTION app.guard_fee_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Receipts cannot be deleted; void them instead' USING ERRCODE = '42501'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This receipt is already void' USING ERRCODE = '42501'; END IF;
  IF (NEW.amount, NEW.invoice_id, NEW.student_id, NEW.mode, NEW.paid_on, NEW.receipt_no, NEW.school_id)
     IS DISTINCT FROM (OLD.amount, OLD.invoice_id, OLD.student_id, OLD.mode, OLD.paid_on, OLD.receipt_no, OLD.school_id) THEN
    RAISE EXCEPTION 'Receipts cannot be edited; void and re-issue' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS trg_guard_fee_payment ON public.fee_payments;
CREATE TRIGGER trg_guard_fee_payment BEFORE UPDATE OR DELETE ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION app.guard_fee_payment();

-- Helpers added here must stay executable by clients whose statements fire triggers.
REVOKE ALL ON FUNCTION app.next_doc_no(uuid, text, text) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION app.grade_of(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.guard_fee_payment() TO authenticated;
