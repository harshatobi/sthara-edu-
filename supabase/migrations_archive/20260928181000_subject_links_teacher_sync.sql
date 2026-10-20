-- Fix for 20260928180000_subject_links: a teacher's legacy (not yet linked) assignment
-- was dropped when ANY teacher's link covered that class subject. It must only be
-- replaced by THIS teacher's own link, e.g. linking 10-A Mathematics must keep the
-- same teacher's unlinked 9-B Mathematics.
CREATE OR REPLACE FUNCTION app.sync_teacher_assignments(p_teacher uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH linked AS (
    SELECT c.id AS class_id, c.name AS class_name, cs.subject_name
    FROM public.teacher_subjects ts
    JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
    JOIN public.classes c ON c.id = cs.class_id
    WHERE ts.teacher_id = p_teacher
  ),
  legacy AS (
    SELECT e FROM public.users u,
      jsonb_array_elements(CASE WHEN jsonb_typeof(u.assignments) = 'array' THEN u.assignments ELSE '[]'::jsonb END) e
    WHERE u.id = p_teacher
      -- Entries written from teacher_subjects carry "linked": a removed link must not come back as legacy.
      AND (e ->> 'linked') IS NULL
      AND NOT EXISTS (SELECT 1 FROM linked lk
                      WHERE app.norm_class(lk.class_name) = app.norm_class(e ->> 'class')
                        AND lower(lk.subject_name) = lower(trim(e ->> 'subject')))
  ),
  merged AS (
    SELECT class_id, class_name, subject_name, true AS is_linked FROM linked
    UNION
    SELECT (SELECT c.id FROM public.classes c JOIN public.users u ON u.id = p_teacher
             WHERE c.school_id = u.school_id AND app.norm_class(c.name) = app.norm_class(l.e ->> 'class') LIMIT 1),
           l.e ->> 'class', trim(l.e ->> 'subject'), false
    FROM legacy l WHERE coalesce(trim(l.e ->> 'subject'), '') <> ''
  )
  UPDATE public.users u SET
    assignments       = coalesce((SELECT jsonb_agg(jsonb_build_object('class', class_name, 'subject', subject_name)
                                   || CASE WHEN is_linked THEN '{"linked": true}'::jsonb ELSE '{}'::jsonb END ORDER BY class_name, subject_name) FROM merged), '[]'::jsonb),
    teaching_subjects = coalesce((SELECT jsonb_agg(jsonb_build_object('classId', class_id, 'className', class_name, 'subjectName', subject_name)
                                   || CASE WHEN is_linked THEN '{"linked": true}'::jsonb ELSE '{}'::jsonb END ORDER BY class_name, subject_name) FROM merged), '[]'::jsonb),
    teacher_subject   = (SELECT subject_name FROM merged ORDER BY class_name, subject_name LIMIT 1)
  WHERE u.id = p_teacher AND u.role = 'teacher';
$$;
REVOKE ALL ON FUNCTION app.sync_teacher_assignments(uuid) FROM public, anon, authenticated;
