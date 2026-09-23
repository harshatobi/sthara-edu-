-- ============================================================================
-- Sthara OS — schema hardening (2026-09-23)
--
-- Written against the LIVE schema as probed on 2026-09-23 (not schema.sql,
-- which had drifted). Enforces, in the database, what the product promises:
--
--   P1  Tenant isolation — every role sees only its own school; superadmin all.
--   P2  Role scoping — students: own records; staff: their school; parents:
--       linked children only (via guardians).
--   P3  Grade integrity — no browser can write scores, AI results or teacher
--       approval. Submissions / submission_items are server-written only.
--   P4  TML integrity — tml_scores, tutor_sessions, engagement_scores are
--       server-written only (tutor depth feeds TML; clients must not forge it).
--   P5  Proctoring — proctor_alerts table; notifications gain the columns the
--       alert route writes (user_id, type, metadata).
--   P6  Wellness privacy, as shown to students ("Who can see what"):
--       student: everything of their own; class teacher: energy trend + at-risk
--       flag, note only if shared; parent: fortnightly summary; school admin:
--       anonymised class aggregates (groups < 5 students suppressed).
--       No role other than the student reads raw wellness rows.
--   P7  DPDP — guardians + consents; only a linked parent sets consent.
--   P8  Audit trail — append-only audit_log for grade, role, consent and
--       guardian changes.
--   P9  Account safety — no client can create users, change roles/schools, or
--       create schools (onboarding goes through a server route).
--   P10 Platform secrets — platform_settings is superadmin-only.
--   P11 Hygiene — constraints, updated_at triggers, indexes.
--
-- Non-destructive: no rows are deleted or rewritten. Constraints that could
-- conflict with legacy rows are added NOT VALID; uniqueness / NOT NULL are
-- only applied when existing data already satisfies them (NOTICE otherwise).
-- Idempotent: safe to re-run. Every existing policy on the managed tables is
-- dropped and replaced by the set below, so the result doesn't depend on
-- whatever policies were there before.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- 0. Helpers (schema app, not exposed through the API)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM public;
GRANT USAGE ON SCHEMA app TO authenticated, anon;

CREATE OR REPLACE FUNCTION app.current_school_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT school_id FROM public.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION app.user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT role FROM public.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION app.is_superadmin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.users WHERE id = auth.uid()), false)
      OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT COALESCE((SELECT role IN ('teacher', 'admin') FROM public.users WHERE id = auth.uid()), false) $$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT COALESCE((SELECT role = 'admin' FROM public.users WHERE id = auth.uid()), false) $$;

