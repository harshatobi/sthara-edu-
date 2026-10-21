-- Record inspector for the Platform Manager (a school's Records tab, behind a break-glass window).
--
-- Four read-only functions, callable by the service role only, after /api/ops has checked the operator's role,
-- territory and open access window. They work on a fixed list of school-owned tables (app.ops_inspectable) and
-- always filter by the school, so one school's window can never read another's rows.
--
-- Never inspectable, window or not: wellbeing (wellness_logs, incidents), pay and statutory records, tutor
-- conversations, and Sthara's own tables.

CREATE OR REPLACE FUNCTION app.ops_inspectable() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'users', 'consents', 'role_grants', 'staff_members', 'staff_jobs',
    'classes', 'class_subjects', 'student_subjects', 'teacher_subjects', 'assignments', 'submissions', 'submission_items',
    'tml_scores', 'lesson_plans', 'course_plans', 'syllabus_progress', 'academic_events', 'timetable_slots',
    'attendance', 'attendance_month_reviews', 'staff_punches', 'staff_day_marks', 'leave_requests',
    'fee_structures', 'fee_invoices', 'fee_payments', 'fee_concession_requests', 'fee_reminders', 'fee_day_closes',
    'admission_applicants', 'admission_events', 'account_requests',
    'notifications', 'school_threads', 'school_messages', 'whatsapp_log', 'situations'
  ]::text[]
$$;

-- Single-column foreign keys between inspectable tables: (child table, child column, parent table).
CREATE OR REPLACE FUNCTION app.ops_inspect_links() RETURNS TABLE (child text, col text, parent text)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT cr.relname::text, a.attname::text, pr.relname::text
    FROM pg_constraint c
    JOIN pg_class cr ON cr.oid = c.conrelid
    JOIN pg_class pr ON pr.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = cr.relnamespace AND n.nspname = 'public'
    JOIN pg_namespace pn ON pn.oid = pr.relnamespace AND pn.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
     AND cr.relname = ANY (app.ops_inspectable()) AND pr.relname = ANY (app.ops_inspectable())
$$;

-- The shape of every inspectable table: its columns, what each row points to, and what points at it.
CREATE OR REPLACE FUNCTION public.ops_inspect_meta() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table', t,
    'columns', (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
                  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t),
    'refs', (SELECT coalesce(jsonb_agg(jsonb_build_object('column', l.col, 'table', l.parent)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.child = t),
    'children', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', l.child, 'column', l.col)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.parent = t)
  ) ORDER BY t), '[]'::jsonb)
  FROM unnest(app.ops_inspectable()) t WHERE to_regclass('public.' || quote_ident(t)) IS NOT NULL
$$;

-- One row of one school, with how many rows of each child table point at it. NULL when the school has no such row.
CREATE OR REPLACE FUNCTION public.ops_inspect_row(p_school uuid, p_table text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row jsonb;
  v_children jsonb := '[]'::jsonb;
  v_n bigint;
  l record;
BEGIN
  IF NOT (p_table = ANY (app.ops_inspectable())) THEN RAISE EXCEPTION 'Table % cannot be inspected', p_table USING ERRCODE = '42501'; END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id = $1 AND x.school_id = $2', p_table) INTO v_row USING p_id, p_school;
  IF v_row IS NULL THEN RETURN NULL; END IF;
  FOR l IN SELECT child, col FROM app.ops_inspect_links() WHERE parent = p_table ORDER BY child, col LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1 AND school_id = $2', l.child, l.col) INTO v_n USING p_id, p_school;
    v_children := v_children || jsonb_build_object('table', l.child, 'column', l.col, 'count', v_n);
  END LOOP;
  RETURN jsonb_build_object('row', v_row, 'children', v_children);
END $$;

-- The school's newest rows in a table (at most 100), optionally only those whose uuid column p_column equals p_value.
CREATE OR REPLACE FUNCTION public.ops_inspect_list(p_school uuid, p_table text, p_column text DEFAULT NULL, p_value uuid DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_out jsonb;
  v_order text;
  v_where text := 'x.school_id = $1';
BEGIN
  IF NOT (p_table = ANY (app.ops_inspectable())) THEN RAISE EXCEPTION 'Table % cannot be inspected', p_table USING ERRCODE = '42501'; END IF;
  IF p_column IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column AND data_type = 'uuid') THEN
      RAISE EXCEPTION 'Column % cannot be filtered on', p_column USING ERRCODE = '42703';
    END IF;
    v_where := v_where || format(' AND x.%I = $2', p_column);
  END IF;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'created_at')
              THEN 'x.created_at DESC NULLS LAST, x.id' ELSE 'x.id' END INTO v_order;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(y)), ''[]''::jsonb) FROM (SELECT x.* FROM public.%I x WHERE %s ORDER BY %s LIMIT %s) y',
                 p_table, v_where, v_order, greatest(1, least(coalesce(p_limit, 50), 100)))
    INTO v_out USING p_school, p_value;
  RETURN v_out;
END $$;

-- Which of the school's tables hold a row with this id.
CREATE OR REPLACE FUNCTION public.ops_inspect_find(p_school uuid, p_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t text;
  hit boolean;
  out text[] := '{}';
BEGIN
  FOREACH t IN ARRAY app.ops_inspectable() LOOP
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND school_id = $2)', t) INTO hit USING p_id, p_school;
    IF hit THEN out := out || t; END IF;
  END LOOP;
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION app.ops_inspectable(), app.ops_inspect_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_inspect_meta(), public.ops_inspect_row(uuid, text, uuid),
  public.ops_inspect_list(uuid, text, text, uuid, integer), public.ops_inspect_find(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_inspect_meta(), public.ops_inspect_row(uuid, text, uuid),
  public.ops_inspect_list(uuid, text, text, uuid, integer), public.ops_inspect_find(uuid, uuid) TO service_role;
