-- Office roles, permissions and ERP controls — 2026-09-24
--
-- Access    role_permissions  catalogue: which permission each office role carries (mirrors src/lib/admin/rbac.ts)
--           role_grants       who holds which role, optionally until a date; revocation is soft and audited
--           app.has_perm(p)   used by RLS; app.user_has_perm(u, p) used by server functions
--           An admin account (users.role = 'admin') can do only what its active grants allow. The first admin
--           of a school is granted school_admin automatically; the last school_admin can't be removed.
-- Fees      fee_day_closes          end-of-day cash close; receipts on a closed day can't be added or voided
--           fee_concession_requests maker-checker: requested by one person, decided by another
-- Workforce leave_policies          days per leave type per session; balances are derived
-- Probe     probe_acks              acknowledged / snoozed findings, per school
--
-- Existing admin read policies on the ERP tables, audit_log and consents move from is_admin() to
-- has_perm(), so an accountant reads fees but not wellness, a counsellor wellness but not fees.

-- ---------------------------------------------------------------------------
-- 1. Roles and permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key text NOT NULL,
  perm     text NOT NULL,
  PRIMARY KEY (role_key, perm)
);

-- Replaced wholesale so the catalogue always matches this file (and rbac.ts).
DELETE FROM public.role_permissions;
INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin', ARRAY['dashboard.view','boardpack.view','probe.view','academics.read','workforce.read','leave.approve','leave.policy',
     'fees.read','fees.collect','fees.bill','fees.concession.request','fees.concession.approve','fees.void','fees.dayclose','fees.remind',
     'admissions.read','admissions.manage','wellness.read','wellness.file','compliance.read','compliance.act','audit.read','people.manage','access.manage']),
  ('principal', ARRAY['dashboard.view','boardpack.view','probe.view','academics.read','workforce.read','leave.approve','leave.policy',
     'fees.read','fees.collect','fees.bill','fees.concession.request','fees.concession.approve','fees.void','fees.dayclose','fees.remind',
     'admissions.read','admissions.manage','wellness.read','wellness.file','compliance.read','compliance.act','audit.read','people.manage']),
  ('vice_principal', ARRAY['dashboard.view','boardpack.view','probe.view','academics.read','workforce.read','leave.approve',
     'admissions.read','wellness.read','compliance.read']),
  ('finance_head', ARRAY['dashboard.view','boardpack.view','probe.view','fees.read','fees.collect','fees.bill','fees.concession.request',
     'fees.concession.approve','fees.void','fees.dayclose','fees.remind','audit.read']),
  ('accountant', ARRAY['dashboard.view','probe.view','fees.read','fees.collect','fees.bill','fees.concession.request','fees.dayclose','fees.remind']),
  ('cashier', ARRAY['dashboard.view','fees.read','fees.collect']),
  ('admissions_officer', ARRAY['dashboard.view','probe.view','admissions.read','admissions.manage']),
  ('hr_manager', ARRAY['dashboard.view','probe.view','workforce.read','leave.approve','leave.policy']),
  ('academic_coordinator', ARRAY['dashboard.view','probe.view','academics.read','workforce.read']),
  ('counsellor', ARRAY['dashboard.view','wellness.read']),
  ('dpo', ARRAY['dashboard.view','probe.view','compliance.read','compliance.act','audit.read','wellness.read'])
) AS t(r, ps), unnest(ps) AS p;

CREATE TABLE IF NOT EXISTS public.role_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_key    text NOT NULL CHECK (role_key IN ('school_admin','principal','vice_principal','finance_head','accountant','cashier',
                                                 'admissions_officer','hr_manager','academic_coordinator','counsellor','dpo')),
  expires_on  date,
  note        text CHECK (note IS NULL OR char_length(note) <= 300),
  granted_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  revoked_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_grants_active ON public.role_grants (user_id, role_key) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_role_grants_school ON public.role_grants (school_id) WHERE revoked_at IS NULL;

