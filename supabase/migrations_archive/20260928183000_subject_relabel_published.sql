-- Subject linking, part 3: a published timetable can take a subject *relabel*.
--
-- Linking renames a class's subject to its official name ("English" -> "English
-- Language and Literature"). That is not a schedule change: same period, class,
-- teacher and room. The published-slot guard (20260928100000_deletion_fixes) now
-- accepts an update that changes only `subject`, and only while
-- ops_rename_class_subject has set the transaction-local flag app.subject_relabel.

CREATE OR REPLACE FUNCTION app.guard_published_slots() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- A deleted person or room leaves the lesson in place, unassigned. (class_key is generated, so it isn't
  -- computed yet in a BEFORE trigger and is left out of the comparison.)
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['teacher_id', 'staff_member_id', 'room_id', 'class_key']) = (to_jsonb(OLD) - ARRAY['teacher_id', 'staff_member_id', 'room_id', 'class_key'])
     AND (NEW.teacher_id IS NULL OR NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id)
     AND (NEW.staff_member_id IS NULL OR NEW.staff_member_id IS NOT DISTINCT FROM OLD.staff_member_id)
     AND (NEW.room_id IS NULL OR NEW.room_id IS NOT DISTINCT FROM OLD.room_id) THEN
    RETURN NEW;
  END IF;
  -- Subject linking relabels a subject to its official name; nothing else may change.
  IF TG_OP = 'UPDATE' AND current_setting('app.subject_relabel', true) = 'on'
     AND (to_jsonb(NEW) - ARRAY['subject', 'class_key']) = (to_jsonb(OLD) - ARRAY['subject', 'class_key']) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.timetable_versions v
             WHERE v.id = coalesce(NEW.version_id, OLD.version_id) AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'this timetable is published; copy it to a new draft to change it' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

-- The rename sets the flag around the timetable relabel only.
CREATE OR REPLACE FUNCTION app.relabel_timetable_subject(p_school uuid, p_class_key text, p_from text, p_to text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('app.subject_relabel', 'on', true);
  UPDATE public.timetable_slots SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = p_class_key AND lower(subject) = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.subject_relabel', 'off', true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION app.relabel_timetable_subject(uuid, text, text, text) FROM public, anon, authenticated;

-- ops_rename_class_subject (20260928182000) relabels timetable slots through the helper.
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
  -- Published timetables only accept this relabel through the flagged helper.
  n := app.relabel_timetable_subject(p_school, k, f, p_to);
  out := out || jsonb_build_object('timetable_slots', n);
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