-- "Class 10-A", "10A", "10 a" -> "10a"
CREATE OR REPLACE FUNCTION app.norm_class(t text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT regexp_replace(lower(coalesce(t, '')), 'class|[^a-z0-9]', '', 'g') $$;

-- Does the current teacher teach this student's class (teacher_class or any
-- entry of users.assignments [{class, subject}])?
CREATE OR REPLACE FUNCTION app.teaches_student(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users t
    JOIN public.users s ON s.id = p_student AND s.school_id = t.school_id AND s.role = 'student'
    WHERE t.id = auth.uid() AND t.role = 'teacher'
      AND app.norm_class(s.student_class) <> ''
      AND (
        app.norm_class(t.teacher_class) = app.norm_class(s.student_class)
        OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
              SELECT 1 FROM json_array_elements(t.assignments::json) e
              WHERE app.norm_class(e->>'class') = app.norm_class(s.student_class)))
      )
  )
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Missing tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guardians (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship text,
  verified     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_guardians_student ON public.guardians (student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_parent  ON public.guardians (parent_id);

-- Linked, verified parent of this student?
CREATE OR REPLACE FUNCTION app.is_parent_of(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.guardians WHERE parent_id = auth.uid() AND student_id = p_student AND verified) $$;
REVOKE ALL ON FUNCTION app.is_parent_of(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app.is_parent_of(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.consents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  consent_type   text NOT NULL CHECK (consent_type IN ('wellness_checkin', 'ai_tutor', 'data_processing', 'proctoring')),
  granted        boolean NOT NULL DEFAULT false,
  granted_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  policy_version text,
  granted_at     timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, consent_type)
);
CREATE INDEX IF NOT EXISTS idx_consents_student ON public.consents (student_id);

CREATE TABLE IF NOT EXISTS public.proctor_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_name     text,
  assignment_id    uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  assignment_title text,
  switch_count     int NOT NULL DEFAULT 0 CHECK (switch_count >= 0),
  flagged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proctor_alerts_school  ON public.proctor_alerts (school_id, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_proctor_alerts_student ON public.proctor_alerts (student_id, assignment_id);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_role  text,
  action      text NOT NULL,
  table_name  text NOT NULL,
  row_id      text,
  school_id   uuid,
  old_values  jsonb,
  new_values  jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_school_at ON public.audit_log (school_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_row       ON public.audit_log (table_name, row_id);

-- Explicit grants for the new tables (don't rely on project default privileges).
-- RLS below decides which rows; the browser never gets write grants it doesn't need.
REVOKE ALL ON public.guardians, public.consents, public.proctor_alerts, public.audit_log FROM anon;
GRANT SELECT ON public.guardians, public.consents, public.proctor_alerts, public.audit_log TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.guardians TO authenticated;
GRANT ALL ON public.guardians, public.consents, public.proctor_alerts, public.audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Missing columns (live schema lacks these; app code already expects them)
-- ---------------------------------------------------------------------------
ALTER TABLE public.assignments   ADD COLUMN IF NOT EXISTS proctored boolean NOT NULL DEFAULT false;
ALTER TABLE public.assignments   ADD COLUMN IF NOT EXISTS submission_mode text NOT NULL DEFAULT 'handwritten';
ALTER TABLE public.assignments   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.schools       ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.wellness_logs ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.wellness_logs ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Constraints (NOT VALID where legacy rows might violate; validate later)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_valid') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_role_valid
      CHECK (role IN ('student', 'teacher', 'admin', 'parent', 'superadmin')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE role IS NULL) THEN
    ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
  ELSE
    RAISE NOTICE 'users.role has NULLs; NOT NULL not applied. Backfill, then re-run.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_submission_mode_valid') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_submission_mode_valid
      CHECK (submission_mode IN ('typed', 'handwritten'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wellness_energy_range') THEN
    ALTER TABLE public.wellness_logs ADD CONSTRAINT wellness_energy_range
      CHECK (energy IS NULL OR energy BETWEEN 1 AND 5) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wellness_note_length') THEN
    ALTER TABLE public.wellness_logs ADD CONSTRAINT wellness_note_length
      CHECK (note IS NULL OR char_length(note) <= 4000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_score_range') THEN
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_score_range
      CHECK (score IS NULL OR (score >= 0 AND (max_score IS NULL OR score <= max_score))) NOT VALID;
  END IF;
  -- One submission per student per assignment — only if the data already allows it.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_submissions_assignment_student')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_assignment_student') THEN
    IF NOT EXISTS (SELECT 1 FROM public.submissions GROUP BY assignment_id, student_id HAVING count(*) > 1) THEN
      CREATE UNIQUE INDEX uq_submissions_assignment_student ON public.submissions (assignment_id, student_id);
    ELSE
      RAISE NOTICE 'Duplicate (assignment_id, student_id) submissions exist; unique index not created. Resolve duplicates, then re-run.';
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes on hot RLS / query paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_school_role        ON public.users (school_id, role);
CREATE INDEX IF NOT EXISTS idx_assignments_school       ON public.assignments (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_student      ON public.submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_school       ON public.submissions (school_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_student ON public.submission_items (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_student_created ON public.wellness_logs (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_school_created  ON public.wellness_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tml_student_subject      ON public.tml_scores (student_id, subject, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutor_sessions_student   ON public.tutor_sessions (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user       ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_student    ON public.notifications (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_situations_school        ON public.situations (school_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Row-level security: replace every policy on the managed tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  p record;
  managed text[] := ARRAY[
    'schools', 'users', 'superadmins', 'platform_settings', 'classes', 'assignments', 'submissions',
    'submission_items', 'syllabus', 'materials', 'learning_outcomes', 'tml_scores', 'tutor_sessions',
    'engagement_scores', 'wellness_logs', 'situations', 'notifications', 'student_chats', 'student_memory',
    'guardians', 'consents', 'proctor_alerts', 'audit_log'];
BEGIN
  FOREACH t IN ARRAY managed LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Shorthands used below (evaluated once per statement via scalar subqueries):
--   (SELECT auth.uid())               the caller
--   (SELECT app.current_school_id())  the caller's school
--   (SELECT app.is_superadmin())      platform operator

-- schools: members read their own school; only superadmin writes (onboarding is server-side).
CREATE POLICY schools_read ON public.schools FOR SELECT TO authenticated
  USING (id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
CREATE POLICY schools_superadmin_write ON public.schools FOR ALL TO authenticated
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

-- users: self; staff see their school; parents see linked children; superadmin all.
-- No client inserts/updates: accounts and roles are created server-side (P9).
CREATE POLICY users_read ON public.users FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
    OR app.is_parent_of(id)
    OR (SELECT app.is_superadmin())
  );
CREATE POLICY users_superadmin_write ON public.users FOR ALL TO authenticated
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

CREATE POLICY superadmins_read ON public.superadmins FOR SELECT TO authenticated
  USING ((SELECT app.is_superadmin()));

-- platform_settings holds a default password: superadmin only (P10).
CREATE POLICY platform_settings_superadmin ON public.platform_settings FOR ALL TO authenticated
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

CREATE POLICY classes_read ON public.classes FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
CREATE POLICY classes_admin_write ON public.classes FOR ALL TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))
  WITH CHECK (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- assignments: whole school reads (students need them to work); staff write within
-- their school; a teacher only writes their own.
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
CREATE POLICY assignments_staff_insert ON public.assignments FOR INSERT TO authenticated
  WITH CHECK ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
              AND (teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())));
CREATE POLICY assignments_staff_update ON public.assignments FOR UPDATE TO authenticated
  USING ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
         AND (teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())))
  WITH CHECK (school_id = (SELECT app.current_school_id()));
CREATE POLICY assignments_staff_delete ON public.assignments FOR DELETE TO authenticated
  USING ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
         AND (teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())));

-- Grade & evidence tables (P3, P4): read-only for clients, written by the server.
CREATE POLICY submissions_read ON public.submissions FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id)
         OR (SELECT app.is_superadmin()));
CREATE POLICY submission_items_read ON public.submission_items FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id)
         OR (SELECT app.is_superadmin()));
CREATE POLICY tml_scores_read ON public.tml_scores FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id)
         OR (SELECT app.is_superadmin()));
CREATE POLICY tutor_sessions_read ON public.tutor_sessions FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));
CREATE POLICY engagement_scores_read ON public.engagement_scores FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id)
         OR (SELECT app.is_superadmin()));