-- Does user u hold permission p in their own school right now?
CREATE OR REPLACE FUNCTION app.user_has_perm(u uuid, p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users x
    WHERE x.id = u AND (x.role = 'superadmin' OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = u))
  ) OR EXISTS (
    SELECT 1
    FROM public.role_grants g
    JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = p
    JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.user_id = u AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
  )
$$;

CREATE OR REPLACE FUNCTION app.has_perm(p text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.user_has_perm(auth.uid(), p)
$$;

-- Active holders of a permission in a school (separation-of-duties checks).
CREATE OR REPLACE FUNCTION app.perm_holders(p_school uuid, p text) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT g.user_id)::int
  FROM public.role_grants g
  JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = p
  JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
  WHERE g.school_id = p_school AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
$$;

-- Grants only go to admin accounts of the same school; the last school_admin can't be revoked.
CREATE OR REPLACE FUNCTION app.guard_role_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND school_id = NEW.school_id AND role = 'admin') THEN
      RAISE EXCEPTION 'Roles can only be given to office (admin) accounts of this school' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Only as a cascade from the account itself being deleted; otherwise grants are revoked, keeping the history.
    IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN
      RAISE EXCEPTION 'Grants are revoked, not deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.user_id, NEW.role_key, NEW.school_id) IS DISTINCT FROM (OLD.user_id, OLD.role_key, OLD.school_id) THEN
    RAISE EXCEPTION 'Revoke this grant and create a new one instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND OLD.role_key = 'school_admin'
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.school_id = OLD.school_id AND g.role_key = 'school_admin'
                     AND g.revoked_at IS NULL AND g.id <> OLD.id AND (g.expires_on IS NULL OR g.expires_on >= current_date)) THEN
    RAISE EXCEPTION 'A school must keep at least one school admin' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_role_grant ON public.role_grants;
CREATE TRIGGER trg_guard_role_grant BEFORE INSERT OR UPDATE OR DELETE ON public.role_grants
  FOR EACH ROW EXECUTE FUNCTION app.guard_role_grant();

-- The first admin account of a school becomes its school admin, so a new school is never locked out.
CREATE OR REPLACE FUNCTION app.bootstrap_school_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role = 'admin' AND NEW.school_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.school_id = NEW.school_id AND g.role_key = 'school_admin' AND g.revoked_at IS NULL) THEN
    INSERT INTO public.role_grants (school_id, user_id, role_key, note) VALUES (NEW.school_id, NEW.id, 'school_admin', 'First admin of the school');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_bootstrap_school_admin ON public.users;
CREATE TRIGGER trg_bootstrap_school_admin AFTER INSERT OR UPDATE OF role, school_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.bootstrap_school_admin();

-- Existing admins keep the full access they had before roles existed.
INSERT INTO public.role_grants (school_id, user_id, role_key, note)
SELECT u.school_id, u.id, 'school_admin', 'Held full admin access before office roles'
FROM public.users u
WHERE u.role = 'admin' AND u.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id = u.id AND g.revoked_at IS NULL);

-- ---------------------------------------------------------------------------
-- 2. Fees: day close and concession requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_day_closes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day           date NOT NULL,
  status        text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed', 'reopened')),
  totals        jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {mode: amount} of live receipts at close
  receipts      int NOT NULL DEFAULT 0,
  cash_expected numeric(12, 2) NOT NULL DEFAULT 0,
  cash_counted  numeric(12, 2) NOT NULL DEFAULT 0,
  variance      numeric(12, 2) GENERATED ALWAYS AS (cash_counted - cash_expected) STORED,
  note          text CHECK (note IS NULL OR char_length(note) <= 500),
  closed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at     timestamptz NOT NULL DEFAULT now(),
  reopened_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reopened_at   timestamptz,
  reopen_reason text,
  CHECK (status = 'closed' OR (reopened_at IS NOT NULL AND reopen_reason IS NOT NULL)),
  CHECK (variance = 0 OR note IS NOT NULL OR status = 'reopened'),
  UNIQUE (school_id, day)
);

