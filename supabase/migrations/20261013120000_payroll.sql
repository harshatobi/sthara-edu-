-- Payroll — 2026-10-13
--
-- Builds on the employee master (grades, statutory and bank details, exits) and the attendance month review.
--
-- statutory_rates       Sthara's dated rate tables: PF, ESI, professional tax by state, income tax slabs for both
--                       regimes, statutory bonus and gratuity. One row per key and effective date.
-- statutory_overrides   a school's own rate for a key from a date, with the reason; wins over Sthara's table
-- payroll_settings      per school: day basis for loss of pay, PF and ESI registration and policy, professional tax
--                       state, TAN, bonus month, gratuity and leave encashment switches
-- pay_items             the school's own earnings and deductions. Each is fixed, a percentage, or a rate times a
--                       count read from records (sessions, duties, invigilation, covers, lessons), and says whether
--                       it is taxable, counts for PF and ESI, and reduces with loss of pay.
-- salary_templates      a structure per grade: which items, with default figures
-- staff_salaries        a person's salary from a date (effective-dated, like their job); the lines hold their own
--                       figure for each item
-- staff_pay_settings    per person: tax regime, PF mode, professional tax and ESI exemptions, payment mode, hold
-- pay_adjustments       one-off additions, deductions and overrides for a person in a month, with a note
-- staff_loans           advances and loans with a monthly instalment; loan_recoveries records what each run took
-- tax_declarations      per person per financial year: regime, investments, rent, previous employer
-- pay_runs              a month's payroll (or one person's full and final settlement): draft, submitted, approved.
--                       The person who submits can't approve. An approved run is frozen.
-- pay_run_lines         one person's pay in a run: days, every earning and deduction, employer contributions, net.
--                       A snapshot: it never changes after approval, whatever happens to the salary or the rates.
--
-- Permissions: payroll.prepare builds and submits runs and keeps salaries (HR manager, accountant);
-- payroll.approve approves or sends back (principal, finance head); payroll.read sees runs and salaries. The school
-- admin and the principal hold all three, as they hold every permission; the submit-then-approve rule still
-- stops anyone approving a run they submitted.
--
-- Access: no browser role reads or writes any of this. Everything goes through /api/admin/payroll and
-- /api/me/payslips (service role), which check the permission and record salary views in audit_log.

INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin', ARRAY['payroll.read','payroll.prepare','payroll.approve']),
  ('principal',    ARRAY['payroll.read','payroll.prepare','payroll.approve']),
  ('hr_manager',   ARRAY['payroll.read','payroll.prepare']),
  ('accountant',   ARRAY['payroll.read','payroll.prepare']),
  ('finance_head', ARRAY['payroll.read','payroll.approve'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- ── Rate tables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.statutory_rates (
  key             text NOT NULL CHECK (key ~ '^[a-z]+(:[A-Za-z]+)?$'),
  effective_from  date NOT NULL,
  value           jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  note            text CHECK (length(note) <= 500),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, effective_from)
);

CREATE TABLE IF NOT EXISTS public.statutory_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  key             text NOT NULL,
  effective_from  date NOT NULL,
  value           jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  reason          text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, key, effective_from)
);

