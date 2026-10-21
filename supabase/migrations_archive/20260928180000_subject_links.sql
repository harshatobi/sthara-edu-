-- Subject linking: every subject a school tracks is an official curriculum subject,
-- and every role's relationship to it is a row, not free text.
--
--   class_subjects    what a class (section) offers: an official curriculum subject, core or elective
--   student_subjects  what each student takes: every core subject of their class, plus chosen electives
--   teacher_subjects  who teaches which class subject (subject teacher or co-teacher)
--   subject_leads     head of department / subject lead per subject across the school
--
-- TML, the tutor and the teacher desk key on these, so a subject is the same thing
-- everywhere: same canonical name (the curriculum document's), same key.
--
-- Compatibility: classes.metadata.subjects and users.assignments / teaching_subjects /
-- teacher_subject are still read across the app and by RLS (teacher scope). Triggers
-- rebuild them from these tables, keeping any legacy entry that isn't linked yet so
-- nothing disappears before an operator links it.
--
-- Enrolment follows the student: on creation or a class change, core subjects of the
-- new class are added, subjects of the old class removed, and electives carried over
-- when the new class offers the same subject (e.g. promotion 11-A -> 12-A).
--
-- Writes go through the service role only (/api/ops, /api/admin after permission checks).

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  -- Class-independent key, e.g. 'mathematics', 'english-language-and-literature'.
  subject_key   text NOT NULL CHECK (subject_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(subject_key) <= 80),
  -- The curriculum document's name, e.g. 'Mathematics', 'Hindi Course A'.
  subject_name  text NOT NULL CHECK (char_length(subject_name) BETWEEN 1 AND 120),
  board         text NOT NULL DEFAULT 'CBSE' CHECK (board IN ('CBSE')),
  -- The curriculum level the subject is taught at ('6' .. '12').
  level         text NOT NULL CHECK (level ~ '^(1[0-2]|[1-9])$'),
  kind          text NOT NULL DEFAULT 'core' CHECK (kind IN ('core', 'elective')),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_key)
);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON public.class_subjects (school_id, subject_key);

CREATE TABLE IF NOT EXISTS public.student_subjects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_subject_id  uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  source            text NOT NULL CHECK (source IN ('core', 'elective')),
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_student_subjects_cs ON public.student_subjects (class_subject_id);

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_subject_id  uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'subject_teacher' CHECK (role IN ('subject_teacher', 'co_teacher')),
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_cs ON public.teacher_subjects (class_subject_id);

CREATE TABLE IF NOT EXISTS public.subject_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_key   text NOT NULL,
  subject_name  text NOT NULL,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject_key, user_id)
);

-- ── Integrity: every link stays inside one school, with the right roles ─────

CREATE OR REPLACE FUNCTION app.guard_subject_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_school uuid; v_role text; v_user_school uuid;
BEGIN
  IF TG_TABLE_NAME = 'class_subjects' THEN
    SELECT school_id INTO v_school FROM public.classes WHERE id = NEW.class_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'class_subjects: class belongs to another school'; END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'subject_leads' THEN
    SELECT role, school_id INTO v_role, v_user_school FROM public.users WHERE id = NEW.user_id;
    IF v_user_school IS DISTINCT FROM NEW.school_id OR v_role NOT IN ('teacher', 'admin') THEN
      RAISE EXCEPTION 'subject_leads: a subject lead must be a teacher or office account of the school';
    END IF;
    RETURN NEW;
  END IF;
  SELECT school_id INTO v_school FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION '%: class subject belongs to another school', TG_TABLE_NAME; END IF;
  -- Through jsonb: the two tables name the person column differently.
  SELECT role, school_id INTO v_role, v_user_school FROM public.users
   WHERE id = (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'student_subjects' THEN 'student_id' ELSE 'teacher_id' END)::uuid;
  IF v_user_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION '%: person belongs to another school', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME = 'student_subjects' AND v_role <> 'student' THEN RAISE EXCEPTION 'student_subjects: not a student'; END IF;
  IF TG_TABLE_NAME = 'teacher_subjects' AND v_role <> 'teacher' THEN RAISE EXCEPTION 'teacher_subjects: not a teacher'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_class_subjects ON public.class_subjects;
CREATE TRIGGER trg_guard_class_subjects BEFORE INSERT OR UPDATE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link();
DROP TRIGGER IF EXISTS trg_guard_student_subjects ON public.student_subjects;
CREATE TRIGGER trg_guard_student_subjects BEFORE INSERT OR UPDATE ON public.student_subjects
  FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link();
DROP TRIGGER IF EXISTS trg_guard_teacher_subjects ON public.teacher_subjects;
CREATE TRIGGER trg_guard_teacher_subjects BEFORE INSERT OR UPDATE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link();
DROP TRIGGER IF EXISTS trg_guard_subject_leads ON public.subject_leads;
CREATE TRIGGER trg_guard_subject_leads BEFORE INSERT OR UPDATE ON public.subject_leads
  FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link();