CREATE OR REPLACE FUNCTION app.day_closed(p_school uuid, p_day date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fee_day_closes WHERE school_id = p_school AND day = p_day AND status = 'closed')
$$;

-- Close a day: totals are computed here from the receipts, never taken from the browser.
CREATE OR REPLACE FUNCTION public.admin_close_day(p_school uuid, p_day date, p_cash_counted numeric, p_note text, p_actor uuid)
RETURNS public.fee_day_closes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.fee_day_closes; v_totals jsonb; v_n int; v_cash numeric;
BEGIN
  IF NOT app.user_has_perm(p_actor, 'fees.dayclose') THEN RAISE EXCEPTION 'You can''t close the day book' USING ERRCODE = '42501'; END IF;
  IF p_day > current_date THEN RAISE EXCEPTION 'A future day can''t be closed' USING ERRCODE = '22023'; END IF;
  IF app.day_closed(p_school, p_day) THEN RAISE EXCEPTION 'That day is already closed' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_object_agg(mode, total), '{}'::jsonb), coalesce(sum(n), 0)::int
    INTO v_totals, v_n
    FROM (SELECT mode, sum(amount) AS total, count(*) AS n FROM public.fee_payments
          WHERE school_id = p_school AND paid_on = p_day AND voided_at IS NULL GROUP BY mode) t;
  v_cash := coalesce((v_totals ->> 'cash')::numeric, 0);
  IF p_cash_counted <> v_cash AND nullif(trim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Cash counted differs from receipts by %; explain the difference', p_cash_counted - v_cash USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fee_day_closes (school_id, day, status, totals, receipts, cash_expected, cash_counted, note, closed_by, closed_at,
                                     reopened_by, reopened_at, reopen_reason)
  VALUES (p_school, p_day, 'closed', v_totals, v_n, v_cash, p_cash_counted, nullif(trim(p_note), ''), p_actor, now(), NULL, NULL, NULL)
  ON CONFLICT (school_id, day) DO UPDATE
    SET status = 'closed', totals = EXCLUDED.totals, receipts = EXCLUDED.receipts, cash_expected = EXCLUDED.cash_expected,
        cash_counted = EXCLUDED.cash_counted, note = EXCLUDED.note, closed_by = EXCLUDED.closed_by, closed_at = now(),
        reopened_by = NULL, reopened_at = NULL, reopen_reason = NULL
  RETURNING * INTO v;
  RETURN v;
END $$;