-- Seeded once; later changes are new dated rows (or edits by Sthara), never overwritten by re-running this file.
INSERT INTO public.statutory_rates (key, effective_from, value, note) VALUES
  ('pf', '2014-09-01', '{"employee_pct": 12, "employer_pct": 12, "eps_pct": 8.33, "ceiling": 15000, "admin_pct": 0.5, "edli_pct": 0.5}',
     'EPF: 12% each on Basic + DA; 8.33% of the employer share (on wages up to the ceiling) goes to pension.'),
  ('esi', '2019-07-01', '{"employee_pct": 0.75, "employer_pct": 3.25, "ceiling": 21000}',
     'ESI: for employees with gross wages up to the ceiling.'),
  ('bonus', '2015-04-01', '{"pct": 8.33, "wage_ceiling": 21000, "calc_ceiling": 7000}',
     'Payment of Bonus Act: minimum bonus on Basic + DA capped at the calculation ceiling, for wages up to the wage ceiling.'),
  ('gratuity', '2018-03-29', '{"min_years": 5, "days": 15, "divisor": 26, "cap": 2000000}',
     'Payment of Gratuity Act: 15 days of last Basic + DA for each completed year, after five years.'),
  ('pt:AP', '2013-04-01', '{"slabs": [{"upto": 15000, "amount": 0}, {"upto": 20000, "amount": 150}, {"upto": null, "amount": 200}]}',
     'Andhra Pradesh professional tax, monthly, on gross salary.'),
  ('pt:TS', '2014-06-02', '{"slabs": [{"upto": 15000, "amount": 0}, {"upto": 20000, "amount": 150}, {"upto": null, "amount": 200}]}',
     'Telangana professional tax, monthly, on gross salary.'),
  ('pt:KA', '2023-04-01', '{"slabs": [{"upto": 24999, "amount": 0}, {"upto": null, "amount": 200}], "february_amount": 300}',
     'Karnataka professional tax, monthly; Rs 300 in February.'),
  ('it:new', '2025-04-01', '{"standard_deduction": 75000, "slabs": [{"upto": 400000, "pct": 0}, {"upto": 800000, "pct": 5}, {"upto": 1200000, "pct": 10}, {"upto": 1600000, "pct": 15}, {"upto": 2000000, "pct": 20}, {"upto": 2400000, "pct": 25}, {"upto": null, "pct": 30}], "rebate_income": 1200000, "rebate_max": 60000, "marginal_relief": true, "cess_pct": 4, "surcharge": [{"above": 5000000, "pct": 10}, {"above": 10000000, "pct": 15}, {"above": 20000000, "pct": 25}]}',
     'New tax regime, FY 2025-26 slabs. Confirm against the Finance Act for each new year.'),
  ('it:old', '2023-04-01', '{"standard_deduction": 50000, "slabs": [{"upto": 250000, "pct": 0}, {"upto": 500000, "pct": 5}, {"upto": 1000000, "pct": 20}, {"upto": null, "pct": 30}], "senior_exemption": 300000, "super_senior_exemption": 500000, "rebate_income": 500000, "rebate_max": 12500, "marginal_relief": false, "cess_pct": 4, "surcharge": [{"above": 5000000, "pct": 10}, {"above": 10000000, "pct": 15}, {"above": 20000000, "pct": 25}, {"above": 50000000, "pct": 37}], "caps": {"c80": 150000, "d80": 75000, "home_loan_interest": 200000, "nps_80ccd1b": 50000}}',
     'Old tax regime slabs and deduction caps.')
ON CONFLICT (key, effective_from) DO NOTHING;