CREATE POLICY syllabus_read ON public.syllabus FOR SELECT TO authenticated
  USING (school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
CREATE POLICY syllabus_staff_write ON public.syllabus FOR ALL TO authenticated
  USING ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
         AND (teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())))
  WITH CHECK ((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
              AND (teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())));

CREATE POLICY materials_read ON public.materials FOR SELECT TO authenticated
  USING (school_id IS NULL OR school_id = (SELECT app.current_school_id()) OR (SELECT app.is_superadmin()));
CREATE POLICY materials_staff_write ON public.materials FOR ALL TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))
  WITH CHECK (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

CREATE POLICY learning_outcomes_read ON public.learning_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY learning_outcomes_superadmin_write ON public.learning_outcomes FOR ALL TO authenticated
  USING ((SELECT app.is_superadmin())) WITH CHECK ((SELECT app.is_superadmin()));

-- wellness_logs (P6): the student alone touches raw rows. Everyone else goes
-- through the purpose-limited functions in section 7.
CREATE POLICY wellness_own ON public.wellness_logs FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()) AND school_id IS NOT DISTINCT FROM (SELECT app.current_school_id()));

-- situations: staff of the school (teachers see their own + school-wide ones).
CREATE POLICY situations_read ON public.situations FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
          AND (teacher_id IS NULL OR teacher_id = (SELECT auth.uid()) OR (SELECT app.is_admin())))
         OR (SELECT app.is_superadmin()));

-- notifications: the recipient reads and marks read (only `read` may change — trigger below).
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid()));
CREATE POLICY notifications_mark_read ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid()));