CREATE TABLE IF NOT EXISTS public.fee_concession_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id    uuid NOT NULL REFERENCES public.fee_invoices(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount        numeric(12, 2) NOT NULL CHECK (amount >= 0),
  reason        text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  self_approved boolean NOT NULL DEFAULT false,
  CHECK (status <> 'rejected' OR decision_note IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_concession_pending ON public.fee_concession_requests (invoice_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_concession_school ON public.fee_concession_requests (school_id, status);

-- Decide a concession. The approver must hold fees.concession.approve and must not be the requester,
-- unless they are the only approver in the school (then it's recorded as self-approved).
CREATE OR REPLACE FUNCTION public.admin_decide_concession(p_school uuid, p_request uuid, p_approve boolean, p_note text, p_actor uuid)
RETURNS public.fee_concession_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.fee_concession_requests; inv public.fee_invoices; v_paid numeric; v_self boolean;
BEGIN
  IF NOT app.user_has_perm(p_actor, 'fees.concession.approve') THEN
    RAISE EXCEPTION 'You can''t approve concessions' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.fee_concession_requests WHERE id = p_request AND school_id = p_school FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request was already decided' USING ERRCODE = '22023'; END IF;
  v_self := r.requested_by = p_actor;
  IF v_self AND app.perm_holders(p_school, 'fees.concession.approve') > 1 THEN
    RAISE EXCEPTION 'Someone else has to approve a concession you requested' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve THEN
    IF nullif(trim(p_note), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for rejecting' USING ERRCODE = '22023'; END IF;
    UPDATE public.fee_concession_requests SET status = 'rejected', decided_by = p_actor, decided_at = now(), decision_note = trim(p_note)
      WHERE id = r.id RETURNING * INTO r;
    RETURN r;
  END IF;
  SELECT * INTO inv FROM public.fee_invoices WHERE id = r.invoice_id FOR UPDATE;
  IF inv.voided_at IS NOT NULL THEN RAISE EXCEPTION 'The invoice was voided' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.fee_payments WHERE invoice_id = inv.id AND voided_at IS NULL;
  IF r.amount > inv.amount - v_paid THEN
    RAISE EXCEPTION 'The concession is more than the unpaid part of the invoice (%)', inv.amount - v_paid USING ERRCODE = '22023';
  END IF;
  UPDATE public.fee_invoices SET concession = r.amount, concession_reason = CASE WHEN r.amount > 0 THEN r.reason END WHERE id = inv.id;
  UPDATE public.fee_concession_requests SET status = 'approved', decided_by = p_actor, decided_at = now(),
         decision_note = nullif(trim(p_note), ''), self_approved = v_self
    WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END $$;

-- Receipts on a closed day can't be added or voided.
CREATE OR REPLACE FUNCTION public.admin_record_payment(
  p_school uuid, p_invoice uuid, p_amount numeric, p_mode text, p_reference text, p_paid_on date, p_actor uuid)
RETURNS public.fee_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inv public.fee_invoices; v_paid numeric; v public.fee_payments;
BEGIN
  IF app.day_closed(p_school, p_paid_on) THEN
    RAISE EXCEPTION 'The day book for % is closed. Reopen it to add a receipt on that date.', p_paid_on USING ERRCODE = '22023';
  END IF;
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

CREATE OR REPLACE FUNCTION app.guard_fee_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Receipts cannot be deleted; void them instead' USING ERRCODE = '42501'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This receipt is already void' USING ERRCODE = '42501'; END IF;
  IF (NEW.amount, NEW.invoice_id, NEW.student_id, NEW.mode, NEW.paid_on, NEW.receipt_no, NEW.school_id)
     IS DISTINCT FROM (OLD.amount, OLD.invoice_id, OLD.student_id, OLD.mode, OLD.paid_on, OLD.receipt_no, OLD.school_id) THEN
    RAISE EXCEPTION 'Receipts cannot be edited; void and re-issue' USING ERRCODE = '42501';
  END IF;
  IF NEW.voided_at IS NOT NULL AND app.day_closed(OLD.school_id, OLD.paid_on) THEN
    RAISE EXCEPTION 'The day book for % is closed. Reopen it to void this receipt.', OLD.paid_on USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Leave policy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session       text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  leave_type    text NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'duty', 'maternity', 'paternity', 'unpaid')),
  days_per_year numeric(5, 1) NOT NULL CHECK (days_per_year >= 0 AND days_per_year <= 366),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, session, leave_type)
);

-- ---------------------------------------------------------------------------
-- 4. Probe acknowledgements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.probe_acks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  finding_key  text NOT NULL CHECK (char_length(finding_key) <= 200),
  -- The finding's state when acknowledged; if it changes (worse), the finding comes back.
  fingerprint  text NOT NULL CHECK (char_length(fingerprint) <= 200),
  status       text NOT NULL CHECK (status IN ('acknowledged', 'snoozed')),
  snooze_until date,
  note         text CHECK (note IS NULL OR char_length(note) <= 500),
  acked_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  acked_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'snoozed' OR snooze_until IS NOT NULL),
  UNIQUE (school_id, finding_key)
);

-- ---------------------------------------------------------------------------
-- 5. RLS (new tables) and has_perm-based reads (existing ERP tables)
-- ---------------------------------------------------------------------------
ALTER TABLE public.role_permissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_day_closes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_concession_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_policies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_acks              ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.role_permissions, public.role_grants, public.fee_day_closes, public.fee_concession_requests,
  public.leave_policies, public.probe_acks FROM anon;