-- ── School settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  school_id        uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  day_basis        text NOT NULL DEFAULT 'calendar' CHECK (day_basis IN ('calendar', 'fixed30', 'working26')),
  pf_enabled       boolean NOT NULL DEFAULT false,
  pf_policy        text NOT NULL DEFAULT 'capped' CHECK (pf_policy IN ('capped', 'full')),
  pf_code          text CHECK (length(pf_code) <= 40),
  esi_enabled      boolean NOT NULL DEFAULT false,
  esi_code         text CHECK (length(esi_code) <= 40),
  pt_state         text CHECK (pt_state ~ '^[A-Z]{2}$'),
  tds_enabled      boolean NOT NULL DEFAULT true,
  tan              text CHECK (tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
  employer_pan     text CHECK (employer_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  bonus_enabled    boolean NOT NULL DEFAULT false,
  bonus_month      smallint NOT NULL DEFAULT 10 CHECK (bonus_month BETWEEN 1 AND 12),
  gratuity_enabled boolean NOT NULL DEFAULT true,
  encash_types     text[] NOT NULL DEFAULT '{earned}',
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Pay items, templates, salaries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code          text NOT NULL CHECK (code ~ '^[A-Z0-9_]{1,16}$'),
  name          text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  kind          text NOT NULL CHECK (kind IN ('earning', 'deduction')),
  calc          text NOT NULL CHECK (calc IN ('fixed', 'percent', 'rate_count')),
  percent_of    text CHECK (percent_of IN ('basic', 'basic_da', 'gross')),
  count_source  text CHECK (count_source IN ('sessions', 'duties', 'duty_hours', 'invigilation', 'event_duty', 'covers', 'lessons')),
  threshold     numeric(8, 2) NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  default_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (default_value >= 0),
  role          text CHECK (role IN ('basic', 'da', 'hra')),            -- what the statutory rules read
  taxable       boolean NOT NULL DEFAULT true,
  pf_wage       boolean NOT NULL DEFAULT false,
  esi_wage      boolean NOT NULL DEFAULT true,
  prorate       boolean NOT NULL DEFAULT true,                           -- reduces with loss of pay and part months
  sort          smallint NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code),
  CHECK (calc <> 'percent' OR percent_of IS NOT NULL),
  CHECK (calc <> 'rate_count' OR count_source IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.salary_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id    uuid REFERENCES public.hr_grades(id) ON DELETE SET NULL,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  -- [{ item_id, value }]: an amount, a percentage or a rate, as the item says
  lines       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) <= 60),
  active      boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_templates_name ON public.salary_templates (school_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  effective_from   date NOT NULL,
  template_id      uuid REFERENCES public.salary_templates(id) ON DELETE SET NULL,
  lines            jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 60),
  reason           text CHECK (length(reason) <= 500),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_school ON public.staff_salaries (school_id, effective_from);

CREATE TABLE IF NOT EXISTS public.staff_pay_settings (
  staff_member_id  uuid PRIMARY KEY REFERENCES public.staff_members(id) ON DELETE CASCADE,
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tax_regime       text NOT NULL DEFAULT 'new' CHECK (tax_regime IN ('new', 'old')),
  pf_mode          text NOT NULL DEFAULT 'policy' CHECK (pf_mode IN ('policy', 'exempt', 'capped', 'full')),
  vpf_pct          numeric(5, 2) NOT NULL DEFAULT 0 CHECK (vpf_pct BETWEEN 0 AND 88),
  esi_exempt       boolean NOT NULL DEFAULT false,
  pt_exempt        boolean NOT NULL DEFAULT false,
  tds_exempt       boolean NOT NULL DEFAULT false,
  pay_mode         text NOT NULL DEFAULT 'bank' CHECK (pay_mode IN ('bank', 'cash', 'cheque')),
  on_hold          boolean NOT NULL DEFAULT false,
  hold_reason      text CHECK (length(hold_reason) <= 300),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pay_adjustments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  month            date NOT NULL CHECK (extract(day FROM month) = 1),
  -- 'add': an extra line. 'override': replaces what the rules worked out for item_id this month.
  mode             text NOT NULL DEFAULT 'add' CHECK (mode IN ('add', 'override')),
  item_id          uuid REFERENCES public.pay_items(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('earning', 'deduction')),
  label            text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  amount           numeric(12, 2) NOT NULL CHECK (amount >= 0),
  taxable          boolean NOT NULL DEFAULT true,
  note             text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 500),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (mode <> 'override' OR item_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_pay_adjustments_month ON public.pay_adjustments (school_id, month);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_adjustments_override ON public.pay_adjustments (staff_member_id, month, item_id) WHERE mode = 'override';

CREATE TABLE IF NOT EXISTS public.staff_loans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('advance', 'loan')),
  principal        numeric(12, 2) NOT NULL CHECK (principal > 0),
  issued_on        date NOT NULL,
  instalment       numeric(12, 2) NOT NULL CHECK (instalment > 0),
  start_month      date NOT NULL CHECK (extract(day FROM start_month) = 1),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'written_off')),
  note             text CHECK (length(note) <= 500),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_staff_loans_member ON public.staff_loans (staff_member_id, status);