-- ── Legacy fields, rebuilt from the tables ──────────────────────────────────

-- classes.metadata.subjects = linked subjects (core first) + legacy names not linked yet.
-- metadata.linkedSubjects remembers what came from the table, so a removed subject really goes
-- (instead of lingering as "legacy").
CREATE OR REPLACE FUNCTION app.sync_class_subject_meta(p_class uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH cur AS (
    SELECT coalesce((SELECT jsonb_agg(cs.subject_name ORDER BY (cs.kind <> 'core'), cs.subject_name)
                     FROM public.class_subjects cs WHERE cs.class_id = p_class), '[]'::jsonb) AS linked
  )
  UPDATE public.classes c SET metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
    'subjects', cur.linked || coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'subjects') = 'array' THEN c.metadata -> 'subjects' ELSE '[]'::jsonb END) e
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cur.linked) l WHERE lower(l) = lower(trim(e)))
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'linkedSubjects') = 'array' THEN c.metadata -> 'linkedSubjects' ELSE '[]'::jsonb END) p
                        WHERE lower(p) = lower(trim(e)))), '[]'::jsonb),
    'linkedSubjects', cur.linked)
  FROM cur
  WHERE c.id = p_class;
$$;

-- users.assignments / teaching_subjects / teacher_subject = linked teaching rows + legacy rows not linked yet.
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
      AND NOT EXISTS (
        SELECT 1 FROM public.class_subjects cs JOIN public.classes c ON c.id = cs.class_id
        WHERE c.school_id = u.school_id AND app.norm_class(c.name) = app.norm_class(e ->> 'class')
          AND lower(cs.subject_name) = lower(trim(e ->> 'subject')))
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

-- ── Enrolment ────────────────────────────────────────────────────────────────

