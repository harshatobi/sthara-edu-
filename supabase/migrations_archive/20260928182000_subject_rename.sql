-- Subject linking, part 2.
--
-- 1. ops_rename_class_subject: when a class's legacy subject name is linked to its
--    official name ("English" -> "English Language and Literature" in Class 10-A),
--    every teacher module that stores the subject as text follows: course plans
--    (lesson planner), syllabus progress, lesson plans, homework/assignments,
--    materials, the old syllabus table, timetable slots and scheduling
--    requirements, covers, visits, the feed, and each student's TML, tutor
--    sessions and message threads. Chapter keys don't carry the subject, so
--    progress stays attached to its chapter. A row whose official-name twin
--    already exists (a unique key would collide) is left alone and counted.
-- 2. ops_resync_teacher: rebuild a teacher's legacy assignment fields on demand.
-- 3. ops_subject_metrics: subject-link gaps per school, for School Manager health.
--
-- All service_role only.

CREATE OR REPLACE FUNCTION public.ops_rename_class_subject(p_school uuid, p_class text, p_from text, p_to text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  k text := app.norm_class(p_class);
  f text := lower(trim(p_from));
  out jsonb := '{}'::jsonb;
  n int;
  skipped int := 0;
BEGIN
  IF p_school IS NULL OR k = '' OR f = '' OR coalesce(trim(p_to), '') = '' OR f = lower(trim(p_to)) THEN
    RETURN out;
  END IF;

  -- Tables with a unique key on (…, class, subject, …): skip rows whose twin exists.
  UPDATE public.course_plans x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.course_plans y WHERE y.school_id = x.school_id AND y.class = x.class AND y.subject = p_to AND y.session = x.session);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('course_plans', n);
  skipped := skipped + (SELECT count(*) FROM public.course_plans x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);

  UPDATE public.syllabus_progress x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.syllabus_progress y WHERE y.school_id = x.school_id AND y.class = x.class AND y.subject = p_to
                     AND y.session = x.session AND y.chapter_key = x.chapter_key AND y.topic IS NOT DISTINCT FROM x.topic);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('syllabus_progress', n);
  skipped := skipped + (SELECT count(*) FROM public.syllabus_progress x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);

  UPDATE public.sched_requirements x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.sched_requirements y WHERE y.school_id = x.school_id AND y.session = x.session AND y.class_key = x.class_key
                     AND lower(y.subject) = lower(p_to) AND y.group_label IS NOT DISTINCT FROM x.group_label);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('sched_requirements', n);
  skipped := skipped + (SELECT count(*) FROM public.sched_requirements x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);

  UPDATE public.syllabus x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.syllabus y WHERE y.teacher_id = x.teacher_id AND y.topic = x.topic AND y.month IS NOT DISTINCT FROM x.month AND y.subject = p_to);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('syllabus', n);

  -- Class-level tables with no unique key on the subject.
  UPDATE public.lesson_plans SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('lesson_plans', n);
  UPDATE public.assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('assignments', n);
  UPDATE public.materials SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('materials', n);
  UPDATE public.timetable_slots SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('timetable_slots', n);
  UPDATE public.cover_assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('cover_assignments', n);
  UPDATE public.visit_sessions SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('visit_sessions', n);
  UPDATE public.situations SET subject = p_to WHERE school_id = p_school AND app.norm_class(class_name) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('situations', n);

  -- Student-level: the class's students' mastery, tutor sessions and threads.
  UPDATE public.tml_scores t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('tml_scores', n);
  UPDATE public.tutor_sessions t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('tutor_sessions', n);
  UPDATE public.school_threads t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('school_threads', n);

  RETURN out || jsonb_build_object('skipped', skipped);
END $$;

CREATE OR REPLACE FUNCTION public.ops_resync_teacher(p_teacher uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT app.sync_teacher_assignments(p_teacher) $$;

CREATE OR REPLACE FUNCTION public.ops_subject_metrics(p_school uuid DEFAULT NULL)
RETURNS TABLE (school_id uuid, metrics jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH sch AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  students AS (
    SELECT u.id, u.school_id, u.student_class FROM public.users u JOIN sch ON sch.id = u.school_id
    WHERE u.role = 'student' AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
  )
  SELECT sch.id, jsonb_build_object(
    'classSubjectsLinked', (SELECT count(*) FROM public.class_subjects cs WHERE cs.school_id = sch.id),
    -- Names on a class's list that aren't linked to an official subject yet.
    'classSubjectsUnlinked', (SELECT count(*) FROM public.classes c,
        jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'subjects') = 'array' THEN c.metadata -> 'subjects' ELSE '[]'::jsonb END) e
      WHERE c.school_id = sch.id AND NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id AND lower(cs.subject_name) = lower(trim(e)))),
    'classesNoSubjects', (SELECT count(*) FROM public.classes c WHERE c.school_id = sch.id
      AND EXISTS (SELECT 1 FROM students s WHERE app.norm_class(s.student_class) = app.norm_class(c.name))
      AND NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id)),
    'classSubjectsNoTeacher', (SELECT count(*) FROM public.class_subjects cs WHERE cs.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.teacher_subjects ts WHERE ts.class_subject_id = cs.id)),
    'studentsNoSubjects', (SELECT count(*) FROM students s WHERE s.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.student_subjects ss WHERE ss.student_id = s.id)),
    -- Class 11-12 students in a class that offers electives but who have chosen none.
    'seniorNoElectives', (SELECT count(*) FROM students s JOIN public.classes c ON c.school_id = s.school_id AND app.norm_class(c.name) = app.norm_class(s.student_class)
      WHERE s.school_id = sch.id
        AND EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id AND cs.kind = 'elective' AND cs.level IN ('11', '12'))
        AND NOT EXISTS (SELECT 1 FROM public.student_subjects ss JOIN public.class_subjects cs ON cs.id = ss.class_subject_id
                        WHERE ss.student_id = s.id AND ss.source = 'elective')),
    'subjectsNoLead', (SELECT count(DISTINCT cs.subject_key) FROM public.class_subjects cs WHERE cs.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.subject_leads l WHERE l.school_id = cs.school_id AND l.subject_key = cs.subject_key))
  )
  FROM sch;
$$;

REVOKE ALL ON FUNCTION public.ops_rename_class_subject(uuid, text, text, text), public.ops_resync_teacher(uuid), public.ops_subject_metrics(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_rename_class_subject(uuid, text, text, text), public.ops_resync_teacher(uuid), public.ops_subject_metrics(uuid)
  TO service_role;