CREATE TABLE IF NOT EXISTS public.tax_declarations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  fy               text NOT NULL CHECK (fy ~ '^\d{4}-\d{2}$'),
  -- { c80, d80, rent_annual, metro, home_loan_interest, nps_80ccd1b, other_income, prev_income, prev_tds }
  items            jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(items) = 'object'),
  proofs_verified  boolean NOT NULL DEFAULT false,
  verified_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at      timestamptz,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, fy)
);

-- ── Runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pay_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'settlement')),
  month            date NOT NULL CHECK (extract(day FROM month) = 1),
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,     -- settlement: whose
  exit_id          uuid REFERENCES public.staff_exits(id) ON DELETE SET NULL,
  -- settlement inputs: { leave_days, notice_short_days, gratuity: 'auto' | 'none' | amount, last_day }
  inputs           jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(inputs) = 'object'),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  totals           jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at      timestamptz,
  computed_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at     timestamptz,
  approved_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  note             text CHECK (length(note) <= 1000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'settlement') = (staff_member_id IS NOT NULL)),
  CHECK (kind <> 'settlement' OR exit_id IS NOT NULL OR status = 'approved'),
  CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND submitted_by IS NOT NULL)),
  CHECK (status <> 'approved' OR approved_by <> submitted_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_runs_month ON public.pay_runs (school_id, month) WHERE kind = 'regular';
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_runs_settlement ON public.pay_runs (exit_id) WHERE kind = 'settlement';

CREATE TABLE IF NOT EXISTS public.pay_run_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  month            date NOT NULL,
  person           jsonb NOT NULL,        -- name, code, designation, department, grade as they stood
  days             jsonb NOT NULL,        -- { basis, employed, lop, payable }
  earnings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  deductions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  employer         jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax              jsonb NOT NULL DEFAULT '{}'::jsonb,     -- how the month's TDS was worked out
  gross            numeric(12, 2) NOT NULL DEFAULT 0,
  total_deductions numeric(12, 2) NOT NULL DEFAULT 0,
  net              numeric(12, 2) NOT NULL DEFAULT 0,
  on_hold          boolean NOT NULL DEFAULT false,
  pay_mode         text NOT NULL DEFAULT 'bank',
  flags            text[] NOT NULL DEFAULT '{}',
  UNIQUE (run_id, staff_member_id)
);
CREATE INDEX IF NOT EXISTS idx_pay_run_lines_member ON public.pay_run_lines (staff_member_id, month);

CREATE TABLE IF NOT EXISTS public.loan_recoveries (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id   uuid NOT NULL REFERENCES public.staff_loans(id) ON DELETE CASCADE,
  run_id    uuid NOT NULL REFERENCES public.pay_runs(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  amount    numeric(12, 2) NOT NULL CHECK (amount > 0),
  UNIQUE (loan_id, run_id)
);

-- An approved run is frozen: its lines can't be added, changed or removed, and the run itself can't move back.
CREATE OR REPLACE FUNCTION app.guard_pay_run_lines() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = coalesce(NEW.run_id, OLD.run_id) AND r.status = 'approved') THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_pay_run_lines ON public.pay_run_lines;
CREATE TRIGGER trg_guard_pay_run_lines BEFORE INSERT OR UPDATE OR DELETE ON public.pay_run_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_pay_run_lines();

CREATE OR REPLACE FUNCTION app.guard_pay_runs() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Removing a whole school takes its payroll with it: by then the school row is already gone.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_pay_runs ON public.pay_runs;
CREATE TRIGGER trg_guard_pay_runs BEFORE UPDATE OR DELETE ON public.pay_runs
  FOR EACH ROW EXECUTE FUNCTION app.guard_pay_runs();