GRANT SELECT ON public.role_permissions, public.role_grants, public.fee_day_closes, public.fee_concession_requests,
  public.leave_policies, public.probe_acks TO authenticated;
GRANT ALL ON public.role_permissions, public.role_grants, public.fee_day_closes, public.fee_concession_requests,
  public.leave_policies, public.probe_acks TO service_role;

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS role_grants_read ON public.role_grants;
CREATE POLICY role_grants_read ON public.role_grants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR ((SELECT app.has_perm('access.manage')) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_day_closes_read ON public.fee_day_closes;
CREATE POLICY fee_day_closes_read ON public.fee_day_closes FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_concession_requests_read ON public.fee_concession_requests;
CREATE POLICY fee_concession_requests_read ON public.fee_concession_requests FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS leave_policies_read ON public.leave_policies;
CREATE POLICY leave_policies_read ON public.leave_policies FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS probe_acks_read ON public.probe_acks;
CREATE POLICY probe_acks_read ON public.probe_acks FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('probe.view')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- Existing admin reads, now by permission.
DROP POLICY IF EXISTS fee_structures_read ON public.fee_structures;
CREATE POLICY fee_structures_read ON public.fee_structures FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id()))
         OR ((SELECT app.user_role()) = 'parent' AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_invoices_read ON public.fee_invoices;
CREATE POLICY fee_invoices_read ON public.fee_invoices FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_payments_read ON public.fee_payments;
CREATE POLICY fee_payments_read ON public.fee_payments FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS fee_reminders_read ON public.fee_reminders;
CREATE POLICY fee_reminders_read ON public.fee_reminders FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('fees.read')) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS admission_applicants_read ON public.admission_applicants;
CREATE POLICY admission_applicants_read ON public.admission_applicants FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('admissions.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS admission_events_read ON public.admission_events;
CREATE POLICY admission_events_read ON public.admission_events FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('admissions.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS leave_requests_read ON public.leave_requests;
CREATE POLICY leave_requests_read ON public.leave_requests FOR SELECT TO authenticated
  USING (staff_id = (SELECT auth.uid())
         OR ((SELECT app.has_perm('workforce.read')) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS school_filings_read ON public.school_filings;
CREATE POLICY school_filings_read ON public.school_filings FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('wellness.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS audit_log_read ON public.audit_log;
CREATE POLICY audit_log_read ON public.audit_log FOR SELECT TO authenticated
  USING (((SELECT app.has_perm('audit.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS consents_read ON public.consents;
CREATE POLICY consents_read ON public.consents FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR app.is_parent_of(student_id)
         OR ((SELECT app.has_perm('compliance.read')) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

-- School-wide wellness report: wellness.read, not every admin.
CREATE OR REPLACE FUNCTION public.school_wellness_report(p_since date)
RETURNS TABLE (bucket text, key text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH w AS (
    SELECT w.student_id, w.energy, w.created_at, app.grade_of(s.student_class) AS grade
    FROM public.wellness_logs w
    JOIN public.users s ON s.id = w.student_id
    WHERE app.has_perm('wellness.read')
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

-- ---------------------------------------------------------------------------
-- 6. Triggers and grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leave_policies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['role_grants', 'fee_day_closes', 'fee_concession_requests', 'leave_policies', 'probe_acks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.audit()', t);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.admin_close_day(uuid, date, numeric, text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_concession(uuid, uuid, boolean, text, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, date, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_day(uuid, date, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_concession(uuid, uuid, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_payment(uuid, uuid, numeric, text, text, date, uuid) TO service_role;
REVOKE ALL ON FUNCTION app.perm_holders(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION app.user_has_perm(uuid, text), app.has_perm(text), app.perm_holders(uuid, text), app.day_closed(uuid, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.guard_role_grant(), app.bootstrap_school_admin() TO authenticated, service_role;
