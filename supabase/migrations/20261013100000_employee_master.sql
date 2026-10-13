-- Employee master — 2026-10-13
--
-- The staff register (staff_members) becomes the one record for everyone who works at the school. Every teacher
-- and office login gets a row (created here for existing logins, and by a trigger for new ones); support staff
-- with no login already live there. This migration adds what an HR system of record needs around that row.
--
-- staff_members       + department_id, grade_id, manager_id, probation_until, confirmed_on, exit_on
-- staff_jobs          effective-dated job history: each row is the whole job (designation, category, department,
--                     grade, manager, employment, contract) from a date. The row in force today is copied onto
--                     staff_members, so everything that reads the register keeps working; future-dated rows take
--                     effect when hr_sync_jobs() next runs after their date.
-- hr_departments      school-defined departments, each with a head
-- hr_grades           grades (PRT, TGT, PGT, office and support grades) with a pay band
-- hr_posts            sanctioned posts per department and grade; filled is counted from the register
-- hr_settings         employee code format and counter, default probation months, notice days, alert window
-- staff_profiles      personal and family details (date of birth, address, emergency contact)
-- staff_statutory     PAN, UAN, ESI number, the last four digits of Aadhaar (never the full number), bank account
--                     and nominee
-- staff_qualifications degrees, B.Ed, CTET and other certificates, with who verified them
-- staff_documents     files in the private "staff-docs" bucket, and dated records with an expiry (police
--                     verification, driving licence, medical fitness)
-- staff_exits         resignation, termination, retirement or contract end: notice, last working day, checklist
-- staff_events        the lifecycle timeline (probation, confirmation, exit, rehire)
--
-- Permissions: hr.manage keeps the records and runs lifecycle actions; hr.sensitive sees and edits personal,
-- statutory and bank details. Both go to the HR manager, the principal and the school admin. Everyone else with
-- workforce.read still sees only what staff_members holds: name, role, department.
--
-- Access: the new tables have no grants for browser roles at all. Every read and write goes through
-- /api/admin/people (service role), which checks the permission and records each view of statutory or bank
-- details in audit_log. Changes to personal and statutory rows are audited by field name only, so the audit
-- trail never holds a PAN or an account number.

INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin', ARRAY['hr.manage','hr.sensitive']),
  ('principal',    ARRAY['hr.manage','hr.sensitive']),
  ('hr_manager',   ARRAY['hr.manage','hr.sensitive'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- ── Structure ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind        text NOT NULL DEFAULT 'academic' CHECK (kind IN ('academic', 'administrative', 'support')),
  head_id     uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_departments_name ON public.hr_departments (school_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS public.hr_grades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  category    text CHECK (category IN ('teaching', 'office', 'support', 'assistant')),
  pay_min     numeric(12, 2) CHECK (pay_min >= 0),
  pay_max     numeric(12, 2) CHECK (pay_max >= 0),
  sort        smallint NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (pay_min IS NULL OR pay_max IS NULL OR pay_max >= pay_min)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_grades_name ON public.hr_grades (school_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS public.hr_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  department_id  uuid NOT NULL REFERENCES public.hr_departments(id) ON DELETE CASCADE,
  grade_id       uuid REFERENCES public.hr_grades(id) ON DELETE CASCADE,       -- null: any grade in the department
  sanctioned     smallint NOT NULL CHECK (sanctioned BETWEEN 0 AND 2000),
  note           text CHECK (length(note) <= 300),
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_posts ON public.hr_posts
  (school_id, department_id, coalesce(grade_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.hr_settings (
  school_id         uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  code_prefix       text NOT NULL DEFAULT 'EMP-' CHECK (code_prefix ~ '^[A-Za-z0-9/_-]{0,12}$'),
  code_width        smallint NOT NULL DEFAULT 4 CHECK (code_width BETWEEN 2 AND 8),
  code_last_no      int NOT NULL DEFAULT 0 CHECK (code_last_no >= 0),
  probation_months  smallint NOT NULL DEFAULT 6 CHECK (probation_months BETWEEN 0 AND 36),
  notice_days       smallint NOT NULL DEFAULT 30 CHECK (notice_days BETWEEN 0 AND 365),
  alert_days        smallint NOT NULL DEFAULT 30 CHECK (alert_days BETWEEN 1 AND 180),
  updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── The register row ────────────────────────────────────────────────────────
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.hr_grades(id) ON DELETE SET NULL;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS probation_until date;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS confirmed_on date;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS exit_on date;
DO $$ BEGIN
  ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_not_own_manager CHECK (manager_id IS NULL OR manager_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_staff_members_department ON public.staff_members (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_manager ON public.staff_members (manager_id) WHERE manager_id IS NOT NULL;

-- ── Job history ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  effective_from   date NOT NULL,
  action           text NOT NULL CHECK (action IN ('hire', 'redesignation', 'transfer', 'promotion', 'employment_change', 'renewal', 'rehire', 'correction')),
  designation      text NOT NULL DEFAULT '' CHECK (length(designation) <= 80),
  category         text NOT NULL CHECK (category IN ('teaching', 'office', 'support', 'assistant')),
  department_id    uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  grade_id         uuid REFERENCES public.hr_grades(id) ON DELETE SET NULL,
  manager_id       uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  employment       text NOT NULL DEFAULT 'permanent' CHECK (employment IN ('permanent', 'contract', 'visiting')),
  contract_from    date,
  contract_to      date,
  reason           text CHECK (length(reason) <= 500),
  authority        text CHECK (length(authority) <= 120),      -- who approved it (name or order number)
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_member_id, effective_from),
  CHECK (manager_id IS NULL OR manager_id <> staff_member_id),
  CHECK (contract_from IS NULL OR contract_to IS NULL OR contract_to >= contract_from)
);
CREATE INDEX IF NOT EXISTS idx_staff_jobs_school ON public.staff_jobs (school_id, effective_from);

CREATE OR REPLACE FUNCTION app.school_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- Copies the job in force today onto the register row. The flag tells the register's own trigger that this
-- update is the history catching up, not someone editing the register.
CREATE OR REPLACE FUNCTION app.sync_staff_job(p_member uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE j public.staff_jobs; n int;
BEGIN
  SELECT * INTO j FROM public.staff_jobs
  WHERE staff_member_id = p_member AND effective_from <= app.school_today()
  ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM set_config('app.job_sync', '1', true);
  UPDATE public.staff_members m
  SET designation = j.designation, category = j.category, department_id = j.department_id, grade_id = j.grade_id,
      manager_id = j.manager_id, employment = j.employment, contract_from = j.contract_from, contract_to = j.contract_to,
      updated_at = now()
  WHERE m.id = p_member
    AND (m.designation, m.category, m.department_id, m.grade_id, m.manager_id, m.employment, m.contract_from, m.contract_to)
        IS DISTINCT FROM
        (j.designation, j.category, j.department_id, j.grade_id, j.manager_id, j.employment, j.contract_from, j.contract_to);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.job_sync', '', true);
  RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION app.staff_jobs_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app.sync_staff_job(coalesce(NEW.staff_member_id, OLD.staff_member_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_staff_jobs_sync ON public.staff_jobs;
CREATE TRIGGER trg_staff_jobs_sync AFTER INSERT OR UPDATE OR DELETE ON public.staff_jobs
  FOR EACH ROW EXECUTE FUNCTION app.staff_jobs_sync();

-- A new register row starts its history with a hire; a direct edit of the job fields on the register (the
-- schedule's staff register still does this) is kept as a correction dated today.
CREATE OR REPLACE FUNCTION app.staff_members_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.job_sync', true) = '1' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id,
      grade_id, manager_id, employment, contract_from, contract_to, created_by)
    VALUES (NEW.school_id, NEW.id, least(coalesce(NEW.joined_on, NEW.contract_from, app.school_today()), app.school_today()), 'hire',
      NEW.designation, NEW.category, NEW.department_id, NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to, NEW.created_by)
    ON CONFLICT (staff_member_id, effective_from) DO NOTHING;
  ELSIF (NEW.designation, NEW.category, NEW.department_id, NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to)
        IS DISTINCT FROM
        (OLD.designation, OLD.category, OLD.department_id, OLD.grade_id, OLD.manager_id, OLD.employment, OLD.contract_from, OLD.contract_to) THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id,
      grade_id, manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (NEW.school_id, NEW.id, app.school_today(), 'correction', NEW.designation, NEW.category, NEW.department_id,
      NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to, 'Edited in the staff register', auth.uid())
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET designation = EXCLUDED.designation, category = EXCLUDED.category, department_id = EXCLUDED.department_id,
          grade_id = EXCLUDED.grade_id, manager_id = EXCLUDED.manager_id, employment = EXCLUDED.employment,
          contract_from = EXCLUDED.contract_from, contract_to = EXCLUDED.contract_to;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_staff_members_job ON public.staff_members;
CREATE TRIGGER trg_staff_members_job AFTER INSERT OR UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION app.staff_members_job();

-- Brings every register row in a school up to the job in force today (future-dated changes whose day has come).
CREATE OR REPLACE FUNCTION public.hr_sync_jobs(p_school uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.staff_members WHERE school_id = p_school LOOP
    IF app.sync_staff_job(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.hr_sync_jobs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_sync_jobs(uuid) TO service_role;

-- The next employee code in the school's format. Numbers are issued in order and never reused; a number a
-- legacy code already took is passed over.
CREATE OR REPLACE FUNCTION public.hr_next_employee_code(p_school uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.hr_settings; code text;
BEGIN
  INSERT INTO public.hr_settings (school_id) VALUES (p_school) ON CONFLICT (school_id) DO NOTHING;
  LOOP
    UPDATE public.hr_settings SET code_last_no = code_last_no + 1 WHERE school_id = p_school RETURNING * INTO s;
    code := s.code_prefix || lpad(s.code_last_no::text, s.code_width, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff_members WHERE school_id = p_school AND lower(employee_code) = lower(code));
  END LOOP;
  RETURN code;
END $$;
REVOKE ALL ON FUNCTION public.hr_next_employee_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_next_employee_code(uuid) TO service_role;

-- ── Personal, statutory, qualifications, documents ──────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  staff_member_id     uuid PRIMARY KEY REFERENCES public.staff_members(id) ON DELETE CASCADE,
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  date_of_birth       date,
  gender              text CHECK (gender IN ('female', 'male', 'other')),
  blood_group         text CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  marital_status      text CHECK (marital_status IN ('single', 'married', 'widowed', 'divorced')),
  kin_name            text CHECK (length(kin_name) <= 120),           -- father's or spouse's name, as on statutory forms
  personal_email      text CHECK (length(personal_email) <= 200),
  address             text CHECK (length(address) <= 400),
  city                text CHECK (length(city) <= 80),
  state               text CHECK (length(state) <= 80),
  pincode             text CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  emergency_name      text CHECK (length(emergency_name) <= 120),
  emergency_relation  text CHECK (length(emergency_relation) <= 60),
  emergency_phone     text CHECK (emergency_phone ~ '^\+[1-9][0-9]{7,14}$'),
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_statutory (
  staff_member_id   uuid PRIMARY KEY REFERENCES public.staff_members(id) ON DELETE CASCADE,
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  pan               text CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  uan               text CHECK (uan ~ '^[0-9]{12}$'),
  esi_no            text CHECK (esi_no ~ '^[0-9]{10}$'),
  aadhaar_last4     text CHECK (aadhaar_last4 ~ '^[0-9]{4}$'),         -- the full number is never stored
  bank_account      text CHECK (bank_account ~ '^[0-9]{6,18}$'),
  bank_ifsc         text CHECK (bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name         text CHECK (length(bank_name) <= 80),
  bank_holder       text CHECK (length(bank_holder) <= 120),
  nominee_name      text CHECK (length(nominee_name) <= 120),
  nominee_relation  text CHECK (length(nominee_relation) <= 60),
  updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('photo', 'id_proof', 'address_proof', 'qualification', 'experience', 'appointment_letter',
                     'contract', 'police_verification', 'driving_licence', 'medical_fitness', 'bank_proof', 'other')),
  title            text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  issued_on        date,
  expires_on       date,
  storage_path     text,                                      -- null: a dated record with no file
  file_name        text CHECK (length(file_name) <= 200),
  mime             text CHECK (length(mime) <= 100),
  size_bytes       int CHECK (size_bytes >= 0),
  uploaded_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS idx_staff_documents_member ON public.staff_documents (staff_member_id);
CREATE INDEX IF NOT EXISTS idx_staff_documents_expiry ON public.staff_documents (school_id, expires_on) WHERE expires_on IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff_qualifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('school', 'diploma', 'graduate', 'postgraduate', 'doctorate', 'd_el_ed', 'b_ed', 'm_ed',
                     'ctet', 'state_tet', 'net_set', 'certificate', 'other')),
  title            text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  institution      text CHECK (length(institution) <= 160),
  year             smallint CHECK (year BETWEEN 1950 AND 2100),
  result           text CHECK (length(result) <= 60),
  verified_on      date,
  verified_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES public.staff_documents(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_qualifications_member ON public.staff_qualifications (staff_member_id);

-- ── Lifecycle ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_exits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('resignation', 'termination', 'retirement', 'contract_end', 'absconding', 'death')),
  notice_on        date NOT NULL,
  last_day         date NOT NULL,
  reason           text CHECK (length(reason) <= 1000),
  -- [{ key, label, done, by, at }]
  checklist        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checklist) = 'array' AND jsonb_array_length(checklist) <= 40),
  status           text NOT NULL DEFAULT 'notice' CHECK (status IN ('notice', 'completed', 'withdrawn')),
  login_flagged_at timestamptz,
  closed_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at        timestamptz,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (last_day >= notice_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_exits_open ON public.staff_exits (staff_member_id) WHERE status = 'notice';
CREATE INDEX IF NOT EXISTS idx_staff_exits_school ON public.staff_exits (school_id, status);

CREATE TABLE IF NOT EXISTS public.staff_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('probation_set', 'probation_extended', 'confirmed', 'exit_started', 'exit_withdrawn',
                     'exited', 'rehired')),
  on_date          date NOT NULL,
  note             text CHECK (length(note) <= 1000),
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_events_member ON public.staff_events (staff_member_id, on_date);

-- ── Every login is on the register ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.users_on_register() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role IN ('teacher', 'admin') AND NEW.school_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE school_id = NEW.school_id AND user_id = NEW.id) THEN
    INSERT INTO public.staff_members (school_id, user_id, name, category, designation)
    VALUES (NEW.school_id, NEW.id, left(coalesce(nullif(trim(NEW.name), ''), 'Staff'), 120),
            CASE WHEN NEW.role = 'teacher' THEN 'teaching' ELSE 'office' END,
            CASE WHEN NEW.role = 'teacher' THEN 'Teacher' ELSE 'Office' END);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_users_on_register ON public.users;
CREATE TRIGGER trg_users_on_register AFTER INSERT OR UPDATE OF role, school_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.users_on_register();

-- History for everyone already on the register, starting the day they joined (or were added).
INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, employment, contract_from, contract_to, created_by)
SELECT m.school_id, m.id, least(coalesce(m.joined_on, m.contract_from, (m.created_at AT TIME ZONE 'Asia/Kolkata')::date), app.school_today()), 'hire',
       m.designation, m.category, m.employment, m.contract_from, m.contract_to, m.created_by
FROM public.staff_members m
WHERE NOT EXISTS (SELECT 1 FROM public.staff_jobs j WHERE j.staff_member_id = m.id);

-- Existing teacher and office logins that were never added to the register. Their history starts the day the
-- login was created; HR sets the real joining date in People.
INSERT INTO public.staff_members (school_id, user_id, name, category, designation, created_at)
SELECT u.school_id, u.id, left(coalesce(nullif(trim(u.name), ''), 'Staff'), 120),
       CASE WHEN u.role = 'teacher' THEN 'teaching' ELSE 'office' END,
       CASE WHEN u.role = 'teacher' THEN 'Teacher' ELSE 'Office' END,
       coalesce(u.created_at, now())
FROM public.users u
WHERE u.role IN ('teacher', 'admin') AND u.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.staff_members m WHERE m.school_id = u.school_id AND m.user_id = u.id);
-- The insert trigger dated those hires today; move them back to the day the login was created.
UPDATE public.staff_jobs j
SET effective_from = (m.created_at AT TIME ZONE 'Asia/Kolkata')::date
FROM public.staff_members m
WHERE j.staff_member_id = m.id AND j.action = 'hire' AND m.user_id IS NOT NULL AND m.joined_on IS NULL
  AND j.effective_from > (m.created_at AT TIME ZONE 'Asia/Kolkata')::date
  AND (SELECT count(*) FROM public.staff_jobs x WHERE x.staff_member_id = m.id) = 1;

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_jobs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_statutory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_exits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_events         ENABLE ROW LEVEL SECURITY;

-- No browser role reads or writes these; the API (service role) is the only way in.
REVOKE ALL ON public.hr_departments, public.hr_grades, public.hr_posts, public.hr_settings, public.staff_jobs, public.staff_profiles,
  public.staff_statutory, public.staff_documents, public.staff_qualifications, public.staff_exits, public.staff_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hr_departments, public.hr_grades, public.hr_posts, public.hr_settings, public.staff_jobs, public.staff_profiles,
  public.staff_statutory, public.staff_documents, public.staff_qualifications, public.staff_exits, public.staff_events TO service_role;

-- Private bucket for staff documents: no storage policies, so only the service role reads or writes it and
-- the API hands out short-lived signed links.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staff-docs', 'staff-docs', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Audit ───────────────────────────────────────────────────────────────────
-- Personal and statutory rows: which fields changed, never their values.
CREATE OR REPLACE FUNCTION app.audit_fields_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields text[];
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_fields
  FROM jsonb_object_keys(v_row) k
  WHERE k NOT IN ('staff_member_id', 'school_id', 'updated_at', 'updated_by')
    AND coalesce(v_old -> k, 'null'::jsonb) IS DISTINCT FROM coalesce(v_new -> k, 'null'::jsonb);
  IF TG_OP = 'UPDATE' AND cardinality(v_fields) = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), nullif(v_row ->> 'updated_by', '')::uuid),
          CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'staff_member_id', nullif(v_row ->> 'school_id', '')::uuid,
          NULL, jsonb_build_object('fields', to_jsonb(v_fields)));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_audit_staff_profiles ON public.staff_profiles;
CREATE TRIGGER trg_audit_staff_profiles AFTER INSERT OR UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION app.audit_fields_only();
DROP TRIGGER IF EXISTS trg_audit_staff_statutory ON public.staff_statutory;
CREATE TRIGGER trg_audit_staff_statutory AFTER INSERT OR UPDATE OR DELETE ON public.staff_statutory
  FOR EACH ROW EXECUTE FUNCTION app.audit_fields_only();

DROP TRIGGER IF EXISTS trg_audit_staff_jobs ON public.staff_jobs;
CREATE TRIGGER trg_audit_staff_jobs AFTER INSERT OR UPDATE OR DELETE ON public.staff_jobs
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_staff_exits ON public.staff_exits;
CREATE TRIGGER trg_audit_staff_exits AFTER INSERT OR UPDATE OR DELETE ON public.staff_exits
  FOR EACH ROW EXECUTE FUNCTION app.audit('kind,notice_on,last_day,status,login_flagged_at');
DROP TRIGGER IF EXISTS trg_audit_staff_documents ON public.staff_documents;
CREATE TRIGGER trg_audit_staff_documents AFTER INSERT OR DELETE ON public.staff_documents
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_hr_grades ON public.hr_grades;
CREATE TRIGGER trg_audit_hr_grades AFTER INSERT OR UPDATE OR DELETE ON public.hr_grades
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,pay_min,pay_max,active');
DROP TRIGGER IF EXISTS trg_audit_hr_posts ON public.hr_posts;
CREATE TRIGGER trg_audit_hr_posts AFTER INSERT OR UPDATE OR DELETE ON public.hr_posts
  FOR EACH ROW EXECUTE FUNCTION app.audit('sanctioned');

-- The register's own audit now also covers the lifecycle dates and the employee code.
DROP TRIGGER IF EXISTS trg_audit_staff_members ON public.staff_members;
CREATE TRIGGER trg_audit_staff_members AFTER INSERT OR UPDATE OR DELETE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,category,designation,phone_e164,active,user_id,employee_code,joined_on,probation_until,confirmed_on,exit_on');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_departments', 'hr_grades', 'hr_posts', 'hr_settings', 'staff_profiles', 'staff_statutory'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;