-- Tutor chat history & memory: the student's own (DPDP: they can erase chats).
CREATE POLICY student_chats_own ON public.student_chats FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid())) WITH CHECK (student_id = (SELECT auth.uid()));
CREATE POLICY student_memory_own_read ON public.student_memory FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));

-- guardians: the parent, the student, and the school's admin read; admins of the
-- student's school manage links (verification is an admin act).
CREATE POLICY guardians_read ON public.guardians FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid())
         OR ((SELECT app.is_admin()) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
         OR (SELECT app.is_superadmin()));
CREATE POLICY guardians_admin_write ON public.guardians FOR ALL TO authenticated
  USING (((SELECT app.is_admin()) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
         OR (SELECT app.is_superadmin()))
  WITH CHECK (((SELECT app.is_admin()) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
              OR (SELECT app.is_superadmin()));

-- consents (P7): the student and their parents read; the school admin reads;
-- writes only through app.set_consent() (section 7) so they're audited.
CREATE POLICY consents_read ON public.consents FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR app.is_parent_of(student_id)
         OR ((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

-- proctor_alerts (P5): staff of the school read; written by the server route.
CREATE POLICY proctor_alerts_read ON public.proctor_alerts FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- audit_log (P8): admins read their school; superadmin all; nobody writes directly.
CREATE POLICY audit_log_read ON public.audit_log FOR SELECT TO authenticated
  USING (((SELECT app.is_admin()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- ---------------------------------------------------------------------------
-- 6. Triggers: column guards, updated_at, audit
-- ---------------------------------------------------------------------------
-- True when the statement comes from the server (service role) or a DB owner,
-- not from a signed-in browser client.
CREATE OR REPLACE FUNCTION app.is_server() RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'service_role') $$;

-- Students may not flip the at-risk acknowledgement on their own wellness rows.
CREATE OR REPLACE FUNCTION app.guard_wellness_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT app.is_server() THEN
    NEW.resolved   := OLD.resolved;
    NEW.student_id := OLD.student_id;
    NEW.school_id  := OLD.school_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_wellness_update ON public.wellness_logs;
CREATE TRIGGER trg_guard_wellness_update BEFORE UPDATE ON public.wellness_logs
  FOR EACH ROW EXECUTE FUNCTION app.guard_wellness_update();

CREATE OR REPLACE FUNCTION app.guard_wellness_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT app.is_server() THEN NEW.resolved := false; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_wellness_insert ON public.wellness_logs;
CREATE TRIGGER trg_guard_wellness_insert BEFORE INSERT ON public.wellness_logs
  FOR EACH ROW EXECUTE FUNCTION app.guard_wellness_insert();

-- Recipients may only toggle `read` on a notification.
CREATE OR REPLACE FUNCTION app.guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_read boolean := NEW.read;
BEGIN
  IF NOT app.is_server() THEN
    NEW := OLD;
    NEW.read := v_read;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_notification_update ON public.notifications;
CREATE TRIGGER trg_guard_notification_update BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION app.guard_notification_update();

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schools', 'users', 'assignments', 'submissions', 'consents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;

-- Audit (P8). SECURITY DEFINER so the insert works whoever makes the change.
CREATE OR REPLACE FUNCTION app.audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
BEGIN
  -- Only record changes to the fields that matter for this table.
  IF TG_OP = 'UPDATE' AND TG_NARGS > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(string_to_array(TG_ARGV[0], ',')) f
                   WHERE v_old -> f IS DISTINCT FROM v_new -> f) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_school := CASE WHEN TG_TABLE_NAME = 'guardians'
                   THEN (SELECT school_id FROM public.users WHERE id = (v_row ->> 'student_id')::uuid)
                   ELSE nullif(v_row ->> 'school_id', '')::uuid END;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (auth.uid(), CASE WHEN app.is_server() THEN 'server' ELSE app.user_role() END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'id', v_school, v_old, v_new);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_submissions ON public.submissions;
CREATE TRIGGER trg_audit_submissions AFTER UPDATE OR DELETE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION app.audit('score,max_score,grade,final_grade,teacher_approved,ai_grade');
DROP TRIGGER IF EXISTS trg_audit_users ON public.users;
CREATE TRIGGER trg_audit_users AFTER UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.audit('role,school_id,email');
DROP TRIGGER IF EXISTS trg_audit_consents ON public.consents;
CREATE TRIGGER trg_audit_consents AFTER INSERT OR UPDATE OR DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_guardians ON public.guardians;
CREATE TRIGGER trg_audit_guardians AFTER INSERT OR UPDATE OR DELETE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ---------------------------------------------------------------------------
-- 7. Purpose-limited access functions (exposed as RPCs)
-- ---------------------------------------------------------------------------
-- P6 teacher view: energy trend + at-risk flag for students in classes the
-- teacher teaches; the note only when the student shared it.
CREATE OR REPLACE FUNCTION public.teacher_wellness_feed(p_days int DEFAULT 14)
RETURNS TABLE (log_id uuid, student_id uuid, student_name text, student_class text,
               created_at timestamptz, energy int, at_risk boolean, resolved boolean, shared_note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT w.id, w.student_id, s.name, s.student_class, w.created_at, w.energy,
         (w.energy IS NOT NULL AND w.energy <= 2), w.resolved,
         CASE WHEN w.shared THEN w.note END
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
    AND (w.note IS NULL OR w.shared)
    AND app.teaches_student(w.student_id)
  ORDER BY w.created_at DESC
$$;

-- P6 parent view: fortnightly summary for a linked child, no raw rows.
CREATE OR REPLACE FUNCTION public.parent_wellness_summary(p_student uuid, p_days int DEFAULT 14)
RETURNS TABLE (checkins bigint, avg_energy numeric, low_days bigint, latest_energy int, latest_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(*), round(avg(w.energy)::numeric, 1), count(*) FILTER (WHERE w.energy <= 2),
         (array_agg(w.energy ORDER BY w.created_at DESC))[1], max(w.created_at)
  FROM public.wellness_logs w
  WHERE app.is_parent_of(p_student)
    AND w.student_id = p_student AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
$$;

-- P6 admin view: anonymised per-class aggregates; classes with fewer than 5
-- distinct students in the window are suppressed.
CREATE OR REPLACE FUNCTION public.school_wellness_aggregates(p_days int DEFAULT 14)
RETURNS TABLE (student_class text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.student_class, count(DISTINCT w.student_id), count(*), round(avg(w.energy)::numeric, 2),
         round(avg((w.energy <= 2)::int)::numeric, 2)
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE (app.is_admin() OR app.is_superadmin())
    AND w.school_id = app.current_school_id()
    AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  GROUP BY s.student_class
  HAVING count(DISTINCT w.student_id) >= 5
$$;

-- P7: a verified parent grants or revokes consent for their child (audited).
CREATE OR REPLACE FUNCTION public.set_consent(p_student uuid, p_type text, p_granted boolean, p_policy_version text DEFAULT NULL)
RETURNS public.consents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.consents;
BEGIN
  IF NOT app.is_parent_of(p_student) THEN
    RAISE EXCEPTION 'Only a verified parent or guardian can set consent for this student' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.consents (student_id, school_id, consent_type, granted, granted_by, policy_version, granted_at, revoked_at)
  SELECT p_student, u.school_id, p_type, p_granted, auth.uid(), p_policy_version,
         CASE WHEN p_granted THEN now() END, CASE WHEN NOT p_granted THEN now() END
  FROM public.users u WHERE u.id = p_student
  ON CONFLICT (student_id, consent_type) DO UPDATE
    SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, policy_version = EXCLUDED.policy_version,
        granted_at = CASE WHEN EXCLUDED.granted THEN now() ELSE consents.granted_at END,
        revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END
  RETURNING * INTO v;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.teacher_wellness_feed(int)             FROM public, anon;
REVOKE ALL ON FUNCTION public.parent_wellness_summary(uuid, int)     FROM public, anon;
REVOKE ALL ON FUNCTION public.school_wellness_aggregates(int)        FROM public, anon;
REVOKE ALL ON FUNCTION public.set_consent(uuid, text, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.teacher_wellness_feed(int)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_wellness_summary(uuid, int)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_wellness_aggregates(int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_consent(uuid, text, boolean, text) TO authenticated;

-- Helpers added after the first GRANT (is_server, guards, audit) — keep them
-- executable by clients whose statements fire the triggers.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated;

COMMIT;
