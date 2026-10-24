-- Living Record 06: co-curricular. Houses (with dated history and house points), clubs and teams (NCC, Scouts and
-- Guides among them) with a teacher in charge, and Kirti: each student achievements and participation. Teachers
-- record; the academic coordinator or principal approves before anything shows on the portals or the TC.
-- Screens read through the server, so signed-in users get no direct access to these tables.

CREATE TABLE public.houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  colour text CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX houses_name ON public.houses (school_id, lower(name));
CREATE TRIGGER trg_touch_houses BEFORE UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_houses AFTER INSERT OR DELETE OR UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION app.audit();

-- A student in a house from a date; a move closes the row (to_date) and opens the next, so history stays.
CREATE TABLE public.house_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE RESTRICT,
  from_date date NOT NULL,
  to_date date CHECK (to_date IS NULL OR to_date >= from_date),
  reason text CHECK (reason IS NULL OR length(reason) <= 200),
  set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX house_members_open ON public.house_members (student_id) WHERE to_date IS NULL;
CREATE INDEX house_members_house ON public.house_members (house_id) WHERE to_date IS NULL;
CREATE INDEX house_members_import_job ON public.house_members (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_house_members BEFORE UPDATE ON public.house_members FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_house_members AFTER INSERT OR DELETE OR UPDATE ON public.house_members FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.cc_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('club', 'team', 'ncc', 'scouts_guides', 'other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  in_charge uuid REFERENCES public.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cc_groups_name ON public.cc_groups (school_id, lower(name));
CREATE TRIGGER trg_touch_cc_groups BEFORE UPDATE ON public.cc_groups FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_cc_groups AFTER INSERT OR DELETE OR UPDATE ON public.cc_groups FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.cc_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.cc_groups(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  role text CHECK (role IS NULL OR length(role) BETWEEN 1 AND 40),
  left_on date,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id, session)
);
CREATE INDEX cc_memberships_student ON public.cc_memberships (student_id);
CREATE INDEX cc_memberships_import_job ON public.cc_memberships (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_cc_memberships BEFORE UPDATE ON public.cc_memberships FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_cc_memberships AFTER INSERT OR DELETE OR UPDATE ON public.cc_memberships FOR EACH ROW EXECUTE FUNCTION app.audit();

-- Kirti: one achievement or participation of one student. House points, when given, go to the house the student
-- was in on the day (house_id is set when the entry is approved).
CREATE TABLE public.kirti_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  on_date date NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 160),
  category text NOT NULL CHECK (category IN ('sports', 'academic', 'arts', 'music_dance', 'literary', 'science', 'cultural', 'community', 'leadership', 'other')),
  level text NOT NULL CHECK (level IN ('class', 'house', 'school', 'inter_school', 'zone', 'district', 'state', 'national', 'international')),
  position text NOT NULL CHECK (position IN ('participant', 'first', 'second', 'third', 'special', 'other')),
  position_note text CHECK (position_note IS NULL OR length(position_note) <= 60),
  CHECK (position <> 'other' OR position_note IS NOT NULL),
  house_points int CHECK (house_points IS NULL OR house_points BETWEEN -100 AND 1000),
  house_id uuid REFERENCES public.houses(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.cc_groups(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.student_documents(id) ON DELETE SET NULL,
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_note text CHECK (reject_note IS NULL OR length(reject_note) <= 300),
  CHECK (status <> 'rejected' OR reject_note IS NOT NULL),
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kirti_entries_student ON public.kirti_entries (student_id, on_date DESC);
CREATE INDEX kirti_entries_pending ON public.kirti_entries (school_id, created_at) WHERE status = 'pending';
CREATE INDEX kirti_entries_house ON public.kirti_entries (house_id, session) WHERE status = 'approved' AND house_points IS NOT NULL;
CREATE INDEX kirti_entries_import_job ON public.kirti_entries (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_kirti_entries BEFORE UPDATE ON public.kirti_entries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_kirti_entries AFTER INSERT OR DELETE OR UPDATE ON public.kirti_entries FOR EACH ROW EXECUTE FUNCTION app.audit('status');

-- Points a whole house earns (an inter-house event), beyond what its students bring in through Kirti.
CREATE TABLE public.house_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  on_date date NOT NULL,
  points int NOT NULL CHECK (points BETWEEN -1000 AND 5000 AND points <> 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_note text CHECK (reject_note IS NULL OR length(reject_note) <= 300),
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX house_points_house ON public.house_points (house_id, session);
CREATE TRIGGER trg_touch_house_points BEFORE UPDATE ON public.house_points FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_house_points AFTER INSERT OR DELETE OR UPDATE ON public.house_points FOR EACH ROW EXECUTE FUNCTION app.audit('status');

ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.houses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.houses TO service_role;
ALTER TABLE public.house_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.house_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.house_members TO service_role;
ALTER TABLE public.cc_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cc_groups FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cc_groups TO service_role;
ALTER TABLE public.cc_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cc_memberships FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cc_memberships TO service_role;
ALTER TABLE public.kirti_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kirti_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kirti_entries TO service_role;
ALTER TABLE public.house_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.house_points FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.house_points TO service_role;

-- The academic coordinator, principal and school admin set things up and approve. Teachers record through the
-- teacher portal (any teacher of the school; a club in-charge manages its members).
INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'cocurricular.manage'), ('school_admin', 'cocurricular.approve'),
  ('principal', 'cocurricular.manage'), ('principal', 'cocurricular.approve'),
  ('academic_coordinator', 'cocurricular.manage'), ('academic_coordinator', 'cocurricular.approve')
  ON CONFLICT DO NOTHING;

-- ── Bulk import: houses, memberships, Kirti ─────────────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members',
  'student_health', 'emergency_contacts', 'family_primary', 'student_documents', 'certificates', 'house_members', 'cc_memberships',
  'kirti_entries'));

-- House placements: the house each student is in from a date. A different house closes the open placement the day
-- before (kept as history, put back by undo) and opens the new one; the same house is unchanged.
CREATE OR REPLACE FUNCTION public.import_house_members(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, h.id AS hid, m.id AS cur_id, m.house_id AS cur_house, m.from_date AS cur_from
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, house_id uuid, from_date date, reason text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.houses h ON h.id = x.house_id AND h.school_id = p_school
    LEFT JOIN public.house_members m ON m.student_id = s.id AND m.to_date IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN hid IS NULL THEN 'Unknown house.'
      WHEN cur_id IS NOT NULL AND cur_house <> hid AND from_date <= cur_from THEN 'The student is in another house since ' || to_char(cur_from, 'DD-MM-YYYY') || '; the move must be later.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL OR cur_house <> hid), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_house = hid), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'house_members', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.house_members m ON m.id = _r.cur_id WHERE _r.cur_house <> _r.hid
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.house_members m SET to_date = r.from_date - 1, reason = coalesce(m.reason, r.reason)
    FROM pg_temp._r r WHERE m.id = r.cur_id AND r.cur_house <> r.hid;
  INSERT INTO public.house_members (school_id, student_id, house_id, from_date, reason, set_by, import_job_id)
    SELECT p_school, sid, hid, from_date, reason, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL OR cur_house <> hid;
  RETURN v_out;
END $$;

-- Club and team memberships: one per student, group and session; a repeat updates the role.
CREATE OR REPLACE FUNCTION public.import_cc_memberships(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, g.id AS gid,
      (SELECT m.id FROM public.cc_memberships m WHERE m.group_id = x.group_id AND m.student_id = s.id AND m.session = x.session) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, group_id uuid, session text, role text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.cc_groups g ON g.id = x.group_id AND g.school_id = p_school;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND r.role IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.cc_memberships m WHERE m.id = r.cur_id AND m.role IS DISTINCT FROM r.role) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN gid IS NULL THEN 'Unknown club or team.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'cc_memberships', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.cc_memberships m ON m.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.cc_memberships m SET role = r.role, import_job_id = p_job FROM pg_temp._r r WHERE m.id = r.cur_id AND r.changed;
  INSERT INTO public.cc_memberships (school_id, group_id, student_id, session, role, added_by, import_job_id)
    SELECT p_school, gid, sid, session, role, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

-- Kirti from the school past records: matched on student, title and date. Imported entries are approved (the
-- school is loading what it already recorded), by whoever commits.
CREATE OR REPLACE FUNCTION public.import_kirti(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT k.id FROM public.kirti_entries k WHERE k.student_id = s.id AND lower(k.title) = lower(x.title) AND k.on_date = x.on_date LIMIT 1) AS cur_id,
      (SELECT m.house_id FROM public.house_members m WHERE m.student_id = s.id AND m.from_date <= x.on_date AND (m.to_date IS NULL OR m.to_date >= x.on_date) LIMIT 1) AS hid
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, session text, on_date date, title text, category text, level text, position text,
      position_note text, house_points int, notes text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.kirti_entries k WHERE k.id = r.cur_id AND
    (r.category, r.level, r.position, coalesce(r.position_note, k.position_note), coalesce(r.house_points, k.house_points), coalesce(r.notes, k.notes))
    IS DISTINCT FROM (k.category, k.level, k.position, k.position_note, k.house_points, k.notes)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN house_points IS NOT NULL AND hid IS NULL THEN 'House points are given, but the student wasn''t in a house on that day.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'kirti_entries', k.id, to_jsonb(k) FROM pg_temp._r JOIN public.kirti_entries k ON k.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.kirti_entries k SET category = r.category, level = r.level, position = r.position, position_note = coalesce(r.position_note, k.position_note),
      house_points = coalesce(r.house_points, k.house_points), house_id = CASE WHEN coalesce(r.house_points, k.house_points) IS NULL THEN k.house_id ELSE coalesce(r.hid, k.house_id) END,
      notes = coalesce(r.notes, k.notes), import_job_id = p_job
    FROM pg_temp._r r WHERE k.id = r.cur_id AND r.changed;
  INSERT INTO public.kirti_entries (school_id, student_id, session, on_date, title, category, level, position, position_note, house_points, house_id, notes,
      status, recorded_by, approved_by, approved_at, import_job_id)
    SELECT p_school, sid, session, on_date, title, category, level, position, position_note, house_points, CASE WHEN house_points IS NOT NULL THEN hid END, notes,
      'approved', p_actor, p_actor, now(), p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.import_house_members(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_house_members(uuid, uuid, uuid, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.import_cc_memberships(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_cc_memberships(uuid, uuid, uuid, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.import_kirti(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_kirti(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- Undo learns the co-curricular tables, and a register entry with co-curricular records from elsewhere stays.
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