-- Every student currently in the class gets this core subject.
CREATE OR REPLACE FUNCTION app.enrol_core(p_class_subject uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
  SELECT cs.school_id, u.id, cs.id, 'core'
  FROM public.class_subjects cs
  JOIN public.classes c ON c.id = cs.class_id
  JOIN public.users u ON u.school_id = cs.school_id AND u.role = 'student' AND app.norm_class(u.student_class) = app.norm_class(c.name)
  WHERE cs.id = p_class_subject AND cs.kind = 'core'
  ON CONFLICT (student_id, class_subject_id) DO NOTHING;
$$;

-- A student's subjects follow their class: electives carried over by subject, core re-derived.
CREATE OR REPLACE FUNCTION app.reconcile_student_subjects(p_student uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_school uuid; v_role text; v_cls text; v_class uuid;
BEGIN
  SELECT school_id, role, student_class INTO v_school, v_role, v_cls FROM public.users WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student' THEN
    DELETE FROM public.student_subjects WHERE student_id = p_student;
    RETURN;
  END IF;
  SELECT id INTO v_class FROM public.classes WHERE school_id = v_school AND app.norm_class(name) = app.norm_class(v_cls) ORDER BY created_at LIMIT 1;
  -- Electives: carried to the new class when it offers the same subject.
  INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
  SELECT v_school, p_student, ncs.id, 'elective'
  FROM public.student_subjects ss
  JOIN public.class_subjects ocs ON ocs.id = ss.class_subject_id
  JOIN public.class_subjects ncs ON ncs.class_id = v_class AND ncs.subject_key = ocs.subject_key
  WHERE ss.student_id = p_student AND ss.source = 'elective' AND ocs.class_id IS DISTINCT FROM v_class
  ON CONFLICT (student_id, class_subject_id) DO NOTHING;
  DELETE FROM public.student_subjects ss USING public.class_subjects cs
   WHERE ss.class_subject_id = cs.id AND ss.student_id = p_student AND cs.class_id IS DISTINCT FROM v_class;
  IF v_class IS NOT NULL THEN
    INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
    SELECT v_school, p_student, cs.id, 'core' FROM public.class_subjects cs WHERE cs.class_id = v_class AND cs.kind = 'core'
    ON CONFLICT (student_id, class_subject_id) DO NOTHING;
  END IF;
END $$;

-- ── Triggers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.on_class_subject_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM app.sync_class_subject_meta(OLD.class_id);
    RETURN NULL;
  END IF;
  PERFORM app.sync_class_subject_meta(NEW.class_id);
  IF TG_OP = 'INSERT' OR OLD.kind IS DISTINCT FROM NEW.kind THEN
    IF NEW.kind = 'core' THEN
      PERFORM app.enrol_core(NEW.id);
      UPDATE public.student_subjects SET source = 'core' WHERE class_subject_id = NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Core -> elective: students keep it, now as a choice that can be undone.
      UPDATE public.student_subjects SET source = 'elective' WHERE class_subject_id = NEW.id;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.subject_name IS DISTINCT FROM NEW.subject_name THEN
    PERFORM app.sync_teacher_assignments(ts.teacher_id) FROM public.teacher_subjects ts WHERE ts.class_subject_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_class_subject_change ON public.class_subjects;
CREATE TRIGGER trg_class_subject_change AFTER INSERT OR UPDATE OR DELETE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION app.on_class_subject_change();

CREATE OR REPLACE FUNCTION app.on_teacher_subject_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM app.sync_teacher_assignments(CASE WHEN TG_OP = 'DELETE' THEN OLD.teacher_id ELSE NEW.teacher_id END);
  IF TG_OP = 'UPDATE' AND OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN PERFORM app.sync_teacher_assignments(OLD.teacher_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_teacher_subject_change ON public.teacher_subjects;
CREATE TRIGGER trg_teacher_subject_change AFTER INSERT OR UPDATE OR DELETE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION app.on_teacher_subject_change();

CREATE OR REPLACE FUNCTION app.on_student_class_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role <> 'student' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id
     AND app.norm_class(OLD.student_class) = app.norm_class(NEW.student_class) THEN
    RETURN NULL;
  END IF;
  PERFORM app.reconcile_student_subjects(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_student_class_change ON public.users;
CREATE TRIGGER trg_student_class_change AFTER INSERT OR UPDATE OF student_class, role, school_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.on_student_class_change();

-- A renamed class: its students now match by the new name, so re-derive theirs.
CREATE OR REPLACE FUNCTION app.on_class_rename() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app.norm_class(OLD.name) <> app.norm_class(NEW.name) THEN
    PERFORM app.reconcile_student_subjects(u.id) FROM public.users u
     WHERE u.school_id = NEW.school_id AND u.role = 'student'
       AND app.norm_class(u.student_class) IN (app.norm_class(OLD.name), app.norm_class(NEW.name));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_class_rename ON public.classes;
CREATE TRIGGER trg_class_rename AFTER UPDATE OF name ON public.classes
  FOR EACH ROW EXECUTE FUNCTION app.on_class_rename();

-- Audit trail, like guardians and consents.
DROP TRIGGER IF EXISTS trg_audit_class_subjects ON public.class_subjects;
CREATE TRIGGER trg_audit_class_subjects AFTER INSERT OR UPDATE OR DELETE ON public.class_subjects
  FOR EACH ROW EXECUTE FUNCTION app.audit('subject_name,kind,level');
DROP TRIGGER IF EXISTS trg_audit_student_subjects ON public.student_subjects;
CREATE TRIGGER trg_audit_student_subjects AFTER INSERT OR UPDATE OR DELETE ON public.student_subjects
  FOR EACH ROW EXECUTE FUNCTION app.audit('source');
DROP TRIGGER IF EXISTS trg_audit_teacher_subjects ON public.teacher_subjects;
CREATE TRIGGER trg_audit_teacher_subjects AFTER INSERT OR UPDATE OR DELETE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION app.audit('role,teacher_id');
DROP TRIGGER IF EXISTS trg_audit_subject_leads ON public.subject_leads;
CREATE TRIGGER trg_audit_subject_leads AFTER INSERT OR UPDATE OR DELETE ON public.subject_leads
  FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Access ───────────────────────────────────────────────────────────────────

ALTER TABLE public.class_subjects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_leads    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.class_subjects, public.student_subjects, public.teacher_subjects, public.subject_leads FROM anon, authenticated;
GRANT SELECT ON public.class_subjects, public.student_subjects, public.teacher_subjects, public.subject_leads TO authenticated;
GRANT ALL ON public.class_subjects, public.student_subjects, public.teacher_subjects, public.subject_leads TO service_role;

-- What a class offers, who teaches it and who leads a subject: anyone at the school.
DROP POLICY IF EXISTS class_subjects_read ON public.class_subjects;
CREATE POLICY class_subjects_read ON public.class_subjects FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS teacher_subjects_read ON public.teacher_subjects;
CREATE POLICY teacher_subjects_read ON public.teacher_subjects FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS subject_leads_read ON public.subject_leads;
CREATE POLICY subject_leads_read ON public.subject_leads FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
-- What a student takes: the student, their verified parents, and the school's staff.
DROP POLICY IF EXISTS student_subjects_read ON public.student_subjects;
CREATE POLICY student_subjects_read ON public.student_subjects FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR (SELECT app.is_parent_of(student_id))
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

REVOKE ALL ON FUNCTION app.guard_subject_link(), app.sync_class_subject_meta(uuid), app.sync_teacher_assignments(uuid),
  app.enrol_core(uuid), app.reconcile_student_subjects(uuid), app.on_class_subject_change(), app.on_teacher_subject_change(),
  app.on_student_class_change(), app.on_class_rename() FROM public, anon, authenticated;