-- Approving a run and booking its loan recoveries happen together or not at all.
CREATE OR REPLACE FUNCTION public.payroll_approve_run(p_school uuid, p_run uuid, p_by uuid, p_recoveries jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.pay_runs; x jsonb;
BEGIN
  SELECT * INTO r FROM public.pay_runs WHERE id = p_run AND school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payroll: no such run' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'payroll: run is not awaiting approval' USING ERRCODE = 'P0001'; END IF;
  IF r.submitted_by = p_by THEN RAISE EXCEPTION 'payroll: the person who submitted a run cannot approve it' USING ERRCODE = 'P0001'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_recoveries, '[]'::jsonb)) LOOP
    INSERT INTO public.loan_recoveries (loan_id, run_id, school_id, amount)
    SELECT l.id, p_run, p_school, (x ->> 'amount')::numeric FROM public.staff_loans l
    WHERE l.id = (x ->> 'loan_id')::uuid AND l.school_id = p_school;
  END LOOP;
  UPDATE public.staff_loans l SET status = 'closed', closed_at = now()
  WHERE l.school_id = p_school AND l.status = 'open'
    AND l.principal <= (SELECT coalesce(sum(amount), 0) FROM public.loan_recoveries v WHERE v.loan_id = l.id);
  UPDATE public.pay_runs SET status = 'approved', approved_by = p_by, approved_at = now() WHERE id = p_run;
END $$;
REVOKE ALL ON FUNCTION public.payroll_approve_run(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_approve_run(uuid, uuid, uuid, jsonb) TO service_role;

-- ── Access ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['statutory_rates', 'statutory_overrides', 'payroll_settings', 'pay_items', 'salary_templates', 'staff_salaries',
    'staff_pay_settings', 'pay_adjustments', 'staff_loans', 'tax_declarations', 'pay_runs', 'pay_run_lines', 'loan_recoveries'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['payroll_settings', 'pay_items', 'salary_templates', 'staff_pay_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;

-- ── Audit ───────────────────────────────────────────────────────────────────
-- Salaries and pay lines hold amounts, so the trail records that they changed and by whom, not the figures.
-- (The figures themselves are kept: salaries are dated rows that are never overwritten, and run lines are frozen.)
CREATE OR REPLACE FUNCTION app.audit_touch_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), nullif(v_row ->> 'created_by', '')::uuid, nullif(v_row ->> 'updated_by', '')::uuid),
          CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, coalesce(v_row ->> 'id', v_row ->> 'staff_member_id'), nullif(v_row ->> 'school_id', '')::uuid, NULL,
          jsonb_strip_nulls(jsonb_build_object('staff_member_id', v_row ->> 'staff_member_id', 'effective_from', v_row ->> 'effective_from', 'month', v_row ->> 'month', 'fy', v_row ->> 'fy')));
  RETURN NULL;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_salaries', 'pay_adjustments', 'staff_loans', 'tax_declarations', 'staff_pay_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_audit_pay_runs ON public.pay_runs;
CREATE TRIGGER trg_audit_pay_runs AFTER INSERT OR UPDATE OR DELETE ON public.pay_runs
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,submitted_by,approved_by');
DROP TRIGGER IF EXISTS trg_audit_payroll_settings ON public.payroll_settings;
CREATE TRIGGER trg_audit_payroll_settings AFTER INSERT OR UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_statutory_overrides ON public.statutory_overrides;
CREATE TRIGGER trg_audit_statutory_overrides AFTER INSERT OR UPDATE OR DELETE ON public.statutory_overrides
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_pay_items ON public.pay_items;
CREATE TRIGGER trg_audit_pay_items AFTER INSERT OR UPDATE OR DELETE ON public.pay_items
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,calc,percent_of,count_source,threshold,taxable,pf_wage,esi_wage,prorate,active');
