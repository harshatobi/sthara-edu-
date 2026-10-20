-- Sthara baseline — the whole schema as of 20261018171721, dumped from the live database on 2026-10-20.
--
-- Every migration up to and including 20261018171721 is folded in here; the originals are kept for reference in
-- supabase/migrations_archive/. Regenerate with scripts/db/dump-baseline.sh — never hand-edit.
--
-- Grants are explicit for every table, view, sequence and function (Supabase stops granting new public tables
-- to the API roles by default on 2026-10-30), so this file rebuilds the same access on a fresh project.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "app";


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: sandbox_seed; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "sandbox_seed";


--
-- Name: audit(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."audit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
BEGIN
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
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'id', v_school, v_old, v_new);
  RETURN NULL;
END $$;


--
-- Name: audit_exam_marks(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."audit_exam_marks"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_was_submitted boolean;
BEGIN
  SELECT submitted_at IS NOT NULL INTO v_was_submitted FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF NOT coalesce(v_was_submitted, false) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.marks IS NOT DISTINCT FROM OLD.marks AND NEW.code IS NOT DISTINCT FROM OLD.code THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), (coalesce(NEW, OLD)).updated_by), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, 'exam_marks', (coalesce(NEW, OLD)).id::text, (coalesce(NEW, OLD)).school_id,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('sheet_id', OLD.sheet_id, 'student_id', OLD.student_id, 'marks', OLD.marks, 'code', OLD.code) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('sheet_id', NEW.sheet_id, 'student_id', NEW.student_id, 'marks', NEW.marks, 'code', NEW.code, 'source', NEW.source) END);
  RETURN NULL;
END $$;


--
-- Name: audit_fields_only(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."audit_fields_only"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: audit_touch_only(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."audit_touch_only"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_row jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), nullif(v_row ->> 'created_by', '')::uuid, nullif(v_row ->> 'updated_by', '')::uuid),
          CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, coalesce(v_row ->> 'id', v_row ->> 'staff_member_id'), nullif(v_row ->> 'school_id', '')::uuid, NULL,
          jsonb_strip_nulls(jsonb_build_object('staff_member_id', v_row ->> 'staff_member_id', 'effective_from', v_row ->> 'effective_from', 'month', v_row ->> 'month', 'fy', v_row ->> 'fy')));
  RETURN NULL;
END $$;


--
-- Name: bootstrap_school_admin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."bootstrap_school_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.role = 'admin' AND NEW.school_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.school_id = NEW.school_id AND g.role_key = 'school_admin' AND g.revoked_at IS NULL) THEN
    INSERT INTO public.role_grants (school_id, user_id, role_key, note) VALUES (NEW.school_id, NEW.id, 'school_admin', 'First admin of the school');
  END IF;
  RETURN NULL;
END $$;


--
-- Name: can_see_thread("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."can_see_thread"("p_thread" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_threads t
    WHERE t.id = p_thread AND (
      (t.parent_id = auth.uid() AND app.is_parent_of(t.student_id))
      OR t.staff_id = auth.uid()
      OR (t.school_id = app.current_school_id() AND app.has_perm('messages.office'))
      OR app.is_superadmin()
    )
  )
$$;


--
-- Name: check_timetable_slot(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."check_timetable_slot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE clash record;
BEGIN
  IF NEW.school_id IS DISTINCT FROM (SELECT school_id FROM public.timetable_versions WHERE id = NEW.version_id) THEN
    RAISE EXCEPTION 'timetable slot and version are in different schools';
  END IF;
  IF NEW.teacher_id IS NOT NULL OR NEW.staff_member_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no AND s.id <> NEW.id
       AND ((NEW.teacher_id IS NOT NULL AND s.teacher_id = NEW.teacher_id)
            OR (NEW.staff_member_id IS NOT NULL AND s.staff_member_id = NEW.staff_member_id))
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'teacher clash: already teaching % in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no
       AND s.room_id = NEW.room_id AND s.id <> NEW.id
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'room clash: % is already in this room in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: current_school_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."current_school_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT school_id FROM public.users WHERE id = auth.uid() $$;


--
-- Name: day_closed("uuid", "date"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."day_closed"("p_school" "uuid", "p_day" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.fee_day_closes WHERE school_id = p_school AND day = p_day AND status = 'closed')
$$;


--
-- Name: enrol_core("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."enrol_core"("p_class_subject" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
  SELECT cs.school_id, u.id, cs.id, 'core'
  FROM public.class_subjects cs
  JOIN public.classes c ON c.id = cs.class_id
  JOIN public.users u ON u.school_id = cs.school_id AND u.role = 'student' AND app.norm_class(u.student_class) = app.norm_class(c.name)
  WHERE cs.id = p_class_subject AND cs.kind = 'core'
  ON CONFLICT (student_id, class_subject_id) DO NOTHING;
$$;


--
-- Name: grade_of("text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."grade_of"("t" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT nullif(substring(coalesce(t, '') from '(\d{1,2})'), '')::int
$$;


--
-- Name: guard_director(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_director"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.role = 'director' AND NOT (
       EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND role = 'superadmin')
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'Only the superadmin can be a director' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_exam_marks(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_exam_marks"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE s record;
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_sheets WHERE id = OLD.sheet_id) THEN RETURN OLD; END IF;
  SELECT status, max_marks INTO s FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'marks sheet is not open' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.marks IS NOT NULL AND NEW.marks > s.max_marks THEN
    RAISE EXCEPTION 'marks above the maximum' USING ERRCODE = '23514';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: guard_exam_scheme_grades(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_exam_scheme_grades"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.exam_schemes s
    WHERE s.school_id = NEW.school_id AND s.session = NEW.session AND s.status = 'active' AND s.id <> NEW.id AND s.grades && NEW.grades
  ) THEN
    RAISE EXCEPTION 'another active scheme already covers one of these classes' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_exam_student_terms(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_exam_student_terms"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_student uuid := coalesce(NEW.student_id, OLD.student_id); v_term uuid := coalesce(NEW.term_id, OLD.term_id);
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = v_term) THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_class_terms ct JOIN public.classes c ON c.id = ct.class_id JOIN public.users u ON u.id = v_student
    WHERE ct.term_id = v_term AND ct.status = 'published'
      AND regexp_replace(lower(c.name), 'class|[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(u.student_class, '')), 'class|[^a-z0-9]', '', 'g')
  ) THEN
    RAISE EXCEPTION 'class term is published' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: guard_fee_payment(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_fee_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: guard_notification_update(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_notification_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_read boolean := NEW.read;
BEGIN
  IF NOT app.is_server() THEN
    NEW := OLD;
    NEW.read := v_read;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_pay_run_lines(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_pay_run_lines"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = coalesce(NEW.run_id, OLD.run_id) AND r.status = 'approved') THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: guard_pay_runs(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_pay_runs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Removing a whole school takes its payroll with it: by then the school row is already gone.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: guard_published_slots(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_published_slots"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  -- Linking a login: the lesson's register teacher becomes the same person's account; nothing else may change.
  IF TG_OP = 'UPDATE' AND current_setting('app.person_relink', true) = 'on'
     AND OLD.staff_member_id IS NOT NULL AND NEW.staff_member_id IS NULL AND OLD.teacher_id IS NULL AND NEW.teacher_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['teacher_id', 'staff_member_id', 'class_key']) = (to_jsonb(OLD) - ARRAY['teacher_id', 'staff_member_id', 'class_key']) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.timetable_versions v
             WHERE v.id = coalesce(NEW.version_id, OLD.version_id) AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'this timetable is published; copy it to a new draft to change it' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;


--
-- Name: guard_report_cards(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_report_cards"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id)
       OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.student_id)
       OR NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = OLD.term_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'report cards are kept' USING ERRCODE = '42501';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.version <> OLD.version OR NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id
     OR NEW.published_at <> OLD.published_at OR NEW.revised <> OLD.revised OR NEW.revision_reason IS DISTINCT FROM OLD.revision_reason
     OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at) THEN
    RAISE EXCEPTION 'published report card is frozen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_role_grant(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_role_grant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND school_id = NEW.school_id AND role = 'admin') THEN
      RAISE EXCEPTION 'Roles can only be given to office (admin) accounts of this school' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
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


--
-- Name: guard_subject_link(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_subject_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  SELECT role, school_id INTO v_role, v_user_school FROM public.users
   WHERE id = (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'student_subjects' THEN 'student_id' ELSE 'teacher_id' END)::uuid;
  IF v_user_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION '%: person belongs to another school', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME = 'student_subjects' AND v_role <> 'student' THEN RAISE EXCEPTION 'student_subjects: not a student'; END IF;
  IF TG_TABLE_NAME = 'teacher_subjects' AND v_role <> 'teacher' THEN RAISE EXCEPTION 'teacher_subjects: not a teacher'; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_superadmin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_superadmin"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.role = 'superadmin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'superadmin') THEN
    -- Deliberately not SECURITY DEFINER: current_user is whoever is really asking.
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_superadmin_list(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_superadmin_list"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.user_id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.user_id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_wellness_insert(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_wellness_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT app.is_server() THEN NEW.resolved := false; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_wellness_update(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."guard_wellness_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT app.is_server() THEN
    NEW.resolved   := OLD.resolved;
    NEW.student_id := OLD.student_id;
    NEW.school_id  := OLD.school_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: has_perm("text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."has_perm"("p" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT app.user_has_perm(auth.uid(), p)
$$;


--
-- Name: has_wellness_consent("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."has_wellness_consent"("p_student" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.student_id = p_student AND c.consent_type = 'wellness_checkin'
      AND c.granted AND c.revoked_at IS NULL
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT COALESCE((SELECT role = 'admin' FROM public.users WHERE id = auth.uid()), false) $$;


--
-- Name: is_parent_of("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_parent_of"("p_student" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.guardians WHERE parent_id = auth.uid() AND student_id = p_student AND verified) $$;


--
-- Name: is_server(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_server"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'service_role') $$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT COALESCE((SELECT role IN ('teacher', 'admin') FROM public.users WHERE id = auth.uid()), false) $$;


--
-- Name: is_superadmin(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.users WHERE id = auth.uid()), false)
      OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid())
$$;


--
-- Name: is_teacher(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."is_teacher"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
$$;


--
-- Name: next_doc_no("uuid", "text", "text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."next_doc_no"("p_school" "uuid", "p_kind" "text", "p_session" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, p_kind, p_session, 1)
  ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN (CASE p_kind WHEN 'invoice' THEN 'INV' ELSE 'RCT' END) || '/' || p_session || '/' || lpad(n::text, 5, '0');
END $$;


--
-- Name: norm_class("text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."norm_class"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'pg_temp'
    AS $$ SELECT regexp_replace(lower(coalesce(t, '')), 'class|[^a-z0-9]', '', 'g') $$;


--
-- Name: on_class_rename(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."on_class_rename"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF app.norm_class(OLD.name) <> app.norm_class(NEW.name) THEN
    PERFORM app.reconcile_student_subjects(u.id) FROM public.users u
     WHERE u.school_id = NEW.school_id AND u.role = 'student'
       AND app.norm_class(u.student_class) IN (app.norm_class(OLD.name), app.norm_class(NEW.name));
  END IF;
  RETURN NULL;
END $$;


--
-- Name: on_class_subject_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."on_class_subject_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
      UPDATE public.student_subjects SET source = 'elective' WHERE class_subject_id = NEW.id;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.subject_name IS DISTINCT FROM NEW.subject_name THEN
    PERFORM app.sync_teacher_assignments(ts.teacher_id) FROM public.teacher_subjects ts WHERE ts.class_subject_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: on_student_class_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."on_student_class_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role <> 'student' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id
     AND app.norm_class(OLD.student_class) = app.norm_class(NEW.student_class) THEN
    RETURN NULL;
  END IF;
  PERFORM app.reconcile_student_subjects(NEW.id);
  RETURN NULL;
END $$;


--
-- Name: on_teacher_subject_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."on_teacher_subject_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.sync_teacher_assignments(CASE WHEN TG_OP = 'DELETE' THEN OLD.teacher_id ELSE NEW.teacher_id END);
  IF TG_OP = 'UPDATE' AND OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN PERFORM app.sync_teacher_assignments(OLD.teacher_id); END IF;
  RETURN NULL;
END $$;


--
-- Name: ops_access_grants_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_access_grants_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Rows go only when their school is deleted (the cascade), never one by one.
    IF EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN
      RAISE EXCEPTION 'ops_access_grants is append-only';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operator_email IS DISTINCT FROM OLD.operator_email
     OR NEW.operator_role IS DISTINCT FROM OLD.operator_role OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.case_ref IS DISTINCT FROM OLD.case_ref OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (OLD.operator_id IS NOT NULL AND NEW.operator_id IS NOT NULL AND NEW.operator_id <> OLD.operator_id)
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'An access grant cannot be changed, only ended';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: ops_case_messages_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_case_messages_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'A case message cannot be changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.ops_cases WHERE id = OLD.case_id) THEN RAISE EXCEPTION 'A case message cannot be removed'; END IF;
  RETURN OLD;
END $$;


--
-- Name: ops_commissions_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_commissions_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'paid') THEN RAISE EXCEPTION 'An approved or paid commission cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'paid' AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.paid_on IS DISTINCT FROM OLD.paid_on) THEN
    RAISE EXCEPTION 'A paid commission cannot be changed';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: ops_inspect_links(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_inspect_links"() RETURNS TABLE("child" "text", "col" "text", "parent" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: ops_inspectable(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_inspectable"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
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


--
-- Name: ops_quotes_guard(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."ops_quotes_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.plan IS DISTINCT FROM OLD.plan OR NEW.students IS DISTINCT FROM OLD.students
     OR NEW.price_per_student IS DISTINCT FROM OLD.price_per_student OR NEW.list_price IS DISTINCT FROM OLD.list_price
     OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct OR NEW.term_months IS DISTINCT FROM OLD.term_months) THEN
    RAISE EXCEPTION 'A quote that has left draft cannot be repriced: make a new version';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: perm_holders("uuid", "text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."perm_holders"("p_school" "uuid", "p" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT count(DISTINCT g.user_id)::int
  FROM public.role_grants g
  JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = p
  JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
  WHERE g.school_id = p_school AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
$$;


--
-- Name: reconcile_student_subjects("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."reconcile_student_subjects"("p_student" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_school uuid; v_role text; v_cls text; v_class uuid;
BEGIN
  SELECT school_id, role, student_class INTO v_school, v_role, v_cls FROM public.users WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student' THEN
    DELETE FROM public.student_subjects WHERE student_id = p_student;
    RETURN;
  END IF;
  SELECT id INTO v_class FROM public.classes WHERE school_id = v_school AND app.norm_class(name) = app.norm_class(v_cls) ORDER BY created_at LIMIT 1;
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


--
-- Name: relabel_timetable_subject("uuid", "text", "text", "text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."relabel_timetable_subject"("p_school" "uuid", "p_class_key" "text", "p_from" "text", "p_to" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('app.subject_relabel', 'on', true);
  UPDATE public.timetable_slots SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = p_class_key AND lower(subject) = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.subject_relabel', 'off', true);
  RETURN n;
END $$;


--
-- Name: release_staff_threads(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."release_staff_threads"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.school_threads SET audience = 'office', staff_id = NULL WHERE staff_id = OLD.id;
  RETURN OLD;
END $$;


--
-- Name: school_today(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."school_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;


--
-- Name: sees_learning(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."sees_learning"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
      OR app.has_perm('academics.read') OR app.has_perm('workforce.read')
$$;


--
-- Name: settings_changes_immutable(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."settings_changes_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION 'settings_changes is append-only';
END $$;


--
-- Name: staff_jobs_sync(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."staff_jobs_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM app.sync_staff_job(coalesce(NEW.staff_member_id, OLD.staff_member_id));
  RETURN NULL;
END $$;


--
-- Name: staff_members_job(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."staff_members_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: strip_answer_key("jsonb"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."strip_answer_key"("qs" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE WHEN jsonb_typeof(qs) <> 'array' THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(q) = 'object' THEN q - 'answer' - 'correctAnswerIndex' - 'why' ELSE q END ORDER BY ord)
      FROM jsonb_array_elements(qs) WITH ORDINALITY AS t(q, ord)), '[]'::jsonb)
  END
$$;


--
-- Name: sync_class_subject_meta("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."sync_class_subject_meta"("p_class" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: sync_staff_job("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."sync_staff_job"("p_member" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: sync_teacher_assignments("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."sync_teacher_assignments"("p_teacher" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: teaches_class("text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."teaches_class"("p_class" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT app.norm_class(p_class) <> '' AND EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = auth.uid() AND t.role = 'teacher'
      AND (app.norm_class(t.teacher_class) = app.norm_class(p_class)
           OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
                 SELECT 1 FROM json_array_elements(t.assignments::json) e
                 WHERE app.norm_class(e->>'class') = app.norm_class(p_class))))
  )
$$;


--
-- Name: teaches_student("uuid"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."teaches_student"("p_student" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;


--
-- Name: user_has_perm("uuid", "text"); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."user_has_perm"("u" "uuid", "p" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: user_role(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT role FROM public.users WHERE id = auth.uid() $$;


--
-- Name: users_on_register(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION "app"."users_on_register"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: fee_day_closes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_day_closes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "status" "text" DEFAULT 'closed'::"text" NOT NULL,
    "totals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "receipts" integer DEFAULT 0 NOT NULL,
    "cash_expected" numeric(12,2) DEFAULT 0 NOT NULL,
    "cash_counted" numeric(12,2) DEFAULT 0 NOT NULL,
    "variance" numeric(12,2) GENERATED ALWAYS AS (("cash_counted" - "cash_expected")) STORED,
    "note" "text",
    "closed_by" "uuid",
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reopened_by" "uuid",
    "reopened_at" timestamp with time zone,
    "reopen_reason" "text",
    CONSTRAINT "fee_day_closes_check" CHECK ((("status" = 'closed'::"text") OR (("reopened_at" IS NOT NULL) AND ("reopen_reason" IS NOT NULL)))),
    CONSTRAINT "fee_day_closes_check1" CHECK ((("variance" = (0)::numeric) OR ("note" IS NOT NULL) OR ("status" = 'reopened'::"text"))),
    CONSTRAINT "fee_day_closes_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "fee_day_closes_status_check" CHECK (("status" = ANY (ARRAY['closed'::"text", 'reopened'::"text"])))
);


--
-- Name: admin_close_day("uuid", "date", numeric, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_close_day"("p_school" "uuid", "p_day" "date", "p_cash_counted" numeric, "p_note" "text", "p_actor" "uuid") RETURNS "public"."fee_day_closes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: fee_concession_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_concession_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    "self_approved" boolean DEFAULT false NOT NULL,
    CONSTRAINT "fee_concession_requests_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "fee_concession_requests_check" CHECK ((("status" <> 'rejected'::"text") OR ("decision_note" IS NOT NULL))),
    CONSTRAINT "fee_concession_requests_decision_note_check" CHECK ((("decision_note" IS NULL) OR ("char_length"("decision_note") <= 300))),
    CONSTRAINT "fee_concession_requests_reason_check" CHECK ((("char_length"("reason") >= 1) AND ("char_length"("reason") <= 300))),
    CONSTRAINT "fee_concession_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


--
-- Name: admin_decide_concession("uuid", "uuid", boolean, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_decide_concession"("p_school" "uuid", "p_request" "uuid", "p_approve" boolean, "p_note" "text", "p_actor" "uuid") RETURNS "public"."fee_concession_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: admin_invoice_student("uuid", "uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_invoice_student"("p_school" "uuid", "p_student" "uuid", "p_session" "text", "p_actor" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE fs record; e jsonb; n int := 0; v_no int;
BEGIN
  SELECT s.annual_fee, s.schedule INTO fs FROM public.users u
    JOIN public.fee_structures s ON s.school_id = u.school_id AND s.session = p_session AND s.grade = app.grade_of(u.student_class)
   WHERE u.id = p_student AND u.school_id = p_school AND u.role = 'student';
  IF NOT FOUND THEN RETURN 0; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(fs.schedule) LOOP
    v_no := (e ->> 'no')::int;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.fee_invoices i JOIN public.users x ON x.id = i.student_id
                              WHERE i.school_id = p_school AND i.session = p_session AND i.instalment_no = v_no AND i.voided_at IS NULL
                                AND app.grade_of(x.student_class) = (SELECT app.grade_of(student_class) FROM public.users WHERE id = p_student));
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_student AND session = p_session AND instalment_no = v_no);
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, p_student, p_session, v_no, coalesce(e ->> 'label', 'Instalment ' || v_no),
            app.next_doc_no(p_school, 'invoice', p_session), (e ->> 'due_on')::date, round(fs.annual_fee * (e ->> 'share')::numeric, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: admin_raise_invoices("uuid", "text", integer, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_raise_invoices"("p_school" "uuid", "p_session" "text", "p_instalment" integer, "p_actor" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r record; n int := 0; v_share numeric; v_label text; v_due date;
BEGIN
  FOR r IN
    SELECT u.id AS student_id, fs.annual_fee, fs.schedule
    FROM public.users u
    JOIN public.fee_structures fs
      ON fs.school_id = u.school_id AND fs.session = p_session AND fs.grade = app.grade_of(u.student_class)
    WHERE u.school_id = p_school AND u.role = 'student'
      AND NOT EXISTS (SELECT 1 FROM public.fee_invoices i
                      WHERE i.student_id = u.id AND i.session = p_session AND i.instalment_no = p_instalment)
    ORDER BY u.student_class, u.name
  LOOP
    SELECT (e ->> 'share')::numeric, e ->> 'label', (e ->> 'due_on')::date INTO v_share, v_label, v_due
    FROM jsonb_array_elements(r.schedule) e WHERE (e ->> 'no')::int = p_instalment;
    CONTINUE WHEN v_share IS NULL OR v_due IS NULL;
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, r.student_id, p_session, p_instalment, coalesce(v_label, 'Instalment ' || p_instalment),
            app.next_doc_no(p_school, 'invoice', p_session), v_due, round(r.annual_fee * v_share, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: fee_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "mode" "text" NOT NULL,
    "reference" "text",
    "paid_on" "date" NOT NULL,
    "receipt_no" "text" NOT NULL,
    "recorded_by" "uuid",
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voided_at" timestamp with time zone,
    "void_reason" "text",
    "voided_by" "uuid",
    CONSTRAINT "fee_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "fee_payments_check" CHECK ((("voided_at" IS NULL) OR ("void_reason" IS NOT NULL))),
    CONSTRAINT "fee_payments_mode_check" CHECK (("mode" = ANY (ARRAY['upi'::"text", 'bank_transfer'::"text", 'card'::"text", 'cheque'::"text", 'cash'::"text", 'dd'::"text"]))),
    CONSTRAINT "fee_payments_reference_check" CHECK ((("reference" IS NULL) OR ("char_length"("reference") <= 120)))
);


--
-- Name: admin_record_payment("uuid", "uuid", numeric, "text", "text", "date", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_record_payment"("p_school" "uuid", "p_invoice" "uuid", "p_amount" numeric, "p_mode" "text", "p_reference" "text", "p_paid_on" "date", "p_actor" "uuid") RETURNS "public"."fee_payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: admin_teacher_work("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_teacher_work"("p_school" "uuid", "p_from" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "p_to" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("teacher_id" "uuid", "pending" bigint, "oldest_pending" timestamp with time zone, "graded30" bigint, "last_graded" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH ok AS (
    SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        OR app.is_superadmin()
        OR (p_school = app.current_school_id() AND (app.has_perm('dashboard.view') OR app.has_perm('workforce.read'))) AS allowed
  )
  SELECT a.teacher_id,
         count(*) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         min(s.submitted_at) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         count(*) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to),
         max(s.updated_at) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to)
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE a.school_id = p_school AND (SELECT allowed FROM ok)
  GROUP BY a.teacher_id
$$;


--
-- Name: exam_attendance("uuid", "date", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."exam_attendance"("p_school" "uuid", "p_from" "date", "p_to" "date") RETURNS TABLE("student_id" "uuid", "class_name" "text", "present" bigint, "late" bigint, "absent" bigint, "excused" bigint, "class_days" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH a AS (
    SELECT student_id, class_name, day, status FROM public.attendance
    WHERE school_id = p_school AND day BETWEEN p_from AND p_to
  ), days AS (
    SELECT regexp_replace(lower(class_name), 'class|[^a-z0-9]', '', 'g') AS k, count(DISTINCT day) AS n FROM a GROUP BY 1
  )
  SELECT a.student_id, max(a.class_name),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused'),
         max(d.n)
  FROM a JOIN days d ON d.k = regexp_replace(lower(a.class_name), 'class|[^a-z0-9]', '', 'g')
  GROUP BY a.student_id
$$;


--
-- Name: exam_fee_dues("uuid", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."exam_fee_dues"("p_school" "uuid", "p_today" "date") RETURNS TABLE("student_id" "uuid", "overdue" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT i.student_id, sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0))
  FROM public.fee_invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM public.fee_payments WHERE school_id = p_school AND voided_at IS NULL GROUP BY invoice_id) p ON p.invoice_id = i.id
  WHERE i.school_id = p_school AND i.voided_at IS NULL AND i.due_on <= p_today
  GROUP BY i.student_id
  HAVING sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0)) > 0
$$;


--
-- Name: hr_daily(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."hr_daily"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE s record; a record; today date := app.school_today(); synced int := 0; sent int := 0; holders uuid[];
BEGIN
  FOR s IN SELECT sc.id, coalesce(h.alert_days, 30) AS alert_days FROM public.schools sc LEFT JOIN public.hr_settings h ON h.school_id = sc.id
           WHERE EXISTS (SELECT 1 FROM public.staff_members m WHERE m.school_id = sc.id) LOOP
    synced := synced + public.hr_sync_jobs(s.id);

    SELECT coalesce(array_agg(DISTINCT g.user_id), '{}') INTO holders
    FROM public.role_grants g
    JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = 'hr.manage'
    JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.school_id = s.id AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= today);
    CONTINUE WHEN cardinality(holders) = 0;

    FOR a IN
      SELECT m.id, m.name || '''s probation ends' AS what, m.probation_until AS due, 'Confirm them or extend the probation.' AS body
      FROM public.staff_members m
      WHERE m.school_id = s.id AND m.active AND m.employment = 'permanent' AND m.probation_until IS NOT NULL AND m.confirmed_on IS NULL
      UNION ALL
      SELECT m.id, m.name || '''s contract ends', m.contract_to, 'Renew it or record the end of contract.'
      FROM public.staff_members m
      WHERE m.school_id = s.id AND m.active AND m.employment <> 'permanent' AND m.contract_to IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.staff_exits x WHERE x.staff_member_id = m.id AND x.status = 'notice')
      UNION ALL
      SELECT m.id, m.name || '''s last working day is', x.last_day, 'Finish the exit checklist and close the exit on the day.'
      FROM public.staff_exits x JOIN public.staff_members m ON m.id = x.staff_member_id
      WHERE x.school_id = s.id AND x.status = 'notice'
      UNION ALL
      SELECT m.id, m.name || '''s ' || lower(d.title) || ' expires', d.expires_on, 'Get the renewed document and add it to their record.'
      FROM public.staff_documents d JOIN public.staff_members m ON m.id = d.staff_member_id
      WHERE d.school_id = s.id AND m.active AND d.expires_on IS NOT NULL
    LOOP
      CONTINUE WHEN a.due - today NOT IN (0, 7, s.alert_days);
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
      SELECT s.id, h, 'hr',
             a.what || CASE a.due - today WHEN 0 THEN ' today' WHEN 1 THEN ' tomorrow' ELSE ' in ' || (a.due - today) || ' days' END,
             a.body || ' Open People > Needs attention.',
             jsonb_build_object('staffMemberId', a.id, 'due', a.due)
      FROM unnest(holders) AS h;
      sent := sent + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('synced', synced, 'alerts', sent);
END $$;


--
-- Name: hr_link_login("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."hr_link_login"("p_school" "uuid", "p_member" "uuid", "p_user" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE m public.staff_members; u record; bare uuid; t text;
BEGIN
  SELECT * INTO m FROM public.staff_members WHERE id = p_member AND school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hr_link: no such employee' USING ERRCODE = 'P0001'; END IF;
  IF m.user_id IS NOT NULL THEN RAISE EXCEPTION 'hr_link: already has a login' USING ERRCODE = 'P0001'; END IF;
  SELECT id, name, role INTO u FROM public.users WHERE id = p_user AND school_id = p_school AND role IN ('teacher', 'admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'hr_link: no such login' USING ERRCODE = 'P0001'; END IF;

  -- The login's own register row was made automatically. It can go only if nothing was ever recorded on it.
  SELECT id INTO bare FROM public.staff_members WHERE school_id = p_school AND user_id = p_user;
  IF bare IS NOT NULL THEN
    IF (SELECT count(*) FROM public.staff_jobs WHERE staff_member_id = bare) > 1
       OR EXISTS (SELECT 1 FROM public.staff_profiles WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_statutory WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_documents WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_qualifications WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_exits WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_events WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_members WHERE manager_id = bare)
       OR EXISTS (SELECT 1 FROM public.hr_departments WHERE head_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_members WHERE id = bare AND (employee_code IS NOT NULL OR department_id IS NOT NULL OR grade_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'hr_link: the login already has its own record' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.staff_members WHERE id = bare;
  END IF;

  -- Everything recorded against the register row now belongs to the login. A table that names a person holds
  -- either user_id or staff_member_id, never both, so each row flips from one to the other.
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'staff_member_id' AND c.table_name <> 'staff_members'
      AND EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name AND c2.column_name = 'user_id')
  LOOP
    EXECUTE format('UPDATE public.%I SET user_id = $1, staff_member_id = NULL WHERE staff_member_id = $2', t) USING p_user, p_member;
  END LOOP;
  UPDATE public.leave_requests SET staff_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  UPDATE public.cover_assignments SET absent_user_id = p_user, absent_staff_member_id = NULL WHERE absent_staff_member_id = p_member;
  UPDATE public.cover_assignments SET sub_user_id = p_user, sub_staff_member_id = NULL WHERE sub_staff_member_id = p_member;
  UPDATE public.sched_requirements SET teacher_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  PERFORM set_config('app.person_relink', 'on', true);
  UPDATE public.timetable_slots SET teacher_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  PERFORM set_config('app.person_relink', 'off', true);

  -- People with a login link WhatsApp themselves; the register consent was for the roster-only number.
  UPDATE public.staff_members
  SET user_id = p_user, name = left(coalesce(nullif(trim(u.name), ''), m.name), 120), whatsapp_opt_in = false, updated_at = now()
  WHERE id = p_member;
END $_$;


--
-- Name: hr_next_employee_code("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."hr_next_employee_code"("p_school" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: hr_reassign_reports("uuid", "uuid", "uuid", "date", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."hr_reassign_reports"("p_school" "uuid", "p_from" "uuid", "p_to" "uuid", "p_on" "date", "p_reason" "text", "p_by" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r public.staff_members; n int := 0; d date := least(p_on, app.school_today());
BEGIN
  IF p_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE id = p_to AND school_id = p_school AND active) THEN
    RAISE EXCEPTION 'hr_reassign: the new manager is not on the register' USING ERRCODE = 'P0001';
  END IF;
  FOR r IN SELECT * FROM public.staff_members WHERE school_id = p_school AND manager_id = p_from AND active AND id IS DISTINCT FROM p_to LOOP
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id, grade_id,
      manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (p_school, r.id, d, 'transfer', r.designation, r.category, r.department_id, r.grade_id, p_to, r.employment, r.contract_from, r.contract_to, p_reason, p_by)
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET manager_id = EXCLUDED.manager_id, reason = EXCLUDED.reason,
          action = CASE WHEN staff_jobs.action IN ('hire', 'rehire') THEN staff_jobs.action ELSE 'transfer' END;
    n := n + 1;
  END LOOP;
  -- If the new manager reported to the person who has gone, they move up to that person's own manager.
  SELECT * INTO r FROM public.staff_members WHERE id = p_to AND manager_id = p_from;
  IF FOUND THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id, grade_id,
      manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (p_school, r.id, d, 'transfer', r.designation, r.category, r.department_id, r.grade_id,
      (SELECT nullif(manager_id, p_to) FROM public.staff_members WHERE id = p_from), r.employment, r.contract_from, r.contract_to, p_reason, p_by)
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET manager_id = EXCLUDED.manager_id, reason = EXCLUDED.reason,
          action = CASE WHEN staff_jobs.action IN ('hire', 'rehire') THEN staff_jobs.action ELSE 'transfer' END;
  END IF;
  RETURN n;
END $$;


--
-- Name: hr_sync_jobs("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."hr_sync_jobs"("p_school" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.staff_members WHERE school_id = p_school LOOP
    IF app.sync_staff_job(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END $$;


--
-- Name: log_app_error("text", "text", "text", "text", "text", "text", "text", "text", "uuid", "uuid", "text", "text", "text", "text", "text", integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."log_app_error"("p_fingerprint" "text", "p_source" "text", "p_kind" "text", "p_message" "text", "p_stack" "text", "p_route" "text", "p_method" "text", "p_path" "text", "p_school" "uuid", "p_user" "uuid", "p_user_role" "text", "p_release" "text", "p_environment" "text", "p_user_agent" "text", "p_digest" "text", "p_repeats" integer, "p_context" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  msg text := left(coalesce(nullif(p_message, ''), 'Unknown error'), 2000);
  n integer := greatest(1, least(coalesce(p_repeats, 1), 100000));
BEGIN
  INSERT INTO public.app_error_groups AS g (fingerprint, source, kind, message, route, events, first_seen, last_seen, last_release, last_environment)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_route, 300), n, now(), now(), p_release, p_environment)
  ON CONFLICT (fingerprint) DO UPDATE SET
    events = g.events + n,
    last_seen = now(),
    last_release = coalesce(excluded.last_release, g.last_release),
    last_environment = coalesce(excluded.last_environment, g.last_environment),
    regressed_at = CASE WHEN g.status = 'resolved' THEN now() ELSE g.regressed_at END,
    status = CASE WHEN g.status = 'resolved' THEN 'open' ELSE g.status END;
  INSERT INTO public.app_errors (fingerprint, source, kind, message, stack, route, method, path, school_id, user_id, user_role,
                                 release, environment, user_agent, digest, repeats, context)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_stack, 8000), left(p_route, 300), left(p_method, 10), left(p_path, 500),
          (SELECT id FROM public.schools WHERE id = p_school), (SELECT id FROM public.users WHERE id = p_user), left(p_user_role, 40),
          left(p_release, 80), left(p_environment, 40), left(p_user_agent, 400), left(p_digest, 120), n, coalesce(p_context, '{}'::jsonb));
  IF random() < 0.02 THEN
    DELETE FROM public.app_errors WHERE at < now() - interval '30 days';
  END IF;
END $$;


--
-- Name: ops_ai_usage(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_ai_usage"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH u AS (
    SELECT *, input_tokens + output_tokens + thinking_tokens AS tokens
    FROM public.ai_usage WHERE at >= p_from AND at < p_to
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
        'input', coalesce(sum(input_tokens), 0), 'output', coalesce(sum(output_tokens), 0),
        'thinking', coalesce(sum(thinking_tokens), 0), 'cached', coalesce(sum(cached_tokens), 0),
        'tokens', coalesce(sum(tokens), 0), 'cost', coalesce(sum(cost_usd), 0),
        'unpriced', count(*) FILTER (WHERE cost_usd IS NULL AND ok),
        'avgLatency', round(avg(latency_ms) FILTER (WHERE ok)),
        'users', count(DISTINCT user_id), 'schools', count(DISTINCT school_id)) FROM u),
    'daily', coalesce((SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object('day', (at AT TIME ZONE 'Asia/Kolkata')::date, 'calls', count(*),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0)) d
        FROM u GROUP BY (at AT TIME ZONE 'Asia/Kolkata')::date) x), '[]'::jsonb),
    'features', coalesce((SELECT jsonb_agg(f ORDER BY (f->>'cost')::numeric DESC, (f->>'tokens')::bigint DESC) FROM (
        SELECT jsonb_build_object('key', feature, 'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
          'input', sum(input_tokens), 'output', sum(output_tokens) + sum(thinking_tokens),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0), 'avgLatency', round(avg(latency_ms) FILTER (WHERE ok))) f
        FROM u GROUP BY feature) x), '[]'::jsonb),
    'schools', coalesce((SELECT jsonb_agg(s ORDER BY (s->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.school_id, 'name', coalesce(sc.name, CASE WHEN u.school_id IS NULL THEN 'No school (operators)' ELSE 'Deleted school' END),
          'calls', count(*), 'users', count(DISTINCT u.user_id), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) s
        FROM u LEFT JOIN public.schools sc ON sc.id = u.school_id GROUP BY u.school_id, sc.name) x), '[]'::jsonb),
    'models', coalesce((SELECT jsonb_agg(m ORDER BY (m->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('model', model, 'calls', count(*), 'input', sum(input_tokens), 'cached', sum(cached_tokens),
          'output', sum(output_tokens), 'thinking', sum(thinking_tokens), 'cost', coalesce(sum(cost_usd), 0)) m
        FROM u GROUP BY model) x), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(p ORDER BY (p->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.user_id, 'name', coalesce(us.name, us.email, 'Deleted user'), 'role', us.role,
          'school', sc.name, 'calls', count(*), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) p
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        WHERE u.user_id IS NOT NULL GROUP BY u.user_id, us.name, us.email, us.role, sc.name
        ORDER BY coalesce(sum(u.cost_usd), 0) DESC LIMIT 25) x), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(r ORDER BY r->>'at' DESC) FROM (
        SELECT jsonb_build_object('id', u.id, 'at', u.at, 'feature', u.feature, 'model', u.model, 'school', sc.name,
          'user', coalesce(us.name, us.email), 'input', u.input_tokens, 'output', u.output_tokens + u.thinking_tokens,
          'cost', u.cost_usd, 'ok', u.ok, 'latency', u.latency_ms, 'error', u.error) r
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        ORDER BY u.at DESC LIMIT 50) x), '[]'::jsonb)
  );
$$;


--
-- Name: ops_delete_account("uuid", "uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_delete_account"("p_school" "uuid", "p_user" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user AND school_id = p_school FOR UPDATE;
  IF NOT FOUND OR v_user.role = 'superadmin' THEN
    RAISE EXCEPTION 'Account not found in this school' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_user)
     OR EXISTS (SELECT 1 FROM public.fee_payments WHERE student_id = p_user) THEN
    RAISE EXCEPTION 'This student has fee records, which are kept as financial records, so the account can''t be deleted.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id = p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date))
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id <> p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)) THEN
    RAISE EXCEPTION 'This is the school''s only school admin. Give another admin that role first.'
      USING ERRCODE = 'P0001', HINT = 'last_admin';
  END IF;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'school', p_school, 'account.deleted',
    jsonb_build_object('id', v_user.id, 'name', v_user.name, 'email', v_user.email, 'role', v_user.role),
    NULL, p_reason);
  DELETE FROM public.users WHERE id = p_user;
END $$;


--
-- Name: ops_delete_school("uuid", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_delete_school"("p_school" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") RETURNS "uuid"[]
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_school public.schools%ROWTYPE;
  v_users uuid[];
BEGIN
  SELECT * INTO v_school FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fee_payments WHERE school_id = p_school)
     OR EXISTS (SELECT 1 FROM public.fee_invoices WHERE school_id = p_school) THEN
    RAISE EXCEPTION 'This school has fee records, which are kept as financial records. Suspend it instead of deleting it.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO v_users FROM public.users WHERE school_id = p_school AND role <> 'superadmin';

  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', NULL, 'school.deleted',
    jsonb_build_object('id', v_school.id, 'name', v_school.name, 'code', v_school.settings->>'code',
      'plan', v_school.settings->>'plan', 'accounts', cardinality(v_users), 'created_at', v_school.created_at),
    NULL, p_reason);

  DELETE FROM public.users WHERE id = ANY (v_users);
  DELETE FROM public.schools WHERE id = p_school;
  RETURN v_users;
END $$;


--
-- Name: ops_error_stats("text"[], timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_error_stats"("p_fingerprints" "text"[], "p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH e AS (
    SELECT fingerprint, at, repeats, school_id, user_id
    FROM public.app_errors
    WHERE fingerprint = ANY (p_fingerprints) AND at >= least(p_since, now() - interval '24 hours')
  )
  SELECT jsonb_build_object(
    'groups', coalesce((
      SELECT jsonb_object_agg(fp, jsonb_build_object(
        'inRange', (SELECT coalesce(sum(repeats), 0) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'users',   (SELECT count(DISTINCT user_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'hours',   (SELECT jsonb_agg(coalesce(b.n, 0) ORDER BY h)
                    FROM generate_series(0, 23) AS h
                    LEFT JOIN (SELECT 23 - floor(extract(epoch FROM now() - e.at) / 3600)::int AS slot, sum(e.repeats) AS n
                               FROM e WHERE e.fingerprint = fp GROUP BY 1) b ON b.slot = h)))
      FROM unnest(p_fingerprints) AS fp), '{}'::jsonb),
    'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.at >= p_since)
  );
$$;


--
-- Name: ops_inspect_find("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_inspect_find"("p_school" "uuid", "p_id" "uuid") RETURNS "text"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
END $_$;


--
-- Name: ops_inspect_list("uuid", "text", "text", "uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_inspect_list"("p_school" "uuid", "p_table" "text", "p_column" "text" DEFAULT NULL::"text", "p_value" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
END $_$;


--
-- Name: ops_inspect_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_inspect_meta"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table', t,
    'columns', (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
                  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t),
    'refs', (SELECT coalesce(jsonb_agg(jsonb_build_object('column', l.col, 'table', l.parent)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.child = t),
    'children', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', l.child, 'column', l.col)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.parent = t)
  ) ORDER BY t), '[]'::jsonb)
  FROM unnest(app.ops_inspectable()) t WHERE to_regclass('public.' || quote_ident(t)) IS NOT NULL
$$;


--
-- Name: ops_inspect_row("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_inspect_row"("p_school" "uuid", "p_table" "text", "p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
END $_$;


--
-- Name: ops_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_jobs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE out jsonb;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.jobid, 'name', j.jobname, 'schedule', j.schedule, 'active', j.active, 'command', left(j.command, 200),
      'runs', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.started DESC), '[]'::jsonb) FROM (
                 SELECT d.status, d.start_time AS started, d.end_time AS ended, left(d.return_message, 300) AS message
                   FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 20) r)
    ) ORDER BY j.jobname), '[]'::jsonb) FROM cron.job j
  $q$ INTO out;
  RETURN out;
END $_$;


--
-- Name: ops_login_check("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_login_check"("p_school" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'role', u.role,
    'hasLogin', a.id IS NOT NULL,
    'confirmed', a.email_confirmed_at IS NOT NULL,
    'bannedUntil', CASE WHEN a.banned_until > now() THEN a.banned_until END,
    'lastSignIn', a.last_sign_in_at,
    'createdAt', coalesce(a.created_at, u.created_at),
    'left', coalesce((u.metadata ->> 'left')::boolean, false),
    'tempPassword', coalesce((u.metadata ->> 'mustChangePassword')::boolean, false),
    'emailMatches', lower(coalesce(a.email, '')) = lower(coalesce(u.email, '')),
    'hasPassword', coalesce(a.encrypted_password, '') <> '',
    'twoFactor', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified')
  )
  FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.school_id = p_school AND lower(u.email) = lower(trim(p_email))
  LIMIT 1
$$;


--
-- Name: ops_migrations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_migrations"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE out jsonb;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version DESC), '[]'::jsonb)
      FROM (SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 25) m
  $q$ INTO out;
  RETURN out;
END $_$;


--
-- Name: ops_norm_class("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_norm_class"("c" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_temp'
    AS $$ SELECT regexp_replace(lower(coalesce(c, '')), 'class|[^a-z0-9]', '', 'g') $$;


--
-- Name: ops_platform_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_platform_health"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'server_version', current_setting('server_version'),
    'rls_off', coalesce((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), '[]'::jsonb),
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'anon_writable', coalesce((
      SELECT jsonb_agg(DISTINCT table_name ORDER BY table_name)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')), '[]'::jsonb),
    'migrations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version)
      FROM supabase_migrations.schema_migrations), '[]'::jsonb),
    'operators', (SELECT count(DISTINCT id) FROM (
        SELECT id FROM public.users WHERE role = 'superadmin'
        UNION SELECT user_id FROM public.superadmins) o),
    'audit_7d', (SELECT count(*) FROM public.audit_log WHERE at > now() - interval '7 days'),
    'audit_last', (SELECT max(at) FROM public.audit_log),
    'db_bytes', pg_database_size(current_database())
  );
$$;


--
-- Name: ops_registry_counts("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_registry_counts"("p_school" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("school_id" "uuid", "counts" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH s AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  people AS (
    SELECT u.school_id, u.role, count(*) AS n, max(a.last_sign_in_at) AS last_sign_in
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id IN (SELECT id FROM s) GROUP BY u.school_id, u.role
  ),
  roles AS (SELECT school_id, jsonb_object_agg(role, n) AS roles, sum(n)::int AS people, max(last_sign_in) AS last_sign_in FROM people GROUP BY school_id),
  cls AS (
    SELECT c.school_id, count(*)::int AS classes,
           count(*) FILTER (WHERE jsonb_typeof(c.metadata -> 'subjects') IS DISTINCT FROM 'array' OR jsonb_array_length(c.metadata -> 'subjects') = 0)::int AS empty
      FROM public.classes c WHERE c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  cases AS (
    SELECT c.school_id, count(*)::int AS open,
           count(*) FILTER (WHERE (c.first_responded_at IS NULL AND now() > c.first_response_due) OR now() > c.resolve_due)::int AS late,
           count(*) FILTER (WHERE c.owner_id IS NULL)::int AS unassigned
      FROM public.ops_cases c WHERE c.status NOT IN ('resolved', 'closed') AND c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  tasks AS (
    SELECT t.school_id, count(*)::int AS open, count(*) FILTER (WHERE t.due_on < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
      FROM public.ops_tasks t WHERE t.status = 'open' AND t.school_id IN (SELECT id FROM s) GROUP BY t.school_id
  ),
  acts AS (SELECT a.school_id, max(a.happened_at) AS last FROM public.ops_activities a WHERE a.school_id IN (SELECT id FROM s) GROUP BY a.school_id),
  prim AS (SELECT DISTINCT ON (c.school_id) c.school_id, c.name, c.phone, c.email FROM public.ops_contacts c
            WHERE c.active AND c.school_id IN (SELECT id FROM s) ORDER BY c.school_id, c.is_primary DESC, c.decides DESC, c.created_at)
  SELECT s.id, jsonb_build_object(
    'roles', coalesce(r.roles, '{}'::jsonb), 'people', coalesce(r.people, 0), 'lastSignIn', r.last_sign_in,
    'classes', coalesce(cls.classes, 0), 'classesWithoutSubjects', coalesce(cls.empty, 0),
    'openCases', coalesce(cases.open, 0), 'lateCases', coalesce(cases.late, 0), 'unassignedCases', coalesce(cases.unassigned, 0),
    'openTasks', coalesce(tasks.open, 0), 'overdueTasks', coalesce(tasks.overdue, 0),
    'lastActivity', acts.last,
    'contact', CASE WHEN prim.name IS NULL THEN NULL ELSE jsonb_build_object('name', prim.name, 'phone', prim.phone, 'email', prim.email) END
  )
  FROM s
  LEFT JOIN roles r ON r.school_id = s.id
  LEFT JOIN cls ON cls.school_id = s.id
  LEFT JOIN cases ON cases.school_id = s.id
  LEFT JOIN tasks ON tasks.school_id = s.id
  LEFT JOIN acts ON acts.school_id = s.id
  LEFT JOIN prim ON prim.school_id = s.id
$$;


--
-- Name: ops_rename_class_subject("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_rename_class_subject"("p_school" "uuid", "p_class" "text", "p_from" "text", "p_to" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  UPDATE public.lesson_plans SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('lesson_plans', n);
  UPDATE public.assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('assignments', n);
  UPDATE public.materials SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('materials', n);
  n := app.relabel_timetable_subject(p_school, k, f, p_to);
  out := out || jsonb_build_object('timetable_slots', n);
  UPDATE public.cover_assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('cover_assignments', n);
  UPDATE public.visit_sessions SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('visit_sessions', n);
  UPDATE public.situations SET subject = p_to WHERE school_id = p_school AND app.norm_class(class_name) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('situations', n);
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


--
-- Name: ops_request_stats(timestamp with time zone, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_request_stats"("p_since" timestamp with time zone, "p_school" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM (
    SELECT method, route, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms))::int AS p50,
           round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95,
           max(duration_ms) AS max, count(DISTINCT user_id) AS users
      FROM public.request_log
     WHERE at >= p_since AND (p_school IS NULL OR school_id = p_school)
     GROUP BY method, route
     ORDER BY count(*) DESC
     LIMIT 200
  ) x
$$;


--
-- Name: ops_resync_teacher("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_resync_teacher"("p_teacher" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ SELECT app.sync_teacher_assignments(p_teacher) $$;


--
-- Name: ops_school_ai("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_school_ai"("p_school" "uuid", "p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
    'tokens', coalesce(sum(input_tokens + output_tokens + thinking_tokens), 0),
    'costUsd', coalesce(sum(cost_usd), 0))
  FROM public.ai_usage WHERE school_id = p_school AND at >= p_since
$$;


--
-- Name: ops_school_diagnostics("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_school_diagnostics"("p_school" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH people AS (
    SELECT u.id, u.role, u.name, u.email, u.student_class, u.teacher_class, u.custom_student_id, u.assignments, u.metadata,
           a.last_sign_in_at, a.banned_until, a.email_confirmed_at, (a.id IS NULL) AS no_login
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id = p_school
  ),
  flagged AS (
    SELECT p.*, coalesce((p.metadata ->> 'left')::boolean, false) AS has_left,
           (p.banned_until IS NOT NULL AND p.banned_until > now()) AS banned
      FROM people p
  ),
  logins AS (
    SELECT role,
           count(*) AS total,
           count(*) FILTER (WHERE has_left) AS left_school,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at IS NULL) AS never,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '7 days') AS week,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '30 days') AS month,
           count(*) FILTER (WHERE NOT has_left AND banned) AS banned,
           count(*) FILTER (WHERE NOT has_left AND coalesce((metadata ->> 'mustChangePassword')::boolean, false)) AS temp_password,
           count(*) FILTER (WHERE no_login) AS no_login
      FROM flagged GROUP BY role
  ),
  stuck AS (
    SELECT id, role, name, email,
           CASE WHEN no_login THEN 'no_login' WHEN banned THEN 'banned' ELSE 'never' END AS state
      FROM flagged
     WHERE role IN ('admin', 'teacher') AND NOT has_left AND (no_login OR banned OR last_sign_in_at IS NULL)
     ORDER BY role, name LIMIT 50
  ),
  active AS (SELECT * FROM flagged WHERE NOT has_left),
  class_names AS (SELECT public.ops_norm_class(name) AS n FROM public.classes WHERE school_id = p_school),
  checks AS (
    SELECT 'students_no_class' AS key, 'users' AS tbl, array_agg(id) AS ids FROM active WHERE role = 'student' AND coalesce(student_class, '') = ''
    UNION ALL
    SELECT 'students_unknown_class', 'users', array_agg(id) FROM active
     WHERE role = 'student' AND coalesce(student_class, '') <> '' AND public.ops_norm_class(student_class) NOT IN (SELECT n FROM class_names)
    UNION ALL
    SELECT 'teachers_teach_nothing', 'users', array_agg(id) FROM active
     WHERE role = 'teacher' AND coalesce(teacher_class, '') = '' AND (assignments IS NULL OR jsonb_typeof(to_jsonb(assignments)) <> 'array' OR jsonb_array_length(to_jsonb(assignments)) = 0)
    UNION ALL
    SELECT 'parents_no_child', 'users', array_agg(p.id) FROM active p
     WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.parent_id = p.id)
    UNION ALL
    SELECT 'students_no_verified_parent', 'users', array_agg(s.id) FROM active s
     WHERE s.role = 'student' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = s.id AND g.verified)
    UNION ALL
    SELECT 'duplicate_roll_numbers', 'users', array_agg(id) FROM active a
     WHERE a.role = 'student' AND coalesce(a.custom_student_id, '') <> ''
       AND (SELECT count(*) FROM active b WHERE b.role = 'student' AND lower(trim(b.custom_student_id)) = lower(trim(a.custom_student_id))) > 1
    UNION ALL
    SELECT 'family_links_across_schools', 'users', array_agg(DISTINCT s.id) FROM people s
      JOIN public.guardians g ON g.student_id = s.id JOIN public.users par ON par.id = g.parent_id
     WHERE par.school_id IS DISTINCT FROM p_school
    UNION ALL
    SELECT 'classes_no_students', 'classes', array_agg(c.id) FROM public.classes c
     WHERE c.school_id = p_school AND NOT EXISTS (SELECT 1 FROM active s WHERE s.role = 'student' AND public.ops_norm_class(s.student_class) = public.ops_norm_class(c.name))
    UNION ALL
    SELECT 'accounts_no_login', 'users', array_agg(id) FROM flagged WHERE no_login
  )
  SELECT jsonb_build_object(
    'logins', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.role), '[]'::jsonb) FROM logins l),
    'stuck', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM stuck s),
    'checks', (SELECT jsonb_agg(jsonb_build_object('key', key, 'table', tbl, 'count', coalesce(array_length(ids, 1), 0), 'sample', to_jsonb(coalesce(ids[1:5], '{}'::uuid[])))) FROM checks)
  )
$$;


--
-- Name: ops_school_metrics("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_school_metrics"("p_school" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("school_id" "uuid", "metrics" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
WITH sch AS (
  SELECT s.id FROM public.schools s WHERE p_school IS NULL OR s.id = p_school
),
ppl AS (
  SELECT u.id, u.school_id, u.role, u.student_class, u.custom_student_id, u.assignments, u.metadata,
         a.last_sign_in_at, a.created_at AS auth_created
  FROM public.users u
  JOIN sch ON sch.id = u.school_id
  LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.role IN ('student', 'teacher', 'parent', 'admin')
    AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
),
acts AS (
  SELECT student_id AS uid, submitted_at AS at FROM public.submissions WHERE submitted_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.tutor_sessions WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.student_chats WHERE role = 'user' AND created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.wellness_logs WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.assignments WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, updated_at FROM public.lesson_plans WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.materials WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT marked_by, marked_at FROM public.attendance WHERE marked_at > now() - interval '56 days'
  UNION ALL SELECT updated_by, updated_at FROM public.syllabus_progress WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT acknowledged_by, acknowledged_at FROM public.situations WHERE acknowledged_at > now() - interval '56 days'
  UNION ALL SELECT logged_by, created_at FROM public.incidents WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT sender_id, created_at FROM public.school_messages WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT recorded_by, recorded_at FROM public.fee_payments WHERE recorded_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.admission_events WHERE at > now() - interval '56 days'
  UNION ALL SELECT granted_by, updated_at FROM public.consents WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.audit_log WHERE at > now() - interval '56 days'
  UNION ALL SELECT user_id, at FROM public.ai_usage WHERE at > now() - interval '56 days'
),
act AS (
  SELECT p.id, p.school_id, p.role, date_trunc('week', a.at) AS wk, max(a.at) AS last_at
  FROM acts a JOIN ppl p ON p.id = a.uid
  GROUP BY 1, 2, 3, 4
),
last_act AS (SELECT id, max(last_at) AS at FROM act GROUP BY id),
roles AS (
  SELECT p.school_id, p.role, jsonb_build_object(
    'total',     count(*),
    'signedIn7',  count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '7 days'),
    'signedIn30', count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '30 days'),
    'active7',    count(*) FILTER (WHERE l.at > now() - interval '7 days'),
    'active30',   count(*) FILTER (WHERE l.at > now() - interval '30 days'),
    'never',      count(*) FILTER (WHERE p.last_sign_in_at IS NULL)
  ) AS m
  FROM ppl p LEFT JOIN last_act l ON l.id = p.id
  GROUP BY 1, 2
),
weekly AS (
  SELECT school_id, jsonb_agg(jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'), 'role', role, 'active', n) ORDER BY wk, role) AS m
  FROM (SELECT school_id, role, wk, count(DISTINCT id) AS n FROM act GROUP BY 1, 2, 3) w
  GROUP BY 1
),
cls AS (
  SELECT c.school_id, jsonb_agg(jsonb_build_object('name', c.name, 'students', coalesce(x.students, 0), 'active7', coalesce(x.active7, 0)) ORDER BY c.name) AS m
  FROM public.classes c
  JOIN sch ON sch.id = c.school_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS students, count(*) FILTER (WHERE l.at > now() - interval '7 days') AS active7
    FROM ppl p LEFT JOIN last_act l ON l.id = p.id
    WHERE p.school_id = c.school_id AND p.role = 'student'
      AND public.ops_norm_class(p.student_class) = public.ops_norm_class(c.name)
  ) x ON true
  GROUP BY 1
),
verified AS (
  SELECT g.student_id, g.parent_id FROM public.guardians g
  JOIN ppl s ON s.id = g.student_id AND s.role = 'student'
  JOIN ppl pa ON pa.id = g.parent_id AND pa.role = 'parent'
  WHERE g.verified
),
dq AS (
  SELECT p.school_id, jsonb_build_object(
    'studentsNoParent', count(*) FILTER (WHERE p.role = 'student' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.student_id = p.id)),
    'studentsNoClass',  count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.student_class), '') = ''),
    'studentsNoRoll',   count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.custom_student_id), '') = ''),
    'parentsNoChild',   count(*) FILTER (WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.parent_id = p.id)),
    'teachersNoAssignments', count(*) FILTER (WHERE p.role = 'teacher' AND jsonb_array_length(CASE WHEN jsonb_typeof(p.assignments) = 'array' THEN p.assignments ELSE '[]'::jsonb END) = 0),
    'staleTempPasswords', count(*) FILTER (WHERE (p.metadata ->> 'mustChangePassword')::boolean IS TRUE AND p.auth_created < now() - interval '14 days')
  ) AS m
  FROM ppl p GROUP BY 1
),
fees AS (
  SELECT i.school_id,
         sum(i.amount - coalesce(i.concession, 0)) AS due,
         count(*) AS invoices,
         coalesce(sum((SELECT sum(fp.amount) FROM public.fee_payments fp WHERE fp.invoice_id = i.id AND fp.voided_at IS NULL)), 0) AS paid
  FROM public.fee_invoices i JOIN sch ON sch.id = i.school_id
  WHERE i.voided_at IS NULL AND i.due_on <= current_date
  GROUP BY 1
),
ops AS (
  SELECT sch.id AS school_id, jsonb_build_object(
    'classCount',        (SELECT count(*) FROM public.classes c WHERE c.school_id = sch.id),
    'attendanceDays14',  (SELECT count(DISTINCT a.day) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 14),
    'classesMarked7',    (SELECT count(DISTINCT public.ops_norm_class(a.class_name)) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 7),
    'feeStructures',     (SELECT count(*) FROM public.fee_structures f WHERE f.school_id = sch.id),
    'feeDue',            coalesce((SELECT due FROM fees WHERE fees.school_id = sch.id), 0),
    'feeCollected',      coalesce((SELECT paid FROM fees WHERE fees.school_id = sch.id), 0),
    'invoicesDue',       coalesce((SELECT invoices FROM fees WHERE fees.school_id = sch.id), 0),
    'assignments30',     (SELECT count(*) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'teachersSettingWork30', (SELECT count(DISTINCT x.teacher_id) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'gradingBacklog',    (SELECT count(*) FROM public.submissions x WHERE x.school_id = sch.id AND x.submitted_at < now() - interval '7 days' AND x.teacher_approved IS NOT TRUE),
    'incidentsOpenOld',  (SELECT count(*) FROM public.incidents x WHERE x.school_id = sch.id AND x.closed_at IS NULL AND x.created_at < now() - interval '14 days'),
    'timetablePublished', EXISTS (SELECT 1 FROM public.timetable_versions t WHERE t.school_id = sch.id AND t.status = 'published'),
    'leavePendingOld',   (SELECT count(*) FROM public.leave_requests x WHERE x.school_id = sch.id AND x.status = 'pending' AND x.created_at < now() - interval '3 days'),
    'errors7',           (SELECT count(*) FROM public.app_errors x WHERE x.school_id = sch.id AND x.at > now() - interval '7 days'),
    'aiCostUsd30',       (SELECT coalesce(sum(x.cost_usd), 0) FROM public.ai_usage x WHERE x.school_id = sch.id AND x.at > now() - interval '30 days')
  ) AS m
  FROM sch
)
SELECT sch.id, jsonb_build_object(
  'at',      now(),
  'roles',   coalesce((SELECT jsonb_object_agg(r.role, r.m) FROM roles r WHERE r.school_id = sch.id), '{}'::jsonb),
  'weekly',  coalesce((SELECT w.m FROM weekly w WHERE w.school_id = sch.id), '[]'::jsonb),
  'classes', coalesce((SELECT c.m FROM cls c WHERE c.school_id = sch.id), '[]'::jsonb),
  'data',    coalesce((SELECT d.m FROM dq d WHERE d.school_id = sch.id), '{}'::jsonb),
  'ops',     (SELECT o.m FROM ops o WHERE o.school_id = sch.id)
)
FROM sch;
$$;


--
-- Name: FUNCTION "ops_school_metrics"("p_school" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."ops_school_metrics"("p_school" "uuid") IS 'Platform Manager school health: counts only (adoption by role, per class, data quality, operations). service_role only.';


--
-- Name: ops_set_platform_config("text", "jsonb", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_set_platform_config"("p_key" "text", "p_value" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_old jsonb;
BEGIN
  SELECT value INTO v_old FROM public.platform_config WHERE key = p_key FOR UPDATE;
  INSERT INTO public.platform_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, p_actor, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', p_key, v_old, p_value, p_reason);
  RETURN jsonb_build_object('old', v_old, 'new', p_value);
END $$;


--
-- Name: ops_subject_metrics("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_subject_metrics"("p_school" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("school_id" "uuid", "metrics" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH sch AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  students AS (
    SELECT u.id, u.school_id, u.student_class FROM public.users u JOIN sch ON sch.id = u.school_id
    WHERE u.role = 'student' AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
  )
  SELECT sch.id, jsonb_build_object(
    'classSubjectsLinked', (SELECT count(*) FROM public.class_subjects cs WHERE cs.school_id = sch.id),
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


--
-- Name: ops_tml_stale(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_tml_stale"("p_since" timestamp with time zone DEFAULT ("now"() - '14 days'::interval)) RETURNS TABLE("school_id" "uuid", "students" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH ev AS (
    SELECT i.school_id, i.student_id, max(i.created_at) AS newest
    FROM public.submission_items i
    WHERE i.teacher_confirmed AND i.created_at >= p_since AND i.created_at < now() - interval '30 minutes'
    GROUP BY 1, 2
  )
  SELECT ev.school_id, count(*)::int
  FROM ev
  LEFT JOIN LATERAL (
    SELECT max(t.computed_at) AS at FROM public.tml_scores t WHERE t.student_id = ev.student_id
  ) snap ON true
  WHERE snap.at IS NULL OR snap.at + interval '30 minutes' < ev.newest
  GROUP BY 1
$$;


--
-- Name: FUNCTION "ops_tml_stale"("p_since" timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."ops_tml_stale"("p_since" timestamp with time zone) IS 'Platform Manager TML health: students per school whose confirmed work is newer than their latest TML snapshot. service_role only.';


--
-- Name: ops_update_school("uuid", "jsonb", "jsonb", "text", "uuid", "text", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."ops_update_school"("p_school" "uuid", "p_patch" "jsonb", "p_journal" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text", "p_expected" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row public.schools;
  v_settings jsonb;
  k text;
BEGIN
  SELECT * INTO v_row FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'school not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'school changed since it was loaded' USING ERRCODE = '40001';
  END IF;
  v_settings := coalesce(v_row.settings, '{}'::jsonb);
  IF p_patch ? 'settings' THEN
    FOR k IN SELECT jsonb_object_keys(p_patch -> 'settings') LOOP
      IF jsonb_typeof(p_patch -> 'settings' -> k) = 'null'
        THEN v_settings := v_settings - k;
        ELSE v_settings := jsonb_set(v_settings, ARRAY[k], p_patch -> 'settings' -> k, true);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.schools SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch ->> 'name' ELSE name END,
    institution_type = CASE WHEN p_patch ? 'institution_type' THEN p_patch ->> 'institution_type' ELSE institution_type END,
    trial_expires_at = CASE WHEN p_patch ? 'trial_expires_at' THEN (p_patch ->> 'trial_expires_at')::timestamptz ELSE trial_expires_at END,
    settings = v_settings
  WHERE id = p_school
  RETURNING * INTO v_row;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  SELECT p_actor, p_actor_email, 'school', p_school, j ->> 'key', j -> 'old', j -> 'new', p_reason
  FROM jsonb_array_elements(coalesce(p_journal, '[]'::jsonb)) j;
  RETURN jsonb_build_object('updated_at', v_row.updated_at);
END $$;


--
-- Name: parent_wellness_summary("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."parent_wellness_summary"("p_student" "uuid", "p_days" integer DEFAULT 14) RETURNS TABLE("checkins" bigint, "avg_energy" numeric, "low_days" bigint, "latest_energy" integer, "latest_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT count(*), round(avg(w.energy)::numeric, 1), count(*) FILTER (WHERE w.energy <= 2),
         (array_agg(w.energy ORDER BY w.created_at DESC))[1], max(w.created_at)
  FROM public.wellness_logs w
  WHERE app.is_parent_of(p_student)
    AND w.student_id = p_student AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
$$;


--
-- Name: payroll_approve_run("uuid", "uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."payroll_approve_run"("p_school" "uuid", "p_run" "uuid", "p_by" "uuid", "p_recoveries" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: school_attendance_summary("date", "date", "date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."school_attendance_summary"("p_from" "date", "p_to" "date", "p_month_from" "date") RETURNS TABLE("bucket" "text", "student_id" "uuid", "class_name" "text", "key" "text", "present" bigint, "late" bigint, "absent" bigint, "excused" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH who AS (
    SELECT (app.has_perm('attendance.read') OR app.is_superadmin()) AS named,
           (app.has_perm('attendance.read') OR app.has_perm('boardpack.view') OR app.is_superadmin()) AS allowed
  ), a AS (
    SELECT a.student_id, a.class_name, a.day, a.status
    FROM public.attendance a, who
    WHERE who.allowed
      AND a.school_id = app.current_school_id()
      AND a.day BETWEEN greatest(p_from, p_to - 400) AND p_to
  ), s AS (
    SELECT 'student'::text AS bucket, student_id, max(class_name) AS class_name,
           count(*) FILTER (WHERE status = 'present') AS present, count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'absent') AS absent, count(*) FILTER (WHERE status = 'excused') AS excused
    FROM a GROUP BY student_id
    UNION ALL
    SELECT 'student_month', student_id, max(class_name),
           count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
           count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
    FROM a WHERE day >= p_month_from GROUP BY student_id
  )
  SELECT s.bucket, CASE WHEN who.named THEN s.student_id END, s.class_name, NULL::text, s.present, s.late, s.absent, s.excused
  FROM s, who
  UNION ALL
  SELECT 'class_week', NULL, class_name, to_char(date_trunc('week', day::timestamp), 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a GROUP BY class_name, date_trunc('week', day::timestamp)
  UNION ALL
  SELECT 'class_day', NULL, class_name, to_char(p_to, 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a WHERE day = p_to GROUP BY class_name
$$;


--
-- Name: school_wellness_aggregates(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."school_wellness_aggregates"("p_days" integer DEFAULT 14) RETURNS TABLE("student_class" "text", "students" bigint, "checkins" bigint, "avg_energy" numeric, "low_share" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT s.student_class, count(DISTINCT w.student_id), count(*), round(avg(w.energy)::numeric, 2),
         round(avg((w.energy <= 2)::int)::numeric, 2)
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE app.has_perm('wellness.read')
    AND w.school_id = app.current_school_id()
    AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  GROUP BY s.student_class
  HAVING count(DISTINCT w.student_id) >= 5
$$;


--
-- Name: school_wellness_report("date"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."school_wellness_report"("p_since" "date") RETURNS TABLE("bucket" "text", "key" "text", "students" bigint, "checkins" bigint, "avg_energy" numeric, "low_share" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "granted" boolean DEFAULT false NOT NULL,
    "granted_by" "uuid",
    "policy_version" "text",
    "granted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consents_consent_type_check" CHECK (("consent_type" = ANY (ARRAY['wellness_checkin'::"text", 'ai_tutor'::"text", 'data_processing'::"text", 'proctoring'::"text"])))
);


--
-- Name: set_consent("uuid", "text", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_consent"("p_student" "uuid", "p_type" "text", "p_granted" boolean, "p_policy_version" "text" DEFAULT NULL::"text") RETURNS "public"."consents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: teacher_wellness_feed(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."teacher_wellness_feed"("p_days" integer DEFAULT 14) RETURNS TABLE("log_id" "uuid", "student_id" "uuid", "student_name" "text", "student_class" "text", "created_at" timestamp with time zone, "energy" integer, "at_risk" boolean, "resolved" boolean, "shared_note" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


--
-- Name: academic_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."academic_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date" NOT NULL,
    "wing_ids" "uuid"[],
    "bell_schedule_id" "uuid",
    "suspends_classes" boolean DEFAULT false NOT NULL,
    "staff_scope" "text" DEFAULT 'none'::"text" NOT NULL,
    "starts_at" time without time zone,
    "ends_at" time without time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "academic_events_check" CHECK (("ends_on" >= "starts_on")),
    CONSTRAINT "academic_events_check1" CHECK ((("ends_on" - "starts_on") <= 366)),
    CONSTRAINT "academic_events_check2" CHECK ((("starts_at" IS NULL) OR ("ends_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "academic_events_kind_check" CHECK (("kind" = ANY (ARRAY['holiday'::"text", 'exam'::"text", 'ptm'::"text", 'meeting'::"text", 'event'::"text", 'other'::"text"]))),
    CONSTRAINT "academic_events_notes_check" CHECK (("length"("notes") <= 2000)),
    CONSTRAINT "academic_events_staff_scope_check" CHECK (("staff_scope" = ANY (ARRAY['all'::"text", 'teaching'::"text", 'office'::"text", 'none'::"text"]))),
    CONSTRAINT "academic_events_title_check" CHECK ((("length"(TRIM(BOTH FROM "title")) >= 1) AND ("length"(TRIM(BOTH FROM "title")) <= 120)))
);


--
-- Name: account_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "applicant_id" "uuid",
    "people" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    "result" "jsonb",
    CONSTRAINT "account_requests_decision_note_check" CHECK ((("decision_note" IS NULL) OR ("length"("decision_note") <= 1000))),
    CONSTRAINT "account_requests_enrolment_applicant" CHECK ((("kind" <> 'enrolment'::"text") OR ("applicant_id" IS NOT NULL))),
    CONSTRAINT "account_requests_kind_check" CHECK (("kind" = ANY (ARRAY['enrolment'::"text", 'accounts'::"text"]))),
    CONSTRAINT "account_requests_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 1000))),
    CONSTRAINT "account_requests_people_array" CHECK ((("jsonb_typeof"("people") = 'array'::"text") AND ("jsonb_array_length"("people") <= 200))),
    CONSTRAINT "account_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


--
-- Name: admission_applicants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admission_applicants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "name" "text" NOT NULL,
    "grade" integer NOT NULL,
    "date_of_birth" "date",
    "guardian_name" "text",
    "guardian_phone" "text",
    "guardian_email" "text",
    "previous_school" "text",
    "source" "text" DEFAULT 'walk_in'::"text" NOT NULL,
    "stage" "text" DEFAULT 'enquiry'::"text" NOT NULL,
    "furthest_stage" "text" DEFAULT 'enquiry'::"text" NOT NULL,
    "assessment_on" "date",
    "notes" "text",
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "student_id" "uuid",
    "parent_id" "uuid",
    CONSTRAINT "admission_applicants_furthest_stage_check" CHECK (("furthest_stage" = ANY (ARRAY['enquiry'::"text", 'application'::"text", 'assessment'::"text", 'offer'::"text", 'enrolled'::"text"]))),
    CONSTRAINT "admission_applicants_grade_check" CHECK ((("grade" >= 1) AND ("grade" <= 12))),
    CONSTRAINT "admission_applicants_guardian_email_check" CHECK ((("guardian_email" IS NULL) OR ("char_length"("guardian_email") <= 160))),
    CONSTRAINT "admission_applicants_guardian_name_check" CHECK ((("guardian_name" IS NULL) OR ("char_length"("guardian_name") <= 120))),
    CONSTRAINT "admission_applicants_guardian_phone_check" CHECK ((("guardian_phone" IS NULL) OR ("char_length"("guardian_phone") <= 20))),
    CONSTRAINT "admission_applicants_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120))),
    CONSTRAINT "admission_applicants_notes_check" CHECK ((("notes" IS NULL) OR ("char_length"("notes") <= 2000))),
    CONSTRAINT "admission_applicants_previous_school_check" CHECK ((("previous_school" IS NULL) OR ("char_length"("previous_school") <= 160))),
    CONSTRAINT "admission_applicants_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "admission_applicants_source_check" CHECK (("source" = ANY (ARRAY['walk_in'::"text", 'website'::"text", 'referral'::"text", 'sibling'::"text", 'event'::"text", 'advertisement'::"text", 'other'::"text"]))),
    CONSTRAINT "admission_applicants_stage_check" CHECK (("stage" = ANY (ARRAY['enquiry'::"text", 'application'::"text", 'assessment'::"text", 'offer'::"text", 'enrolled'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


--
-- Name: admission_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admission_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "applicant_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "from_stage" "text",
    "to_stage" "text" NOT NULL,
    "note" "text",
    "actor_id" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admission_events_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 1000)))
);


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_usage" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "feature" "text" NOT NULL,
    "model" "text" NOT NULL,
    "user_id" "uuid",
    "school_id" "uuid",
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "thinking_tokens" integer DEFAULT 0 NOT NULL,
    "cached_tokens" integer DEFAULT 0 NOT NULL,
    "cost_usd" numeric(14,8),
    "ok" boolean DEFAULT true NOT NULL,
    "latency_ms" integer,
    "error" "text",
    CONSTRAINT "ai_usage_cached_tokens_check" CHECK (("cached_tokens" >= 0)),
    CONSTRAINT "ai_usage_feature_check" CHECK ((("length"("feature") >= 1) AND ("length"("feature") <= 60))),
    CONSTRAINT "ai_usage_input_tokens_check" CHECK (("input_tokens" >= 0)),
    CONSTRAINT "ai_usage_model_check" CHECK ((("length"("model") >= 1) AND ("length"("model") <= 80))),
    CONSTRAINT "ai_usage_output_tokens_check" CHECK (("output_tokens" >= 0)),
    CONSTRAINT "ai_usage_thinking_tokens_check" CHECK (("thinking_tokens" >= 0))
);


--
-- Name: ai_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_usage" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ai_usage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_error_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_error_groups" (
    "fingerprint" "text" NOT NULL,
    "source" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "message" "text" NOT NULL,
    "route" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "events" bigint DEFAULT 0 NOT NULL,
    "first_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_release" "text",
    "last_environment" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "regressed_at" timestamp with time zone,
    "note" "text",
    CONSTRAINT "app_error_groups_fingerprint_check" CHECK ((("length"("fingerprint") >= 8) AND ("length"("fingerprint") <= 80))),
    CONSTRAINT "app_error_groups_kind_check" CHECK (("kind" = ANY (ARRAY['uncaught'::"text", 'logged'::"text", 'client'::"text", 'render'::"text", 'unhandled'::"text"]))),
    CONSTRAINT "app_error_groups_message_check" CHECK (("length"("message") <= 2000)),
    CONSTRAINT "app_error_groups_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 2000))),
    CONSTRAINT "app_error_groups_route_check" CHECK ((("route" IS NULL) OR ("length"("route") <= 300))),
    CONSTRAINT "app_error_groups_source_check" CHECK (("source" = ANY (ARRAY['server'::"text", 'client'::"text"]))),
    CONSTRAINT "app_error_groups_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


--
-- Name: app_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_errors" (
    "id" bigint NOT NULL,
    "fingerprint" "text" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "message" "text" NOT NULL,
    "stack" "text",
    "route" "text",
    "method" "text",
    "path" "text",
    "school_id" "uuid",
    "user_id" "uuid",
    "user_role" "text",
    "release" "text",
    "environment" "text",
    "user_agent" "text",
    "digest" "text",
    "repeats" integer DEFAULT 1 NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "app_errors_message_check" CHECK (("length"("message") <= 2000)),
    CONSTRAINT "app_errors_method_check" CHECK ((("method" IS NULL) OR ("length"("method") <= 10))),
    CONSTRAINT "app_errors_path_check" CHECK ((("path" IS NULL) OR ("length"("path") <= 500))),
    CONSTRAINT "app_errors_repeats_check" CHECK (("repeats" >= 1)),
    CONSTRAINT "app_errors_route_check" CHECK ((("route" IS NULL) OR ("length"("route") <= 300))),
    CONSTRAINT "app_errors_stack_check" CHECK ((("stack" IS NULL) OR ("length"("stack") <= 8000))),
    CONSTRAINT "app_errors_user_agent_check" CHECK ((("user_agent" IS NULL) OR ("length"("user_agent") <= 400)))
);


--
-- Name: app_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."app_errors" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."app_errors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "teacher_id" "uuid",
    "title" "text" NOT NULL,
    "type" "text",
    "subject" "text",
    "class" "text",
    "description" "text",
    "instructions" "text",
    "due_date" "date",
    "questions" "jsonb" DEFAULT '[]'::"jsonb",
    "tasks" "jsonb" DEFAULT '[]'::"jsonb",
    "units" "text"[] DEFAULT '{}'::"text"[],
    "question_paper_url" "text",
    "assigned_student_ids" "text"[] DEFAULT '{}'::"text"[],
    "total_marks" numeric,
    "status" "text" DEFAULT 'published'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "proctored" boolean DEFAULT false NOT NULL,
    "submission_mode" "text" DEFAULT 'handwritten'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignments_status_valid" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))),
    CONSTRAINT "assignments_submission_mode_valid" CHECK (("submission_mode" = ANY (ARRAY['typed'::"text", 'handwritten'::"text"]))),
    CONSTRAINT "assignments_type_check" CHECK (("type" = ANY (ARRAY['homework'::"text", 'quiz'::"text", 'task'::"text"])))
);


--
-- Name: assignments_student; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."assignments_student" WITH ("security_barrier"='true') AS
 SELECT "id",
    "school_id",
    "teacher_id",
    "title",
    "type",
    "subject",
    "class",
    "description",
    "instructions",
    "due_date",
    "app"."strip_answer_key"("questions") AS "questions",
    "tasks",
    "units",
    "question_paper_url",
    "assigned_student_ids",
    "total_marks",
    "status",
    "created_at",
    "proctored",
    "submission_mode",
    "updated_at"
   FROM "public"."assignments" "a"
  WHERE (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ("status" IS DISTINCT FROM 'draft'::"text"));


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_name" "text" NOT NULL,
    "day" "date" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text",
    "marked_by" "uuid",
    "marked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_class_name_check" CHECK ((("length"("class_name") >= 1) AND ("length"("class_name") <= 40))),
    CONSTRAINT "attendance_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 300))),
    CONSTRAINT "attendance_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'late'::"text", 'excused'::"text"])))
);


--
-- Name: attendance_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."attendance_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "vendor" "text",
    "token_hash" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_devices_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "attendance_devices_vendor_check" CHECK (("length"("vendor") <= 60))
);


--
-- Name: attendance_month_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."attendance_month_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "month" "date" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "summary" "jsonb" NOT NULL,
    "waived" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lop_days" numeric(5,1) DEFAULT 0 NOT NULL,
    "note" "text",
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_month_reviews_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "attendance_month_reviews_lop_days_check" CHECK (("lop_days" >= (0)::numeric)),
    CONSTRAINT "attendance_month_reviews_month_check" CHECK ((EXTRACT(day FROM "month") = (1)::numeric)),
    CONSTRAINT "attendance_month_reviews_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "attendance_month_reviews_status_check" CHECK (("status" = 'confirmed'::"text"))
);


--
-- Name: attendance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."attendance_settings" (
    "school_id" "uuid" NOT NULL,
    "teacher_start" time without time zone DEFAULT '07:45:00'::time without time zone NOT NULL,
    "teacher_end" time without time zone DEFAULT '15:00:00'::time without time zone NOT NULL,
    "office_start" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "office_end" time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL,
    "grace_min" smallint DEFAULT 10 NOT NULL,
    "lates_rule" boolean DEFAULT true NOT NULL,
    "lates_per_half_day" smallint DEFAULT 3 NOT NULL,
    "short_rule" boolean DEFAULT true NOT NULL,
    "min_full_hours" numeric(4,2) DEFAULT 6 NOT NULL,
    "absent_rule" boolean DEFAULT true NOT NULL,
    "geofence_lat" numeric(9,6),
    "geofence_lng" numeric(9,6),
    "geofence_radius_m" integer DEFAULT 200 NOT NULL,
    "noshow_alerts" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_settings_check" CHECK ((("teacher_end" > "teacher_start") AND ("office_end" > "office_start"))),
    CONSTRAINT "attendance_settings_geofence_lat_check" CHECK ((("geofence_lat" >= ('-90'::integer)::numeric) AND ("geofence_lat" <= (90)::numeric))),
    CONSTRAINT "attendance_settings_geofence_lng_check" CHECK ((("geofence_lng" >= ('-180'::integer)::numeric) AND ("geofence_lng" <= (180)::numeric))),
    CONSTRAINT "attendance_settings_geofence_radius_m_check" CHECK ((("geofence_radius_m" >= 50) AND ("geofence_radius_m" <= 5000))),
    CONSTRAINT "attendance_settings_grace_min_check" CHECK ((("grace_min" >= 0) AND ("grace_min" <= 120))),
    CONSTRAINT "attendance_settings_lates_per_half_day_check" CHECK ((("lates_per_half_day" >= 1) AND ("lates_per_half_day" <= 31))),
    CONSTRAINT "attendance_settings_min_full_hours_check" CHECK ((("min_full_hours" >= (1)::numeric) AND ("min_full_hours" <= (16)::numeric)))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "row_id" "text",
    "school_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb"
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bell_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bell_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "seq" smallint NOT NULL,
    "label" "text" NOT NULL,
    "kind" "text" DEFAULT 'period'::"text" NOT NULL,
    "period_no" smallint,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    CONSTRAINT "bell_periods_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "bell_periods_check1" CHECK ((("kind" = 'period'::"text") = ("period_no" IS NOT NULL))),
    CONSTRAINT "bell_periods_kind_check" CHECK (("kind" = ANY (ARRAY['period'::"text", 'break'::"text", 'lunch'::"text", 'assembly'::"text", 'other'::"text"]))),
    CONSTRAINT "bell_periods_label_check" CHECK ((("length"(TRIM(BOTH FROM "label")) >= 1) AND ("length"(TRIM(BOTH FROM "label")) <= 40))),
    CONSTRAINT "bell_periods_period_no_check" CHECK ((("period_no" >= 1) AND ("period_no" <= 16))),
    CONSTRAINT "bell_periods_seq_check" CHECK ((("seq" >= 1) AND ("seq" <= 40)))
);


--
-- Name: bell_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."bell_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "wing_id" "uuid",
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'regular'::"text" NOT NULL,
    "weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bell_schedules_check" CHECK ((("kind" = 'regular'::"text") OR ("weekdays" = '{}'::smallint[]))),
    CONSTRAINT "bell_schedules_kind_check" CHECK (("kind" = ANY (ARRAY['regular'::"text", 'variant'::"text"]))),
    CONSTRAINT "bell_schedules_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "bell_schedules_weekdays_check" CHECK (("weekdays" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))
);


--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."class_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "subject_key" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "board" "text" DEFAULT 'CBSE'::"text" NOT NULL,
    "level" "text" NOT NULL,
    "kind" "text" DEFAULT 'core'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_subjects_board_check" CHECK (("board" = 'CBSE'::"text")),
    CONSTRAINT "class_subjects_kind_check" CHECK (("kind" = ANY (ARRAY['core'::"text", 'elective'::"text"]))),
    CONSTRAINT "class_subjects_level_check" CHECK (("level" ~ '^(1[0-2]|[1-9])$'::"text")),
    CONSTRAINT "class_subjects_subject_key_check" CHECK ((("subject_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text") AND ("char_length"("subject_key") <= 80))),
    CONSTRAINT "class_subjects_subject_name_check" CHECK ((("char_length"("subject_name") >= 1) AND ("char_length"("subject_name") <= 120)))
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: comp_off_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comp_off_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "days" numeric(2,1) NOT NULL,
    "duty_on" "date" NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "uuid",
    "note" "text" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    CONSTRAINT "comp_off_grants_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "comp_off_grants_days_check" CHECK (("days" = ANY (ARRAY[0.5, (1)::numeric]))),
    CONSTRAINT "comp_off_grants_note_check" CHECK ((("length"(TRIM(BOTH FROM "note")) >= 1) AND ("length"(TRIM(BOTH FROM "note")) <= 500))),
    CONSTRAINT "comp_off_grants_source_check" CHECK (("source" = ANY (ARRAY['roster'::"text", 'duty'::"text", 'cover'::"text", 'other'::"text"])))
);


--
-- Name: course_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."course_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "session" "text" DEFAULT '2026-27'::"text" NOT NULL,
    "term_start" "date" NOT NULL,
    "term_end" "date" NOT NULL,
    "periods_per_week" integer DEFAULT 6 NOT NULL,
    "period_minutes" integer DEFAULT 40 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "periods_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "course_plans_check" CHECK (("term_end" > "term_start")),
    CONSTRAINT "course_plans_period_minutes_check" CHECK ((("period_minutes" >= 20) AND ("period_minutes" <= 120))),
    CONSTRAINT "course_plans_periods_per_week_check" CHECK ((("periods_per_week" >= 1) AND ("periods_per_week" <= 20))),
    CONSTRAINT "course_plans_periods_source_check" CHECK (("periods_source" = ANY (ARRAY['manual'::"text", 'timetable'::"text"])))
);


--
-- Name: cover_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cover_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "on_date" "date" NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "period_no" smallint NOT NULL,
    "subject" "text" NOT NULL,
    "absent_user_id" "uuid",
    "absent_staff_member_id" "uuid",
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'assigned'::"text" NOT NULL,
    "sub_user_id" "uuid",
    "sub_staff_member_id" "uuid",
    "flag_note" "text",
    "flagged_at" timestamp with time zone,
    "assigned_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cover_assignments_check" CHECK ((("status" <> 'assigned'::"text") OR ("num_nonnulls"("sub_user_id", "sub_staff_member_id") = 1))),
    CONSTRAINT "cover_assignments_check1" CHECK ((("status" <> 'not_needed'::"text") OR ("num_nonnulls"("sub_user_id", "sub_staff_member_id") = 0))),
    CONSTRAINT "cover_assignments_flag_note_check" CHECK (("length"("flag_note") <= 500)),
    CONSTRAINT "cover_assignments_reason_check" CHECK (("reason" = ANY (ARRAY['leave'::"text", 'absent'::"text", 'release'::"text"]))),
    CONSTRAINT "cover_assignments_status_check" CHECK (("status" = ANY (ARRAY['assigned'::"text", 'not_needed'::"text"])))
);


--
-- Name: doc_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."doc_counters" (
    "school_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "session" "text" NOT NULL,
    "last_no" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "doc_counters_kind_check" CHECK (("kind" = ANY (ARRAY['invoice'::"text", 'receipt'::"text"])))
);


--
-- Name: duty_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."duty_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "on_date" "date" NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "event_id" "uuid",
    "room_id" "uuid",
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duty_assignments_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "duty_assignments_check1" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "duty_assignments_kind_check" CHECK (("kind" = ANY (ARRAY['invigilation'::"text", 'event'::"text", 'other'::"text"]))),
    CONSTRAINT "duty_assignments_note_check" CHECK (("length"("note") <= 500)),
    CONSTRAINT "duty_assignments_title_check" CHECK ((("length"(TRIM(BOTH FROM "title")) >= 1) AND ("length"(TRIM(BOTH FROM "title")) <= 120)))
);


--
-- Name: duty_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."duty_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "weekdays" smallint[] DEFAULT '{1,2,3,4,5}'::smallint[] NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    "location" "text",
    "needed" smallint DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duty_posts_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "duty_posts_kind_check" CHECK (("kind" = ANY (ARRAY['gate'::"text", 'bus'::"text", 'lunch'::"text", 'corridor'::"text", 'assembly'::"text", 'event'::"text", 'other'::"text"]))),
    CONSTRAINT "duty_posts_location_check" CHECK (("length"("location") <= 80)),
    CONSTRAINT "duty_posts_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "duty_posts_needed_check" CHECK ((("needed" >= 1) AND ("needed" <= 20))),
    CONSTRAINT "duty_posts_weekdays_check" CHECK ((("weekdays" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND ("cardinality"("weekdays") > 0)))
);


--
-- Name: duty_roster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."duty_roster" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "duty_roster_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "duty_roster_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


--
-- Name: engagement_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."engagement_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "attendance_score" numeric(5,2) DEFAULT 100,
    "app_engagement_score" numeric(5,2) DEFAULT 100,
    "teacher_engagement_score" numeric(5,2) DEFAULT 100,
    "overall_engagement" numeric(5,2) DEFAULT 100,
    "computed_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: enquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."enquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "school" "text" NOT NULL,
    "role" "text" NOT NULL,
    "phone" "text",
    "message" "text" NOT NULL,
    "consent" boolean NOT NULL,
    "source_origin" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "note" "text",
    "handled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "designation" "text",
    "city" "text",
    "student_count" integer,
    "board" "text",
    "improvement_goal" "text",
    "state" "text",
    "district" "text",
    "territory_id" "uuid",
    "owner_id" "uuid",
    "source" "text",
    "campaign_id" "uuid",
    "utm" "jsonb",
    CONSTRAINT "enquiries_board_check" CHECK ((("board" IS NULL) OR ("board" = ANY (ARRAY['cbse'::"text", 'icse'::"text", 'state'::"text", 'ib'::"text", 'cambridge'::"text", 'other'::"text"])))),
    CONSTRAINT "enquiries_city_check" CHECK ((("city" IS NULL) OR ("char_length"("city") <= 100))),
    CONSTRAINT "enquiries_consent_check" CHECK ("consent"),
    CONSTRAINT "enquiries_designation_check" CHECK ((("designation" IS NULL) OR ("char_length"("designation") <= 100))),
    CONSTRAINT "enquiries_district_check" CHECK ((("district" IS NULL) OR ("length"("district") <= 80))),
    CONSTRAINT "enquiries_email_check" CHECK ((("char_length"("email") >= 3) AND ("char_length"("email") <= 254))),
    CONSTRAINT "enquiries_improvement_goal_check" CHECK ((("improvement_goal" IS NULL) OR ("improvement_goal" = ANY (ARRAY['learning-gaps'::"text", 'learning-outcomes'::"text", 'teacher-workload'::"text", 'academic-visibility'::"text", 'parent-engagement'::"text", 'explore-ai'::"text", 'full-platform'::"text"])))),
    CONSTRAINT "enquiries_message_check" CHECK ((("char_length"("message") >= 10) AND ("char_length"("message") <= 3000))),
    CONSTRAINT "enquiries_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 100))),
    CONSTRAINT "enquiries_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 2000))),
    CONSTRAINT "enquiries_phone_check" CHECK ((("phone" IS NULL) OR ("char_length"("phone") <= 30))),
    CONSTRAINT "enquiries_role_check" CHECK (("role" = ANY (ARRAY['school-leader'::"text", 'administrator'::"text", 'teacher'::"text", 'parent'::"text", 'other'::"text"]))),
    CONSTRAINT "enquiries_school_check" CHECK ((("char_length"("school") >= 2) AND ("char_length"("school") <= 160))),
    CONSTRAINT "enquiries_source_check" CHECK ((("source" IS NULL) OR ("length"("source") <= 40))),
    CONSTRAINT "enquiries_state_check" CHECK ((("state" IS NULL) OR ("length"("state") <= 60))),
    CONSTRAINT "enquiries_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'closed'::"text", 'spam'::"text"]))),
    CONSTRAINT "enquiries_student_count_check" CHECK ((("student_count" IS NULL) OR (("student_count" >= 1) AND ("student_count" <= 999999))))
);


--
-- Name: exam_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "scheme_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'written'::"text" NOT NULL,
    "max_marks" numeric(6,2) NOT NULL,
    "seq" smallint DEFAULT 1 NOT NULL,
    "subjects" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "held_from" "date",
    "held_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_assessments_code_check" CHECK (("code" ~ '^[A-Z][A-Z0-9]{0,11}$'::"text")),
    CONSTRAINT "exam_assessments_kind_check" CHECK (("kind" = ANY (ARRAY['written'::"text", 'internal'::"text", 'practical'::"text", 'project'::"text", 'oral'::"text"]))),
    CONSTRAINT "exam_assessments_max_marks_check" CHECK ((("max_marks" > (0)::numeric) AND ("max_marks" <= (1000)::numeric))),
    CONSTRAINT "exam_assessments_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "exam_assessments_subjects_check" CHECK (("jsonb_typeof"("subjects") = 'object'::"text"))
);


--
-- Name: exam_class_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_class_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "version" integer DEFAULT 0 NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "published_by" "uuid",
    "published_at" timestamp with time zone,
    "reopen_reason" "text",
    "reopened_by" "uuid",
    "reopened_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_class_terms_reopen_reason_check" CHECK (("length"("reopen_reason") <= 1000)),
    CONSTRAINT "exam_class_terms_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'published'::"text"]))),
    CONSTRAINT "exam_class_terms_version_check" CHECK (("version" >= 0))
);


--
-- Name: exam_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_marks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "sheet_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "marks" numeric(6,2),
    "code" "text",
    "questions" "jsonb",
    "source" "text" DEFAULT 'grid'::"text" NOT NULL,
    "source_ref" "uuid",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_marks_check" CHECK ((NOT (("marks" IS NOT NULL) AND ("code" IS NOT NULL)))),
    CONSTRAINT "exam_marks_code_check" CHECK (("code" = ANY (ARRAY['AB'::"text", 'ML'::"text", 'EX'::"text"]))),
    CONSTRAINT "exam_marks_marks_check" CHECK (("marks" >= (0)::numeric)),
    CONSTRAINT "exam_marks_questions_check" CHECK ((("questions" IS NULL) OR ("jsonb_typeof"("questions") = 'array'::"text"))),
    CONSTRAINT "exam_marks_source_check" CHECK (("source" = ANY (ARRAY['grid'::"text", 'import'::"text", 'online'::"text", 'script'::"text", 'practical'::"text"])))
);


--
-- Name: exam_schemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_schemes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "name" "text" NOT NULL,
    "grades" smallint[] NOT NULL,
    "preset" "text",
    "grading" "jsonb" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_schemes_grades_check" CHECK (((("cardinality"("grades") >= 1) AND ("cardinality"("grades") <= 12)) AND ("grades" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint]))),
    CONSTRAINT "exam_schemes_grading_check" CHECK (("jsonb_typeof"("grading") = 'array'::"text")),
    CONSTRAINT "exam_schemes_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "exam_schemes_preset_check" CHECK (("preset" = ANY (ARRAY['foundational'::"text", 'primary'::"text", 'middle'::"text", 'secondary'::"text", 'senior'::"text"]))),
    CONSTRAINT "exam_schemes_rules_check" CHECK (("jsonb_typeof"("rules") = 'object'::"text")),
    CONSTRAINT "exam_schemes_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "exam_schemes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


--
-- Name: exam_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_sheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "class_subject_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "max_marks" numeric(6,2) NOT NULL,
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone,
    "returned_note" "text",
    "returned_by" "uuid",
    "returned_at" timestamp with time zone,
    "reopened_reason" "text",
    "reopened_by" "uuid",
    "reopened_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_sheets_max_marks_check" CHECK (("max_marks" > (0)::numeric)),
    CONSTRAINT "exam_sheets_reopened_reason_check" CHECK (("length"("reopened_reason") <= 1000)),
    CONSTRAINT "exam_sheets_returned_note_check" CHECK (("length"("returned_note") <= 1000)),
    CONSTRAINT "exam_sheets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'submitted'::"text", 'locked'::"text"])))
);


--
-- Name: exam_student_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_student_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "remark" "text",
    "coscholastic" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_student_terms_coscholastic_check" CHECK (("jsonb_typeof"("coscholastic") = 'object'::"text")),
    CONSTRAINT "exam_student_terms_remark_check" CHECK (("length"("remark") <= 600))
);


--
-- Name: exam_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."exam_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "scheme_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "seq" smallint NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date" NOT NULL,
    "weight" numeric(5,2) DEFAULT 0 NOT NULL,
    "components" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subject_weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_terms_check" CHECK (("ends_on" >= "starts_on")),
    CONSTRAINT "exam_terms_components_check" CHECK (("jsonb_typeof"("components") = 'array'::"text")),
    CONSTRAINT "exam_terms_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60))),
    CONSTRAINT "exam_terms_seq_check" CHECK ((("seq" >= 1) AND ("seq" <= 12))),
    CONSTRAINT "exam_terms_subject_weights_check" CHECK (("jsonb_typeof"("subject_weights") = 'object'::"text")),
    CONSTRAINT "exam_terms_weight_check" CHECK ((("weight" >= (0)::numeric) AND ("weight" <= (100)::numeric)))
);


--
-- Name: fee_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "instalment_no" integer NOT NULL,
    "label" "text" NOT NULL,
    "invoice_no" "text" NOT NULL,
    "due_on" "date" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "concession" numeric(12,2) DEFAULT 0 NOT NULL,
    "concession_reason" "text",
    "voided_at" timestamp with time zone,
    "void_reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_invoices_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "fee_invoices_check" CHECK (("concession" <= "amount")),
    CONSTRAINT "fee_invoices_check1" CHECK ((("concession" = (0)::numeric) OR ("concession_reason" IS NOT NULL))),
    CONSTRAINT "fee_invoices_check2" CHECK ((("voided_at" IS NULL) OR ("void_reason" IS NOT NULL))),
    CONSTRAINT "fee_invoices_concession_check" CHECK (("concession" >= (0)::numeric)),
    CONSTRAINT "fee_invoices_instalment_no_check" CHECK ((("instalment_no" >= 1) AND ("instalment_no" <= 12)))
);


--
-- Name: fee_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "invoice_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "outstanding" numeric(12,2) NOT NULL,
    "tone" "text" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "sent_by" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_reminders_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'whatsapp'::"text", 'email'::"text", 'sms'::"text"]))),
    CONSTRAINT "fee_reminders_tone_check" CHECK (("tone" = ANY (ARRAY['gentle'::"text", 'firm'::"text", 'final'::"text"])))
);


--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."fee_structures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "grade" integer NOT NULL,
    "annual_fee" numeric(12,2) NOT NULL,
    "schedule" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "note" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fee_structures_annual_fee_check" CHECK (("annual_fee" >= (0)::numeric)),
    CONSTRAINT "fee_structures_grade_check" CHECK ((("grade" >= 1) AND ("grade" <= 12))),
    CONSTRAINT "fee_structures_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "fee_structures_schedule_check" CHECK (("jsonb_typeof"("schedule") = 'array'::"text")),
    CONSTRAINT "fee_structures_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."guardians" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "relationship" "text",
    "verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: hr_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hr_departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'academic'::"text" NOT NULL,
    "head_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_departments_kind_check" CHECK (("kind" = ANY (ARRAY['academic'::"text", 'administrative'::"text", 'support'::"text"]))),
    CONSTRAINT "hr_departments_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80)))
);


--
-- Name: hr_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hr_grades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "pay_min" numeric(12,2),
    "pay_max" numeric(12,2),
    "sort" smallint DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_grades_category_check" CHECK (("category" = ANY (ARRAY['teaching'::"text", 'office'::"text", 'support'::"text", 'assistant'::"text"]))),
    CONSTRAINT "hr_grades_check" CHECK ((("pay_min" IS NULL) OR ("pay_max" IS NULL) OR ("pay_max" >= "pay_min"))),
    CONSTRAINT "hr_grades_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60))),
    CONSTRAINT "hr_grades_pay_max_check" CHECK (("pay_max" >= (0)::numeric)),
    CONSTRAINT "hr_grades_pay_min_check" CHECK (("pay_min" >= (0)::numeric))
);


--
-- Name: hr_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hr_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "grade_id" "uuid",
    "sanctioned" smallint NOT NULL,
    "note" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_posts_note_check" CHECK (("length"("note") <= 300)),
    CONSTRAINT "hr_posts_sanctioned_check" CHECK ((("sanctioned" >= 0) AND ("sanctioned" <= 2000)))
);


--
-- Name: hr_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."hr_settings" (
    "school_id" "uuid" NOT NULL,
    "code_prefix" "text" DEFAULT 'EMP-'::"text" NOT NULL,
    "code_width" smallint DEFAULT 4 NOT NULL,
    "code_last_no" integer DEFAULT 0 NOT NULL,
    "probation_months" smallint DEFAULT 6 NOT NULL,
    "notice_days" smallint DEFAULT 30 NOT NULL,
    "alert_days" smallint DEFAULT 30 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_settings_alert_days_check" CHECK ((("alert_days" >= 1) AND ("alert_days" <= 180))),
    CONSTRAINT "hr_settings_code_last_no_check" CHECK (("code_last_no" >= 0)),
    CONSTRAINT "hr_settings_code_prefix_check" CHECK (("code_prefix" ~ '^[A-Za-z0-9/_-]{0,12}$'::"text")),
    CONSTRAINT "hr_settings_code_width_check" CHECK ((("code_width" >= 2) AND ("code_width" <= 8))),
    CONSTRAINT "hr_settings_notice_days_check" CHECK ((("notice_days" >= 0) AND ("notice_days" <= 365))),
    CONSTRAINT "hr_settings_probation_months_check" CHECK ((("probation_months" >= 0) AND ("probation_months" <= 36)))
);


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "class_name" "text",
    "category" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "details" "text",
    "location" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logged_by" "uuid",
    "parent_notice" "text" NOT NULL,
    "parent_notice_by" "uuid",
    "parent_notice_at" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "outcome" "text",
    "closed_by" "uuid",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incidents_category_check" CHECK (("category" = ANY (ARRAY['health'::"text", 'discipline'::"text", 'bullying'::"text", 'safety'::"text", 'property'::"text", 'child_protection'::"text", 'other'::"text"]))),
    CONSTRAINT "incidents_details_check" CHECK ((("details" IS NULL) OR ("length"("details") <= 4000))),
    CONSTRAINT "incidents_location_check" CHECK ((("location" IS NULL) OR ("length"("location") <= 120))),
    CONSTRAINT "incidents_outcome_check" CHECK ((("outcome" IS NULL) OR ("length"("outcome") <= 2000))),
    CONSTRAINT "incidents_parent_notice_check" CHECK (("parent_notice" = ANY (ARRAY['sent'::"text", 'awaiting_class_teacher'::"text", 'principal_decides'::"text", 'declined'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "incidents_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'normal'::"text"]))),
    CONSTRAINT "incidents_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"]))),
    CONSTRAINT "incidents_summary_check" CHECK ((("length"("summary") >= 3) AND ("length"("summary") <= 160)))
);


--
-- Name: lab_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lab_runs" (
    "id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "chapter" "text",
    "engine" "text" NOT NULL,
    "scene_id" "uuid",
    "scene" "jsonb" NOT NULL,
    "results" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lab_runs_chapter_check" CHECK ((("chapter" IS NULL) OR ("char_length"("chapter") <= 200))),
    CONSTRAINT "lab_runs_class_check" CHECK ((("char_length"("class") >= 1) AND ("char_length"("class") <= 40))),
    CONSTRAINT "lab_runs_engine_check" CHECK (("engine" ~ '^[a-z][a-z-]{1,29}$'::"text")),
    CONSTRAINT "lab_runs_results_check" CHECK ((("jsonb_typeof"("results") = 'array'::"text") AND ("pg_column_size"("results") < 32768))),
    CONSTRAINT "lab_runs_scene_check" CHECK ((("jsonb_typeof"("scene") = 'object'::"text") AND ("pg_column_size"("scene") < 8192))),
    CONSTRAINT "lab_runs_subject_check" CHECK ((("char_length"("subject") >= 1) AND ("char_length"("subject") <= 60)))
);


--
-- Name: lab_scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lab_scenes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "chapter" "text",
    "engine" "text" NOT NULL,
    "title" "text" NOT NULL,
    "scene" "jsonb" NOT NULL,
    "lesson_plan_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lab_scenes_chapter_check" CHECK ((("chapter" IS NULL) OR ("char_length"("chapter") <= 200))),
    CONSTRAINT "lab_scenes_class_check" CHECK ((("char_length"("class") >= 1) AND ("char_length"("class") <= 40))),
    CONSTRAINT "lab_scenes_engine_check" CHECK (("engine" ~ '^[a-z][a-z-]{1,29}$'::"text")),
    CONSTRAINT "lab_scenes_scene_check" CHECK ((("jsonb_typeof"("scene") = 'object'::"text") AND ("pg_column_size"("scene") < 8192))),
    CONSTRAINT "lab_scenes_subject_check" CHECK ((("char_length"("subject") >= 1) AND ("char_length"("subject") <= 60))),
    CONSTRAINT "lab_scenes_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 140)))
);


--
-- Name: learning_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."learning_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject" "text" NOT NULL,
    "class" "text" NOT NULL,
    "unit_name" "text" NOT NULL,
    "outcome_code" "text" NOT NULL,
    "outcome_name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: leave_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."leave_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "leave_type" "text" NOT NULL,
    "days_per_year" numeric(5,1) NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leave_policies_days_per_year_check" CHECK ((("days_per_year" >= (0)::numeric) AND ("days_per_year" <= (366)::numeric))),
    CONSTRAINT "leave_policies_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['casual'::"text", 'sick'::"text", 'earned'::"text", 'duty'::"text", 'maternity'::"text", 'paternity'::"text", 'unpaid'::"text"]))),
    CONSTRAINT "leave_policies_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "leave_type" "text" NOT NULL,
    "from_date" "date" NOT NULL,
    "to_date" "date" NOT NULL,
    "half_day" boolean DEFAULT false NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "decision_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "staff_member_id" "uuid",
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "entered_by" "uuid",
    CONSTRAINT "leave_requests_check" CHECK (("to_date" >= "from_date")),
    CONSTRAINT "leave_requests_check1" CHECK (((NOT "half_day") OR ("to_date" = "from_date"))),
    CONSTRAINT "leave_requests_check2" CHECK ((("status" <> 'rejected'::"text") OR ("decision_note" IS NOT NULL))),
    CONSTRAINT "leave_requests_decision_note_check" CHECK ((("decision_note" IS NULL) OR ("char_length"("decision_note") <= 1000))),
    CONSTRAINT "leave_requests_leave_type_check" CHECK (("leave_type" = ANY (ARRAY['casual'::"text", 'sick'::"text", 'earned'::"text", 'duty'::"text", 'maternity'::"text", 'paternity'::"text", 'unpaid'::"text", 'compensatory'::"text"]))),
    CONSTRAINT "leave_requests_one_person" CHECK (("num_nonnulls"("staff_id", "staff_member_id") = 1)),
    CONSTRAINT "leave_requests_reason_check" CHECK ((("char_length"("reason") >= 1) AND ("char_length"("reason") <= 1000))),
    CONSTRAINT "leave_requests_source_check" CHECK (("source" = ANY (ARRAY['app'::"text", 'office'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "leave_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


--
-- Name: lesson_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lesson_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "session" "text" DEFAULT '2026-27'::"text" NOT NULL,
    "chapter_key" "text" NOT NULL,
    "chapter_name" "text" NOT NULL,
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "title" "text" NOT NULL,
    "lesson_date" "date",
    "period" integer,
    "duration_min" integer DEFAULT 40 NOT NULL,
    "objectives" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "success_criteria" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "prior_knowledge" "text",
    "materials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "stages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "differentiation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "check_for_understanding" "text",
    "homework_assignment_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "reflection" "text",
    "taught_on" "date",
    "ai_drafted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lesson_plans_duration_min_check" CHECK ((("duration_min" >= 10) AND ("duration_min" <= 240))),
    CONSTRAINT "lesson_plans_period_check" CHECK ((("period" IS NULL) OR (("period" >= 1) AND ("period" <= 12)))),
    CONSTRAINT "lesson_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'taught'::"text"]))),
    CONSTRAINT "lesson_plans_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 200)))
);


--
-- Name: loan_recoveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."loan_recoveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loan_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    CONSTRAINT "loan_recoveries_amount_check" CHECK (("amount" > (0)::numeric))
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "teacher_id" "uuid",
    "title" "text",
    "content" "jsonb",
    "subject" "text",
    "class" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "student_id" "uuid",
    "title" "text",
    "body" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "type" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: ops_access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_access_events" (
    "id" bigint NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "text" NOT NULL,
    "target" "text",
    CONSTRAINT "ops_access_events_action_check" CHECK (("length"("action") <= 80)),
    CONSTRAINT "ops_access_events_target_check" CHECK ((("target" IS NULL) OR ("length"("target") <= 300)))
);


--
-- Name: ops_access_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_access_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ops_access_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_access_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operator_id" "uuid",
    "operator_email" "text" NOT NULL,
    "operator_role" "text" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'records'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "case_ref" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "ops_access_grants_case_ref_check" CHECK ((("case_ref" IS NULL) OR ("length"("case_ref") <= 80))),
    CONSTRAINT "ops_access_grants_reason_check" CHECK ((("length"("reason") >= 10) AND ("length"("reason") <= 500))),
    CONSTRAINT "ops_access_grants_scope_check" CHECK (("scope" = ANY (ARRAY['records'::"text", 'view_as'::"text"]))),
    CONSTRAINT "ops_access_grants_window" CHECK ((("expires_at" > "started_at") AND ("expires_at" <= ("started_at" + '00:30:00'::interval))))
);


--
-- Name: ops_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_accounts" (
    "school_id" "uuid" NOT NULL,
    "state" "text",
    "district" "text",
    "territory_id" "uuid",
    "owner_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "ops_accounts_district_check" CHECK ((("district" IS NULL) OR ("length"("district") <= 80))),
    CONSTRAINT "ops_accounts_state_check" CHECK ((("state" IS NULL) OR ("length"("state") <= 60)))
);


--
-- Name: ops_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "direction" "text",
    "subject" "text" NOT NULL,
    "body" "text",
    "happened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid",
    "case_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_activities_body_check" CHECK ((("body" IS NULL) OR ("length"("body") <= 6000))),
    CONSTRAINT "ops_activities_direction_check" CHECK ((("direction" IS NULL) OR ("direction" = ANY (ARRAY['in'::"text", 'out'::"text"])))),
    CONSTRAINT "ops_activities_kind_check" CHECK (("kind" = ANY (ARRAY['call'::"text", 'meeting'::"text", 'email'::"text", 'whatsapp'::"text", 'visit'::"text", 'note'::"text"]))),
    CONSTRAINT "ops_activities_subject_check" CHECK ((("length"("subject") >= 2) AND ("length"("subject") <= 160)))
);


--
-- Name: ops_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "channel" "text" DEFAULT 'other'::"text" NOT NULL,
    "starts_on" "date",
    "ends_on" "date",
    "budget" numeric(14,2),
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_campaigns_budget_check" CHECK ((("budget" IS NULL) OR ("budget" >= (0)::numeric))),
    CONSTRAINT "ops_campaigns_channel_check" CHECK (("channel" = ANY (ARRAY['search_ads'::"text", 'social_ads'::"text", 'event'::"text", 'print'::"text", 'outbound'::"text", 'referral_programme'::"text", 'content'::"text", 'partner'::"text", 'other'::"text"]))),
    CONSTRAINT "ops_campaigns_check" CHECK ((("ends_on" IS NULL) OR ("starts_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "ops_campaigns_code_check" CHECK (("code" ~ '^[a-z0-9_-]{2,60}$'::"text")),
    CONSTRAINT "ops_campaigns_name_check" CHECK ((("length"("name") >= 2) AND ("length"("name") <= 160))),
    CONSTRAINT "ops_campaigns_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 2000)))
);


--
-- Name: ops_canned_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_canned_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_canned_replies_body_check" CHECK ((("length"("body") >= 2) AND ("length"("body") <= 4000))),
    CONSTRAINT "ops_canned_replies_title_check" CHECK ((("length"("title") >= 2) AND ("length"("title") <= 80)))
);


--
-- Name: ops_case_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_case_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "ref" "text" NOT NULL,
    "label" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_case_links_kind_check" CHECK (("kind" = ANY (ARRAY['error'::"text", 'record'::"text", 'audit'::"text", 'request'::"text", 'url'::"text"]))),
    CONSTRAINT "ops_case_links_label_check" CHECK ((("label" IS NULL) OR ("length"("label") <= 200))),
    CONSTRAINT "ops_case_links_ref_check" CHECK ((("length"("ref") >= 1) AND ("length"("ref") <= 400)))
);


--
-- Name: ops_case_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_case_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "case_id" "uuid" NOT NULL,
    "author_kind" "text" NOT NULL,
    "author_id" "uuid",
    "author_name" "text",
    "body" "text" NOT NULL,
    "internal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_case_messages_author_kind_check" CHECK (("author_kind" = ANY (ARRAY['school'::"text", 'operator'::"text", 'system'::"text"]))),
    CONSTRAINT "ops_case_messages_author_name_check" CHECK ((("author_name" IS NULL) OR ("length"("author_name") <= 120))),
    CONSTRAINT "ops_case_messages_body_check" CHECK ((("length"("body") >= 1) AND ("length"("body") <= 8000))),
    CONSTRAINT "ops_case_messages_check" CHECK (((NOT "internal") OR ("author_kind" = 'operator'::"text")))
);


--
-- Name: ops_case_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ops_case_number_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_cases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" bigint DEFAULT "nextval"('"public"."ops_case_number_seq"'::"regclass") NOT NULL,
    "school_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "source" "text" DEFAULT 'operator'::"text" NOT NULL,
    "raised_by" "uuid",
    "raised_by_name" "text",
    "contact_id" "uuid",
    "owner_id" "uuid",
    "first_response_due" timestamp with time zone NOT NULL,
    "resolve_due" timestamp with time zone NOT NULL,
    "first_responded_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "reopened" integer DEFAULT 0 NOT NULL,
    "last_school_at" timestamp with time zone,
    "last_operator_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_cases_category_check" CHECK (("length"("category") <= 40)),
    CONSTRAINT "ops_cases_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "ops_cases_raised_by_name_check" CHECK ((("raised_by_name" IS NULL) OR ("length"("raised_by_name") <= 120))),
    CONSTRAINT "ops_cases_source_check" CHECK (("source" = ANY (ARRAY['school_portal'::"text", 'operator'::"text", 'phone'::"text", 'email'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "ops_cases_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'open'::"text", 'waiting_school'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "ops_cases_subject_check" CHECK ((("length"("subject") >= 4) AND ("length"("subject") <= 160)))
);


--
-- Name: ops_commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_commission_rules" (
    "key" "text" NOT NULL,
    "rate_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ops_commission_rules_key_check" CHECK (("key" = ANY (ARRAY['deal_owner'::"text", 'owner_manager'::"text"]))),
    CONSTRAINT "ops_commission_rules_rate_pct_check" CHECK ((("rate_pct" >= (0)::numeric) AND ("rate_pct" <= (100)::numeric)))
);


--
-- Name: ops_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opportunity_id" "uuid",
    "school_id" "uuid",
    "payee_kind" "text" NOT NULL,
    "partner_id" "uuid",
    "operator_id" "uuid",
    "payee_name" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "basis_amount" numeric(14,2),
    "rate_pct" numeric(5,2),
    "amount" numeric(14,2) NOT NULL,
    "status" "text" DEFAULT 'accrued'::"text" NOT NULL,
    "auto" boolean DEFAULT false NOT NULL,
    "accrued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "paid_on" "date",
    "payment_ref" "text",
    "note" "text",
    "created_by" "uuid",
    CONSTRAINT "ops_commissions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "ops_commissions_basis_amount_check" CHECK ((("basis_amount" IS NULL) OR ("basis_amount" >= (0)::numeric))),
    CONSTRAINT "ops_commissions_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 500))),
    CONSTRAINT "ops_commissions_payee_kind_check" CHECK (("payee_kind" = ANY (ARRAY['partner'::"text", 'operator'::"text", 'other'::"text"]))),
    CONSTRAINT "ops_commissions_payee_name_check" CHECK ((("length"("payee_name") >= 2) AND ("length"("payee_name") <= 160))),
    CONSTRAINT "ops_commissions_payment_ref_check" CHECK ((("payment_ref" IS NULL) OR ("length"("payment_ref") <= 120))),
    CONSTRAINT "ops_commissions_rate_pct_check" CHECK ((("rate_pct" IS NULL) OR (("rate_pct" >= (0)::numeric) AND ("rate_pct" <= (100)::numeric)))),
    CONSTRAINT "ops_commissions_reason_check" CHECK ((("length"("reason") >= 2) AND ("length"("reason") <= 200))),
    CONSTRAINT "ops_commissions_status_check" CHECK (("status" = ANY (ARRAY['accrued'::"text", 'approved'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


--
-- Name: ops_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'other'::"text" NOT NULL,
    "title" "text",
    "email" "text",
    "phone" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "decides" boolean DEFAULT false NOT NULL,
    "note" "text",
    "user_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_contacts_email_check" CHECK ((("email" IS NULL) OR ("length"("email") <= 200))),
    CONSTRAINT "ops_contacts_name_check" CHECK ((("length"("name") >= 2) AND ("length"("name") <= 120))),
    CONSTRAINT "ops_contacts_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 1000))),
    CONSTRAINT "ops_contacts_phone_check" CHECK ((("phone" IS NULL) OR ("length"("phone") <= 30))),
    CONSTRAINT "ops_contacts_role_check" CHECK (("length"("role") <= 40)),
    CONSTRAINT "ops_contacts_title_check" CHECK ((("title" IS NULL) OR ("length"("title") <= 80)))
);


--
-- Name: ops_discount_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_discount_limits" (
    "role" "text" NOT NULL,
    "max_pct" numeric(5,2) NOT NULL,
    CONSTRAINT "ops_discount_limits_max_pct_check" CHECK ((("max_pct" >= (0)::numeric) AND ("max_pct" <= (100)::numeric))),
    CONSTRAINT "ops_discount_limits_role_check" CHECK (("role" = ANY (ARRAY['director'::"text", 'regional_lead'::"text", 'sales_rep'::"text", 'account_manager'::"text"])))
);


--
-- Name: ops_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "signed_on" "date",
    "expires_on" "date",
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_documents_check" CHECK ((("expires_on" IS NULL) OR ("signed_on" IS NULL) OR ("expires_on" >= "signed_on"))),
    CONSTRAINT "ops_documents_file_name_check" CHECK (("length"("file_name") <= 200)),
    CONSTRAINT "ops_documents_kind_check" CHECK (("kind" = ANY (ARRAY['contract'::"text", 'mou'::"text", 'purchase_order'::"text", 'proposal'::"text", 'invoice'::"text", 'other'::"text"]))),
    CONSTRAINT "ops_documents_size_bytes_check" CHECK (("size_bytes" > 0)),
    CONSTRAINT "ops_documents_title_check" CHECK ((("length"("title") >= 2) AND ("length"("title") <= 160)))
);


--
-- Name: ops_job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_job_runs" (
    "id" bigint NOT NULL,
    "job" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "ok" boolean,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "triggered_by" "text" DEFAULT 'schedule'::"text" NOT NULL,
    CONSTRAINT "ops_job_runs_job_check" CHECK (("length"("job") <= 60)),
    CONSTRAINT "ops_job_runs_triggered_by_check" CHECK (("length"("triggered_by") <= 200))
);


--
-- Name: ops_job_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_job_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ops_job_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_marketing_spend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_marketing_spend" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "opportunity_id" "uuid",
    "enquiry_id" "uuid",
    "school_id" "uuid",
    "spent_on" "date" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "note" "text",
    "entered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_marketing_spend_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "ops_marketing_spend_category_check" CHECK (("category" = ANY (ARRAY['ads'::"text", 'event'::"text", 'travel'::"text", 'print'::"text", 'gifts'::"text", 'agency'::"text", 'pilot_kit'::"text", 'other'::"text"]))),
    CONSTRAINT "ops_marketing_spend_check" CHECK ((("campaign_id" IS NOT NULL) OR ("opportunity_id" IS NOT NULL) OR ("enquiry_id" IS NOT NULL) OR ("school_id" IS NOT NULL))),
    CONSTRAINT "ops_marketing_spend_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 500)))
);


--
-- Name: ops_operators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_operators" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "manager_id" "uuid",
    "title" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_operators_check" CHECK (("manager_id" IS DISTINCT FROM "user_id")),
    CONSTRAINT "ops_operators_role_check" CHECK (("role" = ANY (ARRAY['director'::"text", 'regional_lead'::"text", 'sales_rep'::"text", 'account_manager'::"text", 'support_agent'::"text", 'engineer'::"text", 'finance'::"text"]))),
    CONSTRAINT "ops_operators_title_check" CHECK ((("title" IS NULL) OR ("length"("title") <= 80)))
);


--
-- Name: ops_opportunity_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ops_opportunity_number_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" bigint DEFAULT "nextval"('"public"."ops_opportunity_number_seq"'::"regclass") NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'new'::"text" NOT NULL,
    "stage" "text" NOT NULL,
    "enquiry_id" "uuid",
    "school_id" "uuid",
    "plan" "text",
    "students" integer,
    "price_per_student" numeric(10,2),
    "amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "expected_close" "date",
    "next_step" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "state" "text",
    "district" "text",
    "territory_id" "uuid",
    "owner_id" "uuid",
    "loss_reason" "text",
    "closed_note" "text",
    "closed_at" timestamp with time zone,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "campaign_id" "uuid",
    "partner_id" "uuid",
    CONSTRAINT "ops_opportunities_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "ops_opportunities_closed_note_check" CHECK ((("closed_note" IS NULL) OR ("length"("closed_note") <= 1000))),
    CONSTRAINT "ops_opportunities_contact_email_check" CHECK ((("contact_email" IS NULL) OR ("length"("contact_email") <= 200))),
    CONSTRAINT "ops_opportunities_contact_name_check" CHECK ((("contact_name" IS NULL) OR ("length"("contact_name") <= 120))),
    CONSTRAINT "ops_opportunities_contact_phone_check" CHECK ((("contact_phone" IS NULL) OR ("length"("contact_phone") <= 30))),
    CONSTRAINT "ops_opportunities_district_check" CHECK ((("district" IS NULL) OR ("length"("district") <= 80))),
    CONSTRAINT "ops_opportunities_kind_check" CHECK (("kind" = ANY (ARRAY['new'::"text", 'pilot_conversion'::"text", 'renewal'::"text", 'expansion'::"text"]))),
    CONSTRAINT "ops_opportunities_loss_reason_check" CHECK ((("loss_reason" IS NULL) OR ("length"("loss_reason") <= 40))),
    CONSTRAINT "ops_opportunities_name_check" CHECK ((("length"("name") >= 2) AND ("length"("name") <= 160))),
    CONSTRAINT "ops_opportunities_next_step_check" CHECK ((("next_step" IS NULL) OR ("length"("next_step") <= 300))),
    CONSTRAINT "ops_opportunities_plan_check" CHECK ((("plan" IS NULL) OR ("plan" = ANY (ARRAY['pilot'::"text", 'aadhara'::"text", 'sthamba'::"text", 'shikhara'::"text", 'mandala'::"text"])))),
    CONSTRAINT "ops_opportunities_price_per_student_check" CHECK ((("price_per_student" IS NULL) OR ("price_per_student" >= (0)::numeric))),
    CONSTRAINT "ops_opportunities_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['website'::"text", 'partner'::"text", 'referral'::"text", 'outbound'::"text", 'event'::"text", 'inbound_call'::"text", 'existing'::"text", 'other'::"text"])))),
    CONSTRAINT "ops_opportunities_state_check" CHECK ((("state" IS NULL) OR ("length"("state") <= 60))),
    CONSTRAINT "ops_opportunities_students_check" CHECK ((("students" IS NULL) OR (("students" >= 1) AND ("students" <= 999999))))
);


--
-- Name: ops_opportunity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_opportunity_events" (
    "id" bigint NOT NULL,
    "opportunity_id" "uuid" NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text",
    "from_stage" "text",
    "to_stage" "text",
    "by_id" "uuid",
    "by_name" "text",
    CONSTRAINT "ops_opportunity_events_body_check" CHECK ((("body" IS NULL) OR ("length"("body") <= 6000))),
    CONSTRAINT "ops_opportunity_events_by_name_check" CHECK ((("by_name" IS NULL) OR ("length"("by_name") <= 120))),
    CONSTRAINT "ops_opportunity_events_kind_check" CHECK (("kind" = ANY (ARRAY['created'::"text", 'stage'::"text", 'note'::"text", 'call'::"text", 'meeting'::"text", 'email'::"text", 'whatsapp'::"text", 'visit'::"text", 'quote'::"text", 'approval'::"text", 'owner'::"text", 'change'::"text"])))
);


--
-- Name: ops_opportunity_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_opportunity_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ops_opportunity_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ops_opportunity_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_opportunity_stages" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort" integer DEFAULT 100 NOT NULL,
    "probability" integer NOT NULL,
    "kind" "text" DEFAULT 'open'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "ops_opportunity_stages_key_check" CHECK (("key" ~ '^[a-z0-9_]{2,40}$'::"text")),
    CONSTRAINT "ops_opportunity_stages_kind_check" CHECK (("kind" = ANY (ARRAY['open'::"text", 'won'::"text", 'lost'::"text"]))),
    CONSTRAINT "ops_opportunity_stages_label_check" CHECK ((("length"("label") >= 2) AND ("length"("label") <= 60))),
    CONSTRAINT "ops_opportunity_stages_probability_check" CHECK ((("probability" >= 0) AND ("probability" <= 100)))
);


--
-- Name: ops_partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'dealer'::"text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "state" "text",
    "district" "text",
    "pan" "text",
    "gstin" "text",
    "commission_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "commission_basis" "text" DEFAULT 'first_year'::"text" NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_partners_commission_basis_check" CHECK (("commission_basis" = ANY (ARRAY['first_year'::"text", 'every_year'::"text"]))),
    CONSTRAINT "ops_partners_commission_pct_check" CHECK ((("commission_pct" >= (0)::numeric) AND ("commission_pct" <= (100)::numeric))),
    CONSTRAINT "ops_partners_contact_name_check" CHECK ((("contact_name" IS NULL) OR ("length"("contact_name") <= 120))),
    CONSTRAINT "ops_partners_district_check" CHECK ((("district" IS NULL) OR ("length"("district") <= 80))),
    CONSTRAINT "ops_partners_email_check" CHECK ((("email" IS NULL) OR ("length"("email") <= 200))),
    CONSTRAINT "ops_partners_gstin_check" CHECK ((("gstin" IS NULL) OR ("length"("gstin") <= 20))),
    CONSTRAINT "ops_partners_kind_check" CHECK (("kind" = ANY (ARRAY['dealer'::"text", 'referral'::"text", 'reseller'::"text", 'consultant'::"text", 'other'::"text"]))),
    CONSTRAINT "ops_partners_name_check" CHECK ((("length"("name") >= 2) AND ("length"("name") <= 160))),
    CONSTRAINT "ops_partners_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 2000))),
    CONSTRAINT "ops_partners_pan_check" CHECK ((("pan" IS NULL) OR ("length"("pan") <= 20))),
    CONSTRAINT "ops_partners_phone_check" CHECK ((("phone" IS NULL) OR ("length"("phone") <= 30))),
    CONSTRAINT "ops_partners_state_check" CHECK ((("state" IS NULL) OR ("length"("state") <= 60)))
);


--
-- Name: ops_picklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_picklists" (
    "kind" "text" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort" integer DEFAULT 100 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "ops_picklists_key_check" CHECK (("key" ~ '^[a-z0-9_]{2,40}$'::"text")),
    CONSTRAINT "ops_picklists_kind_check" CHECK (("kind" = ANY (ARRAY['case_category'::"text", 'contact_role'::"text", 'loss_reason'::"text"]))),
    CONSTRAINT "ops_picklists_label_check" CHECK ((("length"("label") >= 2) AND ("length"("label") <= 60)))
);


--
-- Name: ops_quote_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_quote_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "by_id" "uuid",
    "by_name" "text",
    "by_role" "text",
    "note" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_quote_approvals_decision_check" CHECK (("decision" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "ops_quote_approvals_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 1000)))
);


--
-- Name: ops_quote_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."ops_quote_number_seq"
    START WITH 1001
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" bigint DEFAULT "nextval"('"public"."ops_quote_number_seq"'::"regclass") NOT NULL,
    "opportunity_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "plan" "text" NOT NULL,
    "students" integer NOT NULL,
    "list_price" numeric(10,2),
    "price_per_student" numeric(10,2) NOT NULL,
    "discount_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "term_months" integer DEFAULT 12 NOT NULL,
    "valid_until" "date" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "needs_role" "text",
    "created_by" "uuid",
    "created_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_quotes_discount_pct_check" CHECK ((("discount_pct" >= (0)::numeric) AND ("discount_pct" <= (100)::numeric))),
    CONSTRAINT "ops_quotes_list_price_check" CHECK ((("list_price" IS NULL) OR ("list_price" > (0)::numeric))),
    CONSTRAINT "ops_quotes_needs_role_check" CHECK ((("needs_role" IS NULL) OR ("needs_role" = ANY (ARRAY['regional_lead'::"text", 'director'::"text"])))),
    CONSTRAINT "ops_quotes_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 3000))),
    CONSTRAINT "ops_quotes_plan_check" CHECK (("plan" = ANY (ARRAY['aadhara'::"text", 'sthamba'::"text", 'shikhara'::"text", 'mandala'::"text"]))),
    CONSTRAINT "ops_quotes_price_per_student_check" CHECK (("price_per_student" > (0)::numeric)),
    CONSTRAINT "ops_quotes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'approved'::"text", 'rejected'::"text", 'sent'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"]))),
    CONSTRAINT "ops_quotes_students_check" CHECK ((("students" >= 1) AND ("students" <= 999999))),
    CONSTRAINT "ops_quotes_term_months_check" CHECK ((("term_months" >= 1) AND ("term_months" <= 60)))
);


--
-- Name: ops_sla_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_sla_policies" (
    "priority" "text" NOT NULL,
    "first_response_minutes" integer NOT NULL,
    "resolve_minutes" integer NOT NULL,
    CONSTRAINT "ops_sla_policies_check" CHECK (("resolve_minutes" >= "first_response_minutes")),
    CONSTRAINT "ops_sla_policies_first_response_minutes_check" CHECK ((("first_response_minutes" >= 5) AND ("first_response_minutes" <= 43200))),
    CONSTRAINT "ops_sla_policies_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "ops_sla_policies_resolve_minutes_check" CHECK ((("resolve_minutes" >= 30) AND ("resolve_minutes" <= 129600)))
);


--
-- Name: ops_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "enquiry_id" "uuid",
    "case_id" "uuid",
    "title" "text" NOT NULL,
    "note" "text",
    "due_on" "date",
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "owner_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "done_at" timestamp with time zone,
    "opportunity_id" "uuid",
    CONSTRAINT "ops_tasks_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 2000))),
    CONSTRAINT "ops_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "ops_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "ops_tasks_title_check" CHECK ((("length"("title") >= 2) AND ("length"("title") <= 200)))
);


--
-- Name: ops_territories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_territories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "level" "text" NOT NULL,
    "parent_id" "uuid",
    "state" "text",
    "district" "text",
    "default_owner_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ops_territories_district_check" CHECK ((("district" IS NULL) OR ("length"("district") <= 80))),
    CONSTRAINT "ops_territories_level_check" CHECK (("level" = ANY (ARRAY['region'::"text", 'state'::"text", 'district'::"text"]))),
    CONSTRAINT "ops_territories_name_check" CHECK ((("length"("name") >= 2) AND ("length"("name") <= 80))),
    CONSTRAINT "ops_territories_shape" CHECK (((("level" = 'region'::"text") AND ("parent_id" IS NULL) AND ("state" IS NULL) AND ("district" IS NULL)) OR (("level" = 'state'::"text") AND ("state" IS NOT NULL) AND ("district" IS NULL)) OR (("level" = 'district'::"text") AND ("parent_id" IS NOT NULL) AND ("state" IS NOT NULL) AND ("district" IS NOT NULL)))),
    CONSTRAINT "ops_territories_state_check" CHECK ((("state" IS NULL) OR ("length"("state") <= 60)))
);


--
-- Name: ops_territory_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ops_territory_members" (
    "territory_id" "uuid" NOT NULL,
    "operator_id" "uuid" NOT NULL
);


--
-- Name: pay_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pay_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "mode" "text" DEFAULT 'add'::"text" NOT NULL,
    "item_id" "uuid",
    "kind" "text" NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "taxable" boolean DEFAULT true NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pay_adjustments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "pay_adjustments_check" CHECK ((("mode" <> 'override'::"text") OR ("item_id" IS NOT NULL))),
    CONSTRAINT "pay_adjustments_kind_check" CHECK (("kind" = ANY (ARRAY['earning'::"text", 'deduction'::"text"]))),
    CONSTRAINT "pay_adjustments_label_check" CHECK ((("length"(TRIM(BOTH FROM "label")) >= 1) AND ("length"(TRIM(BOTH FROM "label")) <= 80))),
    CONSTRAINT "pay_adjustments_mode_check" CHECK (("mode" = ANY (ARRAY['add'::"text", 'override'::"text"]))),
    CONSTRAINT "pay_adjustments_month_check" CHECK ((EXTRACT(day FROM "month") = (1)::numeric)),
    CONSTRAINT "pay_adjustments_note_check" CHECK ((("length"(TRIM(BOTH FROM "note")) >= 1) AND ("length"(TRIM(BOTH FROM "note")) <= 500)))
);


--
-- Name: pay_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pay_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "calc" "text" NOT NULL,
    "percent_of" "text",
    "count_source" "text",
    "threshold" numeric(8,2) DEFAULT 0 NOT NULL,
    "default_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "role" "text",
    "taxable" boolean DEFAULT true NOT NULL,
    "pf_wage" boolean DEFAULT false NOT NULL,
    "esi_wage" boolean DEFAULT true NOT NULL,
    "prorate" boolean DEFAULT true NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pay_items_calc_check" CHECK (("calc" = ANY (ARRAY['fixed'::"text", 'percent'::"text", 'rate_count'::"text"]))),
    CONSTRAINT "pay_items_check" CHECK ((("calc" <> 'percent'::"text") OR ("percent_of" IS NOT NULL))),
    CONSTRAINT "pay_items_check1" CHECK ((("calc" <> 'rate_count'::"text") OR ("count_source" IS NOT NULL))),
    CONSTRAINT "pay_items_code_check" CHECK (("code" ~ '^[A-Z0-9_]{1,16}$'::"text")),
    CONSTRAINT "pay_items_count_source_check" CHECK (("count_source" = ANY (ARRAY['sessions'::"text", 'duties'::"text", 'duty_hours'::"text", 'invigilation'::"text", 'event_duty'::"text", 'covers'::"text", 'lessons'::"text"]))),
    CONSTRAINT "pay_items_default_value_check" CHECK (("default_value" >= (0)::numeric)),
    CONSTRAINT "pay_items_kind_check" CHECK (("kind" = ANY (ARRAY['earning'::"text", 'deduction'::"text"]))),
    CONSTRAINT "pay_items_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60))),
    CONSTRAINT "pay_items_percent_of_check" CHECK (("percent_of" = ANY (ARRAY['basic'::"text", 'basic_da'::"text", 'gross'::"text"]))),
    CONSTRAINT "pay_items_role_check" CHECK (("role" = ANY (ARRAY['basic'::"text", 'da'::"text", 'hra'::"text"]))),
    CONSTRAINT "pay_items_threshold_check" CHECK (("threshold" >= (0)::numeric))
);


--
-- Name: pay_run_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pay_run_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "person" "jsonb" NOT NULL,
    "days" "jsonb" NOT NULL,
    "earnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "deductions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "employer" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tax" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "gross" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_deductions" numeric(12,2) DEFAULT 0 NOT NULL,
    "net" numeric(12,2) DEFAULT 0 NOT NULL,
    "on_hold" boolean DEFAULT false NOT NULL,
    "pay_mode" "text" DEFAULT 'bank'::"text" NOT NULL,
    "flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


--
-- Name: pay_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pay_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'regular'::"text" NOT NULL,
    "month" "date" NOT NULL,
    "staff_member_id" "uuid",
    "exit_id" "uuid",
    "inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "totals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "computed_at" timestamp with time zone,
    "computed_by" "uuid",
    "submitted_by" "uuid",
    "submitted_at" timestamp with time zone,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pay_runs_check" CHECK ((("kind" = 'settlement'::"text") = ("staff_member_id" IS NOT NULL))),
    CONSTRAINT "pay_runs_check1" CHECK ((("kind" <> 'settlement'::"text") OR ("exit_id" IS NOT NULL) OR ("status" = 'approved'::"text"))),
    CONSTRAINT "pay_runs_check2" CHECK ((("status" <> 'approved'::"text") OR (("approved_by" IS NOT NULL) AND ("submitted_by" IS NOT NULL)))),
    CONSTRAINT "pay_runs_check3" CHECK ((("status" <> 'approved'::"text") OR ("approved_by" <> "submitted_by"))),
    CONSTRAINT "pay_runs_inputs_check" CHECK (("jsonb_typeof"("inputs") = 'object'::"text")),
    CONSTRAINT "pay_runs_kind_check" CHECK (("kind" = ANY (ARRAY['regular'::"text", 'settlement'::"text"]))),
    CONSTRAINT "pay_runs_month_check" CHECK ((EXTRACT(day FROM "month") = (1)::numeric)),
    CONSTRAINT "pay_runs_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "pay_runs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text"])))
);


--
-- Name: payroll_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."payroll_settings" (
    "school_id" "uuid" NOT NULL,
    "day_basis" "text" DEFAULT 'calendar'::"text" NOT NULL,
    "pf_enabled" boolean DEFAULT false NOT NULL,
    "pf_policy" "text" DEFAULT 'capped'::"text" NOT NULL,
    "pf_code" "text",
    "esi_enabled" boolean DEFAULT false NOT NULL,
    "esi_code" "text",
    "pt_state" "text",
    "tds_enabled" boolean DEFAULT true NOT NULL,
    "tan" "text",
    "employer_pan" "text",
    "bonus_enabled" boolean DEFAULT false NOT NULL,
    "bonus_month" smallint DEFAULT 10 NOT NULL,
    "gratuity_enabled" boolean DEFAULT true NOT NULL,
    "encash_types" "text"[] DEFAULT '{earned}'::"text"[] NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_settings_bonus_month_check" CHECK ((("bonus_month" >= 1) AND ("bonus_month" <= 12))),
    CONSTRAINT "payroll_settings_day_basis_check" CHECK (("day_basis" = ANY (ARRAY['calendar'::"text", 'fixed30'::"text", 'working26'::"text"]))),
    CONSTRAINT "payroll_settings_employer_pan_check" CHECK (("employer_pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::"text")),
    CONSTRAINT "payroll_settings_esi_code_check" CHECK (("length"("esi_code") <= 40)),
    CONSTRAINT "payroll_settings_pf_code_check" CHECK (("length"("pf_code") <= 40)),
    CONSTRAINT "payroll_settings_pf_policy_check" CHECK (("pf_policy" = ANY (ARRAY['capped'::"text", 'full'::"text"]))),
    CONSTRAINT "payroll_settings_pt_state_check" CHECK (("pt_state" ~ '^[A-Z]{2}$'::"text")),
    CONSTRAINT "payroll_settings_tan_check" CHECK (("tan" ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'::"text"))
);


--
-- Name: platform_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."platform_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_config_key_check" CHECK ((("key" ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'::"text") AND ("length"("key") <= 64)))
);


--
-- Name: TABLE "platform_config"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."platform_config" IS 'Operator overrides of code-defined platform settings (src/lib/settings/registry.ts). Service role only.';


--
-- Name: practical_assessment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."practical_assessment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "sheet_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "parts" "jsonb" NOT NULL,
    "total" numeric(5,1) NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "practical_assessment_class_check" CHECK ((("char_length"("class") >= 1) AND ("char_length"("class") <= 40))),
    CONSTRAINT "practical_assessment_parts_check" CHECK (("jsonb_typeof"("parts") = 'object'::"text")),
    CONSTRAINT "practical_assessment_subject_check" CHECK ((("char_length"("subject") >= 1) AND ("char_length"("subject") <= 60))),
    CONSTRAINT "practical_assessment_total_check" CHECK ((("total" >= (0)::numeric) AND ("total" <= (100)::numeric)))
);


--
-- Name: practical_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."practical_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "practical" "text" NOT NULL,
    "done_on" "date",
    "record" "text" DEFAULT 'none'::"text" NOT NULL,
    "viva" smallint,
    "note" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "practical_progress_class_check" CHECK ((("char_length"("class") >= 1) AND ("char_length"("class") <= 40))),
    CONSTRAINT "practical_progress_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300))),
    CONSTRAINT "practical_progress_practical_check" CHECK (("practical" ~ '^[a-z]{1,2}[0-9]{1,2}-[a-z0-9]{2,6}$'::"text")),
    CONSTRAINT "practical_progress_record_check" CHECK (("record" = ANY (ARRAY['none'::"text", 'submitted'::"text", 'checked'::"text"]))),
    CONSTRAINT "practical_progress_subject_check" CHECK ((("char_length"("subject") >= 1) AND ("char_length"("subject") <= 60))),
    CONSTRAINT "practical_progress_viva_check" CHECK ((("viva" IS NULL) OR (("viva" >= 0) AND ("viva" <= 5))))
);


--
-- Name: probe_acks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."probe_acks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "finding_key" "text" NOT NULL,
    "fingerprint" "text" NOT NULL,
    "status" "text" NOT NULL,
    "snooze_until" "date",
    "note" "text",
    "acked_by" "uuid",
    "acked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "probe_acks_check" CHECK ((("status" <> 'snoozed'::"text") OR ("snooze_until" IS NOT NULL))),
    CONSTRAINT "probe_acks_finding_key_check" CHECK (("char_length"("finding_key") <= 200)),
    CONSTRAINT "probe_acks_fingerprint_check" CHECK (("char_length"("fingerprint") <= 200)),
    CONSTRAINT "probe_acks_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "probe_acks_status_check" CHECK (("status" = ANY (ARRAY['acknowledged'::"text", 'snoozed'::"text"])))
);


--
-- Name: proctor_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."proctor_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "student_name" "text",
    "assignment_id" "uuid",
    "assignment_title" "text",
    "switch_count" integer DEFAULT 0 NOT NULL,
    "flagged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "proctor_alerts_switch_count_check" CHECK (("switch_count" >= 0))
);


--
-- Name: qa_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qa_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_id" "uuid",
    "status" "text" DEFAULT 'uploading'::"text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone NOT NULL,
    "machine" "text",
    "git_commit" "text",
    "git_branch" "text",
    "git_dirty" boolean DEFAULT false NOT NULL,
    "target" "text",
    "stages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "totals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "failures" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "files" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "pin_note" "text",
    "files_purged_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "qa_runs_check" CHECK (("finished_at" >= "started_at")),
    CONSTRAINT "qa_runs_failures_check" CHECK (("jsonb_typeof"("failures") = 'array'::"text")),
    CONSTRAINT "qa_runs_files_check" CHECK (("jsonb_typeof"("files") = 'array'::"text")),
    CONSTRAINT "qa_runs_git_branch_check" CHECK (("length"("git_branch") <= 200)),
    CONSTRAINT "qa_runs_git_commit_check" CHECK (("git_commit" ~ '^[0-9a-f]{7,40}$'::"text")),
    CONSTRAINT "qa_runs_machine_check" CHECK (("length"("machine") <= 120)),
    CONSTRAINT "qa_runs_pin_note_check" CHECK (("length"("pin_note") <= 300)),
    CONSTRAINT "qa_runs_stages_check" CHECK (("jsonb_typeof"("stages") = 'array'::"text")),
    CONSTRAINT "qa_runs_status_check" CHECK (("status" = ANY (ARRAY['uploading'::"text", 'pass'::"text", 'fail'::"text"]))),
    CONSTRAINT "qa_runs_target_check" CHECK (("length"("target") <= 300)),
    CONSTRAINT "qa_runs_totals_check" CHECK (("jsonb_typeof"("totals") = 'object'::"text"))
);


--
-- Name: qa_upload_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qa_upload_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "qa_upload_tokens_label_check" CHECK ((("length"(TRIM(BOTH FROM "label")) >= 1) AND ("length"(TRIM(BOTH FROM "label")) <= 80))),
    CONSTRAINT "qa_upload_tokens_token_hash_check" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


--
-- Name: report_card_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."report_card_settings" (
    "school_id" "uuid" NOT NULL,
    "logo" "text",
    "accent" "text" DEFAULT '#002147'::"text" NOT NULL,
    "affiliation" "text",
    "address" "text",
    "signatures" "jsonb" DEFAULT '["Class teacher", "Principal", "Parent"]'::"jsonb" NOT NULL,
    "show" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "hold_on_dues" boolean DEFAULT false NOT NULL,
    "hold_min_amount" numeric(12,2) DEFAULT 1 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "report_card_settings_accent_check" CHECK (("accent" ~ '^#[0-9a-fA-F]{6}$'::"text")),
    CONSTRAINT "report_card_settings_address_check" CHECK (("length"("address") <= 300)),
    CONSTRAINT "report_card_settings_affiliation_check" CHECK (("length"("affiliation") <= 120)),
    CONSTRAINT "report_card_settings_hold_min_amount_check" CHECK (("hold_min_amount" >= (0)::numeric)),
    CONSTRAINT "report_card_settings_logo_check" CHECK ((("logo" IS NULL) OR (("logo" ~ '^data:image/(png|jpeg|webp);base64,'::"text") AND ("length"("logo") <= 400000)))),
    CONSTRAINT "report_card_settings_show_check" CHECK (("jsonb_typeof"("show") = 'object'::"text")),
    CONSTRAINT "report_card_settings_signatures_check" CHECK (("jsonb_typeof"("signatures") = 'array'::"text"))
);


--
-- Name: report_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."report_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "term_id" "uuid" NOT NULL,
    "class_id" "uuid",
    "version" integer NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "revised" boolean DEFAULT false NOT NULL,
    "revision_reason" "text",
    "published_by" "uuid",
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_at" timestamp with time zone,
    "held" boolean DEFAULT false NOT NULL,
    "hold_reason" "text",
    "held_at" timestamp with time zone,
    "released_by" "uuid",
    "released_at" timestamp with time zone,
    CONSTRAINT "report_cards_hold_reason_check" CHECK (("length"("hold_reason") <= 300)),
    CONSTRAINT "report_cards_revision_reason_check" CHECK (("length"("revision_reason") <= 1000)),
    CONSTRAINT "report_cards_snapshot_check" CHECK (("jsonb_typeof"("snapshot") = 'object'::"text")),
    CONSTRAINT "report_cards_version_check" CHECK (("version" >= 1))
);


--
-- Name: request_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."request_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "method" "text" NOT NULL,
    "route" "text" NOT NULL,
    "user_id" "uuid",
    "user_role" "text",
    "school_id" "uuid",
    "duration_ms" integer NOT NULL,
    "release" "text",
    CONSTRAINT "request_log_duration_ms_check" CHECK (("duration_ms" >= 0)),
    CONSTRAINT "request_log_method_check" CHECK (("length"("method") <= 10)),
    CONSTRAINT "request_log_release_check" CHECK ((("release" IS NULL) OR ("length"("release") <= 60))),
    CONSTRAINT "request_log_route_check" CHECK (("length"("route") <= 300)),
    CONSTRAINT "request_log_user_role_check" CHECK ((("user_role" IS NULL) OR ("length"("user_role") <= 30)))
);


--
-- Name: request_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."request_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."request_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."role_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "expires_on" "date",
    "note" "text",
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "role_grants_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 300))),
    CONSTRAINT "role_grants_role_key_check" CHECK (("role_key" = ANY (ARRAY['school_admin'::"text", 'principal'::"text", 'vice_principal'::"text", 'finance_head'::"text", 'accountant'::"text", 'cashier'::"text", 'admissions_officer'::"text", 'hr_manager'::"text", 'academic_coordinator'::"text", 'counsellor'::"text", 'dpo'::"text"])))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."role_permissions" (
    "role_key" "text" NOT NULL,
    "perm" "text" NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'classroom'::"text" NOT NULL,
    "capacity" integer,
    "home_class" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rooms_capacity_check" CHECK ((("capacity" >= 1) AND ("capacity" <= 5000))),
    CONSTRAINT "rooms_kind_check" CHECK (("kind" = ANY (ARRAY['classroom'::"text", 'lab'::"text", 'hall'::"text", 'library'::"text", 'ground'::"text", 'other'::"text"]))),
    CONSTRAINT "rooms_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60)))
);


--
-- Name: salary_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."salary_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "grade_id" "uuid",
    "name" "text" NOT NULL,
    "lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "salary_templates_lines_check" CHECK ((("jsonb_typeof"("lines") = 'array'::"text") AND ("jsonb_array_length"("lines") <= 60))),
    CONSTRAINT "salary_templates_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80)))
);


--
-- Name: sched_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sched_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "class" "text" NOT NULL,
    "class_key" "text" GENERATED ALWAYS AS ("app"."norm_class"("class")) STORED,
    "subject" "text" NOT NULL,
    "group_label" "text" DEFAULT ''::"text" NOT NULL,
    "teacher_id" "uuid",
    "staff_member_id" "uuid",
    "periods_per_week" smallint NOT NULL,
    "doubles" smallint DEFAULT 0 NOT NULL,
    "room_kind" "text",
    "room_id" "uuid",
    "max_per_day" smallint DEFAULT 1 NOT NULL,
    "combined_key" "text",
    "notes" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sched_requirements_check" CHECK ((("doubles" >= 0) AND (("doubles" * 2) <= "periods_per_week"))),
    CONSTRAINT "sched_requirements_class_check" CHECK ((("length"("class") >= 1) AND ("length"("class") <= 40))),
    CONSTRAINT "sched_requirements_combined_key_check" CHECK ((("combined_key" IS NULL) OR (("length"("combined_key") >= 1) AND ("length"("combined_key") <= 40)))),
    CONSTRAINT "sched_requirements_group_label_check" CHECK (("length"("group_label") <= 40)),
    CONSTRAINT "sched_requirements_max_per_day_check" CHECK ((("max_per_day" >= 1) AND ("max_per_day" <= 4))),
    CONSTRAINT "sched_requirements_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 500))),
    CONSTRAINT "sched_requirements_one_teacher" CHECK ((("teacher_id" IS NULL) OR ("staff_member_id" IS NULL))),
    CONSTRAINT "sched_requirements_periods_per_week_check" CHECK ((("periods_per_week" >= 1) AND ("periods_per_week" <= 20))),
    CONSTRAINT "sched_requirements_room_kind_check" CHECK ((("room_kind" IS NULL) OR ("room_kind" = ANY (ARRAY['classroom'::"text", 'lab'::"text", 'hall'::"text", 'library'::"text", 'ground'::"text", 'other'::"text"])))),
    CONSTRAINT "sched_requirements_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "sched_requirements_subject_check" CHECK ((("length"("subject") >= 1) AND ("length"("subject") <= 80)))
);


--
-- Name: sched_solver_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sched_solver_settings" (
    "school_id" "uuid" NOT NULL,
    "default_target_per_week" smallint DEFAULT 30 NOT NULL,
    "default_max_per_day" smallint DEFAULT 7 NOT NULL,
    "default_max_consecutive" smallint DEFAULT 4 NOT NULL,
    "class_teacher_first" boolean DEFAULT true NOT NULL,
    "subject_spread" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sched_solver_settings_default_max_consecutive_check" CHECK ((("default_max_consecutive" >= 1) AND ("default_max_consecutive" <= 12))),
    CONSTRAINT "sched_solver_settings_default_max_per_day_check" CHECK ((("default_max_per_day" >= 1) AND ("default_max_per_day" <= 12))),
    CONSTRAINT "sched_solver_settings_default_target_per_week_check" CHECK ((("default_target_per_week" >= 1) AND ("default_target_per_week" <= 60)))
);


--
-- Name: sched_wings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sched_wings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "grade_from" smallint NOT NULL,
    "grade_to" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sched_wings_check" CHECK (("grade_to" >= "grade_from")),
    CONSTRAINT "sched_wings_grade_from_check" CHECK ((("grade_from" >= 0) AND ("grade_from" <= 12))),
    CONSTRAINT "sched_wings_grade_to_check" CHECK ((("grade_to" >= 0) AND ("grade_to" <= 12))),
    CONSTRAINT "sched_wings_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60)))
);


--
-- Name: school_filings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."school_filings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "session" "text" NOT NULL,
    "due_on" "date",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot" "jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "filed_by" "uuid",
    "filed_at" timestamp with time zone,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "school_filings_check" CHECK ((("status" = 'draft'::"text") OR (("filed_at" IS NOT NULL) AND ("snapshot" IS NOT NULL)))),
    CONSTRAINT "school_filings_data_check" CHECK (("jsonb_typeof"("data") = 'object'::"text")),
    CONSTRAINT "school_filings_kind_check" CHECK (("kind" = 'cbse_wellness'::"text")),
    CONSTRAINT "school_filings_session_check" CHECK (("session" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "school_filings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'filed'::"text"])))
);


--
-- Name: school_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."school_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_role" "text" NOT NULL,
    "body" "text" NOT NULL,
    "channel" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "school_messages_body_check" CHECK ((("length"("body") >= 1) AND ("length"("body") <= 4000))),
    CONSTRAINT "school_messages_channel_check" CHECK (("channel" = ANY (ARRAY['web'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "school_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['parent'::"text", 'teacher'::"text", 'admin'::"text"])))
);


--
-- Name: school_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."school_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "audience" "text" DEFAULT 'teacher'::"text" NOT NULL,
    "subject" "text" NOT NULL,
    "topic" "text" DEFAULT 'general'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_read_at" timestamp with time zone,
    "staff_read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "school_threads_audience_check" CHECK (("audience" = ANY (ARRAY['teacher'::"text", 'office'::"text"]))),
    CONSTRAINT "school_threads_check" CHECK ((("audience" = 'office'::"text") = ("staff_id" IS NULL))),
    CONSTRAINT "school_threads_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"]))),
    CONSTRAINT "school_threads_subject_check" CHECK ((("length"("subject") >= 1) AND ("length"("subject") <= 160))),
    CONSTRAINT "school_threads_topic_check" CHECK (("topic" = ANY (ARRAY['general'::"text", 'academics'::"text", 'homework'::"text", 'wellbeing'::"text", 'fees'::"text", 'meeting'::"text", 'leave'::"text"])))
);


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "institution_type" "text" DEFAULT 'school'::"text",
    "trial_expires_at" timestamp with time zone,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: settings_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."settings_changes" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "scope" "text" NOT NULL,
    "school_id" "uuid",
    "key" "text" NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "reason" "text" NOT NULL,
    CONSTRAINT "settings_changes_check" CHECK ((("scope" = 'school'::"text") OR ("school_id" IS NULL))),
    CONSTRAINT "settings_changes_key_check" CHECK ((("length"("key") >= 1) AND ("length"("key") <= 64))),
    CONSTRAINT "settings_changes_reason_check" CHECK ((("length"("btrim"("reason")) >= 4) AND ("length"("btrim"("reason")) <= 500))),
    CONSTRAINT "settings_changes_scope_check" CHECK (("scope" = ANY (ARRAY['platform'::"text", 'school'::"text"])))
);


--
-- Name: TABLE "settings_changes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."settings_changes" IS 'Append-only journal of operator settings changes (platform and per school). Service role only.';


--
-- Name: settings_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."settings_changes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."settings_changes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shift_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."shift_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "on_date" "date" NOT NULL,
    "kind" "text" NOT NULL,
    "shift_id" "uuid",
    "swap_group" "uuid",
    "reason" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shift_overrides_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "shift_overrides_check1" CHECK ((("kind" <> 'shift'::"text") OR ("shift_id" IS NOT NULL))),
    CONSTRAINT "shift_overrides_kind_check" CHECK (("kind" = ANY (ARRAY['shift'::"text", 'off'::"text", 'work'::"text"]))),
    CONSTRAINT "shift_overrides_reason_check" CHECK ((("length"(TRIM(BOTH FROM "reason")) >= 1) AND ("length"(TRIM(BOTH FROM "reason")) <= 300)))
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "starts_at" time without time zone NOT NULL,
    "ends_at" time without time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shifts_check" CHECK (("ends_at" <> "starts_at")),
    CONSTRAINT "shifts_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 60)))
);


--
-- Name: situations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."situations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "teacher_id" "uuid",
    "type" "text",
    "message" "text",
    "student_name" "text",
    "student_id" "uuid",
    "acknowledged" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text" NOT NULL,
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "class_name" "text",
    "subject" "text",
    "audience" "text" DEFAULT 'staff'::"text" NOT NULL,
    "source_table" "text",
    "source_id" "uuid",
    "dedupe_key" "text",
    "acknowledged_by" "uuid",
    "acknowledged_at" timestamp with time zone,
    "ack_by_name" "text",
    "ack_note" "text",
    "escalate_at" timestamp with time zone,
    "escalated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "situations_ack_note_len" CHECK ((("ack_note" IS NULL) OR ("length"("ack_note") <= 500))),
    CONSTRAINT "situations_audience_chk" CHECK (("audience" = ANY (ARRAY['staff'::"text", 'principal'::"text", 'safeguarding'::"text"]))),
    CONSTRAINT "situations_category_chk" CHECK (("category" = ANY (ARRAY['academic'::"text", 'wellness'::"text", 'attendance'::"text", 'incident'::"text", 'security'::"text"]))),
    CONSTRAINT "situations_severity_chk" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'normal'::"text"])))
);


--
-- Name: staff_absences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_absences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "on_date" "date" NOT NULL,
    "kind" "text" DEFAULT 'absent'::"text" NOT NULL,
    "portion" "text" DEFAULT 'full'::"text" NOT NULL,
    "period_nos" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "source" "text" DEFAULT 'office'::"text" NOT NULL,
    "created_by" "uuid",
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_absences_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "staff_absences_check1" CHECK ((("portion" <> 'periods'::"text") OR ("cardinality"("period_nos") > 0))),
    CONSTRAINT "staff_absences_check2" CHECK ((("kind" <> 'release'::"text") OR ("portion" = 'periods'::"text"))),
    CONSTRAINT "staff_absences_kind_check" CHECK (("kind" = ANY (ARRAY['absent'::"text", 'release'::"text"]))),
    CONSTRAINT "staff_absences_period_nos_check" CHECK (("period_nos" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint])),
    CONSTRAINT "staff_absences_portion_check" CHECK (("portion" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text", 'periods'::"text"]))),
    CONSTRAINT "staff_absences_reason_check" CHECK (("length"("reason") <= 500)),
    CONSTRAINT "staff_absences_source_check" CHECK (("source" = ANY (ARRAY['office'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "staff_absences_status_check" CHECK (("status" = ANY (ARRAY['reported'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


--
-- Name: staff_day_marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_day_marks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "on_date" "date" NOT NULL,
    "status" "text" NOT NULL,
    "in_at" time without time zone,
    "out_at" time without time zone,
    "source" "text" NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_day_marks_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "staff_day_marks_check1" CHECK ((("source" <> 'override'::"text") OR ("length"(TRIM(BOTH FROM COALESCE("reason", ''::"text"))) > 0))),
    CONSTRAINT "staff_day_marks_reason_check" CHECK (("length"("reason") <= 300)),
    CONSTRAINT "staff_day_marks_source_check" CHECK (("source" = ANY (ARRAY['register'::"text", 'override'::"text"]))),
    CONSTRAINT "staff_day_marks_status_check" CHECK (("status" = ANY (ARRAY['present'::"text", 'absent'::"text", 'half_day'::"text", 'off'::"text"])))
);


--
-- Name: staff_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "issued_on" "date",
    "expires_on" "date",
    "storage_path" "text",
    "file_name" "text",
    "mime" "text",
    "size_bytes" integer,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_documents_check" CHECK ((("issued_on" IS NULL) OR ("expires_on" IS NULL) OR ("expires_on" >= "issued_on"))),
    CONSTRAINT "staff_documents_file_name_check" CHECK (("length"("file_name") <= 200)),
    CONSTRAINT "staff_documents_kind_check" CHECK (("kind" = ANY (ARRAY['photo'::"text", 'id_proof'::"text", 'address_proof'::"text", 'qualification'::"text", 'experience'::"text", 'appointment_letter'::"text", 'contract'::"text", 'police_verification'::"text", 'driving_licence'::"text", 'medical_fitness'::"text", 'bank_proof'::"text", 'other'::"text"]))),
    CONSTRAINT "staff_documents_mime_check" CHECK (("length"("mime") <= 100)),
    CONSTRAINT "staff_documents_size_bytes_check" CHECK (("size_bytes" >= 0)),
    CONSTRAINT "staff_documents_title_check" CHECK ((("length"(TRIM(BOTH FROM "title")) >= 1) AND ("length"(TRIM(BOTH FROM "title")) <= 120)))
);


--
-- Name: staff_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "on_date" "date" NOT NULL,
    "note" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_events_kind_check" CHECK (("kind" = ANY (ARRAY['probation_set'::"text", 'probation_extended'::"text", 'confirmed'::"text", 'exit_started'::"text", 'exit_withdrawn'::"text", 'exited'::"text", 'rehired'::"text"]))),
    CONSTRAINT "staff_events_note_check" CHECK (("length"("note") <= 1000))
);


--
-- Name: staff_exits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_exits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "notice_on" "date" NOT NULL,
    "last_day" "date" NOT NULL,
    "reason" "text",
    "checklist" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'notice'::"text" NOT NULL,
    "login_flagged_at" timestamp with time zone,
    "closed_by" "uuid",
    "closed_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_exits_check" CHECK (("last_day" >= "notice_on")),
    CONSTRAINT "staff_exits_checklist_check" CHECK ((("jsonb_typeof"("checklist") = 'array'::"text") AND ("jsonb_array_length"("checklist") <= 40))),
    CONSTRAINT "staff_exits_kind_check" CHECK (("kind" = ANY (ARRAY['resignation'::"text", 'termination'::"text", 'retirement'::"text", 'contract_end'::"text", 'absconding'::"text", 'death'::"text"]))),
    CONSTRAINT "staff_exits_reason_check" CHECK (("length"("reason") <= 1000)),
    CONSTRAINT "staff_exits_status_check" CHECK (("status" = ANY (ARRAY['notice'::"text", 'completed'::"text", 'withdrawn'::"text"])))
);


--
-- Name: staff_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "effective_from" "date" NOT NULL,
    "action" "text" NOT NULL,
    "designation" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" NOT NULL,
    "department_id" "uuid",
    "grade_id" "uuid",
    "manager_id" "uuid",
    "employment" "text" DEFAULT 'permanent'::"text" NOT NULL,
    "contract_from" "date",
    "contract_to" "date",
    "reason" "text",
    "authority" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_jobs_action_check" CHECK (("action" = ANY (ARRAY['hire'::"text", 'redesignation'::"text", 'transfer'::"text", 'promotion'::"text", 'employment_change'::"text", 'renewal'::"text", 'rehire'::"text", 'correction'::"text"]))),
    CONSTRAINT "staff_jobs_authority_check" CHECK (("length"("authority") <= 120)),
    CONSTRAINT "staff_jobs_category_check" CHECK (("category" = ANY (ARRAY['teaching'::"text", 'office'::"text", 'support'::"text", 'assistant'::"text"]))),
    CONSTRAINT "staff_jobs_check" CHECK ((("manager_id" IS NULL) OR ("manager_id" <> "staff_member_id"))),
    CONSTRAINT "staff_jobs_check1" CHECK ((("contract_from" IS NULL) OR ("contract_to" IS NULL) OR ("contract_to" >= "contract_from"))),
    CONSTRAINT "staff_jobs_designation_check" CHECK (("length"("designation") <= 80)),
    CONSTRAINT "staff_jobs_employment_check" CHECK (("employment" = ANY (ARRAY['permanent'::"text", 'contract'::"text", 'visiting'::"text"]))),
    CONSTRAINT "staff_jobs_reason_check" CHECK (("length"("reason") <= 500))
);


--
-- Name: staff_loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_loans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "principal" numeric(12,2) NOT NULL,
    "issued_on" "date" NOT NULL,
    "instalment" numeric(12,2) NOT NULL,
    "start_month" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "staff_loans_instalment_check" CHECK (("instalment" > (0)::numeric)),
    CONSTRAINT "staff_loans_kind_check" CHECK (("kind" = ANY (ARRAY['advance'::"text", 'loan'::"text"]))),
    CONSTRAINT "staff_loans_note_check" CHECK (("length"("note") <= 500)),
    CONSTRAINT "staff_loans_principal_check" CHECK (("principal" > (0)::numeric)),
    CONSTRAINT "staff_loans_start_month_check" CHECK ((EXTRACT(day FROM "start_month") = (1)::numeric)),
    CONSTRAINT "staff_loans_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'written_off'::"text"])))
);


--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "designation" "text" DEFAULT ''::"text" NOT NULL,
    "wing_id" "uuid",
    "phone_e164" "text",
    "employee_code" "text",
    "joined_on" "date",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employment" "text" DEFAULT 'permanent'::"text" NOT NULL,
    "contract_from" "date",
    "contract_to" "date",
    "whatsapp_opt_in" boolean DEFAULT false NOT NULL,
    "department_id" "uuid",
    "grade_id" "uuid",
    "manager_id" "uuid",
    "probation_until" "date",
    "confirmed_on" "date",
    "exit_on" "date",
    CONSTRAINT "staff_members_category_check" CHECK (("category" = ANY (ARRAY['teaching'::"text", 'office'::"text", 'support'::"text", 'assistant'::"text"]))),
    CONSTRAINT "staff_members_contract_check" CHECK ((("contract_to" IS NULL) OR ("contract_from" IS NULL) OR ("contract_to" >= "contract_from"))),
    CONSTRAINT "staff_members_designation_check" CHECK (("length"("designation") <= 80)),
    CONSTRAINT "staff_members_employee_code_check" CHECK (("length"("employee_code") <= 40)),
    CONSTRAINT "staff_members_employment_check" CHECK (("employment" = ANY (ARRAY['permanent'::"text", 'contract'::"text", 'visiting'::"text"]))),
    CONSTRAINT "staff_members_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "staff_members_not_own_manager" CHECK ((("manager_id" IS NULL) OR ("manager_id" <> "id"))),
    CONSTRAINT "staff_members_phone_e164_check" CHECK (("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'::"text"))
);


--
-- Name: staff_noshow_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_noshow_alerts" (
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "on_date" "date" NOT NULL,
    "alerted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: staff_pay_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_pay_settings" (
    "staff_member_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "tax_regime" "text" DEFAULT 'new'::"text" NOT NULL,
    "pf_mode" "text" DEFAULT 'policy'::"text" NOT NULL,
    "vpf_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "esi_exempt" boolean DEFAULT false NOT NULL,
    "pt_exempt" boolean DEFAULT false NOT NULL,
    "tds_exempt" boolean DEFAULT false NOT NULL,
    "pay_mode" "text" DEFAULT 'bank'::"text" NOT NULL,
    "on_hold" boolean DEFAULT false NOT NULL,
    "hold_reason" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_pay_settings_hold_reason_check" CHECK (("length"("hold_reason") <= 300)),
    CONSTRAINT "staff_pay_settings_pay_mode_check" CHECK (("pay_mode" = ANY (ARRAY['bank'::"text", 'cash'::"text", 'cheque'::"text"]))),
    CONSTRAINT "staff_pay_settings_pf_mode_check" CHECK (("pf_mode" = ANY (ARRAY['policy'::"text", 'exempt'::"text", 'capped'::"text", 'full'::"text"]))),
    CONSTRAINT "staff_pay_settings_tax_regime_check" CHECK (("tax_regime" = ANY (ARRAY['new'::"text", 'old'::"text"]))),
    CONSTRAINT "staff_pay_settings_vpf_pct_check" CHECK ((("vpf_pct" >= (0)::numeric) AND ("vpf_pct" <= (88)::numeric)))
);


--
-- Name: staff_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_profiles" (
    "staff_member_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "date_of_birth" "date",
    "gender" "text",
    "blood_group" "text",
    "marital_status" "text",
    "kin_name" "text",
    "personal_email" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "pincode" "text",
    "emergency_name" "text",
    "emergency_relation" "text",
    "emergency_phone" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_profiles_address_check" CHECK (("length"("address") <= 400)),
    CONSTRAINT "staff_profiles_blood_group_check" CHECK (("blood_group" = ANY (ARRAY['A+'::"text", 'A-'::"text", 'B+'::"text", 'B-'::"text", 'AB+'::"text", 'AB-'::"text", 'O+'::"text", 'O-'::"text"]))),
    CONSTRAINT "staff_profiles_city_check" CHECK (("length"("city") <= 80)),
    CONSTRAINT "staff_profiles_emergency_name_check" CHECK (("length"("emergency_name") <= 120)),
    CONSTRAINT "staff_profiles_emergency_phone_check" CHECK (("emergency_phone" ~ '^\+[1-9][0-9]{7,14}$'::"text")),
    CONSTRAINT "staff_profiles_emergency_relation_check" CHECK (("length"("emergency_relation") <= 60)),
    CONSTRAINT "staff_profiles_gender_check" CHECK (("gender" = ANY (ARRAY['female'::"text", 'male'::"text", 'other'::"text"]))),
    CONSTRAINT "staff_profiles_kin_name_check" CHECK (("length"("kin_name") <= 120)),
    CONSTRAINT "staff_profiles_marital_status_check" CHECK (("marital_status" = ANY (ARRAY['single'::"text", 'married'::"text", 'widowed'::"text", 'divorced'::"text"]))),
    CONSTRAINT "staff_profiles_personal_email_check" CHECK (("length"("personal_email") <= 200)),
    CONSTRAINT "staff_profiles_pincode_check" CHECK (("pincode" ~ '^[1-9][0-9]{5}$'::"text")),
    CONSTRAINT "staff_profiles_state_check" CHECK (("length"("state") <= 80))
);


--
-- Name: staff_punches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_punches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "at" timestamp with time zone NOT NULL,
    "direction" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "on_campus" boolean,
    "device_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_punches_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "staff_punches_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text", 'unknown'::"text"]))),
    CONSTRAINT "staff_punches_source_check" CHECK (("source" = ANY (ARRAY['biometric'::"text", 'app'::"text", 'whatsapp'::"text"])))
);


--
-- Name: staff_qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_qualifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "institution" "text",
    "year" smallint,
    "result" "text",
    "verified_on" "date",
    "verified_by" "uuid",
    "document_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_qualifications_institution_check" CHECK (("length"("institution") <= 160)),
    CONSTRAINT "staff_qualifications_kind_check" CHECK (("kind" = ANY (ARRAY['school'::"text", 'diploma'::"text", 'graduate'::"text", 'postgraduate'::"text", 'doctorate'::"text", 'd_el_ed'::"text", 'b_ed'::"text", 'm_ed'::"text", 'ctet'::"text", 'state_tet'::"text", 'net_set'::"text", 'certificate'::"text", 'other'::"text"]))),
    CONSTRAINT "staff_qualifications_result_check" CHECK (("length"("result") <= 60)),
    CONSTRAINT "staff_qualifications_title_check" CHECK ((("length"(TRIM(BOTH FROM "title")) >= 1) AND ("length"(TRIM(BOTH FROM "title")) <= 120))),
    CONSTRAINT "staff_qualifications_year_check" CHECK ((("year" >= 1950) AND ("year" <= 2100)))
);


--
-- Name: staff_salaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_salaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "effective_from" "date" NOT NULL,
    "template_id" "uuid",
    "lines" "jsonb" NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_salaries_lines_check" CHECK ((("jsonb_typeof"("lines") = 'array'::"text") AND (("jsonb_array_length"("lines") >= 1) AND ("jsonb_array_length"("lines") <= 60)))),
    CONSTRAINT "staff_salaries_reason_check" CHECK (("length"("reason") <= 500))
);


--
-- Name: staff_shift_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_shift_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "mode" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "shift_id" "uuid",
    "rotation" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "off_mode" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "off_days" smallint[] DEFAULT '{7}'::smallint[] NOT NULL,
    "off_cycle" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "anchor_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "works_holidays" boolean DEFAULT false NOT NULL,
    "rules_exempt" boolean DEFAULT false NOT NULL,
    "grace_min" smallint,
    "note" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_shift_plans_check" CHECK (("num_nonnulls"("user_id", "staff_member_id") = 1)),
    CONSTRAINT "staff_shift_plans_check1" CHECK ((("mode" <> 'fixed'::"text") OR ("shift_id" IS NOT NULL))),
    CONSTRAINT "staff_shift_plans_check2" CHECK ((("mode" <> 'rotating'::"text") OR ("cardinality"("rotation") > 0))),
    CONSTRAINT "staff_shift_plans_check3" CHECK ((("off_mode" <> 'rotating'::"text") OR ("cardinality"("off_cycle") > 0))),
    CONSTRAINT "staff_shift_plans_check4" CHECK ((("off_days" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND ("off_cycle" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))),
    CONSTRAINT "staff_shift_plans_grace_min_check" CHECK ((("grace_min" >= 0) AND ("grace_min" <= 120))),
    CONSTRAINT "staff_shift_plans_mode_check" CHECK (("mode" = ANY (ARRAY['fixed'::"text", 'rotating'::"text"]))),
    CONSTRAINT "staff_shift_plans_note_check" CHECK (("length"("note") <= 500)),
    CONSTRAINT "staff_shift_plans_off_mode_check" CHECK (("off_mode" = ANY (ARRAY['fixed'::"text", 'rotating'::"text", 'none'::"text"])))
);


--
-- Name: staff_statutory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."staff_statutory" (
    "staff_member_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "pan" "text",
    "uan" "text",
    "esi_no" "text",
    "aadhaar_last4" "text",
    "bank_account" "text",
    "bank_ifsc" "text",
    "bank_name" "text",
    "bank_holder" "text",
    "nominee_name" "text",
    "nominee_relation" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_statutory_aadhaar_last4_check" CHECK (("aadhaar_last4" ~ '^[0-9]{4}$'::"text")),
    CONSTRAINT "staff_statutory_bank_account_check" CHECK (("bank_account" ~ '^[0-9]{6,18}$'::"text")),
    CONSTRAINT "staff_statutory_bank_holder_check" CHECK (("length"("bank_holder") <= 120)),
    CONSTRAINT "staff_statutory_bank_ifsc_check" CHECK (("bank_ifsc" ~ '^[A-Z]{4}0[A-Z0-9]{6}$'::"text")),
    CONSTRAINT "staff_statutory_bank_name_check" CHECK (("length"("bank_name") <= 80)),
    CONSTRAINT "staff_statutory_esi_no_check" CHECK (("esi_no" ~ '^[0-9]{10}$'::"text")),
    CONSTRAINT "staff_statutory_nominee_name_check" CHECK (("length"("nominee_name") <= 120)),
    CONSTRAINT "staff_statutory_nominee_relation_check" CHECK (("length"("nominee_relation") <= 60)),
    CONSTRAINT "staff_statutory_pan_check" CHECK (("pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::"text")),
    CONSTRAINT "staff_statutory_uan_check" CHECK (("uan" ~ '^[0-9]{12}$'::"text"))
);


--
-- Name: statutory_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."statutory_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "effective_from" "date" NOT NULL,
    "value" "jsonb" NOT NULL,
    "reason" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "statutory_overrides_reason_check" CHECK ((("length"(TRIM(BOTH FROM "reason")) >= 1) AND ("length"(TRIM(BOTH FROM "reason")) <= 500))),
    CONSTRAINT "statutory_overrides_value_check" CHECK (("jsonb_typeof"("value") = 'object'::"text"))
);


--
-- Name: statutory_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."statutory_rates" (
    "key" "text" NOT NULL,
    "effective_from" "date" NOT NULL,
    "value" "jsonb" NOT NULL,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "statutory_rates_key_check" CHECK (("key" ~ '^[a-z]+(:[A-Za-z]+)?$'::"text")),
    CONSTRAINT "statutory_rates_note_check" CHECK (("length"("note") <= 500)),
    CONSTRAINT "statutory_rates_value_check" CHECK (("jsonb_typeof"("value") = 'object'::"text"))
);


--
-- Name: student_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."student_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "role" "text",
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "student_chats_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'model'::"text"])))
);


--
-- Name: student_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."student_memory" (
    "student_id" "uuid" NOT NULL,
    "memory" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: student_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."student_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_subject_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_subjects_source_check" CHECK (("source" = ANY (ARRAY['core'::"text", 'elective'::"text"])))
);


--
-- Name: subject_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."subject_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "subject_key" "text" NOT NULL,
    "subject_name" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: submission_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."submission_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "question_index" integer NOT NULL,
    "outcome_code" "text",
    "component_type" "text" DEFAULT 'homework'::"text" NOT NULL,
    "score" numeric(5,2) DEFAULT 0 NOT NULL,
    "max_score" numeric(5,2) DEFAULT 1 NOT NULL,
    "difficulty" "text" DEFAULT 'medium'::"text",
    "hints_used" integer DEFAULT 0,
    "attempts_count" integer DEFAULT 1,
    "teacher_confirmed" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "submission_items_component_type_check" CHECK (("component_type" = ANY (ARRAY['assessment'::"text", 'quiz'::"text", 'homework'::"text", 'retention'::"text", 'classwork'::"text"]))),
    CONSTRAINT "submission_items_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"])))
);


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid",
    "student_id" "uuid",
    "school_id" "uuid",
    "score" numeric,
    "max_score" numeric,
    "grade" "text",
    "final_grade" "text",
    "ai_graded" boolean DEFAULT false,
    "ai_result" "jsonb",
    "teacher_approved" boolean,
    "image_urls" "text"[] DEFAULT '{}'::"text"[],
    "submission_text" "text",
    "answers" "jsonb",
    "type" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "ai_feedback" "text",
    "ai_grade" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "teacher_note" "text"
);


--
-- Name: superadmins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."superadmins" (
    "user_id" "uuid" NOT NULL
);


--
-- Name: syllabus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."syllabus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "teacher_id" "uuid",
    "subject" "text",
    "class" "text",
    "topic" "text",
    "month" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "grade" "text",
    "objectives" "text",
    "publisher" "text" DEFAULT 'NCERT'::"text",
    "unit_id" "text",
    "tags" "text"[],
    "exam_weightage" integer,
    "toughness_level" "text",
    "weightage_score" numeric
);


--
-- Name: syllabus_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."syllabus_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "session" "text" DEFAULT '2026-27'::"text" NOT NULL,
    "chapter_key" "text" NOT NULL,
    "topic" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "taught_on" "date",
    "planned_start" "date",
    "planned_end" "date",
    "note" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "syllabus_progress_check" CHECK ((("planned_end" IS NULL) OR ("planned_start" IS NULL) OR ("planned_end" >= "planned_start"))),
    CONSTRAINT "syllabus_progress_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 2000))),
    CONSTRAINT "syllabus_progress_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'taught'::"text", 'revisit'::"text"])))
);


--
-- Name: tax_declarations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tax_declarations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "fy" "text" NOT NULL,
    "items" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "proofs_verified" boolean DEFAULT false NOT NULL,
    "verified_by" "uuid",
    "verified_at" timestamp with time zone,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tax_declarations_fy_check" CHECK (("fy" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "tax_declarations_items_check" CHECK (("jsonb_typeof"("items") = 'object'::"text"))
);


--
-- Name: teacher_load_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."teacher_load_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "staff_member_id" "uuid",
    "target_per_week" smallint,
    "max_per_day" smallint,
    "max_per_week" smallint,
    "max_consecutive" smallint,
    "unavailable" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teacher_load_rules_max_consecutive_check" CHECK ((("max_consecutive" IS NULL) OR (("max_consecutive" >= 1) AND ("max_consecutive" <= 12)))),
    CONSTRAINT "teacher_load_rules_max_per_day_check" CHECK ((("max_per_day" IS NULL) OR (("max_per_day" >= 1) AND ("max_per_day" <= 12)))),
    CONSTRAINT "teacher_load_rules_max_per_week_check" CHECK ((("max_per_week" IS NULL) OR (("max_per_week" >= 1) AND ("max_per_week" <= 60)))),
    CONSTRAINT "teacher_load_rules_one_person" CHECK ((("user_id" IS NULL) <> ("staff_member_id" IS NULL))),
    CONSTRAINT "teacher_load_rules_target_per_week_check" CHECK ((("target_per_week" IS NULL) OR (("target_per_week" >= 0) AND ("target_per_week" <= 60)))),
    CONSTRAINT "teacher_load_rules_unavailable_check" CHECK ((("jsonb_typeof"("unavailable") = 'array'::"text") AND ("jsonb_array_length"("unavailable") <= 14)))
);


--
-- Name: teacher_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."teacher_subjects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "class_subject_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'subject_teacher'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teacher_subjects_role_check" CHECK (("role" = ANY (ARRAY['subject_teacher'::"text", 'co_teacher'::"text"])))
);


--
-- Name: timetable_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."timetable_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "school_id" "uuid" NOT NULL,
    "class" "text" NOT NULL,
    "class_key" "text" GENERATED ALWAYS AS ("app"."norm_class"("class")) STORED,
    "group_label" "text" DEFAULT ''::"text" NOT NULL,
    "weekday" smallint NOT NULL,
    "period_no" smallint NOT NULL,
    "subject" "text" NOT NULL,
    "teacher_id" "uuid",
    "room_id" "uuid",
    "combined" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "staff_member_id" "uuid",
    "locked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "timetable_slots_class_check" CHECK ((("length"(TRIM(BOTH FROM "class")) >= 1) AND ("length"(TRIM(BOTH FROM "class")) <= 40))),
    CONSTRAINT "timetable_slots_group_label_check" CHECK (("length"("group_label") <= 40)),
    CONSTRAINT "timetable_slots_one_teacher" CHECK ((("teacher_id" IS NULL) OR ("staff_member_id" IS NULL))),
    CONSTRAINT "timetable_slots_period_no_check" CHECK ((("period_no" >= 1) AND ("period_no" <= 16))),
    CONSTRAINT "timetable_slots_subject_check" CHECK ((("length"(TRIM(BOTH FROM "subject")) >= 1) AND ("length"(TRIM(BOTH FROM "subject")) <= 80))),
    CONSTRAINT "timetable_slots_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


--
-- Name: timetable_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."timetable_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "session" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "effective_from" "date",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "published_by" "uuid",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "solver_report" "jsonb",
    CONSTRAINT "timetable_versions_check" CHECK ((("status" <> 'published'::"text") OR (("effective_from" IS NOT NULL) AND ("published_at" IS NOT NULL)))),
    CONSTRAINT "timetable_versions_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "timetable_versions_notes_check" CHECK (("length"("notes") <= 2000)),
    CONSTRAINT "timetable_versions_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'import'::"text", 'copy'::"text", 'solver'::"text"]))),
    CONSTRAINT "timetable_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


--
-- Name: tml_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tml_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "subject" "text" NOT NULL,
    "topic_name" "text" NOT NULL,
    "outcome_code" "text",
    "score" numeric(5,2) NOT NULL,
    "confidence_band" "text" DEFAULT 'provisional'::"text",
    "item_count" integer DEFAULT 0,
    "components" "jsonb" DEFAULT '{}'::"jsonb",
    "computed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tml_scores_confidence_band_check" CHECK (("confidence_band" = ANY (ARRAY['insufficient'::"text", 'provisional'::"text", 'firm'::"text"]))),
    CONSTRAINT "tml_scores_score_check" CHECK ((("score" >= (0)::numeric) AND ("score" <= (100)::numeric)))
);


--
-- Name: tutor_guard_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tutor_guard_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "subject_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tutor_guard_events_kind_check" CHECK (("kind" = ANY (ARRAY['off_topic'::"text", 'profanity'::"text", 'safety'::"text"])))
);


--
-- Name: tutor_session_turns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tutor_session_turns" (
    "sid" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "seq" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tutor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tutor_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "subject" "text",
    "topic" "text",
    "question_id" "text",
    "hint_depth" integer DEFAULT 0,
    "answer_revealed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "subject_key" "text",
    "chapter_key" "text",
    "micro_topic" "text",
    "grounding" "text",
    CONSTRAINT "tutor_sessions_grounding_chk" CHECK ((("grounding" IS NULL) OR ("grounding" = ANY (ARRAY['syllabus'::"text", 'prerequisite'::"text", 'exam'::"text", 'study_skills'::"text"]))))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" "uuid" NOT NULL,
    "school_id" "uuid",
    "name" "text",
    "email" "text",
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "student_class" "text",
    "branch" "text",
    "year" "text",
    "semester" "text",
    "custom_student_id" "text",
    "teacher_class" "text",
    "teacher_subject" "text",
    "assignments" "jsonb" DEFAULT '[]'::"jsonb",
    "teaching_subjects" "jsonb" DEFAULT '[]'::"jsonb",
    "historical_weaknesses" "text"[] DEFAULT '{}'::"text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "memory_profile" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: visit_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."visit_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "school_id" "uuid" NOT NULL,
    "staff_member_id" "uuid" NOT NULL,
    "on_date" "date" NOT NULL,
    "slot_id" "uuid",
    "class" "text",
    "subject" "text",
    "status" "text" NOT NULL,
    "note" "text",
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "visit_sessions_note_check" CHECK (("length"("note") <= 500)),
    CONSTRAINT "visit_sessions_status_check" CHECK (("status" = ANY (ARRAY['taken'::"text", 'missed'::"text"])))
);


--
-- Name: wellness_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."wellness_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "school_id" "uuid",
    "mood" "text",
    "energy" integer,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shared" boolean DEFAULT false NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL
);


--
-- Name: whatsapp_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."whatsapp_links" (
    "user_id" "uuid" NOT NULL,
    "school_id" "uuid",
    "phone_e164" "text" NOT NULL,
    "opted_in" boolean DEFAULT false NOT NULL,
    "verified_at" timestamp with time zone,
    "verified_mode" "text",
    "otp_hash" "text",
    "otp_expires_at" timestamp with time zone,
    "otp_attempts" integer DEFAULT 0 NOT NULL,
    "prefs" "jsonb" DEFAULT '{"fees": true, "alerts": true, "grades": true, "messages": true, "homework_due": true}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_links_phone_e164_check" CHECK (("phone_e164" ~ '^\+[1-9][0-9]{7,14}$'::"text")),
    CONSTRAINT "whatsapp_links_verified_mode_check" CHECK (("verified_mode" = ANY (ARRAY['live'::"text", 'simulated'::"text"])))
);


--
-- Name: whatsapp_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."whatsapp_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "direction" "text" NOT NULL,
    "user_id" "uuid",
    "school_id" "uuid",
    "phone_e164" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" NOT NULL,
    "provider_id" "text",
    "error" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_log_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text"]))),
    CONSTRAINT "whatsapp_log_kind_check" CHECK (("kind" = ANY (ARRAY['ask'::"text", 'answer'::"text", 'notify'::"text", 'otp'::"text", 'message'::"text", 'system'::"text"]))),
    CONSTRAINT "whatsapp_log_status_check" CHECK (("status" = ANY (ARRAY['simulated'::"text", 'sent'::"text", 'failed'::"text", 'received'::"text", 'ignored'::"text"])))
);


--
-- Name: chapters; Type: TABLE; Schema: sandbox_seed; Owner: -
--

CREATE TABLE "sandbox_seed"."chapters" (
    "id" integer DEFAULT 1 NOT NULL,
    "doc" "jsonb" NOT NULL,
    CONSTRAINT "chapters_id_check" CHECK (("id" = 1))
);


--
-- Name: notes; Type: TABLE; Schema: sandbox_seed; Owner: -
--

CREATE TABLE "sandbox_seed"."notes" (
    "k" "text" NOT NULL,
    "v" "text"
);


--
-- Name: academic_events academic_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_events"
    ADD CONSTRAINT "academic_events_pkey" PRIMARY KEY ("id");


--
-- Name: account_requests account_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id");


--
-- Name: admission_applicants admission_applicants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_applicants"
    ADD CONSTRAINT "admission_applicants_pkey" PRIMARY KEY ("id");


--
-- Name: admission_events admission_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_events"
    ADD CONSTRAINT "admission_events_pkey" PRIMARY KEY ("id");


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id");


--
-- Name: app_error_groups app_error_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_error_groups"
    ADD CONSTRAINT "app_error_groups_pkey" PRIMARY KEY ("fingerprint");


--
-- Name: app_errors app_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_errors"
    ADD CONSTRAINT "app_errors_pkey" PRIMARY KEY ("id");


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");


--
-- Name: attendance_devices attendance_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_devices"
    ADD CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id");


--
-- Name: attendance_devices attendance_devices_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_devices"
    ADD CONSTRAINT "attendance_devices_token_hash_key" UNIQUE ("token_hash");


--
-- Name: attendance_month_reviews attendance_month_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_month_reviews"
    ADD CONSTRAINT "attendance_month_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");


--
-- Name: attendance_settings attendance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_settings"
    ADD CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("school_id");


--
-- Name: attendance attendance_student_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_day_key" UNIQUE ("student_id", "day");


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: bell_periods bell_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_periods"
    ADD CONSTRAINT "bell_periods_pkey" PRIMARY KEY ("id");


--
-- Name: bell_periods bell_periods_schedule_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_periods"
    ADD CONSTRAINT "bell_periods_schedule_id_seq_key" UNIQUE ("schedule_id", "seq");


--
-- Name: bell_schedules bell_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_schedules"
    ADD CONSTRAINT "bell_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: class_subjects class_subjects_class_id_subject_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_class_id_subject_key_key" UNIQUE ("class_id", "subject_key");


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id");


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");


--
-- Name: comp_off_grants comp_off_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_pkey" PRIMARY KEY ("id");


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_pkey" PRIMARY KEY ("id");


--
-- Name: consents consents_student_id_consent_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_student_id_consent_type_key" UNIQUE ("student_id", "consent_type");


--
-- Name: course_plans course_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."course_plans"
    ADD CONSTRAINT "course_plans_pkey" PRIMARY KEY ("id");


--
-- Name: course_plans course_plans_school_id_class_subject_session_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."course_plans"
    ADD CONSTRAINT "course_plans_school_id_class_subject_session_key" UNIQUE ("school_id", "class", "subject", "session");


--
-- Name: cover_assignments cover_assignments_on_date_slot_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_on_date_slot_id_key" UNIQUE ("on_date", "slot_id");


--
-- Name: cover_assignments cover_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: doc_counters doc_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."doc_counters"
    ADD CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("school_id", "kind", "session");


--
-- Name: duty_assignments duty_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: duty_posts duty_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_posts"
    ADD CONSTRAINT "duty_posts_pkey" PRIMARY KEY ("id");


--
-- Name: duty_posts duty_posts_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_posts"
    ADD CONSTRAINT "duty_posts_school_id_name_key" UNIQUE ("school_id", "name");


--
-- Name: duty_roster duty_roster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_pkey" PRIMARY KEY ("id");


--
-- Name: engagement_scores engagement_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."engagement_scores"
    ADD CONSTRAINT "engagement_scores_pkey" PRIMARY KEY ("id");


--
-- Name: enquiries enquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id");


--
-- Name: enquiries enquiries_submission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_submission_id_key" UNIQUE ("submission_id");


--
-- Name: exam_assessments exam_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_assessments"
    ADD CONSTRAINT "exam_assessments_pkey" PRIMARY KEY ("id");


--
-- Name: exam_assessments exam_assessments_scheme_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_assessments"
    ADD CONSTRAINT "exam_assessments_scheme_id_code_key" UNIQUE ("scheme_id", "code");


--
-- Name: exam_class_terms exam_class_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_pkey" PRIMARY KEY ("id");


--
-- Name: exam_class_terms exam_class_terms_term_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_term_id_class_id_key" UNIQUE ("term_id", "class_id");


--
-- Name: exam_marks exam_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("id");


--
-- Name: exam_marks exam_marks_sheet_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_sheet_id_student_id_key" UNIQUE ("sheet_id", "student_id");


--
-- Name: exam_schemes exam_schemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_schemes"
    ADD CONSTRAINT "exam_schemes_pkey" PRIMARY KEY ("id");


--
-- Name: exam_sheets exam_sheets_assessment_id_class_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_assessment_id_class_subject_id_key" UNIQUE ("assessment_id", "class_subject_id");


--
-- Name: exam_sheets exam_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_pkey" PRIMARY KEY ("id");


--
-- Name: exam_student_terms exam_student_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_pkey" PRIMARY KEY ("id");


--
-- Name: exam_student_terms exam_student_terms_term_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_term_id_student_id_key" UNIQUE ("term_id", "student_id");


--
-- Name: exam_terms exam_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_terms"
    ADD CONSTRAINT "exam_terms_pkey" PRIMARY KEY ("id");


--
-- Name: exam_terms exam_terms_scheme_id_seq_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_terms"
    ADD CONSTRAINT "exam_terms_scheme_id_seq_key" UNIQUE ("scheme_id", "seq");


--
-- Name: fee_concession_requests fee_concession_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_pkey" PRIMARY KEY ("id");


--
-- Name: fee_day_closes fee_day_closes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_day_closes"
    ADD CONSTRAINT "fee_day_closes_pkey" PRIMARY KEY ("id");


--
-- Name: fee_day_closes fee_day_closes_school_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_day_closes"
    ADD CONSTRAINT "fee_day_closes_school_id_day_key" UNIQUE ("school_id", "day");


--
-- Name: fee_invoices fee_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_pkey" PRIMARY KEY ("id");


--
-- Name: fee_invoices fee_invoices_school_id_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_school_id_invoice_no_key" UNIQUE ("school_id", "invoice_no");


--
-- Name: fee_invoices fee_invoices_student_id_session_instalment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_student_id_session_instalment_no_key" UNIQUE ("student_id", "session", "instalment_no");


--
-- Name: fee_payments fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id");


--
-- Name: fee_payments fee_payments_school_id_receipt_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_school_id_receipt_no_key" UNIQUE ("school_id", "receipt_no");


--
-- Name: fee_reminders fee_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_reminders"
    ADD CONSTRAINT "fee_reminders_pkey" PRIMARY KEY ("id");


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_structures"
    ADD CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id");


--
-- Name: fee_structures fee_structures_school_id_session_grade_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_structures"
    ADD CONSTRAINT "fee_structures_school_id_session_grade_key" UNIQUE ("school_id", "session", "grade");


--
-- Name: guardians guardians_parent_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_parent_id_student_id_key" UNIQUE ("parent_id", "student_id");


--
-- Name: guardians guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_pkey" PRIMARY KEY ("id");


--
-- Name: hr_departments hr_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_departments"
    ADD CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id");


--
-- Name: hr_grades hr_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_grades"
    ADD CONSTRAINT "hr_grades_pkey" PRIMARY KEY ("id");


--
-- Name: hr_posts hr_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_posts"
    ADD CONSTRAINT "hr_posts_pkey" PRIMARY KEY ("id");


--
-- Name: hr_settings hr_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_settings"
    ADD CONSTRAINT "hr_settings_pkey" PRIMARY KEY ("school_id");


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");


--
-- Name: lab_runs lab_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_runs"
    ADD CONSTRAINT "lab_runs_pkey" PRIMARY KEY ("id");


--
-- Name: lab_scenes lab_scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_scenes"
    ADD CONSTRAINT "lab_scenes_pkey" PRIMARY KEY ("id");


--
-- Name: learning_outcomes learning_outcomes_outcome_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_outcome_code_key" UNIQUE ("outcome_code");


--
-- Name: learning_outcomes learning_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_pkey" PRIMARY KEY ("id");


--
-- Name: leave_policies leave_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id");


--
-- Name: leave_policies leave_policies_school_id_session_leave_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_school_id_session_leave_type_key" UNIQUE ("school_id", "session", "leave_type");


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");


--
-- Name: lesson_plans lesson_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id");


--
-- Name: loan_recoveries loan_recoveries_loan_id_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."loan_recoveries"
    ADD CONSTRAINT "loan_recoveries_loan_id_run_id_key" UNIQUE ("loan_id", "run_id");


--
-- Name: loan_recoveries loan_recoveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."loan_recoveries"
    ADD CONSTRAINT "loan_recoveries_pkey" PRIMARY KEY ("id");


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: ops_access_events ops_access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_access_events"
    ADD CONSTRAINT "ops_access_events_pkey" PRIMARY KEY ("id");


--
-- Name: ops_access_grants ops_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_access_grants"
    ADD CONSTRAINT "ops_access_grants_pkey" PRIMARY KEY ("id");


--
-- Name: ops_accounts ops_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_accounts"
    ADD CONSTRAINT "ops_accounts_pkey" PRIMARY KEY ("school_id");


--
-- Name: ops_activities ops_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_activities"
    ADD CONSTRAINT "ops_activities_pkey" PRIMARY KEY ("id");


--
-- Name: ops_campaigns ops_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_campaigns"
    ADD CONSTRAINT "ops_campaigns_pkey" PRIMARY KEY ("id");


--
-- Name: ops_canned_replies ops_canned_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_canned_replies"
    ADD CONSTRAINT "ops_canned_replies_pkey" PRIMARY KEY ("id");


--
-- Name: ops_case_links ops_case_links_case_id_kind_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_links"
    ADD CONSTRAINT "ops_case_links_case_id_kind_ref_key" UNIQUE ("case_id", "kind", "ref");


--
-- Name: ops_case_links ops_case_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_links"
    ADD CONSTRAINT "ops_case_links_pkey" PRIMARY KEY ("id");


--
-- Name: ops_case_messages ops_case_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_messages"
    ADD CONSTRAINT "ops_case_messages_pkey" PRIMARY KEY ("id");


--
-- Name: ops_cases ops_cases_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_number_key" UNIQUE ("number");


--
-- Name: ops_cases ops_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_pkey" PRIMARY KEY ("id");


--
-- Name: ops_commission_rules ops_commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commission_rules"
    ADD CONSTRAINT "ops_commission_rules_pkey" PRIMARY KEY ("key");


--
-- Name: ops_commissions ops_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_pkey" PRIMARY KEY ("id");


--
-- Name: ops_contacts ops_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_contacts"
    ADD CONSTRAINT "ops_contacts_pkey" PRIMARY KEY ("id");


--
-- Name: ops_discount_limits ops_discount_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_discount_limits"
    ADD CONSTRAINT "ops_discount_limits_pkey" PRIMARY KEY ("role");


--
-- Name: ops_documents ops_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_documents"
    ADD CONSTRAINT "ops_documents_pkey" PRIMARY KEY ("id");


--
-- Name: ops_job_runs ops_job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_job_runs"
    ADD CONSTRAINT "ops_job_runs_pkey" PRIMARY KEY ("id");


--
-- Name: ops_marketing_spend ops_marketing_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_pkey" PRIMARY KEY ("id");


--
-- Name: ops_operators ops_operators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_operators"
    ADD CONSTRAINT "ops_operators_pkey" PRIMARY KEY ("user_id");


--
-- Name: ops_opportunities ops_opportunities_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_number_key" UNIQUE ("number");


--
-- Name: ops_opportunities ops_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_pkey" PRIMARY KEY ("id");


--
-- Name: ops_opportunity_events ops_opportunity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunity_events"
    ADD CONSTRAINT "ops_opportunity_events_pkey" PRIMARY KEY ("id");


--
-- Name: ops_opportunity_stages ops_opportunity_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunity_stages"
    ADD CONSTRAINT "ops_opportunity_stages_pkey" PRIMARY KEY ("key");


--
-- Name: ops_partners ops_partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_partners"
    ADD CONSTRAINT "ops_partners_pkey" PRIMARY KEY ("id");


--
-- Name: ops_picklists ops_picklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_picklists"
    ADD CONSTRAINT "ops_picklists_pkey" PRIMARY KEY ("kind", "key");


--
-- Name: ops_quote_approvals ops_quote_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quote_approvals"
    ADD CONSTRAINT "ops_quote_approvals_pkey" PRIMARY KEY ("id");


--
-- Name: ops_quotes ops_quotes_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quotes"
    ADD CONSTRAINT "ops_quotes_number_key" UNIQUE ("number");


--
-- Name: ops_quotes ops_quotes_opportunity_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quotes"
    ADD CONSTRAINT "ops_quotes_opportunity_id_version_key" UNIQUE ("opportunity_id", "version");


--
-- Name: ops_quotes ops_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quotes"
    ADD CONSTRAINT "ops_quotes_pkey" PRIMARY KEY ("id");


--
-- Name: ops_sla_policies ops_sla_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_sla_policies"
    ADD CONSTRAINT "ops_sla_policies_pkey" PRIMARY KEY ("priority");


--
-- Name: ops_tasks ops_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: ops_territories ops_territories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territories"
    ADD CONSTRAINT "ops_territories_pkey" PRIMARY KEY ("id");


--
-- Name: ops_territory_members ops_territory_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territory_members"
    ADD CONSTRAINT "ops_territory_members_pkey" PRIMARY KEY ("territory_id", "operator_id");


--
-- Name: pay_adjustments pay_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_adjustments"
    ADD CONSTRAINT "pay_adjustments_pkey" PRIMARY KEY ("id");


--
-- Name: pay_items pay_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_items"
    ADD CONSTRAINT "pay_items_pkey" PRIMARY KEY ("id");


--
-- Name: pay_items pay_items_school_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_items"
    ADD CONSTRAINT "pay_items_school_id_code_key" UNIQUE ("school_id", "code");


--
-- Name: pay_run_lines pay_run_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_run_lines"
    ADD CONSTRAINT "pay_run_lines_pkey" PRIMARY KEY ("id");


--
-- Name: pay_run_lines pay_run_lines_run_id_staff_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_run_lines"
    ADD CONSTRAINT "pay_run_lines_run_id_staff_member_id_key" UNIQUE ("run_id", "staff_member_id");


--
-- Name: pay_runs pay_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id");


--
-- Name: payroll_settings payroll_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("school_id");


--
-- Name: platform_config platform_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_pkey" PRIMARY KEY ("key");


--
-- Name: practical_assessment practical_assessment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_pkey" PRIMARY KEY ("id");


--
-- Name: practical_assessment practical_assessment_sheet_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_sheet_id_student_id_key" UNIQUE ("sheet_id", "student_id");


--
-- Name: practical_progress practical_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_progress"
    ADD CONSTRAINT "practical_progress_pkey" PRIMARY KEY ("id");


--
-- Name: practical_progress practical_progress_student_id_subject_practical_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_progress"
    ADD CONSTRAINT "practical_progress_student_id_subject_practical_key" UNIQUE ("student_id", "subject", "practical");


--
-- Name: probe_acks probe_acks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."probe_acks"
    ADD CONSTRAINT "probe_acks_pkey" PRIMARY KEY ("id");


--
-- Name: probe_acks probe_acks_school_id_finding_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."probe_acks"
    ADD CONSTRAINT "probe_acks_school_id_finding_key_key" UNIQUE ("school_id", "finding_key");


--
-- Name: proctor_alerts proctor_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."proctor_alerts"
    ADD CONSTRAINT "proctor_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: qa_runs qa_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qa_runs"
    ADD CONSTRAINT "qa_runs_pkey" PRIMARY KEY ("id");


--
-- Name: qa_upload_tokens qa_upload_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qa_upload_tokens"
    ADD CONSTRAINT "qa_upload_tokens_pkey" PRIMARY KEY ("id");


--
-- Name: qa_upload_tokens qa_upload_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qa_upload_tokens"
    ADD CONSTRAINT "qa_upload_tokens_token_hash_key" UNIQUE ("token_hash");


--
-- Name: report_card_settings report_card_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_card_settings"
    ADD CONSTRAINT "report_card_settings_pkey" PRIMARY KEY ("school_id");


--
-- Name: report_cards report_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id");


--
-- Name: report_cards report_cards_student_id_term_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_student_id_term_id_version_key" UNIQUE ("student_id", "term_id", "version");


--
-- Name: request_log request_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."request_log"
    ADD CONSTRAINT "request_log_pkey" PRIMARY KEY ("id");


--
-- Name: role_grants role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_grants"
    ADD CONSTRAINT "role_grants_pkey" PRIMARY KEY ("id");


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_key", "perm");


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");


--
-- Name: rooms rooms_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_school_id_name_key" UNIQUE ("school_id", "name");


--
-- Name: salary_templates salary_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."salary_templates"
    ADD CONSTRAINT "salary_templates_pkey" PRIMARY KEY ("id");


--
-- Name: sched_requirements sched_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_pkey" PRIMARY KEY ("id");


--
-- Name: sched_solver_settings sched_solver_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_solver_settings"
    ADD CONSTRAINT "sched_solver_settings_pkey" PRIMARY KEY ("school_id");


--
-- Name: sched_wings sched_wings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_wings"
    ADD CONSTRAINT "sched_wings_pkey" PRIMARY KEY ("id");


--
-- Name: sched_wings sched_wings_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_wings"
    ADD CONSTRAINT "sched_wings_school_id_name_key" UNIQUE ("school_id", "name");


--
-- Name: school_filings school_filings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_filings"
    ADD CONSTRAINT "school_filings_pkey" PRIMARY KEY ("id");


--
-- Name: school_filings school_filings_school_id_kind_session_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_filings"
    ADD CONSTRAINT "school_filings_school_id_kind_session_key" UNIQUE ("school_id", "kind", "session");


--
-- Name: school_messages school_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_messages"
    ADD CONSTRAINT "school_messages_pkey" PRIMARY KEY ("id");


--
-- Name: school_threads school_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_threads"
    ADD CONSTRAINT "school_threads_pkey" PRIMARY KEY ("id");


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");


--
-- Name: settings_changes settings_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."settings_changes"
    ADD CONSTRAINT "settings_changes_pkey" PRIMARY KEY ("id");


--
-- Name: shift_overrides shift_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_pkey" PRIMARY KEY ("id");


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");


--
-- Name: shifts shifts_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_school_id_name_key" UNIQUE ("school_id", "name");


--
-- Name: situations situations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."situations"
    ADD CONSTRAINT "situations_pkey" PRIMARY KEY ("id");


--
-- Name: staff_absences staff_absences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_pkey" PRIMARY KEY ("id");


--
-- Name: staff_day_marks staff_day_marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_day_marks"
    ADD CONSTRAINT "staff_day_marks_pkey" PRIMARY KEY ("id");


--
-- Name: staff_documents staff_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id");


--
-- Name: staff_events staff_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_events"
    ADD CONSTRAINT "staff_events_pkey" PRIMARY KEY ("id");


--
-- Name: staff_exits staff_exits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_exits"
    ADD CONSTRAINT "staff_exits_pkey" PRIMARY KEY ("id");


--
-- Name: staff_jobs staff_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: staff_jobs staff_jobs_staff_member_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_staff_member_id_effective_from_key" UNIQUE ("staff_member_id", "effective_from");


--
-- Name: staff_loans staff_loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_loans"
    ADD CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id");


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id");


--
-- Name: staff_noshow_alerts staff_noshow_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_noshow_alerts"
    ADD CONSTRAINT "staff_noshow_alerts_pkey" PRIMARY KEY ("user_id", "on_date");


--
-- Name: staff_pay_settings staff_pay_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_pay_settings"
    ADD CONSTRAINT "staff_pay_settings_pkey" PRIMARY KEY ("staff_member_id");


--
-- Name: staff_profiles staff_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("staff_member_id");


--
-- Name: staff_punches staff_punches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_pkey" PRIMARY KEY ("id");


--
-- Name: staff_qualifications staff_qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_pkey" PRIMARY KEY ("id");


--
-- Name: staff_salaries staff_salaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_pkey" PRIMARY KEY ("id");


--
-- Name: staff_salaries staff_salaries_staff_member_id_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_staff_member_id_effective_from_key" UNIQUE ("staff_member_id", "effective_from");


--
-- Name: staff_shift_plans staff_shift_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_pkey" PRIMARY KEY ("id");


--
-- Name: staff_statutory staff_statutory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_statutory"
    ADD CONSTRAINT "staff_statutory_pkey" PRIMARY KEY ("staff_member_id");


--
-- Name: statutory_overrides statutory_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."statutory_overrides"
    ADD CONSTRAINT "statutory_overrides_pkey" PRIMARY KEY ("id");


--
-- Name: statutory_overrides statutory_overrides_school_id_key_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."statutory_overrides"
    ADD CONSTRAINT "statutory_overrides_school_id_key_effective_from_key" UNIQUE ("school_id", "key", "effective_from");


--
-- Name: statutory_rates statutory_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."statutory_rates"
    ADD CONSTRAINT "statutory_rates_pkey" PRIMARY KEY ("key", "effective_from");


--
-- Name: student_chats student_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_chats"
    ADD CONSTRAINT "student_chats_pkey" PRIMARY KEY ("id");


--
-- Name: student_memory student_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_memory"
    ADD CONSTRAINT "student_memory_pkey" PRIMARY KEY ("student_id");


--
-- Name: student_subjects student_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_pkey" PRIMARY KEY ("id");


--
-- Name: student_subjects student_subjects_student_id_class_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_student_id_class_subject_id_key" UNIQUE ("student_id", "class_subject_id");


--
-- Name: subject_leads subject_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subject_leads"
    ADD CONSTRAINT "subject_leads_pkey" PRIMARY KEY ("id");


--
-- Name: subject_leads subject_leads_school_id_subject_key_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subject_leads"
    ADD CONSTRAINT "subject_leads_school_id_subject_key_user_id_key" UNIQUE ("school_id", "subject_key", "user_id");


--
-- Name: submission_items submission_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_pkey" PRIMARY KEY ("id");


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");


--
-- Name: submissions submissions_score_range; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."submissions"
    ADD CONSTRAINT "submissions_score_range" CHECK ((("score" IS NULL) OR (("score" >= (0)::numeric) AND (("max_score" IS NULL) OR ("score" <= "max_score"))))) NOT VALID;


--
-- Name: superadmins superadmins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_pkey" PRIMARY KEY ("user_id");


--
-- Name: syllabus syllabus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus"
    ADD CONSTRAINT "syllabus_pkey" PRIMARY KEY ("id");


--
-- Name: syllabus_progress syllabus_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus_progress"
    ADD CONSTRAINT "syllabus_progress_pkey" PRIMARY KEY ("id");


--
-- Name: syllabus_progress syllabus_progress_school_id_class_subject_session_chapter_k_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus_progress"
    ADD CONSTRAINT "syllabus_progress_school_id_class_subject_session_chapter_k_key" UNIQUE ("school_id", "class", "subject", "session", "chapter_key", "topic");


--
-- Name: syllabus syllabus_unique_topic_month_teacher; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus"
    ADD CONSTRAINT "syllabus_unique_topic_month_teacher" UNIQUE ("teacher_id", "topic", "month", "subject");


--
-- Name: tax_declarations tax_declarations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id");


--
-- Name: tax_declarations tax_declarations_staff_member_id_fy_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_staff_member_id_fy_key" UNIQUE ("staff_member_id", "fy");


--
-- Name: teacher_load_rules teacher_load_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_load_rules"
    ADD CONSTRAINT "teacher_load_rules_pkey" PRIMARY KEY ("id");


--
-- Name: teacher_subjects teacher_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id");


--
-- Name: teacher_subjects teacher_subjects_teacher_id_class_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_teacher_id_class_subject_id_key" UNIQUE ("teacher_id", "class_subject_id");


--
-- Name: timetable_slots timetable_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id");


--
-- Name: timetable_slots timetable_slots_version_id_class_key_weekday_period_no_grou_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_version_id_class_key_weekday_period_no_grou_key" UNIQUE ("version_id", "class_key", "weekday", "period_no", "group_label");


--
-- Name: timetable_versions timetable_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_versions"
    ADD CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id");


--
-- Name: tml_scores tml_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tml_scores"
    ADD CONSTRAINT "tml_scores_pkey" PRIMARY KEY ("id");


--
-- Name: tutor_guard_events tutor_guard_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_guard_events"
    ADD CONSTRAINT "tutor_guard_events_pkey" PRIMARY KEY ("id");


--
-- Name: tutor_session_turns tutor_session_turns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_session_turns"
    ADD CONSTRAINT "tutor_session_turns_pkey" PRIMARY KEY ("sid");


--
-- Name: tutor_sessions tutor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_sessions"
    ADD CONSTRAINT "tutor_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: submissions unique_assignment_student; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "unique_assignment_student" UNIQUE ("assignment_id", "student_id");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: users users_role_valid; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."users"
    ADD CONSTRAINT "users_role_valid" CHECK (("role" = ANY (ARRAY['student'::"text", 'teacher'::"text", 'admin'::"text", 'parent'::"text", 'superadmin'::"text", 'operator'::"text"]))) NOT VALID;


--
-- Name: visit_sessions visit_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visit_sessions"
    ADD CONSTRAINT "visit_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: wellness_logs wellness_energy_range; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."wellness_logs"
    ADD CONSTRAINT "wellness_energy_range" CHECK ((("energy" IS NULL) OR (("energy" >= 1) AND ("energy" <= 5)))) NOT VALID;


--
-- Name: wellness_logs wellness_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wellness_logs"
    ADD CONSTRAINT "wellness_logs_pkey" PRIMARY KEY ("id");


--
-- Name: wellness_logs wellness_note_length; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE "public"."wellness_logs"
    ADD CONSTRAINT "wellness_note_length" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 4000))) NOT VALID;


--
-- Name: whatsapp_links whatsapp_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_links"
    ADD CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("user_id");


--
-- Name: whatsapp_log whatsapp_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_log"
    ADD CONSTRAINT "whatsapp_log_pkey" PRIMARY KEY ("id");


--
-- Name: chapters chapters_pkey; Type: CONSTRAINT; Schema: sandbox_seed; Owner: -
--

ALTER TABLE ONLY "sandbox_seed"."chapters"
    ADD CONSTRAINT "chapters_pkey" PRIMARY KEY ("id");


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: sandbox_seed; Owner: -
--

ALTER TABLE ONLY "sandbox_seed"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("k");


--
-- Name: idx_academic_events_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_academic_events_school" ON "public"."academic_events" USING "btree" ("school_id", "starts_on");


--
-- Name: idx_admission_applicants_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admission_applicants_school" ON "public"."admission_applicants" USING "btree" ("school_id", "session", "stage");


--
-- Name: idx_admission_events_applicant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admission_events_applicant" ON "public"."admission_events" USING "btree" ("applicant_id", "at");


--
-- Name: idx_ai_usage_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_usage_at" ON "public"."ai_usage" USING "btree" ("at" DESC);


--
-- Name: idx_ai_usage_school_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ai_usage_school_at" ON "public"."ai_usage" USING "btree" ("school_id", "at" DESC);


--
-- Name: idx_assignments_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_assignments_class" ON "public"."assignments" USING "btree" ("class");


--
-- Name: idx_assignments_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_assignments_school" ON "public"."assignments" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: idx_assignments_school_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_assignments_school_id" ON "public"."assignments" USING "btree" ("school_id");


--
-- Name: idx_assignments_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_assignments_teacher" ON "public"."assignments" USING "btree" ("teacher_id");


--
-- Name: idx_attendance_class_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_attendance_class_day" ON "public"."attendance" USING "btree" ("school_id", "class_name", "day");


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_attendance_student" ON "public"."attendance" USING "btree" ("student_id", "day" DESC);


--
-- Name: idx_audit_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_row" ON "public"."audit_log" USING "btree" ("table_name", "row_id");


--
-- Name: idx_audit_school_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_audit_school_at" ON "public"."audit_log" USING "btree" ("school_id", "at" DESC);


--
-- Name: idx_bell_periods_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bell_periods_school" ON "public"."bell_periods" USING "btree" ("school_id");


--
-- Name: idx_bell_schedules_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_bell_schedules_school" ON "public"."bell_schedules" USING "btree" ("school_id");


--
-- Name: idx_class_subjects_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_class_subjects_school" ON "public"."class_subjects" USING "btree" ("school_id", "subject_key");


--
-- Name: idx_comp_off_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_comp_off_school" ON "public"."comp_off_grants" USING "btree" ("school_id", "duty_on");


--
-- Name: idx_concession_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_concession_school" ON "public"."fee_concession_requests" USING "btree" ("school_id", "status");


--
-- Name: idx_consents_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_consents_student" ON "public"."consents" USING "btree" ("student_id");


--
-- Name: idx_cover_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cover_school_date" ON "public"."cover_assignments" USING "btree" ("school_id", "on_date");


--
-- Name: idx_cover_sub_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cover_sub_user" ON "public"."cover_assignments" USING "btree" ("sub_user_id", "on_date") WHERE ("sub_user_id" IS NOT NULL);


--
-- Name: idx_duty_assignments_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_duty_assignments_school_date" ON "public"."duty_assignments" USING "btree" ("school_id", "on_date");


--
-- Name: idx_duty_roster_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_duty_roster_school" ON "public"."duty_roster" USING "btree" ("school_id");


--
-- Name: idx_enquiries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_enquiries_status" ON "public"."enquiries" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_exam_assessments_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exam_assessments_term" ON "public"."exam_assessments" USING "btree" ("term_id");


--
-- Name: idx_exam_marks_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exam_marks_student" ON "public"."exam_marks" USING "btree" ("student_id");


--
-- Name: idx_exam_schemes_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exam_schemes_school" ON "public"."exam_schemes" USING "btree" ("school_id", "session");


--
-- Name: idx_exam_sheets_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exam_sheets_class" ON "public"."exam_sheets" USING "btree" ("class_id");


--
-- Name: idx_exam_sheets_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_exam_sheets_school" ON "public"."exam_sheets" USING "btree" ("school_id", "status");


--
-- Name: idx_fee_invoices_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fee_invoices_school" ON "public"."fee_invoices" USING "btree" ("school_id", "session", "due_on");


--
-- Name: idx_fee_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fee_payments_invoice" ON "public"."fee_payments" USING "btree" ("invoice_id");


--
-- Name: idx_fee_payments_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fee_payments_school" ON "public"."fee_payments" USING "btree" ("school_id", "paid_on" DESC);


--
-- Name: idx_fee_reminders_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fee_reminders_student" ON "public"."fee_reminders" USING "btree" ("student_id", "sent_at" DESC);


--
-- Name: idx_guardians_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_guardians_parent" ON "public"."guardians" USING "btree" ("parent_id");


--
-- Name: idx_guardians_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_guardians_student" ON "public"."guardians" USING "btree" ("student_id");


--
-- Name: idx_incidents_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_incidents_school" ON "public"."incidents" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: idx_incidents_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_incidents_student" ON "public"."incidents" USING "btree" ("student_id", "created_at" DESC);


--
-- Name: idx_leave_requests_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_leave_requests_member" ON "public"."leave_requests" USING "btree" ("staff_member_id", "from_date" DESC) WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: idx_leave_requests_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_leave_requests_school" ON "public"."leave_requests" USING "btree" ("school_id", "status", "from_date");


--
-- Name: idx_leave_requests_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_leave_requests_staff" ON "public"."leave_requests" USING "btree" ("staff_id", "from_date" DESC);


--
-- Name: idx_lesson_plans_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lesson_plans_course" ON "public"."lesson_plans" USING "btree" ("school_id", "class", "subject", "lesson_date");


--
-- Name: idx_lesson_plans_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lesson_plans_teacher" ON "public"."lesson_plans" USING "btree" ("teacher_id", "lesson_date");


--
-- Name: idx_marks_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marks_school_date" ON "public"."staff_day_marks" USING "btree" ("school_id", "on_date");


--
-- Name: idx_notifications_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_student" ON "public"."notifications" USING "btree" ("student_id", "created_at" DESC);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_pay_adjustments_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pay_adjustments_month" ON "public"."pay_adjustments" USING "btree" ("school_id", "month");


--
-- Name: idx_pay_run_lines_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pay_run_lines_member" ON "public"."pay_run_lines" USING "btree" ("staff_member_id", "month");


--
-- Name: idx_proctor_alerts_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_proctor_alerts_school" ON "public"."proctor_alerts" USING "btree" ("school_id", "flagged_at" DESC);


--
-- Name: idx_proctor_alerts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_proctor_alerts_student" ON "public"."proctor_alerts" USING "btree" ("student_id", "assignment_id");


--
-- Name: idx_punches_school_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_punches_school_at" ON "public"."staff_punches" USING "btree" ("school_id", "at");


--
-- Name: idx_qa_runs_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_qa_runs_started" ON "public"."qa_runs" USING "btree" ("started_at" DESC);


--
-- Name: idx_report_cards_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_report_cards_student" ON "public"."report_cards" USING "btree" ("student_id") WHERE ("superseded_at" IS NULL);


--
-- Name: idx_report_cards_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_report_cards_term" ON "public"."report_cards" USING "btree" ("term_id", "class_id");


--
-- Name: idx_role_grants_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_role_grants_school" ON "public"."role_grants" USING "btree" ("school_id") WHERE ("revoked_at" IS NULL);


--
-- Name: idx_school_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_school_messages_thread" ON "public"."school_messages" USING "btree" ("thread_id", "created_at");


--
-- Name: idx_school_threads_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_school_threads_parent" ON "public"."school_threads" USING "btree" ("parent_id", "last_message_at" DESC);


--
-- Name: idx_school_threads_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_school_threads_school" ON "public"."school_threads" USING "btree" ("school_id", "audience", "last_message_at" DESC);


--
-- Name: idx_school_threads_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_school_threads_staff" ON "public"."school_threads" USING "btree" ("staff_id", "last_message_at" DESC);


--
-- Name: idx_settings_changes_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_settings_changes_at" ON "public"."settings_changes" USING "btree" ("at" DESC);


--
-- Name: idx_settings_changes_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_settings_changes_school" ON "public"."settings_changes" USING "btree" ("school_id", "at" DESC);


--
-- Name: idx_shift_overrides_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_shift_overrides_school" ON "public"."shift_overrides" USING "btree" ("school_id", "on_date");


--
-- Name: idx_shift_plans_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_shift_plans_school" ON "public"."staff_shift_plans" USING "btree" ("school_id");


--
-- Name: idx_situations_open_escalation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_situations_open_escalation" ON "public"."situations" USING "btree" ("school_id", "escalate_at") WHERE (("acknowledged_at" IS NULL) AND ("escalate_at" IS NOT NULL));


--
-- Name: idx_situations_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_situations_school" ON "public"."situations" USING "btree" ("school_id");


--
-- Name: idx_situations_school_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_situations_school_recent" ON "public"."situations" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: idx_staff_absences_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_absences_school_date" ON "public"."staff_absences" USING "btree" ("school_id", "on_date");


--
-- Name: idx_staff_documents_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_documents_expiry" ON "public"."staff_documents" USING "btree" ("school_id", "expires_on") WHERE ("expires_on" IS NOT NULL);


--
-- Name: idx_staff_documents_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_documents_member" ON "public"."staff_documents" USING "btree" ("staff_member_id");


--
-- Name: idx_staff_events_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_events_member" ON "public"."staff_events" USING "btree" ("staff_member_id", "on_date");


--
-- Name: idx_staff_exits_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_exits_school" ON "public"."staff_exits" USING "btree" ("school_id", "status");


--
-- Name: idx_staff_jobs_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_jobs_school" ON "public"."staff_jobs" USING "btree" ("school_id", "effective_from");


--
-- Name: idx_staff_loans_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_loans_member" ON "public"."staff_loans" USING "btree" ("staff_member_id", "status");


--
-- Name: idx_staff_members_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_members_department" ON "public"."staff_members" USING "btree" ("department_id") WHERE ("department_id" IS NOT NULL);


--
-- Name: idx_staff_members_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_members_manager" ON "public"."staff_members" USING "btree" ("manager_id") WHERE ("manager_id" IS NOT NULL);


--
-- Name: idx_staff_members_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_members_school" ON "public"."staff_members" USING "btree" ("school_id", "active");


--
-- Name: idx_staff_qualifications_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_qualifications_member" ON "public"."staff_qualifications" USING "btree" ("staff_member_id");


--
-- Name: idx_staff_salaries_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_staff_salaries_school" ON "public"."staff_salaries" USING "btree" ("school_id", "effective_from");


--
-- Name: idx_student_chats_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_student_chats_student" ON "public"."student_chats" USING "btree" ("student_id");


--
-- Name: idx_student_subjects_cs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_student_subjects_cs" ON "public"."student_subjects" USING "btree" ("class_subject_id");


--
-- Name: idx_submission_items_confirmed_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_submission_items_confirmed_recent" ON "public"."submission_items" USING "btree" ("created_at") WHERE "teacher_confirmed";


--
-- Name: idx_submission_items_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_submission_items_student" ON "public"."submission_items" USING "btree" ("student_id", "created_at" DESC);


--
-- Name: idx_submissions_assign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_submissions_assign" ON "public"."submissions" USING "btree" ("assignment_id");


--
-- Name: idx_submissions_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_submissions_school" ON "public"."submissions" USING "btree" ("school_id");


--
-- Name: idx_submissions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_submissions_student" ON "public"."submissions" USING "btree" ("student_id");


--
-- Name: idx_syllabus_progress_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_syllabus_progress_course" ON "public"."syllabus_progress" USING "btree" ("school_id", "class", "subject", "session");


--
-- Name: idx_syllabus_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_syllabus_teacher" ON "public"."syllabus" USING "btree" ("teacher_id");


--
-- Name: idx_teacher_subjects_cs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_teacher_subjects_cs" ON "public"."teacher_subjects" USING "btree" ("class_subject_id");


--
-- Name: idx_timetable_slots_staff_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_timetable_slots_staff_member" ON "public"."timetable_slots" USING "btree" ("staff_member_id", "version_id") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: idx_timetable_slots_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_timetable_slots_teacher" ON "public"."timetable_slots" USING "btree" ("teacher_id", "version_id") WHERE ("teacher_id" IS NOT NULL);


--
-- Name: idx_timetable_slots_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_timetable_slots_version" ON "public"."timetable_slots" USING "btree" ("version_id", "weekday", "period_no");


--
-- Name: idx_timetable_versions_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_timetable_versions_school" ON "public"."timetable_versions" USING "btree" ("school_id", "session", "status");


--
-- Name: idx_tml_scores_student_computed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tml_scores_student_computed" ON "public"."tml_scores" USING "btree" ("student_id", "computed_at" DESC);


--
-- Name: idx_tml_student_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tml_student_subject" ON "public"."tml_scores" USING "btree" ("student_id", "subject", "computed_at" DESC);


--
-- Name: idx_tutor_guard_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tutor_guard_school" ON "public"."tutor_guard_events" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: idx_tutor_guard_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tutor_guard_student" ON "public"."tutor_guard_events" USING "btree" ("student_id", "kind", "created_at" DESC);


--
-- Name: idx_tutor_sessions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tutor_sessions_student" ON "public"."tutor_sessions" USING "btree" ("student_id", "created_at" DESC);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");


--
-- Name: idx_users_school_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_school_id" ON "public"."users" USING "btree" ("school_id");


--
-- Name: idx_users_school_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_school_role" ON "public"."users" USING "btree" ("school_id", "role");


--
-- Name: idx_visit_sessions_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_visit_sessions_school" ON "public"."visit_sessions" USING "btree" ("school_id", "on_date");


--
-- Name: idx_wellness_school_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wellness_school_created" ON "public"."wellness_logs" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: idx_wellness_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wellness_student" ON "public"."wellness_logs" USING "btree" ("student_id");


--
-- Name: idx_wellness_student_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wellness_student_created" ON "public"."wellness_logs" USING "btree" ("student_id", "created_at" DESC);


--
-- Name: idx_whatsapp_log_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_whatsapp_log_phone" ON "public"."whatsapp_log" USING "btree" ("phone_e164", "created_at" DESC);


--
-- Name: idx_whatsapp_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_whatsapp_log_user" ON "public"."whatsapp_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_whatsapp_log_user_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_whatsapp_log_user_kind" ON "public"."whatsapp_log" USING "btree" ("user_id", "direction", "kind", "created_at" DESC);


--
-- Name: ix_account_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_account_requests_pending" ON "public"."account_requests" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");


--
-- Name: ix_account_requests_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_account_requests_school" ON "public"."account_requests" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: ix_app_error_groups_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_app_error_groups_seen" ON "public"."app_error_groups" USING "btree" ("last_seen" DESC);


--
-- Name: ix_app_errors_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_app_errors_at" ON "public"."app_errors" USING "btree" ("at" DESC);


--
-- Name: ix_app_errors_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_app_errors_group" ON "public"."app_errors" USING "btree" ("fingerprint", "at" DESC);


--
-- Name: ix_enquiries_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_enquiries_campaign" ON "public"."enquiries" USING "btree" ("campaign_id");


--
-- Name: ix_enquiries_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_enquiries_owner" ON "public"."enquiries" USING "btree" ("owner_id");


--
-- Name: ix_enquiries_territory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_enquiries_territory" ON "public"."enquiries" USING "btree" ("territory_id");


--
-- Name: ix_ops_access_events_grant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_access_events_grant" ON "public"."ops_access_events" USING "btree" ("grant_id", "at");


--
-- Name: ix_ops_access_grants_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_access_grants_operator" ON "public"."ops_access_grants" USING "btree" ("operator_id", "expires_at" DESC);


--
-- Name: ix_ops_access_grants_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_access_grants_school" ON "public"."ops_access_grants" USING "btree" ("school_id", "started_at" DESC);


--
-- Name: ix_ops_accounts_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_accounts_owner" ON "public"."ops_accounts" USING "btree" ("owner_id");


--
-- Name: ix_ops_accounts_territory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_accounts_territory" ON "public"."ops_accounts" USING "btree" ("territory_id");


--
-- Name: ix_ops_activities_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_activities_school" ON "public"."ops_activities" USING "btree" ("school_id", "happened_at" DESC);


--
-- Name: ix_ops_case_messages_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_case_messages_case" ON "public"."ops_case_messages" USING "btree" ("case_id", "created_at");


--
-- Name: ix_ops_cases_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_cases_open" ON "public"."ops_cases" USING "btree" ("status", "resolve_due") WHERE ("status" <> ALL (ARRAY['resolved'::"text", 'closed'::"text"]));


--
-- Name: ix_ops_cases_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_cases_owner" ON "public"."ops_cases" USING "btree" ("owner_id") WHERE ("status" <> ALL (ARRAY['resolved'::"text", 'closed'::"text"]));


--
-- Name: ix_ops_cases_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_cases_school" ON "public"."ops_cases" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: ix_ops_commissions_opp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_commissions_opp" ON "public"."ops_commissions" USING "btree" ("opportunity_id");


--
-- Name: ix_ops_commissions_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_commissions_partner" ON "public"."ops_commissions" USING "btree" ("partner_id");


--
-- Name: ix_ops_commissions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_commissions_status" ON "public"."ops_commissions" USING "btree" ("status");


--
-- Name: ix_ops_contacts_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_contacts_school" ON "public"."ops_contacts" USING "btree" ("school_id");


--
-- Name: ix_ops_documents_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_documents_school" ON "public"."ops_documents" USING "btree" ("school_id", "created_at" DESC);


--
-- Name: ix_ops_job_runs_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_job_runs_job" ON "public"."ops_job_runs" USING "btree" ("job", "started_at" DESC);


--
-- Name: ix_ops_marketing_spend_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_marketing_spend_campaign" ON "public"."ops_marketing_spend" USING "btree" ("campaign_id");


--
-- Name: ix_ops_marketing_spend_opp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_marketing_spend_opp" ON "public"."ops_marketing_spend" USING "btree" ("opportunity_id");


--
-- Name: ix_ops_marketing_spend_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_marketing_spend_school" ON "public"."ops_marketing_spend" USING "btree" ("school_id");


--
-- Name: ix_ops_operators_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_operators_manager" ON "public"."ops_operators" USING "btree" ("manager_id");


--
-- Name: ix_ops_opportunities_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_campaign" ON "public"."ops_opportunities" USING "btree" ("campaign_id");


--
-- Name: ix_ops_opportunities_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_owner" ON "public"."ops_opportunities" USING "btree" ("owner_id");


--
-- Name: ix_ops_opportunities_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_partner" ON "public"."ops_opportunities" USING "btree" ("partner_id");


--
-- Name: ix_ops_opportunities_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_school" ON "public"."ops_opportunities" USING "btree" ("school_id");


--
-- Name: ix_ops_opportunities_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_stage" ON "public"."ops_opportunities" USING "btree" ("stage");


--
-- Name: ix_ops_opportunities_territory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunities_territory" ON "public"."ops_opportunities" USING "btree" ("territory_id");


--
-- Name: ix_ops_opportunity_events_opp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_opportunity_events_opp" ON "public"."ops_opportunity_events" USING "btree" ("opportunity_id", "at" DESC);


--
-- Name: ix_ops_quote_approvals_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_quote_approvals_quote" ON "public"."ops_quote_approvals" USING "btree" ("quote_id", "at");


--
-- Name: ix_ops_quotes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_quotes_status" ON "public"."ops_quotes" USING "btree" ("status") WHERE ("status" = 'pending_approval'::"text");


--
-- Name: ix_ops_tasks_opportunity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_tasks_opportunity" ON "public"."ops_tasks" USING "btree" ("opportunity_id") WHERE ("status" = 'open'::"text");


--
-- Name: ix_ops_tasks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_tasks_owner" ON "public"."ops_tasks" USING "btree" ("owner_id", "due_on") WHERE ("status" = 'open'::"text");


--
-- Name: ix_ops_tasks_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_tasks_school" ON "public"."ops_tasks" USING "btree" ("school_id") WHERE ("status" = 'open'::"text");


--
-- Name: ix_ops_territories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_territories_parent" ON "public"."ops_territories" USING "btree" ("parent_id");


--
-- Name: ix_ops_territory_members_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_ops_territory_members_operator" ON "public"."ops_territory_members" USING "btree" ("operator_id");


--
-- Name: ix_request_log_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_request_log_at" ON "public"."request_log" USING "btree" ("at" DESC);


--
-- Name: ix_request_log_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_request_log_school" ON "public"."request_log" USING "btree" ("school_id", "at" DESC);


--
-- Name: ix_request_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_request_log_user" ON "public"."request_log" USING "btree" ("user_id", "at" DESC);


--
-- Name: ix_sched_requirements_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_sched_requirements_school" ON "public"."sched_requirements" USING "btree" ("school_id", "session");


--
-- Name: ix_teacher_load_rules_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_teacher_load_rules_school" ON "public"."teacher_load_rules" USING "btree" ("school_id");


--
-- Name: lab_runs_scene_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_runs_scene_idx" ON "public"."lab_runs" USING "btree" ("scene_id") WHERE ("scene_id" IS NOT NULL);


--
-- Name: lab_runs_school_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_runs_school_class_idx" ON "public"."lab_runs" USING "btree" ("school_id", "class", "subject", "updated_at" DESC);


--
-- Name: lab_runs_teacher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_runs_teacher_idx" ON "public"."lab_runs" USING "btree" ("teacher_id", "updated_at" DESC);


--
-- Name: lab_scenes_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_scenes_lesson_idx" ON "public"."lab_scenes" USING "btree" ("lesson_plan_id") WHERE ("lesson_plan_id" IS NOT NULL);


--
-- Name: lab_scenes_school_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_scenes_school_class_idx" ON "public"."lab_scenes" USING "btree" ("school_id", "class", "subject", "updated_at" DESC);


--
-- Name: lab_scenes_teacher_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lab_scenes_teacher_idx" ON "public"."lab_scenes" USING "btree" ("teacher_id", "updated_at" DESC);


--
-- Name: practical_assessment_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "practical_assessment_class_idx" ON "public"."practical_assessment" USING "btree" ("school_id", "class", "subject");


--
-- Name: practical_progress_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "practical_progress_class_idx" ON "public"."practical_progress" USING "btree" ("school_id", "class", "subject");


--
-- Name: schools_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "schools_code_unique" ON "public"."schools" USING "btree" ((("settings" ->> 'code'::"text"))) WHERE (("settings" ->> 'code'::"text") IS NOT NULL);


--
-- Name: tutor_session_turns_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tutor_session_turns_student_idx" ON "public"."tutor_session_turns" USING "btree" ("student_id", "created_at");


--
-- Name: uq_account_requests_applicant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_account_requests_applicant" ON "public"."account_requests" USING "btree" ("applicant_id") WHERE (("status" = 'pending'::"text") AND ("applicant_id" IS NOT NULL));


--
-- Name: uq_bell_periods_no; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_bell_periods_no" ON "public"."bell_periods" USING "btree" ("schedule_id", "period_no") WHERE ("period_no" IS NOT NULL);


--
-- Name: uq_concession_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_concession_pending" ON "public"."fee_concession_requests" USING "btree" ("invoice_id") WHERE ("status" = 'pending'::"text");


--
-- Name: uq_duty_roster_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_duty_roster_staff" ON "public"."duty_roster" USING "btree" ("post_id", "weekday", "staff_member_id") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_duty_roster_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_duty_roster_user" ON "public"."duty_roster" USING "btree" ("post_id", "weekday", "user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_hr_departments_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_hr_departments_name" ON "public"."hr_departments" USING "btree" ("school_id", "lower"(TRIM(BOTH FROM "name")));


--
-- Name: uq_hr_grades_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_hr_grades_name" ON "public"."hr_grades" USING "btree" ("school_id", "lower"(TRIM(BOTH FROM "name")));


--
-- Name: uq_hr_posts; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_hr_posts" ON "public"."hr_posts" USING "btree" ("school_id", "department_id", COALESCE("grade_id", '00000000-0000-0000-0000-000000000000'::"uuid"));


--
-- Name: uq_marks_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_marks_staff" ON "public"."staff_day_marks" USING "btree" ("staff_member_id", "on_date") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_marks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_marks_user" ON "public"."staff_day_marks" USING "btree" ("user_id", "on_date") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_pay_adjustments_override; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_pay_adjustments_override" ON "public"."pay_adjustments" USING "btree" ("staff_member_id", "month", "item_id") WHERE ("mode" = 'override'::"text");


--
-- Name: uq_pay_runs_month; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_pay_runs_month" ON "public"."pay_runs" USING "btree" ("school_id", "month") WHERE ("kind" = 'regular'::"text");


--
-- Name: uq_pay_runs_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_pay_runs_settlement" ON "public"."pay_runs" USING "btree" ("exit_id") WHERE ("kind" = 'settlement'::"text");


--
-- Name: uq_punch_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_punch_staff" ON "public"."staff_punches" USING "btree" ("staff_member_id", "at", "source") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_punch_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_punch_user" ON "public"."staff_punches" USING "btree" ("user_id", "at", "source") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_review_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_review_staff" ON "public"."attendance_month_reviews" USING "btree" ("staff_member_id", "month") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_review_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_review_user" ON "public"."attendance_month_reviews" USING "btree" ("user_id", "month") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_role_grants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_role_grants_active" ON "public"."role_grants" USING "btree" ("user_id", "role_key") WHERE ("revoked_at" IS NULL);


--
-- Name: uq_rooms_home_class; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_rooms_home_class" ON "public"."rooms" USING "btree" ("school_id", "app"."norm_class"("home_class")) WHERE (("home_class" IS NOT NULL) AND "active");


--
-- Name: uq_salary_templates_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_salary_templates_name" ON "public"."salary_templates" USING "btree" ("school_id", "lower"(TRIM(BOTH FROM "name")));


--
-- Name: uq_sched_requirements; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_sched_requirements" ON "public"."sched_requirements" USING "btree" ("school_id", "session", "class_key", "lower"("subject"), "group_label");


--
-- Name: uq_shift_overrides_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_shift_overrides_staff" ON "public"."shift_overrides" USING "btree" ("staff_member_id", "on_date") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_shift_overrides_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_shift_overrides_user" ON "public"."shift_overrides" USING "btree" ("user_id", "on_date") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_shift_plans_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_shift_plans_staff" ON "public"."staff_shift_plans" USING "btree" ("staff_member_id") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_shift_plans_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_shift_plans_user" ON "public"."staff_shift_plans" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_situations_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_situations_dedupe" ON "public"."situations" USING "btree" ("school_id", "dedupe_key");


--
-- Name: uq_staff_exits_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_staff_exits_open" ON "public"."staff_exits" USING "btree" ("staff_member_id") WHERE ("status" = 'notice'::"text");


--
-- Name: uq_staff_members_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_staff_members_code" ON "public"."staff_members" USING "btree" ("school_id", "employee_code") WHERE ("employee_code" IS NOT NULL);


--
-- Name: uq_staff_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_staff_members_user" ON "public"."staff_members" USING "btree" ("school_id", "user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_teacher_load_rules_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_teacher_load_rules_staff" ON "public"."teacher_load_rules" USING "btree" ("staff_member_id") WHERE ("staff_member_id" IS NOT NULL);


--
-- Name: uq_teacher_load_rules_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_teacher_load_rules_user" ON "public"."teacher_load_rules" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);


--
-- Name: uq_timetable_versions_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_timetable_versions_effective" ON "public"."timetable_versions" USING "btree" ("school_id", "effective_from") WHERE ("status" = 'published'::"text");


--
-- Name: uq_visit_sessions; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_visit_sessions" ON "public"."visit_sessions" USING "btree" ("staff_member_id", "on_date", "slot_id") WHERE ("slot_id" IS NOT NULL);


--
-- Name: uq_whatsapp_links_verified_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_whatsapp_links_verified_phone" ON "public"."whatsapp_links" USING "btree" ("phone_e164") WHERE ("verified_at" IS NOT NULL);


--
-- Name: uq_whatsapp_log_inbound; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_whatsapp_log_inbound" ON "public"."whatsapp_log" USING "btree" ("provider_id") WHERE (("direction" = 'in'::"text") AND ("provider_id" IS NOT NULL));


--
-- Name: ux_ops_campaigns_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_campaigns_code" ON "public"."ops_campaigns" USING "btree" ("code");


--
-- Name: ux_ops_contacts_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_contacts_primary" ON "public"."ops_contacts" USING "btree" ("school_id") WHERE ("is_primary" AND "active");


--
-- Name: ux_ops_opportunities_enquiry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_opportunities_enquiry" ON "public"."ops_opportunities" USING "btree" ("enquiry_id") WHERE ("enquiry_id" IS NOT NULL);


--
-- Name: ux_ops_partners_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_partners_name" ON "public"."ops_partners" USING "btree" ("lower"("name"));


--
-- Name: ux_ops_territories_district; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_territories_district" ON "public"."ops_territories" USING "btree" ("lower"("state"), "lower"("district")) WHERE ("level" = 'district'::"text");


--
-- Name: ux_ops_territories_region; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_territories_region" ON "public"."ops_territories" USING "btree" ("lower"("name")) WHERE ("level" = 'region'::"text");


--
-- Name: ux_ops_territories_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ops_territories_state" ON "public"."ops_territories" USING "btree" ("lower"("state")) WHERE ("level" = 'state'::"text");


--
-- Name: academic_events trg_audit_academic_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_academic_events" AFTER INSERT OR DELETE OR UPDATE ON "public"."academic_events" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: admission_applicants trg_audit_admission_applicants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_admission_applicants" AFTER INSERT OR DELETE OR UPDATE ON "public"."admission_applicants" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: attendance trg_audit_attendance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_attendance" AFTER DELETE OR UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status');


--
-- Name: attendance_settings trg_audit_attendance_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_attendance_settings" AFTER INSERT OR UPDATE ON "public"."attendance_settings" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: class_subjects trg_audit_class_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_class_subjects" AFTER INSERT OR DELETE OR UPDATE ON "public"."class_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('subject_name,kind,level');


--
-- Name: comp_off_grants trg_audit_comp_off_grants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_comp_off_grants" AFTER INSERT OR DELETE OR UPDATE ON "public"."comp_off_grants" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('days,revoked_at');


--
-- Name: consents trg_audit_consents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_consents" AFTER INSERT OR DELETE OR UPDATE ON "public"."consents" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: cover_assignments trg_audit_cover_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_cover_assignments" AFTER INSERT OR DELETE OR UPDATE ON "public"."cover_assignments" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,sub_user_id,sub_staff_member_id');


--
-- Name: exam_assessments trg_audit_exam_assessments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_assessments" AFTER INSERT OR DELETE OR UPDATE ON "public"."exam_assessments" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('code,name,max_marks,subjects');


--
-- Name: exam_class_terms trg_audit_exam_class_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_class_terms" AFTER INSERT OR UPDATE ON "public"."exam_class_terms" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,version,reopen_reason');


--
-- Name: exam_marks trg_audit_exam_marks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_marks" AFTER INSERT OR DELETE OR UPDATE ON "public"."exam_marks" FOR EACH ROW EXECUTE FUNCTION "app"."audit_exam_marks"();


--
-- Name: exam_schemes trg_audit_exam_schemes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_schemes" AFTER INSERT OR DELETE OR UPDATE ON "public"."exam_schemes" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,grades,grading,rules,status');


--
-- Name: exam_sheets trg_audit_exam_sheets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_sheets" AFTER UPDATE ON "public"."exam_sheets" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,returned_note,reopened_reason');


--
-- Name: exam_terms trg_audit_exam_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_exam_terms" AFTER INSERT OR DELETE OR UPDATE ON "public"."exam_terms" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,weight,components,subject_weights,starts_on,ends_on');


--
-- Name: fee_concession_requests trg_audit_fee_concession_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_concession_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_concession_requests" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: fee_day_closes trg_audit_fee_day_closes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_day_closes" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_day_closes" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: fee_invoices trg_audit_fee_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_invoices" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_invoices" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: fee_payments trg_audit_fee_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_payments" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_payments" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: fee_reminders trg_audit_fee_reminders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_reminders" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_reminders" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: fee_structures trg_audit_fee_structures; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_fee_structures" AFTER INSERT OR DELETE OR UPDATE ON "public"."fee_structures" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: guardians trg_audit_guardians; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_guardians" AFTER INSERT OR DELETE OR UPDATE ON "public"."guardians" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: hr_grades trg_audit_hr_grades; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_hr_grades" AFTER INSERT OR DELETE OR UPDATE ON "public"."hr_grades" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,pay_min,pay_max,active');


--
-- Name: hr_posts trg_audit_hr_posts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_hr_posts" AFTER INSERT OR DELETE OR UPDATE ON "public"."hr_posts" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('sanctioned');


--
-- Name: incidents trg_audit_incidents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_incidents" AFTER INSERT OR DELETE OR UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: leave_policies trg_audit_leave_policies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_leave_policies" AFTER INSERT OR DELETE OR UPDATE ON "public"."leave_policies" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: leave_requests trg_audit_leave_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_leave_requests" AFTER INSERT OR DELETE OR UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: attendance_month_reviews trg_audit_month_reviews; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_month_reviews" AFTER INSERT OR DELETE OR UPDATE ON "public"."attendance_month_reviews" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('lop_days,waived');


--
-- Name: pay_adjustments trg_audit_pay_adjustments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_pay_adjustments" AFTER INSERT OR DELETE OR UPDATE ON "public"."pay_adjustments" FOR EACH ROW EXECUTE FUNCTION "app"."audit_touch_only"();


--
-- Name: pay_items trg_audit_pay_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_pay_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."pay_items" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,calc,percent_of,count_source,threshold,taxable,pf_wage,esi_wage,prorate,active');


--
-- Name: pay_runs trg_audit_pay_runs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_pay_runs" AFTER INSERT OR DELETE OR UPDATE ON "public"."pay_runs" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,submitted_by,approved_by');


--
-- Name: payroll_settings trg_audit_payroll_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_payroll_settings" AFTER INSERT OR UPDATE ON "public"."payroll_settings" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: probe_acks trg_audit_probe_acks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_probe_acks" AFTER INSERT OR DELETE OR UPDATE ON "public"."probe_acks" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: role_grants trg_audit_role_grants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_role_grants" AFTER INSERT OR DELETE OR UPDATE ON "public"."role_grants" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: school_filings trg_audit_school_filings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_school_filings" AFTER INSERT OR DELETE OR UPDATE ON "public"."school_filings" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: schools trg_audit_schools; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_schools" AFTER DELETE OR UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,settings,trial_expires_at,institution_type');


--
-- Name: staff_shift_plans trg_audit_shift_plans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_shift_plans" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_shift_plans" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('mode,shift_id,rotation,off_mode,off_days,off_cycle,rules_exempt,grace_min');


--
-- Name: staff_absences trg_audit_staff_absences; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_absences" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_absences" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,portion,period_nos');


--
-- Name: staff_day_marks trg_audit_staff_day_marks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_day_marks" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_day_marks" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,in_at,out_at,reason');


--
-- Name: staff_documents trg_audit_staff_documents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_documents" AFTER INSERT OR DELETE ON "public"."staff_documents" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: staff_exits trg_audit_staff_exits; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_exits" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_exits" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('kind,notice_on,last_day,status,login_flagged_at');


--
-- Name: staff_jobs trg_audit_staff_jobs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_jobs" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_jobs" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: staff_loans trg_audit_staff_loans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_loans" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_loans" FOR EACH ROW EXECUTE FUNCTION "app"."audit_touch_only"();


--
-- Name: staff_members trg_audit_staff_members; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_members" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_members" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('name,category,designation,phone_e164,active,user_id,employee_code,joined_on,probation_until,confirmed_on,exit_on');


--
-- Name: staff_pay_settings trg_audit_staff_pay_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_pay_settings" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_pay_settings" FOR EACH ROW EXECUTE FUNCTION "app"."audit_touch_only"();


--
-- Name: staff_profiles trg_audit_staff_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_profiles" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_profiles" FOR EACH ROW EXECUTE FUNCTION "app"."audit_fields_only"();


--
-- Name: staff_salaries trg_audit_staff_salaries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_salaries" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_salaries" FOR EACH ROW EXECUTE FUNCTION "app"."audit_touch_only"();


--
-- Name: staff_statutory trg_audit_staff_statutory; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_staff_statutory" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_statutory" FOR EACH ROW EXECUTE FUNCTION "app"."audit_fields_only"();


--
-- Name: statutory_overrides trg_audit_statutory_overrides; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_statutory_overrides" AFTER INSERT OR DELETE OR UPDATE ON "public"."statutory_overrides" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: student_subjects trg_audit_student_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_student_subjects" AFTER INSERT OR DELETE OR UPDATE ON "public"."student_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('source');


--
-- Name: subject_leads trg_audit_subject_leads; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_subject_leads" AFTER INSERT OR DELETE OR UPDATE ON "public"."subject_leads" FOR EACH ROW EXECUTE FUNCTION "app"."audit"();


--
-- Name: submissions trg_audit_submissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_submissions" AFTER DELETE OR UPDATE ON "public"."submissions" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('score,max_score,grade,final_grade,teacher_approved,ai_grade');


--
-- Name: tax_declarations trg_audit_tax_declarations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_tax_declarations" AFTER INSERT OR DELETE OR UPDATE ON "public"."tax_declarations" FOR EACH ROW EXECUTE FUNCTION "app"."audit_touch_only"();


--
-- Name: teacher_subjects trg_audit_teacher_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_teacher_subjects" AFTER INSERT OR DELETE OR UPDATE ON "public"."teacher_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('role,teacher_id');


--
-- Name: timetable_versions trg_audit_timetable_versions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_timetable_versions" AFTER INSERT OR DELETE OR UPDATE ON "public"."timetable_versions" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status,effective_from,name');


--
-- Name: users trg_audit_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_users" AFTER DELETE OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('role,school_id,email');


--
-- Name: visit_sessions trg_audit_visit_sessions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_audit_visit_sessions" AFTER INSERT OR DELETE OR UPDATE ON "public"."visit_sessions" FOR EACH ROW EXECUTE FUNCTION "app"."audit"('status');


--
-- Name: users trg_bootstrap_school_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_bootstrap_school_admin" AFTER INSERT OR UPDATE OF "role", "school_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."bootstrap_school_admin"();


--
-- Name: timetable_slots trg_check_timetable_slot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_check_timetable_slot" BEFORE INSERT OR UPDATE ON "public"."timetable_slots" FOR EACH ROW EXECUTE FUNCTION "app"."check_timetable_slot"();


--
-- Name: classes trg_class_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_class_rename" AFTER UPDATE OF "name" ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "app"."on_class_rename"();


--
-- Name: class_subjects trg_class_subject_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_class_subject_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."class_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."on_class_subject_change"();


--
-- Name: class_subjects trg_guard_class_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_class_subjects" BEFORE INSERT OR UPDATE ON "public"."class_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."guard_subject_link"();


--
-- Name: ops_operators trg_guard_director; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_director" BEFORE INSERT OR UPDATE OF "role", "user_id" ON "public"."ops_operators" FOR EACH ROW EXECUTE FUNCTION "app"."guard_director"();


--
-- Name: exam_marks trg_guard_exam_marks; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_exam_marks" BEFORE INSERT OR DELETE OR UPDATE ON "public"."exam_marks" FOR EACH ROW EXECUTE FUNCTION "app"."guard_exam_marks"();


--
-- Name: exam_schemes trg_guard_exam_scheme_grades; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_exam_scheme_grades" BEFORE INSERT OR UPDATE ON "public"."exam_schemes" FOR EACH ROW EXECUTE FUNCTION "app"."guard_exam_scheme_grades"();


--
-- Name: exam_student_terms trg_guard_exam_student_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_exam_student_terms" BEFORE INSERT OR DELETE OR UPDATE ON "public"."exam_student_terms" FOR EACH ROW EXECUTE FUNCTION "app"."guard_exam_student_terms"();


--
-- Name: fee_payments trg_guard_fee_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_fee_payment" BEFORE DELETE OR UPDATE ON "public"."fee_payments" FOR EACH ROW EXECUTE FUNCTION "app"."guard_fee_payment"();


--
-- Name: notifications trg_guard_notification_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_notification_update" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "app"."guard_notification_update"();


--
-- Name: pay_run_lines trg_guard_pay_run_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_pay_run_lines" BEFORE INSERT OR DELETE OR UPDATE ON "public"."pay_run_lines" FOR EACH ROW EXECUTE FUNCTION "app"."guard_pay_run_lines"();


--
-- Name: pay_runs trg_guard_pay_runs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_pay_runs" BEFORE DELETE OR UPDATE ON "public"."pay_runs" FOR EACH ROW EXECUTE FUNCTION "app"."guard_pay_runs"();


--
-- Name: timetable_slots trg_guard_published_slots; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_published_slots" BEFORE INSERT OR DELETE OR UPDATE ON "public"."timetable_slots" FOR EACH ROW EXECUTE FUNCTION "app"."guard_published_slots"();


--
-- Name: report_cards trg_guard_report_cards; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_report_cards" BEFORE DELETE OR UPDATE ON "public"."report_cards" FOR EACH ROW EXECUTE FUNCTION "app"."guard_report_cards"();


--
-- Name: role_grants trg_guard_role_grant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_role_grant" BEFORE INSERT OR DELETE OR UPDATE ON "public"."role_grants" FOR EACH ROW EXECUTE FUNCTION "app"."guard_role_grant"();


--
-- Name: student_subjects trg_guard_student_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_student_subjects" BEFORE INSERT OR UPDATE ON "public"."student_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."guard_subject_link"();


--
-- Name: subject_leads trg_guard_subject_leads; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_subject_leads" BEFORE INSERT OR UPDATE ON "public"."subject_leads" FOR EACH ROW EXECUTE FUNCTION "app"."guard_subject_link"();


--
-- Name: superadmins trg_guard_superadmin_list; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_superadmin_list" BEFORE INSERT OR UPDATE ON "public"."superadmins" FOR EACH ROW EXECUTE FUNCTION "app"."guard_superadmin_list"();


--
-- Name: users trg_guard_superadmin_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_superadmin_users" BEFORE INSERT OR UPDATE OF "role" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."guard_superadmin"();


--
-- Name: teacher_subjects trg_guard_teacher_subjects; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_teacher_subjects" BEFORE INSERT OR UPDATE ON "public"."teacher_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."guard_subject_link"();


--
-- Name: wellness_logs trg_guard_wellness_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_wellness_insert" BEFORE INSERT ON "public"."wellness_logs" FOR EACH ROW EXECUTE FUNCTION "app"."guard_wellness_insert"();


--
-- Name: wellness_logs trg_guard_wellness_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_wellness_update" BEFORE UPDATE ON "public"."wellness_logs" FOR EACH ROW EXECUTE FUNCTION "app"."guard_wellness_update"();


--
-- Name: ops_access_grants trg_ops_access_grants_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ops_access_grants_guard" BEFORE DELETE OR UPDATE ON "public"."ops_access_grants" FOR EACH ROW EXECUTE FUNCTION "app"."ops_access_grants_guard"();


--
-- Name: ops_case_messages trg_ops_case_messages_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ops_case_messages_guard" BEFORE DELETE OR UPDATE ON "public"."ops_case_messages" FOR EACH ROW EXECUTE FUNCTION "app"."ops_case_messages_guard"();


--
-- Name: ops_commissions trg_ops_commissions_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ops_commissions_guard" BEFORE DELETE OR UPDATE ON "public"."ops_commissions" FOR EACH ROW EXECUTE FUNCTION "app"."ops_commissions_guard"();


--
-- Name: ops_quotes trg_ops_quotes_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ops_quotes_guard" BEFORE UPDATE ON "public"."ops_quotes" FOR EACH ROW EXECUTE FUNCTION "app"."ops_quotes_guard"();


--
-- Name: users trg_release_staff_threads; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_release_staff_threads" BEFORE DELETE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."release_staff_threads"();


--
-- Name: settings_changes trg_settings_changes_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_settings_changes_immutable" BEFORE DELETE OR UPDATE ON "public"."settings_changes" FOR EACH ROW EXECUTE FUNCTION "app"."settings_changes_immutable"();


--
-- Name: staff_jobs trg_staff_jobs_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_staff_jobs_sync" AFTER INSERT OR DELETE OR UPDATE ON "public"."staff_jobs" FOR EACH ROW EXECUTE FUNCTION "app"."staff_jobs_sync"();


--
-- Name: staff_members trg_staff_members_job; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_staff_members_job" AFTER INSERT OR UPDATE ON "public"."staff_members" FOR EACH ROW EXECUTE FUNCTION "app"."staff_members_job"();


--
-- Name: users trg_student_class_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_student_class_change" AFTER INSERT OR UPDATE OF "student_class", "role", "school_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."on_student_class_change"();


--
-- Name: teacher_subjects trg_teacher_subject_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_teacher_subject_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."teacher_subjects" FOR EACH ROW EXECUTE FUNCTION "app"."on_teacher_subject_change"();


--
-- Name: admission_applicants trg_touch_admission_applicants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_admission_applicants" BEFORE UPDATE ON "public"."admission_applicants" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: assignments trg_touch_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_assignments" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: attendance trg_touch_attendance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_attendance" BEFORE UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: consents trg_touch_consents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_consents" BEFORE UPDATE ON "public"."consents" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: course_plans trg_touch_course_plans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_course_plans" BEFORE UPDATE ON "public"."course_plans" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: enquiries trg_touch_enquiries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_enquiries" BEFORE UPDATE ON "public"."enquiries" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_assessments trg_touch_exam_assessments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_assessments" BEFORE UPDATE ON "public"."exam_assessments" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_class_terms trg_touch_exam_class_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_class_terms" BEFORE UPDATE ON "public"."exam_class_terms" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_schemes trg_touch_exam_schemes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_schemes" BEFORE UPDATE ON "public"."exam_schemes" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_sheets trg_touch_exam_sheets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_sheets" BEFORE UPDATE ON "public"."exam_sheets" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_student_terms trg_touch_exam_student_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_student_terms" BEFORE UPDATE ON "public"."exam_student_terms" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: exam_terms trg_touch_exam_terms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_exam_terms" BEFORE UPDATE ON "public"."exam_terms" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: fee_invoices trg_touch_fee_invoices; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_fee_invoices" BEFORE UPDATE ON "public"."fee_invoices" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: fee_structures trg_touch_fee_structures; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_fee_structures" BEFORE UPDATE ON "public"."fee_structures" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: hr_departments trg_touch_hr_departments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_hr_departments" BEFORE UPDATE ON "public"."hr_departments" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: hr_grades trg_touch_hr_grades; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_hr_grades" BEFORE UPDATE ON "public"."hr_grades" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: hr_posts trg_touch_hr_posts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_hr_posts" BEFORE UPDATE ON "public"."hr_posts" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: hr_settings trg_touch_hr_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_hr_settings" BEFORE UPDATE ON "public"."hr_settings" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: incidents trg_touch_incidents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_incidents" BEFORE UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: leave_policies trg_touch_leave_policies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_leave_policies" BEFORE UPDATE ON "public"."leave_policies" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: leave_requests trg_touch_leave_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_leave_requests" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: lesson_plans trg_touch_lesson_plans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_lesson_plans" BEFORE UPDATE ON "public"."lesson_plans" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: pay_items trg_touch_pay_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_pay_items" BEFORE UPDATE ON "public"."pay_items" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: payroll_settings trg_touch_payroll_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_payroll_settings" BEFORE UPDATE ON "public"."payroll_settings" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: report_card_settings trg_touch_report_card_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_report_card_settings" BEFORE UPDATE ON "public"."report_card_settings" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: salary_templates trg_touch_salary_templates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_salary_templates" BEFORE UPDATE ON "public"."salary_templates" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: school_filings trg_touch_school_filings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_school_filings" BEFORE UPDATE ON "public"."school_filings" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: schools trg_touch_schools; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_schools" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: situations trg_touch_situations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_situations" BEFORE UPDATE ON "public"."situations" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: staff_pay_settings trg_touch_staff_pay_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_staff_pay_settings" BEFORE UPDATE ON "public"."staff_pay_settings" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: staff_profiles trg_touch_staff_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_staff_profiles" BEFORE UPDATE ON "public"."staff_profiles" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: staff_statutory trg_touch_staff_statutory; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_staff_statutory" BEFORE UPDATE ON "public"."staff_statutory" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: submissions trg_touch_submissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_submissions" BEFORE UPDATE ON "public"."submissions" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: syllabus_progress trg_touch_syllabus_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_syllabus_progress" BEFORE UPDATE ON "public"."syllabus_progress" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: users trg_touch_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_touch_users" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."touch_updated_at"();


--
-- Name: users trg_users_on_register; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_users_on_register" AFTER INSERT OR UPDATE OF "role", "school_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "app"."users_on_register"();


--
-- Name: academic_events academic_events_bell_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_events"
    ADD CONSTRAINT "academic_events_bell_schedule_id_fkey" FOREIGN KEY ("bell_schedule_id") REFERENCES "public"."bell_schedules"("id") ON DELETE SET NULL;


--
-- Name: academic_events academic_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_events"
    ADD CONSTRAINT "academic_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: academic_events academic_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_events"
    ADD CONSTRAINT "academic_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: account_requests account_requests_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."admission_applicants"("id") ON DELETE CASCADE;


--
-- Name: account_requests account_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: account_requests account_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: account_requests account_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."account_requests"
    ADD CONSTRAINT "account_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: admission_applicants admission_applicants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_applicants"
    ADD CONSTRAINT "admission_applicants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: admission_applicants admission_applicants_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_applicants"
    ADD CONSTRAINT "admission_applicants_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: admission_applicants admission_applicants_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_applicants"
    ADD CONSTRAINT "admission_applicants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: admission_applicants admission_applicants_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_applicants"
    ADD CONSTRAINT "admission_applicants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: admission_events admission_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_events"
    ADD CONSTRAINT "admission_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: admission_events admission_events_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_events"
    ADD CONSTRAINT "admission_events_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "public"."admission_applicants"("id") ON DELETE CASCADE;


--
-- Name: admission_events admission_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admission_events"
    ADD CONSTRAINT "admission_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: app_error_groups app_error_groups_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_error_groups"
    ADD CONSTRAINT "app_error_groups_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: app_errors app_errors_fingerprint_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_errors"
    ADD CONSTRAINT "app_errors_fingerprint_fkey" FOREIGN KEY ("fingerprint") REFERENCES "public"."app_error_groups"("fingerprint") ON DELETE CASCADE;


--
-- Name: app_errors app_errors_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_errors"
    ADD CONSTRAINT "app_errors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: app_errors app_errors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_errors"
    ADD CONSTRAINT "app_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: assignments assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: assignments assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attendance_devices attendance_devices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_devices"
    ADD CONSTRAINT "attendance_devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attendance_devices attendance_devices_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_devices"
    ADD CONSTRAINT "attendance_devices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attendance_month_reviews attendance_month_reviews_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_month_reviews"
    ADD CONSTRAINT "attendance_month_reviews_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attendance_month_reviews attendance_month_reviews_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_month_reviews"
    ADD CONSTRAINT "attendance_month_reviews_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: attendance_month_reviews attendance_month_reviews_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_month_reviews"
    ADD CONSTRAINT "attendance_month_reviews_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: attendance_month_reviews attendance_month_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_month_reviews"
    ADD CONSTRAINT "attendance_month_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: attendance attendance_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: attendance_settings attendance_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_settings"
    ADD CONSTRAINT "attendance_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: attendance_settings attendance_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance_settings"
    ADD CONSTRAINT "attendance_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: bell_periods bell_periods_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_periods"
    ADD CONSTRAINT "bell_periods_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."bell_schedules"("id") ON DELETE CASCADE;


--
-- Name: bell_periods bell_periods_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_periods"
    ADD CONSTRAINT "bell_periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: bell_schedules bell_schedules_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_schedules"
    ADD CONSTRAINT "bell_schedules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: bell_schedules bell_schedules_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."bell_schedules"
    ADD CONSTRAINT "bell_schedules_wing_id_fkey" FOREIGN KEY ("wing_id") REFERENCES "public"."sched_wings"("id") ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: class_subjects class_subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."class_subjects"
    ADD CONSTRAINT "class_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: comp_off_grants comp_off_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: comp_off_grants comp_off_grants_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: comp_off_grants comp_off_grants_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: comp_off_grants comp_off_grants_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: comp_off_grants comp_off_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comp_off_grants"
    ADD CONSTRAINT "comp_off_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: consents consents_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: consents consents_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: consents consents_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."consents"
    ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: course_plans course_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."course_plans"
    ADD CONSTRAINT "course_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: course_plans course_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."course_plans"
    ADD CONSTRAINT "course_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: cover_assignments cover_assignments_absent_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_absent_staff_member_id_fkey" FOREIGN KEY ("absent_staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: cover_assignments cover_assignments_absent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_absent_user_id_fkey" FOREIGN KEY ("absent_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: cover_assignments cover_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: cover_assignments cover_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: cover_assignments cover_assignments_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE CASCADE;


--
-- Name: cover_assignments cover_assignments_sub_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_sub_staff_member_id_fkey" FOREIGN KEY ("sub_staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: cover_assignments cover_assignments_sub_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cover_assignments"
    ADD CONSTRAINT "cover_assignments_sub_user_id_fkey" FOREIGN KEY ("sub_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: doc_counters doc_counters_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."doc_counters"
    ADD CONSTRAINT "doc_counters_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: duty_assignments duty_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: duty_assignments duty_assignments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."academic_events"("id") ON DELETE SET NULL;


--
-- Name: duty_assignments duty_assignments_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: duty_assignments duty_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: duty_assignments duty_assignments_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: duty_assignments duty_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_assignments"
    ADD CONSTRAINT "duty_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: duty_posts duty_posts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_posts"
    ADD CONSTRAINT "duty_posts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: duty_roster duty_roster_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: duty_roster duty_roster_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."duty_posts"("id") ON DELETE CASCADE;


--
-- Name: duty_roster duty_roster_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: duty_roster duty_roster_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: duty_roster duty_roster_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duty_roster"
    ADD CONSTRAINT "duty_roster_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: engagement_scores engagement_scores_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."engagement_scores"
    ADD CONSTRAINT "engagement_scores_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: engagement_scores engagement_scores_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."engagement_scores"
    ADD CONSTRAINT "engagement_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: enquiries enquiries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ops_campaigns"("id") ON DELETE SET NULL;


--
-- Name: enquiries enquiries_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: enquiries enquiries_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: enquiries enquiries_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."enquiries"
    ADD CONSTRAINT "enquiries_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "public"."ops_territories"("id") ON DELETE SET NULL;


--
-- Name: exam_assessments exam_assessments_scheme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_assessments"
    ADD CONSTRAINT "exam_assessments_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "public"."exam_schemes"("id") ON DELETE CASCADE;


--
-- Name: exam_assessments exam_assessments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_assessments"
    ADD CONSTRAINT "exam_assessments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_assessments exam_assessments_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_assessments"
    ADD CONSTRAINT "exam_assessments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."exam_terms"("id") ON DELETE CASCADE;


--
-- Name: exam_class_terms exam_class_terms_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;


--
-- Name: exam_class_terms exam_class_terms_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_class_terms exam_class_terms_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_class_terms exam_class_terms_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_class_terms exam_class_terms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_class_terms exam_class_terms_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_class_terms"
    ADD CONSTRAINT "exam_class_terms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."exam_terms"("id") ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "public"."exam_sheets"("id") ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: exam_marks exam_marks_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_marks"
    ADD CONSTRAINT "exam_marks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_schemes exam_schemes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_schemes"
    ADD CONSTRAINT "exam_schemes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_schemes exam_schemes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_schemes"
    ADD CONSTRAINT "exam_schemes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_schemes exam_schemes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_schemes"
    ADD CONSTRAINT "exam_schemes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_sheets exam_sheets_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."exam_assessments"("id") ON DELETE CASCADE;


--
-- Name: exam_sheets exam_sheets_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;


--
-- Name: exam_sheets exam_sheets_class_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE CASCADE;


--
-- Name: exam_sheets exam_sheets_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_sheets exam_sheets_returned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_returned_by_fkey" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_sheets exam_sheets_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_sheets exam_sheets_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_sheets"
    ADD CONSTRAINT "exam_sheets_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_student_terms exam_student_terms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: exam_student_terms exam_student_terms_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: exam_student_terms exam_student_terms_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."exam_terms"("id") ON DELETE CASCADE;


--
-- Name: exam_student_terms exam_student_terms_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_student_terms"
    ADD CONSTRAINT "exam_student_terms_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: exam_terms exam_terms_scheme_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_terms"
    ADD CONSTRAINT "exam_terms_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "public"."exam_schemes"("id") ON DELETE CASCADE;


--
-- Name: exam_terms exam_terms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."exam_terms"
    ADD CONSTRAINT "exam_terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_concession_requests fee_concession_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_concession_requests fee_concession_requests_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE CASCADE;


--
-- Name: fee_concession_requests fee_concession_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_concession_requests fee_concession_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_concession_requests fee_concession_requests_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_concession_requests"
    ADD CONSTRAINT "fee_concession_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: fee_day_closes fee_day_closes_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_day_closes"
    ADD CONSTRAINT "fee_day_closes_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_day_closes fee_day_closes_reopened_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_day_closes"
    ADD CONSTRAINT "fee_day_closes_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_day_closes fee_day_closes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_day_closes"
    ADD CONSTRAINT "fee_day_closes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_invoices fee_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_invoices fee_invoices_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_invoices fee_invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_invoices"
    ADD CONSTRAINT "fee_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: fee_payments fee_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE RESTRICT;


--
-- Name: fee_payments fee_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_payments fee_payments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_payments fee_payments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: fee_payments fee_payments_voided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_payments"
    ADD CONSTRAINT "fee_payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_reminders fee_reminders_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_reminders"
    ADD CONSTRAINT "fee_reminders_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_reminders fee_reminders_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_reminders"
    ADD CONSTRAINT "fee_reminders_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: fee_reminders fee_reminders_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_reminders"
    ADD CONSTRAINT "fee_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: fee_structures fee_structures_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_structures"
    ADD CONSTRAINT "fee_structures_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: fee_structures fee_structures_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."fee_structures"
    ADD CONSTRAINT "fee_structures_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: guardians guardians_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: guardians guardians_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."guardians"
    ADD CONSTRAINT "guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: hr_departments hr_departments_head_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_departments"
    ADD CONSTRAINT "hr_departments_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: hr_departments hr_departments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_departments"
    ADD CONSTRAINT "hr_departments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: hr_grades hr_grades_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_grades"
    ADD CONSTRAINT "hr_grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: hr_posts hr_posts_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_posts"
    ADD CONSTRAINT "hr_posts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE CASCADE;


--
-- Name: hr_posts hr_posts_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_posts"
    ADD CONSTRAINT "hr_posts_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."hr_grades"("id") ON DELETE CASCADE;


--
-- Name: hr_posts hr_posts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_posts"
    ADD CONSTRAINT "hr_posts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: hr_posts hr_posts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_posts"
    ADD CONSTRAINT "hr_posts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: hr_settings hr_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_settings"
    ADD CONSTRAINT "hr_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: hr_settings hr_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."hr_settings"
    ADD CONSTRAINT "hr_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: incidents incidents_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: incidents incidents_logged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: incidents incidents_parent_notice_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_parent_notice_by_fkey" FOREIGN KEY ("parent_notice_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: incidents incidents_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: incidents incidents_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: lab_runs lab_runs_scene_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_runs"
    ADD CONSTRAINT "lab_runs_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "public"."lab_scenes"("id") ON DELETE SET NULL;


--
-- Name: lab_runs lab_runs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_runs"
    ADD CONSTRAINT "lab_runs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: lab_runs lab_runs_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_runs"
    ADD CONSTRAINT "lab_runs_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: lab_scenes lab_scenes_lesson_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_scenes"
    ADD CONSTRAINT "lab_scenes_lesson_plan_id_fkey" FOREIGN KEY ("lesson_plan_id") REFERENCES "public"."lesson_plans"("id") ON DELETE SET NULL;


--
-- Name: lab_scenes lab_scenes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_scenes"
    ADD CONSTRAINT "lab_scenes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: lab_scenes lab_scenes_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lab_scenes"
    ADD CONSTRAINT "lab_scenes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: leave_policies leave_policies_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: leave_policies leave_policies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_policies"
    ADD CONSTRAINT "leave_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: lesson_plans lesson_plans_homework_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_homework_assignment_id_fkey" FOREIGN KEY ("homework_assignment_id") REFERENCES "public"."assignments"("id") ON DELETE SET NULL;


--
-- Name: lesson_plans lesson_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: lesson_plans lesson_plans_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lesson_plans"
    ADD CONSTRAINT "lesson_plans_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: loan_recoveries loan_recoveries_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."loan_recoveries"
    ADD CONSTRAINT "loan_recoveries_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "public"."staff_loans"("id") ON DELETE CASCADE;


--
-- Name: loan_recoveries loan_recoveries_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."loan_recoveries"
    ADD CONSTRAINT "loan_recoveries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE CASCADE;


--
-- Name: loan_recoveries loan_recoveries_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."loan_recoveries"
    ADD CONSTRAINT "loan_recoveries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: materials materials_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: materials materials_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: notifications notifications_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: ops_access_events ops_access_events_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_access_events"
    ADD CONSTRAINT "ops_access_events_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."ops_access_grants"("id") ON DELETE CASCADE;


--
-- Name: ops_access_grants ops_access_grants_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_access_grants"
    ADD CONSTRAINT "ops_access_grants_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_access_grants ops_access_grants_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_access_grants"
    ADD CONSTRAINT "ops_access_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_accounts ops_accounts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_accounts"
    ADD CONSTRAINT "ops_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_accounts ops_accounts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_accounts"
    ADD CONSTRAINT "ops_accounts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_accounts ops_accounts_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_accounts"
    ADD CONSTRAINT "ops_accounts_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "public"."ops_territories"("id") ON DELETE SET NULL;


--
-- Name: ops_accounts ops_accounts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_accounts"
    ADD CONSTRAINT "ops_accounts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_activities ops_activities_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_activities"
    ADD CONSTRAINT "ops_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."ops_cases"("id") ON DELETE SET NULL;


--
-- Name: ops_activities ops_activities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_activities"
    ADD CONSTRAINT "ops_activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."ops_contacts"("id") ON DELETE SET NULL;


--
-- Name: ops_activities ops_activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_activities"
    ADD CONSTRAINT "ops_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_activities ops_activities_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_activities"
    ADD CONSTRAINT "ops_activities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_campaigns ops_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_campaigns"
    ADD CONSTRAINT "ops_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_canned_replies ops_canned_replies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_canned_replies"
    ADD CONSTRAINT "ops_canned_replies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_case_links ops_case_links_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_links"
    ADD CONSTRAINT "ops_case_links_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."ops_cases"("id") ON DELETE CASCADE;


--
-- Name: ops_case_links ops_case_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_links"
    ADD CONSTRAINT "ops_case_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_case_messages ops_case_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_messages"
    ADD CONSTRAINT "ops_case_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_case_messages ops_case_messages_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_case_messages"
    ADD CONSTRAINT "ops_case_messages_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."ops_cases"("id") ON DELETE CASCADE;


--
-- Name: ops_cases ops_cases_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."ops_contacts"("id") ON DELETE SET NULL;


--
-- Name: ops_cases ops_cases_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_cases ops_cases_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_cases ops_cases_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_cases"
    ADD CONSTRAINT "ops_cases_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_commissions ops_commissions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_commissions ops_commissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_commissions ops_commissions_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_commissions ops_commissions_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ops_opportunities"("id") ON DELETE SET NULL;


--
-- Name: ops_commissions ops_commissions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."ops_partners"("id") ON DELETE SET NULL;


--
-- Name: ops_commissions ops_commissions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_commissions"
    ADD CONSTRAINT "ops_commissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: ops_contacts ops_contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_contacts"
    ADD CONSTRAINT "ops_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_contacts ops_contacts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_contacts"
    ADD CONSTRAINT "ops_contacts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_contacts ops_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_contacts"
    ADD CONSTRAINT "ops_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_documents ops_documents_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_documents"
    ADD CONSTRAINT "ops_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_documents ops_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_documents"
    ADD CONSTRAINT "ops_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_marketing_spend ops_marketing_spend_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ops_campaigns"("id") ON DELETE CASCADE;


--
-- Name: ops_marketing_spend ops_marketing_spend_enquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE CASCADE;


--
-- Name: ops_marketing_spend ops_marketing_spend_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_marketing_spend ops_marketing_spend_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ops_opportunities"("id") ON DELETE CASCADE;


--
-- Name: ops_marketing_spend ops_marketing_spend_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_marketing_spend"
    ADD CONSTRAINT "ops_marketing_spend_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_operators ops_operators_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_operators"
    ADD CONSTRAINT "ops_operators_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_operators ops_operators_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_operators"
    ADD CONSTRAINT "ops_operators_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_operators ops_operators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_operators"
    ADD CONSTRAINT "ops_operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: ops_opportunities ops_opportunities_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ops_campaigns"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_enquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."ops_partners"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunities ops_opportunities_stage_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_stage_fkey" FOREIGN KEY ("stage") REFERENCES "public"."ops_opportunity_stages"("key");


--
-- Name: ops_opportunities ops_opportunities_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunities"
    ADD CONSTRAINT "ops_opportunities_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "public"."ops_territories"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunity_events ops_opportunity_events_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunity_events"
    ADD CONSTRAINT "ops_opportunity_events_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_opportunity_events ops_opportunity_events_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_opportunity_events"
    ADD CONSTRAINT "ops_opportunity_events_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ops_opportunities"("id") ON DELETE CASCADE;


--
-- Name: ops_partners ops_partners_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_partners"
    ADD CONSTRAINT "ops_partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_quote_approvals ops_quote_approvals_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quote_approvals"
    ADD CONSTRAINT "ops_quote_approvals_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_quote_approvals ops_quote_approvals_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quote_approvals"
    ADD CONSTRAINT "ops_quote_approvals_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."ops_quotes"("id") ON DELETE CASCADE;


--
-- Name: ops_quotes ops_quotes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quotes"
    ADD CONSTRAINT "ops_quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_quotes ops_quotes_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_quotes"
    ADD CONSTRAINT "ops_quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ops_opportunities"("id") ON DELETE CASCADE;


--
-- Name: ops_tasks ops_tasks_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."ops_cases"("id") ON DELETE CASCADE;


--
-- Name: ops_tasks ops_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: ops_tasks ops_tasks_enquiry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE CASCADE;


--
-- Name: ops_tasks ops_tasks_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."ops_opportunities"("id") ON DELETE CASCADE;


--
-- Name: ops_tasks ops_tasks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_tasks ops_tasks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_tasks"
    ADD CONSTRAINT "ops_tasks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: ops_territories ops_territories_default_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territories"
    ADD CONSTRAINT "ops_territories_default_owner_id_fkey" FOREIGN KEY ("default_owner_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE SET NULL;


--
-- Name: ops_territories ops_territories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territories"
    ADD CONSTRAINT "ops_territories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."ops_territories"("id") ON DELETE RESTRICT;


--
-- Name: ops_territory_members ops_territory_members_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territory_members"
    ADD CONSTRAINT "ops_territory_members_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "public"."ops_operators"("user_id") ON DELETE CASCADE;


--
-- Name: ops_territory_members ops_territory_members_territory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ops_territory_members"
    ADD CONSTRAINT "ops_territory_members_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "public"."ops_territories"("id") ON DELETE CASCADE;


--
-- Name: pay_adjustments pay_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_adjustments"
    ADD CONSTRAINT "pay_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: pay_adjustments pay_adjustments_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_adjustments"
    ADD CONSTRAINT "pay_adjustments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."pay_items"("id") ON DELETE CASCADE;


--
-- Name: pay_adjustments pay_adjustments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_adjustments"
    ADD CONSTRAINT "pay_adjustments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: pay_adjustments pay_adjustments_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_adjustments"
    ADD CONSTRAINT "pay_adjustments_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: pay_items pay_items_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_items"
    ADD CONSTRAINT "pay_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: pay_run_lines pay_run_lines_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_run_lines"
    ADD CONSTRAINT "pay_run_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE CASCADE;


--
-- Name: pay_run_lines pay_run_lines_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_run_lines"
    ADD CONSTRAINT "pay_run_lines_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: pay_run_lines pay_run_lines_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_run_lines"
    ADD CONSTRAINT "pay_run_lines_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: pay_runs pay_runs_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: pay_runs pay_runs_computed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_computed_by_fkey" FOREIGN KEY ("computed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: pay_runs pay_runs_exit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_exit_id_fkey" FOREIGN KEY ("exit_id") REFERENCES "public"."staff_exits"("id") ON DELETE SET NULL;


--
-- Name: pay_runs pay_runs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: pay_runs pay_runs_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: pay_runs pay_runs_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pay_runs"
    ADD CONSTRAINT "pay_runs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: payroll_settings payroll_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: payroll_settings payroll_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."payroll_settings"
    ADD CONSTRAINT "payroll_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: platform_config platform_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: practical_assessment practical_assessment_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: practical_assessment practical_assessment_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "public"."exam_sheets"("id") ON DELETE CASCADE;


--
-- Name: practical_assessment practical_assessment_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: practical_assessment practical_assessment_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_assessment"
    ADD CONSTRAINT "practical_assessment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: practical_progress practical_progress_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_progress"
    ADD CONSTRAINT "practical_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: practical_progress practical_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_progress"
    ADD CONSTRAINT "practical_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: practical_progress practical_progress_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."practical_progress"
    ADD CONSTRAINT "practical_progress_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: probe_acks probe_acks_acked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."probe_acks"
    ADD CONSTRAINT "probe_acks_acked_by_fkey" FOREIGN KEY ("acked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: probe_acks probe_acks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."probe_acks"
    ADD CONSTRAINT "probe_acks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: proctor_alerts proctor_alerts_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."proctor_alerts"
    ADD CONSTRAINT "proctor_alerts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;


--
-- Name: proctor_alerts proctor_alerts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."proctor_alerts"
    ADD CONSTRAINT "proctor_alerts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: proctor_alerts proctor_alerts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."proctor_alerts"
    ADD CONSTRAINT "proctor_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: qa_runs qa_runs_token_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qa_runs"
    ADD CONSTRAINT "qa_runs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."qa_upload_tokens"("id") ON DELETE SET NULL;


--
-- Name: qa_upload_tokens qa_upload_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qa_upload_tokens"
    ADD CONSTRAINT "qa_upload_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: report_card_settings report_card_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_card_settings"
    ADD CONSTRAINT "report_card_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: report_card_settings report_card_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_card_settings"
    ADD CONSTRAINT "report_card_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: report_cards report_cards_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;


--
-- Name: report_cards report_cards_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: report_cards report_cards_released_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: report_cards report_cards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: report_cards report_cards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: report_cards report_cards_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."report_cards"
    ADD CONSTRAINT "report_cards_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "public"."exam_terms"("id") ON DELETE CASCADE;


--
-- Name: role_grants role_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_grants"
    ADD CONSTRAINT "role_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: role_grants role_grants_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_grants"
    ADD CONSTRAINT "role_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: role_grants role_grants_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_grants"
    ADD CONSTRAINT "role_grants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: role_grants role_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."role_grants"
    ADD CONSTRAINT "role_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: rooms rooms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: salary_templates salary_templates_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."salary_templates"
    ADD CONSTRAINT "salary_templates_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."hr_grades"("id") ON DELETE SET NULL;


--
-- Name: salary_templates salary_templates_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."salary_templates"
    ADD CONSTRAINT "salary_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: salary_templates salary_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."salary_templates"
    ADD CONSTRAINT "salary_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sched_requirements sched_requirements_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: sched_requirements sched_requirements_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: sched_requirements sched_requirements_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: sched_requirements sched_requirements_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sched_requirements sched_requirements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_requirements"
    ADD CONSTRAINT "sched_requirements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sched_solver_settings sched_solver_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_solver_settings"
    ADD CONSTRAINT "sched_solver_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: sched_solver_settings sched_solver_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_solver_settings"
    ADD CONSTRAINT "sched_solver_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: sched_wings sched_wings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sched_wings"
    ADD CONSTRAINT "sched_wings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: school_filings school_filings_filed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_filings"
    ADD CONSTRAINT "school_filings_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: school_filings school_filings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_filings"
    ADD CONSTRAINT "school_filings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: school_filings school_filings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_filings"
    ADD CONSTRAINT "school_filings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: school_messages school_messages_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_messages"
    ADD CONSTRAINT "school_messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: school_messages school_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_messages"
    ADD CONSTRAINT "school_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: school_messages school_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_messages"
    ADD CONSTRAINT "school_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."school_threads"("id") ON DELETE CASCADE;


--
-- Name: school_threads school_threads_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_threads"
    ADD CONSTRAINT "school_threads_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: school_threads school_threads_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_threads"
    ADD CONSTRAINT "school_threads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: school_threads school_threads_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_threads"
    ADD CONSTRAINT "school_threads_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: school_threads school_threads_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."school_threads"
    ADD CONSTRAINT "school_threads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: settings_changes settings_changes_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."settings_changes"
    ADD CONSTRAINT "settings_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: shift_overrides shift_overrides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: shift_overrides shift_overrides_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: shift_overrides shift_overrides_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;


--
-- Name: shift_overrides shift_overrides_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: shift_overrides shift_overrides_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shift_overrides"
    ADD CONSTRAINT "shift_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: shifts shifts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: situations situations_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."situations"
    ADD CONSTRAINT "situations_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: situations situations_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."situations"
    ADD CONSTRAINT "situations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: situations situations_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."situations"
    ADD CONSTRAINT "situations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: situations situations_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."situations"
    ADD CONSTRAINT "situations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_absences staff_absences_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_absences staff_absences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_absences staff_absences_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_absences staff_absences_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_absences staff_absences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_absences"
    ADD CONSTRAINT "staff_absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: staff_day_marks staff_day_marks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_day_marks"
    ADD CONSTRAINT "staff_day_marks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_day_marks staff_day_marks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_day_marks"
    ADD CONSTRAINT "staff_day_marks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_day_marks staff_day_marks_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_day_marks"
    ADD CONSTRAINT "staff_day_marks_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_day_marks staff_day_marks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_day_marks"
    ADD CONSTRAINT "staff_day_marks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_documents staff_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_documents"
    ADD CONSTRAINT "staff_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_events staff_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_events"
    ADD CONSTRAINT "staff_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_events staff_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_events"
    ADD CONSTRAINT "staff_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_events staff_events_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_events"
    ADD CONSTRAINT "staff_events_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_exits staff_exits_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_exits"
    ADD CONSTRAINT "staff_exits_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_exits staff_exits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_exits"
    ADD CONSTRAINT "staff_exits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_exits staff_exits_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_exits"
    ADD CONSTRAINT "staff_exits_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_exits staff_exits_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_exits"
    ADD CONSTRAINT "staff_exits_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_jobs staff_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_jobs staff_jobs_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;


--
-- Name: staff_jobs staff_jobs_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."hr_grades"("id") ON DELETE SET NULL;


--
-- Name: staff_jobs staff_jobs_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: staff_jobs staff_jobs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_jobs staff_jobs_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_jobs"
    ADD CONSTRAINT "staff_jobs_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_loans staff_loans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_loans"
    ADD CONSTRAINT "staff_loans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_loans staff_loans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_loans"
    ADD CONSTRAINT "staff_loans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_loans staff_loans_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_loans"
    ADD CONSTRAINT "staff_loans_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_members staff_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_members staff_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE SET NULL;


--
-- Name: staff_members staff_members_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "public"."hr_grades"("id") ON DELETE SET NULL;


--
-- Name: staff_members staff_members_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: staff_members staff_members_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_members staff_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_members staff_members_wing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_members"
    ADD CONSTRAINT "staff_members_wing_id_fkey" FOREIGN KEY ("wing_id") REFERENCES "public"."sched_wings"("id") ON DELETE SET NULL;


--
-- Name: staff_noshow_alerts staff_noshow_alerts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_noshow_alerts"
    ADD CONSTRAINT "staff_noshow_alerts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_noshow_alerts staff_noshow_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_noshow_alerts"
    ADD CONSTRAINT "staff_noshow_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: staff_pay_settings staff_pay_settings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_pay_settings"
    ADD CONSTRAINT "staff_pay_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_pay_settings staff_pay_settings_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_pay_settings"
    ADD CONSTRAINT "staff_pay_settings_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_pay_settings staff_pay_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_pay_settings"
    ADD CONSTRAINT "staff_pay_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_profiles staff_profiles_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_profiles staff_profiles_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_profiles staff_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_profiles"
    ADD CONSTRAINT "staff_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_punches staff_punches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_punches staff_punches_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."attendance_devices"("id") ON DELETE SET NULL;


--
-- Name: staff_punches staff_punches_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_punches staff_punches_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_punches staff_punches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_punches"
    ADD CONSTRAINT "staff_punches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: staff_qualifications staff_qualifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_qualifications staff_qualifications_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."staff_documents"("id") ON DELETE SET NULL;


--
-- Name: staff_qualifications staff_qualifications_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_qualifications staff_qualifications_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_qualifications staff_qualifications_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_qualifications"
    ADD CONSTRAINT "staff_qualifications_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_salaries staff_salaries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_salaries staff_salaries_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_salaries staff_salaries_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_salaries staff_salaries_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_salaries"
    ADD CONSTRAINT "staff_salaries_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."salary_templates"("id") ON DELETE SET NULL;


--
-- Name: staff_shift_plans staff_shift_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_shift_plans staff_shift_plans_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;


--
-- Name: staff_shift_plans staff_shift_plans_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_shift_plans staff_shift_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: staff_shift_plans staff_shift_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_shift_plans"
    ADD CONSTRAINT "staff_shift_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: staff_statutory staff_statutory_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_statutory"
    ADD CONSTRAINT "staff_statutory_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: staff_statutory staff_statutory_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_statutory"
    ADD CONSTRAINT "staff_statutory_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: staff_statutory staff_statutory_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."staff_statutory"
    ADD CONSTRAINT "staff_statutory_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: statutory_overrides statutory_overrides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."statutory_overrides"
    ADD CONSTRAINT "statutory_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: statutory_overrides statutory_overrides_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."statutory_overrides"
    ADD CONSTRAINT "statutory_overrides_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: student_chats student_chats_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_chats"
    ADD CONSTRAINT "student_chats_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: student_memory student_memory_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_memory"
    ADD CONSTRAINT "student_memory_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: student_subjects student_subjects_class_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE CASCADE;


--
-- Name: student_subjects student_subjects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: student_subjects student_subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: student_subjects student_subjects_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."student_subjects"
    ADD CONSTRAINT "student_subjects_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: subject_leads subject_leads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subject_leads"
    ADD CONSTRAINT "subject_leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: subject_leads subject_leads_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subject_leads"
    ADD CONSTRAINT "subject_leads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: subject_leads subject_leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."subject_leads"
    ADD CONSTRAINT "subject_leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: submission_items submission_items_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;


--
-- Name: submission_items submission_items_outcome_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_outcome_code_fkey" FOREIGN KEY ("outcome_code") REFERENCES "public"."learning_outcomes"("outcome_code");


--
-- Name: submission_items submission_items_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: submission_items submission_items_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: submission_items submission_items_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submission_items"
    ADD CONSTRAINT "submission_items_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;


--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;


--
-- Name: submissions submissions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: superadmins superadmins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: syllabus_progress syllabus_progress_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus_progress"
    ADD CONSTRAINT "syllabus_progress_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: syllabus_progress syllabus_progress_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus_progress"
    ADD CONSTRAINT "syllabus_progress_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: syllabus syllabus_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus"
    ADD CONSTRAINT "syllabus_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: syllabus syllabus_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."syllabus"
    ADD CONSTRAINT "syllabus_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tax_declarations tax_declarations_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: tax_declarations tax_declarations_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: tax_declarations tax_declarations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tax_declarations tax_declarations_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tax_declarations"
    ADD CONSTRAINT "tax_declarations_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: teacher_load_rules teacher_load_rules_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_load_rules"
    ADD CONSTRAINT "teacher_load_rules_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: teacher_load_rules teacher_load_rules_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_load_rules"
    ADD CONSTRAINT "teacher_load_rules_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: teacher_load_rules teacher_load_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_load_rules"
    ADD CONSTRAINT "teacher_load_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: teacher_load_rules teacher_load_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_load_rules"
    ADD CONSTRAINT "teacher_load_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_class_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: teacher_subjects teacher_subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: teacher_subjects teacher_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."teacher_subjects"
    ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: timetable_slots timetable_slots_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: timetable_slots timetable_slots_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: timetable_slots timetable_slots_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE SET NULL;


--
-- Name: timetable_slots timetable_slots_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: timetable_slots timetable_slots_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_slots"
    ADD CONSTRAINT "timetable_slots_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."timetable_versions"("id") ON DELETE CASCADE;


--
-- Name: timetable_versions timetable_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_versions"
    ADD CONSTRAINT "timetable_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: timetable_versions timetable_versions_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_versions"
    ADD CONSTRAINT "timetable_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: timetable_versions timetable_versions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."timetable_versions"
    ADD CONSTRAINT "timetable_versions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: tml_scores tml_scores_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tml_scores"
    ADD CONSTRAINT "tml_scores_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: tml_scores tml_scores_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tml_scores"
    ADD CONSTRAINT "tml_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tutor_guard_events tutor_guard_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_guard_events"
    ADD CONSTRAINT "tutor_guard_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: tutor_guard_events tutor_guard_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_guard_events"
    ADD CONSTRAINT "tutor_guard_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tutor_session_turns tutor_session_turns_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_session_turns"
    ADD CONSTRAINT "tutor_session_turns_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tutor_sessions tutor_sessions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_sessions"
    ADD CONSTRAINT "tutor_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: tutor_sessions tutor_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tutor_sessions"
    ADD CONSTRAINT "tutor_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: users users_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: visit_sessions visit_sessions_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visit_sessions"
    ADD CONSTRAINT "visit_sessions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: visit_sessions visit_sessions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visit_sessions"
    ADD CONSTRAINT "visit_sessions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: visit_sessions visit_sessions_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visit_sessions"
    ADD CONSTRAINT "visit_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE SET NULL;


--
-- Name: visit_sessions visit_sessions_staff_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."visit_sessions"
    ADD CONSTRAINT "visit_sessions_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE CASCADE;


--
-- Name: wellness_logs wellness_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wellness_logs"
    ADD CONSTRAINT "wellness_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: wellness_logs wellness_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wellness_logs"
    ADD CONSTRAINT "wellness_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_links whatsapp_links_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_links"
    ADD CONSTRAINT "whatsapp_links_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_links whatsapp_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_links"
    ADD CONSTRAINT "whatsapp_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: whatsapp_log whatsapp_log_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_log"
    ADD CONSTRAINT "whatsapp_log_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;


--
-- Name: whatsapp_log whatsapp_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."whatsapp_log"
    ADD CONSTRAINT "whatsapp_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: academic_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."academic_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_events academic_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "academic_events_read" ON "public"."academic_events" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: account_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."account_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: account_requests account_requests_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account_requests_read" ON "public"."account_requests" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('admissions.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('admissions.manage'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: admission_applicants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admission_applicants" ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_applicants admission_applicants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admission_applicants_read" ON "public"."admission_applicants" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('admissions.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: admission_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admission_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: admission_events admission_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admission_events_read" ON "public"."admission_events" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('admissions.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_error_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_error_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_errors" ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: assignments assignments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignments_read" ON "public"."assignments" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ( SELECT "app"."is_staff"() AS "is_staff")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: assignments assignments_staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignments_staff_delete" ON "public"."assignments" FOR DELETE TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm"))));


--
-- Name: assignments assignments_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignments_staff_insert" ON "public"."assignments" FOR INSERT TO "authenticated" WITH CHECK ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm"))));


--
-- Name: assignments assignments_staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "assignments_staff_update" ON "public"."assignments" FOR UPDATE TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm")))) WITH CHECK ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm"))));


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attendance_devices" ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_devices attendance_devices_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_devices_read" ON "public"."attendance_devices" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: attendance_month_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attendance_month_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_month_reviews attendance_month_reviews_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_month_reviews_read" ON "public"."attendance_month_reviews" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: attendance attendance_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_read" ON "public"."attendance" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR "app"."is_parent_of"("student_id") OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."is_teacher"() AS "is_teacher") AND "app"."teaches_student"("student_id"))) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ( SELECT "app"."has_perm"('attendance.read'::"text") AS "has_perm")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: attendance_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."attendance_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_settings attendance_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendance_settings_read" ON "public"."attendance_settings" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit_log_read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('audit.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: bell_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bell_periods" ENABLE ROW LEVEL SECURITY;

--
-- Name: bell_periods bell_periods_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bell_periods_read" ON "public"."bell_periods" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: bell_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."bell_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: bell_schedules bell_schedules_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "bell_schedules_read" ON "public"."bell_schedules" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: class_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."class_subjects" ENABLE ROW LEVEL SECURITY;

--
-- Name: class_subjects class_subjects_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "class_subjects_read" ON "public"."class_subjects" FOR SELECT TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "classes_read" ON "public"."classes" FOR SELECT TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: classes classes_superadmin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "classes_superadmin_write" ON "public"."classes" TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: comp_off_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."comp_off_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: comp_off_grants comp_off_grants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comp_off_grants_read" ON "public"."comp_off_grants" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('leave.approve'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."consents" ENABLE ROW LEVEL SECURITY;

--
-- Name: consents consents_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "consents_read" ON "public"."consents" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR "app"."is_parent_of"("student_id") OR (( SELECT "app"."has_perm"('compliance.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: course_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."course_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_plans course_plans_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "course_plans_staff_read" ON "public"."course_plans" FOR SELECT TO "authenticated" USING (((( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: cover_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cover_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: cover_assignments cover_assignments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cover_assignments_read" ON "public"."cover_assignments" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: doc_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."doc_counters" ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."duty_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_assignments duty_assignments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "duty_assignments_read" ON "public"."duty_assignments" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: duty_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."duty_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_posts duty_posts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "duty_posts_read" ON "public"."duty_posts" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: duty_roster; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."duty_roster" ENABLE ROW LEVEL SECURITY;

--
-- Name: duty_roster duty_roster_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "duty_roster_read" ON "public"."duty_roster" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: engagement_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."engagement_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: engagement_scores engagement_scores_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagement_scores_read" ON "public"."engagement_scores" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: enquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."enquiries" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_assessments" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_class_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_class_terms" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_marks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_marks" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_schemes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_schemes" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_sheets" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_student_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_student_terms" ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."exam_terms" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_concession_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_concession_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_concession_requests fee_concession_requests_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_concession_requests_read" ON "public"."fee_concession_requests" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: fee_day_closes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_day_closes" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_day_closes fee_day_closes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_day_closes_read" ON "public"."fee_day_closes" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: fee_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_invoices fee_invoices_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_invoices_read" ON "public"."fee_invoices" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: fee_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_payments fee_payments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_payments_read" ON "public"."fee_payments" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: fee_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_reminders" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_reminders fee_reminders_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_reminders_read" ON "public"."fee_reminders" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: fee_structures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."fee_structures" ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_structures fee_structures_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fee_structures_read" ON "public"."fee_structures" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('fees.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ((( SELECT "app"."user_role"() AS "user_role") = 'parent'::"text") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: guardians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."guardians" ENABLE ROW LEVEL SECURITY;

--
-- Name: guardians guardians_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "guardians_admin_write" ON "public"."guardians" TO "authenticated" USING (((( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm") AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "guardians"."student_id") AND ("u"."school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")))))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin"))) WITH CHECK (((( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm") AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "guardians"."student_id") AND ("u"."school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")))))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: guardians guardians_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "guardians_read" ON "public"."guardians" FOR SELECT TO "authenticated" USING ((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ((( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('compliance.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('fees.remind'::"text") AS "has_perm")) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "guardians"."student_id") AND ("u"."school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")))))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: hr_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hr_departments" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_grades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hr_grades" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hr_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."hr_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents incidents_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "incidents_read" ON "public"."incidents" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (("logged_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "app"."has_perm"('incidents.manage'::"text") AS "has_perm") OR (("category" <> 'child_protection'::"text") AND (( SELECT "app"."has_perm"('feed.read'::"text") AS "has_perm") OR (( SELECT "app"."is_teacher"() AS "is_teacher") AND ("student_id" IS NOT NULL) AND "app"."teaches_student"("student_id")) OR (( SELECT "app"."is_teacher"() AS "is_teacher") AND ("student_id" IS NULL) AND ("class_name" IS NOT NULL) AND "app"."teaches_class"("class_name")))))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: lab_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lab_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_runs lab_runs_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lab_runs_staff_read" ON "public"."lab_runs" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: lab_scenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lab_scenes" ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_scenes lab_scenes_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lab_scenes_staff_read" ON "public"."lab_scenes" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: learning_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."learning_outcomes" ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_outcomes learning_outcomes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "learning_outcomes_read" ON "public"."learning_outcomes" FOR SELECT TO "authenticated" USING (true);


--
-- Name: learning_outcomes learning_outcomes_superadmin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "learning_outcomes_superadmin_write" ON "public"."learning_outcomes" TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: leave_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."leave_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_policies leave_policies_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leave_policies_read" ON "public"."leave_policies" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_requests leave_requests_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leave_requests_read" ON "public"."leave_requests" FOR SELECT TO "authenticated" USING ((("staff_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: lesson_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lesson_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_plans lesson_plans_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lesson_plans_staff_read" ON "public"."lesson_plans" FOR SELECT TO "authenticated" USING (((( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: loan_recoveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."loan_recoveries" ENABLE ROW LEVEL SECURITY;

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;

--
-- Name: materials materials_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "materials_read" ON "public"."materials" FOR SELECT TO "authenticated" USING ((("school_id" IS NULL) OR ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: materials materials_staff_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "materials_staff_write" ON "public"."materials" TO "authenticated" USING ((((( SELECT "app"."is_teacher"() AS "is_teacher") OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm")) AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin"))) WITH CHECK ((((( SELECT "app"."is_teacher"() AS "is_teacher") OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm")) AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_mark_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_mark_read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: notifications notifications_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications_read" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("student_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: ops_access_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_access_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_access_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_access_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_activities" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_campaigns" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_canned_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_canned_replies" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_case_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_case_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_case_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_case_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_cases" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_commission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_commission_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_commissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_discount_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_discount_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_job_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_job_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_marketing_spend; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_marketing_spend" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_operators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_operators" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_opportunities" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_opportunity_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_opportunity_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_opportunity_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_opportunity_stages" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_partners" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_picklists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_picklists" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_quote_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_quote_approvals" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_quotes" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_sla_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_sla_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_territories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_territories" ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_territory_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ops_territory_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pay_adjustments" ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pay_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_run_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pay_run_lines" ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pay_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."payroll_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."platform_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: practical_assessment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."practical_assessment" ENABLE ROW LEVEL SECURITY;

--
-- Name: practical_assessment practical_assessment_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "practical_assessment_staff_read" ON "public"."practical_assessment" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: practical_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."practical_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: practical_progress practical_progress_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "practical_progress_staff_read" ON "public"."practical_progress" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: probe_acks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."probe_acks" ENABLE ROW LEVEL SECURITY;

--
-- Name: probe_acks probe_acks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "probe_acks_read" ON "public"."probe_acks" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('probe.view'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: proctor_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."proctor_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: proctor_alerts proctor_alerts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "proctor_alerts_read" ON "public"."proctor_alerts" FOR SELECT TO "authenticated" USING (((( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: qa_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qa_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: qa_upload_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."qa_upload_tokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: report_card_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."report_card_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: report_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."report_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: request_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."request_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: role_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."role_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: role_grants role_grants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_grants_read" ON "public"."role_grants" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."has_perm"('access.manage'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "role_permissions_read" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);


--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms rooms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rooms_read" ON "public"."rooms" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: salary_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."salary_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: sched_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sched_requirements" ENABLE ROW LEVEL SECURITY;

--
-- Name: sched_requirements sched_requirements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sched_requirements_read" ON "public"."sched_requirements" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: sched_solver_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sched_solver_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: sched_solver_settings sched_solver_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sched_solver_settings_read" ON "public"."sched_solver_settings" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: sched_wings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sched_wings" ENABLE ROW LEVEL SECURITY;

--
-- Name: sched_wings sched_wings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sched_wings_read" ON "public"."sched_wings" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: school_filings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."school_filings" ENABLE ROW LEVEL SECURITY;

--
-- Name: school_filings school_filings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school_filings_read" ON "public"."school_filings" FOR SELECT TO "authenticated" USING (((( SELECT "app"."has_perm"('wellness.read'::"text") AS "has_perm") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: school_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."school_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: school_messages school_messages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school_messages_read" ON "public"."school_messages" FOR SELECT TO "authenticated" USING ("app"."can_see_thread"("thread_id"));


--
-- Name: school_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."school_threads" ENABLE ROW LEVEL SECURITY;

--
-- Name: school_threads school_threads_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school_threads_read" ON "public"."school_threads" FOR SELECT TO "authenticated" USING (((("parent_id" = ( SELECT "auth"."uid"() AS "uid")) AND "app"."is_parent_of"("student_id")) OR ("staff_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ( SELECT "app"."has_perm"('messages.office'::"text") AS "has_perm")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schools_read" ON "public"."schools" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: schools schools_superadmin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "schools_superadmin_write" ON "public"."schools" TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: settings_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."settings_changes" ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shift_overrides" ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_overrides shift_overrides_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "shift_overrides_read" ON "public"."shift_overrides" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "shifts_read" ON "public"."shifts" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: situations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."situations" ENABLE ROW LEVEL SECURITY;

--
-- Name: situations situations_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "situations_read" ON "public"."situations" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((("audience" = 'staff'::"text") AND ( SELECT "app"."is_teacher"() AS "is_teacher") AND (("teacher_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("teacher_id" IS NULL) AND ("student_id" IS NOT NULL) AND "app"."teaches_student"("student_id")) OR (("teacher_id" IS NULL) AND ("student_id" IS NULL) AND ("class_name" IS NOT NULL) AND "app"."teaches_class"("class_name")))) OR (("audience" = 'staff'::"text") AND ( SELECT "app"."has_perm"('feed.read'::"text") AS "has_perm")) OR (("audience" <> 'safeguarding'::"text") AND ( SELECT "app"."has_perm"('incidents.manage'::"text") AS "has_perm")) OR (("audience" = 'safeguarding'::"text") AND ( SELECT "app"."has_perm"('safeguarding.read'::"text") AS "has_perm")))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_absences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_absences" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_absences staff_absences_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_absences_read" ON "public"."staff_absences" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_day_marks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_day_marks" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_day_marks staff_day_marks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_day_marks_read" ON "public"."staff_day_marks" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_documents" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_exits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_exits" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_loans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_loans" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_members staff_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_members_read" ON "public"."staff_members" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_noshow_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_noshow_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_pay_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_pay_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_punches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_punches" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_punches staff_punches_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_punches_read" ON "public"."staff_punches" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_qualifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_salaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_salaries" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_shift_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_shift_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_shift_plans staff_shift_plans_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_shift_plans_read" ON "public"."staff_shift_plans" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: staff_statutory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."staff_statutory" ENABLE ROW LEVEL SECURITY;

--
-- Name: statutory_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."statutory_overrides" ENABLE ROW LEVEL SECURITY;

--
-- Name: statutory_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."statutory_rates" ENABLE ROW LEVEL SECURITY;

--
-- Name: student_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."student_chats" ENABLE ROW LEVEL SECURITY;

--
-- Name: student_chats student_chats_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student_chats_own" ON "public"."student_chats" TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("student_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: student_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."student_memory" ENABLE ROW LEVEL SECURITY;

--
-- Name: student_memory student_memory_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student_memory_own_read" ON "public"."student_memory" FOR SELECT TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: student_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."student_subjects" ENABLE ROW LEVEL SECURITY;

--
-- Name: student_subjects student_subjects_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student_subjects_read" ON "public"."student_subjects" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "app"."is_parent_of"("student_subjects"."student_id") AS "is_parent_of") OR (( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: subject_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."subject_leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: subject_leads subject_leads_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "subject_leads_read" ON "public"."subject_leads" FOR SELECT TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: submission_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."submission_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: submission_items submission_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "submission_items_read" ON "public"."submission_items" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: submissions submissions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "submissions_read" ON "public"."submissions" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: superadmins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."superadmins" ENABLE ROW LEVEL SECURITY;

--
-- Name: superadmins superadmins_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "superadmins_read" ON "public"."superadmins" FOR SELECT TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: syllabus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."syllabus" ENABLE ROW LEVEL SECURITY;

--
-- Name: syllabus_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."syllabus_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: syllabus_progress syllabus_progress_staff_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "syllabus_progress_staff_read" ON "public"."syllabus_progress" FOR SELECT TO "authenticated" USING (((( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: syllabus syllabus_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "syllabus_read" ON "public"."syllabus" FOR SELECT TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: syllabus syllabus_staff_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "syllabus_staff_write" ON "public"."syllabus" TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm")))) WITH CHECK ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ((( SELECT "app"."is_teacher"() AS "is_teacher") AND ("teacher_id" = ( SELECT "auth"."uid"() AS "uid"))) OR ( SELECT "app"."has_perm"('people.manage'::"text") AS "has_perm"))));


--
-- Name: tax_declarations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tax_declarations" ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_load_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."teacher_load_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_load_rules teacher_load_rules_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teacher_load_rules_read" ON "public"."teacher_load_rules" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: teacher_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."teacher_subjects" ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_subjects teacher_subjects_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teacher_subjects_read" ON "public"."teacher_subjects" FOR SELECT TO "authenticated" USING ((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: timetable_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."timetable_slots" ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_slots timetable_slots_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timetable_slots_read" ON "public"."timetable_slots" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR (EXISTS ( SELECT 1
   FROM "public"."timetable_versions" "v"
  WHERE (("v"."id" = "timetable_slots"."version_id") AND ("v"."status" <> 'draft'::"text")))))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: timetable_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."timetable_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: timetable_versions timetable_versions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timetable_versions_read" ON "public"."timetable_versions" FOR SELECT TO "authenticated" USING (((( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (("status" <> 'draft'::"text") OR ( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: tml_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tml_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: tml_scores tml_scores_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tml_scores_read" ON "public"."tml_scores" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("student_id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: tutor_guard_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tutor_guard_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: tutor_guard_events tutor_guard_events_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tutor_guard_events_read" ON "public"."tutor_guard_events" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND ( SELECT "app"."has_perm"('feed.read'::"text") AS "has_perm")) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: tutor_session_turns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tutor_session_turns" ENABLE ROW LEVEL SECURITY;

--
-- Name: tutor_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tutor_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: tutor_sessions tutor_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tutor_sessions_read" ON "public"."tutor_sessions" FOR SELECT TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."sees_learning"() AS "sees_learning") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_read" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "app"."is_staff"() AS "is_staff") AND ("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id"))) OR "app"."is_parent_of"("id") OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: users users_superadmin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_superadmin_write" ON "public"."users" TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin")) WITH CHECK (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: visit_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."visit_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: visit_sessions visit_sessions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "visit_sessions_read" ON "public"."visit_sessions" FOR SELECT TO "authenticated" USING (((("school_id" = ( SELECT "app"."current_school_id"() AS "current_school_id")) AND (( SELECT "app"."has_perm"('schedule.academic'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('schedule.workforce'::"text") AS "has_perm") OR ( SELECT "app"."has_perm"('workforce.read'::"text") AS "has_perm"))) OR ( SELECT "app"."is_superadmin"() AS "is_superadmin")));


--
-- Name: wellness_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."wellness_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: wellness_logs wellness_own_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wellness_own_delete" ON "public"."wellness_logs" FOR DELETE TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: wellness_logs wellness_own_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wellness_own_insert" ON "public"."wellness_logs" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT ("school_id" IS DISTINCT FROM ( SELECT "app"."current_school_id"() AS "current_school_id"))) AND "app"."has_wellness_consent"("student_id")));


--
-- Name: wellness_logs wellness_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wellness_own_read" ON "public"."wellness_logs" FOR SELECT TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: wellness_logs wellness_own_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wellness_own_update" ON "public"."wellness_logs" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND "app"."has_wellness_consent"("student_id"))) WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT ("school_id" IS DISTINCT FROM ( SELECT "app"."current_school_id"() AS "current_school_id"))) AND "app"."has_wellness_consent"("student_id")));


--
-- Name: whatsapp_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."whatsapp_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."whatsapp_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_log whatsapp_log_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp_log_read" ON "public"."whatsapp_log" FOR SELECT TO "authenticated" USING (( SELECT "app"."is_superadmin"() AS "is_superadmin"));


--
-- Name: SCHEMA "app"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "app" TO "authenticated";
GRANT USAGE ON SCHEMA "app" TO "anon";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "audit"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."audit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."audit"() TO "authenticated";


--
-- Name: FUNCTION "bootstrap_school_admin"(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."bootstrap_school_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."bootstrap_school_admin"() TO "service_role";


--
-- Name: FUNCTION "can_see_thread"("p_thread" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."can_see_thread"("p_thread" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."can_see_thread"("p_thread" "uuid") TO "authenticated";


--
-- Name: FUNCTION "current_school_id"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."current_school_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."current_school_id"() TO "authenticated";


--
-- Name: FUNCTION "day_closed"("p_school" "uuid", "p_day" "date"); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."day_closed"("p_school" "uuid", "p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "app"."day_closed"("p_school" "uuid", "p_day" "date") TO "service_role";


--
-- Name: FUNCTION "enrol_core"("p_class_subject" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."enrol_core"("p_class_subject" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "grade_of"("t" "text"); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."grade_of"("t" "text") TO "authenticated";


--
-- Name: FUNCTION "guard_director"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_director"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_fee_payment"(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."guard_fee_payment"() TO "authenticated";


--
-- Name: FUNCTION "guard_notification_update"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_notification_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."guard_notification_update"() TO "authenticated";


--
-- Name: FUNCTION "guard_role_grant"(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."guard_role_grant"() TO "authenticated";
GRANT ALL ON FUNCTION "app"."guard_role_grant"() TO "service_role";


--
-- Name: FUNCTION "guard_subject_link"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_subject_link"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_superadmin"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_superadmin"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_superadmin_list"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_superadmin_list"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_wellness_insert"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_wellness_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."guard_wellness_insert"() TO "authenticated";


--
-- Name: FUNCTION "guard_wellness_update"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."guard_wellness_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."guard_wellness_update"() TO "authenticated";


--
-- Name: FUNCTION "has_perm"("p" "text"); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."has_perm"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "app"."has_perm"("p" "text") TO "service_role";


--
-- Name: FUNCTION "has_wellness_consent"("p_student" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."has_wellness_consent"("p_student" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."has_wellness_consent"("p_student" "uuid") TO "authenticated";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_admin"() TO "authenticated";


--
-- Name: FUNCTION "is_parent_of"("p_student" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."is_parent_of"("p_student" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_parent_of"("p_student" "uuid") TO "authenticated";


--
-- Name: FUNCTION "is_server"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."is_server"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_server"() TO "authenticated";


--
-- Name: FUNCTION "is_staff"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."is_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_staff"() TO "authenticated";


--
-- Name: FUNCTION "is_superadmin"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."is_superadmin"() TO "authenticated";


--
-- Name: FUNCTION "is_teacher"(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."is_teacher"() TO "authenticated";


--
-- Name: FUNCTION "next_doc_no"("p_school" "uuid", "p_kind" "text", "p_session" "text"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."next_doc_no"("p_school" "uuid", "p_kind" "text", "p_session" "text") FROM PUBLIC;


--
-- Name: FUNCTION "norm_class"("t" "text"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."norm_class"("t" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."norm_class"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "app"."norm_class"("t" "text") TO "service_role";


--
-- Name: FUNCTION "on_class_rename"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."on_class_rename"() FROM PUBLIC;


--
-- Name: FUNCTION "on_class_subject_change"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."on_class_subject_change"() FROM PUBLIC;


--
-- Name: FUNCTION "on_student_class_change"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."on_student_class_change"() FROM PUBLIC;


--
-- Name: FUNCTION "on_teacher_subject_change"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."on_teacher_subject_change"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_access_grants_guard"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_access_grants_guard"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_case_messages_guard"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_case_messages_guard"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_commissions_guard"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_commissions_guard"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_inspect_links"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_inspect_links"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_inspectable"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_inspectable"() FROM PUBLIC;


--
-- Name: FUNCTION "ops_quotes_guard"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."ops_quotes_guard"() FROM PUBLIC;


--
-- Name: FUNCTION "perm_holders"("p_school" "uuid", "p" "text"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."perm_holders"("p_school" "uuid", "p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."perm_holders"("p_school" "uuid", "p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "app"."perm_holders"("p_school" "uuid", "p" "text") TO "service_role";


--
-- Name: FUNCTION "reconcile_student_subjects"("p_student" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."reconcile_student_subjects"("p_student" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "relabel_timetable_subject"("p_school" "uuid", "p_class_key" "text", "p_from" "text", "p_to" "text"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."relabel_timetable_subject"("p_school" "uuid", "p_class_key" "text", "p_from" "text", "p_to" "text") FROM PUBLIC;


--
-- Name: FUNCTION "release_staff_threads"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."release_staff_threads"() FROM PUBLIC;


--
-- Name: FUNCTION "sees_learning"(); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."sees_learning"() TO "authenticated";


--
-- Name: FUNCTION "strip_answer_key"("qs" "jsonb"); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."strip_answer_key"("qs" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "sync_class_subject_meta"("p_class" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."sync_class_subject_meta"("p_class" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "sync_teacher_assignments"("p_teacher" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."sync_teacher_assignments"("p_teacher" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "teaches_class"("p_class" "text"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."teaches_class"("p_class" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."teaches_class"("p_class" "text") TO "authenticated";


--
-- Name: FUNCTION "teaches_student"("p_student" "uuid"); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."teaches_student"("p_student" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."teaches_student"("p_student" "uuid") TO "authenticated";


--
-- Name: FUNCTION "touch_updated_at"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."touch_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."touch_updated_at"() TO "authenticated";


--
-- Name: FUNCTION "user_has_perm"("u" "uuid", "p" "text"); Type: ACL; Schema: app; Owner: -
--

GRANT ALL ON FUNCTION "app"."user_has_perm"("u" "uuid", "p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "app"."user_has_perm"("u" "uuid", "p" "text") TO "service_role";


--
-- Name: FUNCTION "user_role"(); Type: ACL; Schema: app; Owner: -
--

REVOKE ALL ON FUNCTION "app"."user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "app"."user_role"() TO "authenticated";


--
-- Name: TABLE "fee_day_closes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_day_closes" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_day_closes" TO "service_role";


--
-- Name: FUNCTION "admin_close_day"("p_school" "uuid", "p_day" "date", "p_cash_counted" numeric, "p_note" "text", "p_actor" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_close_day"("p_school" "uuid", "p_day" "date", "p_cash_counted" numeric, "p_note" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_close_day"("p_school" "uuid", "p_day" "date", "p_cash_counted" numeric, "p_note" "text", "p_actor" "uuid") TO "service_role";


--
-- Name: TABLE "fee_concession_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_concession_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_concession_requests" TO "service_role";


--
-- Name: FUNCTION "admin_decide_concession"("p_school" "uuid", "p_request" "uuid", "p_approve" boolean, "p_note" "text", "p_actor" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_decide_concession"("p_school" "uuid", "p_request" "uuid", "p_approve" boolean, "p_note" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_decide_concession"("p_school" "uuid", "p_request" "uuid", "p_approve" boolean, "p_note" "text", "p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "admin_invoice_student"("p_school" "uuid", "p_student" "uuid", "p_session" "text", "p_actor" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_invoice_student"("p_school" "uuid", "p_student" "uuid", "p_session" "text", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_invoice_student"("p_school" "uuid", "p_student" "uuid", "p_session" "text", "p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "admin_raise_invoices"("p_school" "uuid", "p_session" "text", "p_instalment" integer, "p_actor" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_raise_invoices"("p_school" "uuid", "p_session" "text", "p_instalment" integer, "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_raise_invoices"("p_school" "uuid", "p_session" "text", "p_instalment" integer, "p_actor" "uuid") TO "service_role";


--
-- Name: TABLE "fee_payments"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_payments" TO "service_role";


--
-- Name: FUNCTION "admin_record_payment"("p_school" "uuid", "p_invoice" "uuid", "p_amount" numeric, "p_mode" "text", "p_reference" "text", "p_paid_on" "date", "p_actor" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_record_payment"("p_school" "uuid", "p_invoice" "uuid", "p_amount" numeric, "p_mode" "text", "p_reference" "text", "p_paid_on" "date", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_record_payment"("p_school" "uuid", "p_invoice" "uuid", "p_amount" numeric, "p_mode" "text", "p_reference" "text", "p_paid_on" "date", "p_actor" "uuid") TO "service_role";


--
-- Name: FUNCTION "admin_teacher_work"("p_school" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_teacher_work"("p_school" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_teacher_work"("p_school" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_teacher_work"("p_school" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "exam_attendance"("p_school" "uuid", "p_from" "date", "p_to" "date"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."exam_attendance"("p_school" "uuid", "p_from" "date", "p_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exam_attendance"("p_school" "uuid", "p_from" "date", "p_to" "date") TO "service_role";


--
-- Name: FUNCTION "exam_fee_dues"("p_school" "uuid", "p_today" "date"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."exam_fee_dues"("p_school" "uuid", "p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exam_fee_dues"("p_school" "uuid", "p_today" "date") TO "service_role";


--
-- Name: FUNCTION "hr_daily"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hr_daily"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_daily"() TO "service_role";


--
-- Name: FUNCTION "hr_link_login"("p_school" "uuid", "p_member" "uuid", "p_user" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hr_link_login"("p_school" "uuid", "p_member" "uuid", "p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_link_login"("p_school" "uuid", "p_member" "uuid", "p_user" "uuid") TO "service_role";


--
-- Name: FUNCTION "hr_next_employee_code"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hr_next_employee_code"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_next_employee_code"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "hr_reassign_reports"("p_school" "uuid", "p_from" "uuid", "p_to" "uuid", "p_on" "date", "p_reason" "text", "p_by" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hr_reassign_reports"("p_school" "uuid", "p_from" "uuid", "p_to" "uuid", "p_on" "date", "p_reason" "text", "p_by" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_reassign_reports"("p_school" "uuid", "p_from" "uuid", "p_to" "uuid", "p_on" "date", "p_reason" "text", "p_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "hr_sync_jobs"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."hr_sync_jobs"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_sync_jobs"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "log_app_error"("p_fingerprint" "text", "p_source" "text", "p_kind" "text", "p_message" "text", "p_stack" "text", "p_route" "text", "p_method" "text", "p_path" "text", "p_school" "uuid", "p_user" "uuid", "p_user_role" "text", "p_release" "text", "p_environment" "text", "p_user_agent" "text", "p_digest" "text", "p_repeats" integer, "p_context" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."log_app_error"("p_fingerprint" "text", "p_source" "text", "p_kind" "text", "p_message" "text", "p_stack" "text", "p_route" "text", "p_method" "text", "p_path" "text", "p_school" "uuid", "p_user" "uuid", "p_user_role" "text", "p_release" "text", "p_environment" "text", "p_user_agent" "text", "p_digest" "text", "p_repeats" integer, "p_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_app_error"("p_fingerprint" "text", "p_source" "text", "p_kind" "text", "p_message" "text", "p_stack" "text", "p_route" "text", "p_method" "text", "p_path" "text", "p_school" "uuid", "p_user" "uuid", "p_user_role" "text", "p_release" "text", "p_environment" "text", "p_user_agent" "text", "p_digest" "text", "p_repeats" integer, "p_context" "jsonb") TO "service_role";


--
-- Name: FUNCTION "ops_ai_usage"("p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_ai_usage"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_ai_usage"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "ops_delete_account"("p_school" "uuid", "p_user" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_delete_account"("p_school" "uuid", "p_user" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_delete_account"("p_school" "uuid", "p_user" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") TO "service_role";


--
-- Name: FUNCTION "ops_delete_school"("p_school" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_delete_school"("p_school" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_delete_school"("p_school" "uuid", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") TO "service_role";


--
-- Name: FUNCTION "ops_error_stats"("p_fingerprints" "text"[], "p_since" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_error_stats"("p_fingerprints" "text"[], "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_error_stats"("p_fingerprints" "text"[], "p_since" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "ops_inspect_find"("p_school" "uuid", "p_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_inspect_find"("p_school" "uuid", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_inspect_find"("p_school" "uuid", "p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_inspect_list"("p_school" "uuid", "p_table" "text", "p_column" "text", "p_value" "uuid", "p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_inspect_list"("p_school" "uuid", "p_table" "text", "p_column" "text", "p_value" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_inspect_list"("p_school" "uuid", "p_table" "text", "p_column" "text", "p_value" "uuid", "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "ops_inspect_meta"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_inspect_meta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_inspect_meta"() TO "service_role";


--
-- Name: FUNCTION "ops_inspect_row"("p_school" "uuid", "p_table" "text", "p_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_inspect_row"("p_school" "uuid", "p_table" "text", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_inspect_row"("p_school" "uuid", "p_table" "text", "p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_jobs"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_jobs"() TO "service_role";


--
-- Name: FUNCTION "ops_login_check"("p_school" "uuid", "p_email" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_login_check"("p_school" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_login_check"("p_school" "uuid", "p_email" "text") TO "service_role";


--
-- Name: FUNCTION "ops_migrations"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_migrations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_migrations"() TO "service_role";


--
-- Name: FUNCTION "ops_norm_class"("c" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."ops_norm_class"("c" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ops_norm_class"("c" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ops_norm_class"("c" "text") TO "service_role";


--
-- Name: FUNCTION "ops_platform_health"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_platform_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_platform_health"() TO "service_role";


--
-- Name: FUNCTION "ops_registry_counts"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_registry_counts"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_registry_counts"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_rename_class_subject"("p_school" "uuid", "p_class" "text", "p_from" "text", "p_to" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_rename_class_subject"("p_school" "uuid", "p_class" "text", "p_from" "text", "p_to" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_rename_class_subject"("p_school" "uuid", "p_class" "text", "p_from" "text", "p_to" "text") TO "service_role";


--
-- Name: FUNCTION "ops_request_stats"("p_since" timestamp with time zone, "p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_request_stats"("p_since" timestamp with time zone, "p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_request_stats"("p_since" timestamp with time zone, "p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_resync_teacher"("p_teacher" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_resync_teacher"("p_teacher" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_resync_teacher"("p_teacher" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_school_ai"("p_school" "uuid", "p_since" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_school_ai"("p_school" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_school_ai"("p_school" "uuid", "p_since" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "ops_school_diagnostics"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_school_diagnostics"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_school_diagnostics"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_school_metrics"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_school_metrics"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_school_metrics"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_set_platform_config"("p_key" "text", "p_value" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_set_platform_config"("p_key" "text", "p_value" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_set_platform_config"("p_key" "text", "p_value" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text") TO "service_role";


--
-- Name: FUNCTION "ops_subject_metrics"("p_school" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_subject_metrics"("p_school" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_subject_metrics"("p_school" "uuid") TO "service_role";


--
-- Name: FUNCTION "ops_tml_stale"("p_since" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_tml_stale"("p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_tml_stale"("p_since" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "ops_update_school"("p_school" "uuid", "p_patch" "jsonb", "p_journal" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text", "p_expected" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."ops_update_school"("p_school" "uuid", "p_patch" "jsonb", "p_journal" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text", "p_expected" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ops_update_school"("p_school" "uuid", "p_patch" "jsonb", "p_journal" "jsonb", "p_reason" "text", "p_actor" "uuid", "p_actor_email" "text", "p_expected" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "parent_wellness_summary"("p_student" "uuid", "p_days" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."parent_wellness_summary"("p_student" "uuid", "p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."parent_wellness_summary"("p_student" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."parent_wellness_summary"("p_student" "uuid", "p_days" integer) TO "service_role";


--
-- Name: FUNCTION "payroll_approve_run"("p_school" "uuid", "p_run" "uuid", "p_by" "uuid", "p_recoveries" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."payroll_approve_run"("p_school" "uuid", "p_run" "uuid", "p_by" "uuid", "p_recoveries" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."payroll_approve_run"("p_school" "uuid", "p_run" "uuid", "p_by" "uuid", "p_recoveries" "jsonb") TO "service_role";


--
-- Name: FUNCTION "rls_auto_enable"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


--
-- Name: FUNCTION "school_attendance_summary"("p_from" "date", "p_to" "date", "p_month_from" "date"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."school_attendance_summary"("p_from" "date", "p_to" "date", "p_month_from" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."school_attendance_summary"("p_from" "date", "p_to" "date", "p_month_from" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."school_attendance_summary"("p_from" "date", "p_to" "date", "p_month_from" "date") TO "service_role";


--
-- Name: FUNCTION "school_wellness_aggregates"("p_days" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."school_wellness_aggregates"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."school_wellness_aggregates"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."school_wellness_aggregates"("p_days" integer) TO "service_role";


--
-- Name: FUNCTION "school_wellness_report"("p_since" "date"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."school_wellness_report"("p_since" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."school_wellness_report"("p_since" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."school_wellness_report"("p_since" "date") TO "service_role";


--
-- Name: TABLE "consents"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."consents" TO "authenticated";
GRANT ALL ON TABLE "public"."consents" TO "service_role";


--
-- Name: FUNCTION "set_consent"("p_student" "uuid", "p_type" "text", "p_granted" boolean, "p_policy_version" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_consent"("p_student" "uuid", "p_type" "text", "p_granted" boolean, "p_policy_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_consent"("p_student" "uuid", "p_type" "text", "p_granted" boolean, "p_policy_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_consent"("p_student" "uuid", "p_type" "text", "p_granted" boolean, "p_policy_version" "text") TO "service_role";


--
-- Name: FUNCTION "teacher_wellness_feed"("p_days" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."teacher_wellness_feed"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."teacher_wellness_feed"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."teacher_wellness_feed"("p_days" integer) TO "service_role";


--
-- Name: TABLE "academic_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."academic_events" TO "service_role";
GRANT SELECT ON TABLE "public"."academic_events" TO "authenticated";


--
-- Name: TABLE "account_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."account_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."account_requests" TO "authenticated";


--
-- Name: TABLE "admission_applicants"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."admission_applicants" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_applicants" TO "service_role";


--
-- Name: TABLE "admission_events"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."admission_events" TO "authenticated";
GRANT ALL ON TABLE "public"."admission_events" TO "service_role";


--
-- Name: TABLE "ai_usage"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";


--
-- Name: SEQUENCE "ai_usage_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ai_usage_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_usage_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_usage_id_seq" TO "service_role";


--
-- Name: TABLE "app_error_groups"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."app_error_groups" TO "service_role";


--
-- Name: TABLE "app_errors"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."app_errors" TO "service_role";


--
-- Name: SEQUENCE "app_errors_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."app_errors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_errors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_errors_id_seq" TO "service_role";


--
-- Name: TABLE "assignments"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."assignments" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";


--
-- Name: TABLE "assignments_student"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."assignments_student" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments_student" TO "service_role";


--
-- Name: TABLE "attendance"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."attendance" TO "service_role";
GRANT SELECT ON TABLE "public"."attendance" TO "authenticated";


--
-- Name: TABLE "attendance_devices"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."attendance_devices" TO "service_role";
GRANT SELECT ON TABLE "public"."attendance_devices" TO "authenticated";


--
-- Name: TABLE "attendance_month_reviews"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."attendance_month_reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."attendance_month_reviews" TO "authenticated";


--
-- Name: TABLE "attendance_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."attendance_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."attendance_settings" TO "authenticated";


--
-- Name: TABLE "audit_log"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";


--
-- Name: SEQUENCE "audit_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";


--
-- Name: TABLE "bell_periods"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bell_periods" TO "service_role";
GRANT SELECT ON TABLE "public"."bell_periods" TO "authenticated";


--
-- Name: TABLE "bell_schedules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."bell_schedules" TO "service_role";
GRANT SELECT ON TABLE "public"."bell_schedules" TO "authenticated";


--
-- Name: TABLE "class_subjects"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."class_subjects" TO "service_role";
GRANT SELECT ON TABLE "public"."class_subjects" TO "authenticated";


--
-- Name: TABLE "classes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."classes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";


--
-- Name: TABLE "comp_off_grants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."comp_off_grants" TO "service_role";
GRANT SELECT ON TABLE "public"."comp_off_grants" TO "authenticated";


--
-- Name: TABLE "course_plans"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."course_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."course_plans" TO "service_role";


--
-- Name: TABLE "cover_assignments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cover_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."cover_assignments" TO "authenticated";


--
-- Name: TABLE "doc_counters"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."doc_counters" TO "service_role";


--
-- Name: TABLE "duty_assignments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."duty_assignments" TO "service_role";
GRANT SELECT ON TABLE "public"."duty_assignments" TO "authenticated";


--
-- Name: TABLE "duty_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."duty_posts" TO "service_role";
GRANT SELECT ON TABLE "public"."duty_posts" TO "authenticated";


--
-- Name: TABLE "duty_roster"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."duty_roster" TO "service_role";
GRANT SELECT ON TABLE "public"."duty_roster" TO "authenticated";


--
-- Name: TABLE "engagement_scores"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."engagement_scores" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."engagement_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."engagement_scores" TO "service_role";


--
-- Name: TABLE "enquiries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."enquiries" TO "service_role";


--
-- Name: TABLE "exam_assessments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_assessments" TO "service_role";


--
-- Name: TABLE "exam_class_terms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_class_terms" TO "service_role";


--
-- Name: TABLE "exam_marks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_marks" TO "service_role";


--
-- Name: TABLE "exam_schemes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_schemes" TO "service_role";


--
-- Name: TABLE "exam_sheets"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_sheets" TO "service_role";


--
-- Name: TABLE "exam_student_terms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_student_terms" TO "service_role";


--
-- Name: TABLE "exam_terms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."exam_terms" TO "service_role";


--
-- Name: TABLE "fee_invoices"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_invoices" TO "service_role";


--
-- Name: TABLE "fee_reminders"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_reminders" TO "service_role";


--
-- Name: TABLE "fee_structures"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."fee_structures" TO "authenticated";
GRANT ALL ON TABLE "public"."fee_structures" TO "service_role";


--
-- Name: TABLE "guardians"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."guardians" TO "authenticated";
GRANT ALL ON TABLE "public"."guardians" TO "service_role";


--
-- Name: TABLE "hr_departments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."hr_departments" TO "service_role";


--
-- Name: TABLE "hr_grades"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."hr_grades" TO "service_role";


--
-- Name: TABLE "hr_posts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."hr_posts" TO "service_role";


--
-- Name: TABLE "hr_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."hr_settings" TO "service_role";


--
-- Name: TABLE "incidents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."incidents" TO "service_role";
GRANT SELECT ON TABLE "public"."incidents" TO "authenticated";


--
-- Name: TABLE "lab_runs"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."lab_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_runs" TO "service_role";


--
-- Name: TABLE "lab_scenes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."lab_scenes" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_scenes" TO "service_role";


--
-- Name: TABLE "learning_outcomes"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."learning_outcomes" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."learning_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_outcomes" TO "service_role";


--
-- Name: TABLE "leave_policies"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."leave_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_policies" TO "service_role";


--
-- Name: TABLE "leave_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";


--
-- Name: TABLE "lesson_plans"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."lesson_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_plans" TO "service_role";


--
-- Name: TABLE "loan_recoveries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."loan_recoveries" TO "service_role";


--
-- Name: TABLE "materials"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."materials" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: COLUMN "notifications"."read"; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE("read") ON TABLE "public"."notifications" TO "authenticated";


--
-- Name: TABLE "ops_access_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_access_events" TO "service_role";


--
-- Name: SEQUENCE "ops_access_events_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_access_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ops_access_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ops_access_events_id_seq" TO "service_role";


--
-- Name: TABLE "ops_access_grants"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_access_grants" TO "service_role";


--
-- Name: TABLE "ops_accounts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_accounts" TO "service_role";


--
-- Name: TABLE "ops_activities"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_activities" TO "service_role";


--
-- Name: TABLE "ops_campaigns"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_campaigns" TO "service_role";


--
-- Name: TABLE "ops_canned_replies"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_canned_replies" TO "service_role";


--
-- Name: TABLE "ops_case_links"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_case_links" TO "service_role";


--
-- Name: TABLE "ops_case_messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_case_messages" TO "service_role";


--
-- Name: SEQUENCE "ops_case_number_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_case_number_seq" TO "service_role";


--
-- Name: TABLE "ops_cases"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_cases" TO "service_role";


--
-- Name: TABLE "ops_commission_rules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_commission_rules" TO "service_role";


--
-- Name: TABLE "ops_commissions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_commissions" TO "service_role";


--
-- Name: TABLE "ops_contacts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_contacts" TO "service_role";


--
-- Name: TABLE "ops_discount_limits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_discount_limits" TO "service_role";


--
-- Name: TABLE "ops_documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_documents" TO "service_role";


--
-- Name: TABLE "ops_job_runs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_job_runs" TO "service_role";


--
-- Name: SEQUENCE "ops_job_runs_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_job_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ops_job_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ops_job_runs_id_seq" TO "service_role";


--
-- Name: TABLE "ops_marketing_spend"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_marketing_spend" TO "service_role";


--
-- Name: TABLE "ops_operators"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_operators" TO "service_role";


--
-- Name: SEQUENCE "ops_opportunity_number_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_opportunity_number_seq" TO "service_role";


--
-- Name: TABLE "ops_opportunities"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_opportunities" TO "service_role";


--
-- Name: TABLE "ops_opportunity_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_opportunity_events" TO "service_role";


--
-- Name: SEQUENCE "ops_opportunity_events_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_opportunity_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ops_opportunity_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ops_opportunity_events_id_seq" TO "service_role";


--
-- Name: TABLE "ops_opportunity_stages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_opportunity_stages" TO "service_role";


--
-- Name: TABLE "ops_partners"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_partners" TO "service_role";


--
-- Name: TABLE "ops_picklists"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_picklists" TO "service_role";


--
-- Name: TABLE "ops_quote_approvals"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_quote_approvals" TO "service_role";


--
-- Name: SEQUENCE "ops_quote_number_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."ops_quote_number_seq" TO "service_role";


--
-- Name: TABLE "ops_quotes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_quotes" TO "service_role";


--
-- Name: TABLE "ops_sla_policies"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_sla_policies" TO "service_role";


--
-- Name: TABLE "ops_tasks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_tasks" TO "service_role";


--
-- Name: TABLE "ops_territories"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_territories" TO "service_role";


--
-- Name: TABLE "ops_territory_members"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ops_territory_members" TO "service_role";


--
-- Name: TABLE "pay_adjustments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pay_adjustments" TO "service_role";


--
-- Name: TABLE "pay_items"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pay_items" TO "service_role";


--
-- Name: TABLE "pay_run_lines"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pay_run_lines" TO "service_role";


--
-- Name: TABLE "pay_runs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pay_runs" TO "service_role";


--
-- Name: TABLE "payroll_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."payroll_settings" TO "service_role";


--
-- Name: TABLE "platform_config"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."platform_config" TO "service_role";


--
-- Name: TABLE "practical_assessment"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."practical_assessment" TO "authenticated";
GRANT ALL ON TABLE "public"."practical_assessment" TO "service_role";


--
-- Name: TABLE "practical_progress"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE "public"."practical_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."practical_progress" TO "service_role";


--
-- Name: TABLE "probe_acks"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."probe_acks" TO "authenticated";
GRANT ALL ON TABLE "public"."probe_acks" TO "service_role";


--
-- Name: TABLE "proctor_alerts"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."proctor_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."proctor_alerts" TO "service_role";


--
-- Name: TABLE "qa_runs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."qa_runs" TO "service_role";


--
-- Name: TABLE "qa_upload_tokens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."qa_upload_tokens" TO "service_role";


--
-- Name: TABLE "report_card_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."report_card_settings" TO "service_role";


--
-- Name: TABLE "report_cards"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."report_cards" TO "service_role";


--
-- Name: TABLE "request_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."request_log" TO "service_role";


--
-- Name: SEQUENCE "request_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."request_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."request_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."request_log_id_seq" TO "service_role";


--
-- Name: TABLE "role_grants"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."role_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."role_grants" TO "service_role";


--
-- Name: TABLE "role_permissions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";


--
-- Name: TABLE "rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."rooms" TO "service_role";
GRANT SELECT ON TABLE "public"."rooms" TO "authenticated";


--
-- Name: TABLE "salary_templates"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."salary_templates" TO "service_role";


--
-- Name: TABLE "sched_requirements"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sched_requirements" TO "service_role";
GRANT SELECT ON TABLE "public"."sched_requirements" TO "authenticated";


--
-- Name: TABLE "sched_solver_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sched_solver_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."sched_solver_settings" TO "authenticated";


--
-- Name: TABLE "sched_wings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sched_wings" TO "service_role";
GRANT SELECT ON TABLE "public"."sched_wings" TO "authenticated";


--
-- Name: TABLE "school_filings"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."school_filings" TO "authenticated";
GRANT ALL ON TABLE "public"."school_filings" TO "service_role";


--
-- Name: TABLE "school_messages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."school_messages" TO "service_role";
GRANT SELECT ON TABLE "public"."school_messages" TO "authenticated";


--
-- Name: TABLE "school_threads"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."school_threads" TO "service_role";
GRANT SELECT ON TABLE "public"."school_threads" TO "authenticated";


--
-- Name: TABLE "schools"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."schools" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";


--
-- Name: TABLE "settings_changes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."settings_changes" TO "service_role";


--
-- Name: SEQUENCE "settings_changes_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."settings_changes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."settings_changes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."settings_changes_id_seq" TO "service_role";


--
-- Name: TABLE "shift_overrides"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."shift_overrides" TO "service_role";
GRANT SELECT ON TABLE "public"."shift_overrides" TO "authenticated";


--
-- Name: TABLE "shifts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."shifts" TO "service_role";
GRANT SELECT ON TABLE "public"."shifts" TO "authenticated";


--
-- Name: TABLE "situations"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."situations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."situations" TO "authenticated";
GRANT ALL ON TABLE "public"."situations" TO "service_role";


--
-- Name: TABLE "staff_absences"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_absences" TO "service_role";
GRANT SELECT ON TABLE "public"."staff_absences" TO "authenticated";


--
-- Name: TABLE "staff_day_marks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_day_marks" TO "service_role";
GRANT SELECT ON TABLE "public"."staff_day_marks" TO "authenticated";


--
-- Name: TABLE "staff_documents"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_documents" TO "service_role";


--
-- Name: TABLE "staff_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_events" TO "service_role";


--
-- Name: TABLE "staff_exits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_exits" TO "service_role";


--
-- Name: TABLE "staff_jobs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_jobs" TO "service_role";


--
-- Name: TABLE "staff_loans"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_loans" TO "service_role";


--
-- Name: TABLE "staff_members"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_members" TO "service_role";
GRANT SELECT ON TABLE "public"."staff_members" TO "authenticated";


--
-- Name: TABLE "staff_noshow_alerts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_noshow_alerts" TO "service_role";


--
-- Name: TABLE "staff_pay_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_pay_settings" TO "service_role";


--
-- Name: TABLE "staff_profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_profiles" TO "service_role";


--
-- Name: TABLE "staff_punches"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_punches" TO "service_role";
GRANT SELECT ON TABLE "public"."staff_punches" TO "authenticated";


--
-- Name: TABLE "staff_qualifications"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_qualifications" TO "service_role";


--
-- Name: TABLE "staff_salaries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_salaries" TO "service_role";


--
-- Name: TABLE "staff_shift_plans"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_shift_plans" TO "service_role";
GRANT SELECT ON TABLE "public"."staff_shift_plans" TO "authenticated";


--
-- Name: TABLE "staff_statutory"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."staff_statutory" TO "service_role";


--
-- Name: TABLE "statutory_overrides"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."statutory_overrides" TO "service_role";


--
-- Name: TABLE "statutory_rates"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."statutory_rates" TO "service_role";


--
-- Name: TABLE "student_chats"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."student_chats" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."student_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."student_chats" TO "service_role";


--
-- Name: TABLE "student_memory"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."student_memory" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."student_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."student_memory" TO "service_role";


--
-- Name: TABLE "student_subjects"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."student_subjects" TO "service_role";
GRANT SELECT ON TABLE "public"."student_subjects" TO "authenticated";


--
-- Name: TABLE "subject_leads"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."subject_leads" TO "service_role";
GRANT SELECT ON TABLE "public"."subject_leads" TO "authenticated";


--
-- Name: TABLE "submission_items"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."submission_items" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."submission_items" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_items" TO "service_role";


--
-- Name: TABLE "submissions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."submissions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";


--
-- Name: TABLE "superadmins"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."superadmins" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."superadmins" TO "service_role";


--
-- Name: TABLE "syllabus"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."syllabus" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."syllabus" TO "authenticated";
GRANT ALL ON TABLE "public"."syllabus" TO "service_role";


--
-- Name: TABLE "syllabus_progress"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."syllabus_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."syllabus_progress" TO "service_role";


--
-- Name: TABLE "tax_declarations"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tax_declarations" TO "service_role";


--
-- Name: TABLE "teacher_load_rules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."teacher_load_rules" TO "service_role";
GRANT SELECT ON TABLE "public"."teacher_load_rules" TO "authenticated";


--
-- Name: TABLE "teacher_subjects"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."teacher_subjects" TO "service_role";
GRANT SELECT ON TABLE "public"."teacher_subjects" TO "authenticated";


--
-- Name: TABLE "timetable_slots"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."timetable_slots" TO "service_role";
GRANT SELECT ON TABLE "public"."timetable_slots" TO "authenticated";


--
-- Name: TABLE "timetable_versions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."timetable_versions" TO "service_role";
GRANT SELECT ON TABLE "public"."timetable_versions" TO "authenticated";


--
-- Name: TABLE "tml_scores"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tml_scores" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."tml_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."tml_scores" TO "service_role";


--
-- Name: TABLE "tutor_guard_events"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tutor_guard_events" TO "service_role";
GRANT SELECT ON TABLE "public"."tutor_guard_events" TO "authenticated";


--
-- Name: TABLE "tutor_session_turns"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tutor_session_turns" TO "service_role";


--
-- Name: TABLE "tutor_sessions"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tutor_sessions" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."tutor_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."tutor_sessions" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: TABLE "visit_sessions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."visit_sessions" TO "service_role";
GRANT SELECT ON TABLE "public"."visit_sessions" TO "authenticated";


--
-- Name: TABLE "wellness_logs"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."wellness_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."wellness_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."wellness_logs" TO "service_role";


--
-- Name: TABLE "whatsapp_links"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."whatsapp_links" TO "service_role";


--
-- Name: TABLE "whatsapp_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."whatsapp_log" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_log" TO "authenticated";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- Reference rows
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: learning_outcomes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ops_commission_rules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ops_commission_rules (key, rate_pct, active) VALUES
	('deal_owner', 0.00, false),
	('owner_manager', 0.00, false);


--
-- Data for Name: ops_discount_limits; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ops_discount_limits (role, max_pct) VALUES
	('sales_rep', 5.00),
	('account_manager', 5.00),
	('director', 100.00),
	('regional_lead', 20.00);


--
-- Data for Name: ops_opportunity_stages; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ops_opportunity_stages (key, label, sort, probability, kind, active) VALUES
	('qualify', 'Qualifying', 10, 10, 'open', true),
	('demo', 'Demo and discovery', 20, 25, 'open', true),
	('pilot_proposed', 'Pilot proposed', 30, 40, 'open', true),
	('pilot_running', 'Pilot running', 40, 60, 'open', true),
	('negotiation', 'Proposal and negotiation', 50, 80, 'open', true),
	('won', 'Won', 90, 100, 'won', true),
	('lost', 'Lost', 99, 0, 'lost', true);


--
-- Data for Name: ops_picklists; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ops_picklists (kind, key, label, sort, active) VALUES
	('case_category', 'sign_in', 'Sign-in and accounts', 10, true),
	('case_category', 'data_fix', 'Data correction', 20, true),
	('case_category', 'how_to', 'How do I', 30, true),
	('case_category', 'bug', 'Something is broken', 40, true),
	('case_category', 'fees_billing', 'Fees and billing', 50, true),
	('case_category', 'setup', 'Setup and onboarding', 60, true),
	('case_category', 'request', 'Feature request', 70, true),
	('case_category', 'other', 'Other', 900, true),
	('contact_role', 'correspondent', 'Correspondent / owner', 10, true),
	('contact_role', 'principal', 'Principal', 20, true),
	('contact_role', 'vice_principal', 'Vice principal', 30, true),
	('contact_role', 'accounts', 'Accounts', 40, true),
	('contact_role', 'it_coordinator', 'IT coordinator', 50, true),
	('contact_role', 'office', 'Office administrator', 60, true),
	('contact_role', 'academic_head', 'Academic head', 70, true),
	('contact_role', 'other', 'Other', 900, true),
	('loss_reason', 'price', 'Price', 10, true),
	('loss_reason', 'competitor', 'Chose another product', 20, true),
	('loss_reason', 'no_decision', 'No decision made', 30, true),
	('loss_reason', 'timing', 'Wrong time of year', 40, true),
	('loss_reason', 'fit', 'Product did not fit', 50, true),
	('loss_reason', 'pilot_results', 'Pilot results', 60, true),
	('loss_reason', 'no_response', 'Went quiet', 70, true),
	('loss_reason', 'other', 'Other', 900, true);


--
-- Data for Name: ops_sla_policies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ops_sla_policies (priority, first_response_minutes, resolve_minutes) VALUES
	('urgent', 30, 240),
	('high', 120, 1440),
	('normal', 480, 4320),
	('low', 1440, 10080);


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.role_permissions (role_key, perm) VALUES
	('school_admin', 'dashboard.view'),
	('school_admin', 'boardpack.view'),
	('school_admin', 'probe.view'),
	('school_admin', 'academics.read'),
	('school_admin', 'workforce.read'),
	('school_admin', 'leave.approve'),
	('school_admin', 'leave.policy'),
	('school_admin', 'fees.read'),
	('school_admin', 'fees.collect'),
	('school_admin', 'fees.bill'),
	('school_admin', 'fees.concession.request'),
	('school_admin', 'fees.concession.approve'),
	('school_admin', 'fees.void'),
	('school_admin', 'fees.dayclose'),
	('school_admin', 'fees.remind'),
	('school_admin', 'admissions.read'),
	('school_admin', 'admissions.manage'),
	('school_admin', 'wellness.read'),
	('school_admin', 'wellness.file'),
	('school_admin', 'compliance.read'),
	('school_admin', 'compliance.act'),
	('school_admin', 'audit.read'),
	('school_admin', 'people.manage'),
	('school_admin', 'access.manage'),
	('principal', 'dashboard.view'),
	('principal', 'boardpack.view'),
	('principal', 'probe.view'),
	('principal', 'academics.read'),
	('principal', 'workforce.read'),
	('principal', 'leave.approve'),
	('principal', 'leave.policy'),
	('principal', 'fees.read'),
	('principal', 'fees.collect'),
	('principal', 'fees.bill'),
	('principal', 'fees.concession.request'),
	('principal', 'fees.concession.approve'),
	('principal', 'fees.void'),
	('principal', 'fees.dayclose'),
	('principal', 'fees.remind'),
	('principal', 'admissions.read'),
	('principal', 'admissions.manage'),
	('principal', 'wellness.read'),
	('principal', 'wellness.file'),
	('principal', 'compliance.read'),
	('principal', 'compliance.act'),
	('principal', 'audit.read'),
	('principal', 'people.manage'),
	('vice_principal', 'dashboard.view'),
	('vice_principal', 'boardpack.view'),
	('vice_principal', 'probe.view'),
	('vice_principal', 'academics.read'),
	('vice_principal', 'workforce.read'),
	('vice_principal', 'leave.approve'),
	('vice_principal', 'admissions.read'),
	('vice_principal', 'wellness.read'),
	('vice_principal', 'compliance.read'),
	('finance_head', 'dashboard.view'),
	('finance_head', 'boardpack.view'),
	('finance_head', 'probe.view'),
	('finance_head', 'fees.read'),
	('finance_head', 'fees.collect'),
	('finance_head', 'fees.bill'),
	('finance_head', 'fees.concession.request'),
	('finance_head', 'fees.concession.approve'),
	('finance_head', 'fees.void'),
	('finance_head', 'fees.dayclose'),
	('finance_head', 'fees.remind'),
	('finance_head', 'audit.read'),
	('accountant', 'dashboard.view'),
	('accountant', 'probe.view'),
	('accountant', 'fees.read'),
	('accountant', 'fees.collect'),
	('accountant', 'fees.bill'),
	('accountant', 'fees.concession.request'),
	('accountant', 'fees.dayclose'),
	('accountant', 'fees.remind'),
	('cashier', 'dashboard.view'),
	('cashier', 'fees.read'),
	('cashier', 'fees.collect'),
	('admissions_officer', 'dashboard.view'),
	('admissions_officer', 'probe.view'),
	('admissions_officer', 'admissions.read'),
	('admissions_officer', 'admissions.manage'),
	('hr_manager', 'dashboard.view'),
	('hr_manager', 'probe.view'),
	('hr_manager', 'workforce.read'),
	('hr_manager', 'leave.approve'),
	('hr_manager', 'leave.policy'),
	('academic_coordinator', 'dashboard.view'),
	('academic_coordinator', 'probe.view'),
	('academic_coordinator', 'academics.read'),
	('academic_coordinator', 'workforce.read'),
	('counsellor', 'dashboard.view'),
	('counsellor', 'wellness.read'),
	('dpo', 'dashboard.view'),
	('dpo', 'probe.view'),
	('dpo', 'compliance.read'),
	('dpo', 'compliance.act'),
	('dpo', 'audit.read'),
	('dpo', 'wellness.read'),
	('school_admin', 'messages.office'),
	('principal', 'messages.office'),
	('vice_principal', 'messages.office'),
	('counsellor', 'messages.office'),
	('school_admin', 'feed.read'),
	('school_admin', 'incidents.manage'),
	('school_admin', 'attendance.read'),
	('principal', 'feed.read'),
	('principal', 'incidents.manage'),
	('principal', 'attendance.read'),
	('vice_principal', 'feed.read'),
	('vice_principal', 'incidents.manage'),
	('vice_principal', 'attendance.read'),
	('academic_coordinator', 'feed.read'),
	('academic_coordinator', 'attendance.read'),
	('school_admin', 'os.ask'),
	('principal', 'os.ask'),
	('vice_principal', 'os.ask'),
	('school_admin', 'schedule.academic'),
	('school_admin', 'schedule.workforce'),
	('principal', 'schedule.academic'),
	('principal', 'schedule.workforce'),
	('vice_principal', 'schedule.academic'),
	('academic_coordinator', 'schedule.academic'),
	('hr_manager', 'schedule.workforce'),
	('school_admin', 'safeguarding.read'),
	('principal', 'safeguarding.read'),
	('counsellor', 'safeguarding.read'),
	('school_admin', 'hr.manage'),
	('school_admin', 'hr.sensitive'),
	('principal', 'hr.manage'),
	('principal', 'hr.sensitive'),
	('hr_manager', 'hr.manage'),
	('hr_manager', 'hr.sensitive'),
	('school_admin', 'payroll.read'),
	('school_admin', 'payroll.prepare'),
	('school_admin', 'payroll.approve'),
	('principal', 'payroll.read'),
	('principal', 'payroll.prepare'),
	('principal', 'payroll.approve'),
	('hr_manager', 'payroll.read'),
	('hr_manager', 'payroll.prepare'),
	('accountant', 'payroll.read'),
	('accountant', 'payroll.prepare'),
	('finance_head', 'payroll.read'),
	('finance_head', 'payroll.approve'),
	('school_admin', 'exams.read'),
	('school_admin', 'exams.manage'),
	('school_admin', 'exams.publish'),
	('principal', 'exams.read'),
	('principal', 'exams.manage'),
	('principal', 'exams.publish'),
	('vice_principal', 'exams.read'),
	('academic_coordinator', 'exams.read'),
	('academic_coordinator', 'exams.manage');


--
-- Data for Name: statutory_rates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.statutory_rates (key, effective_from, value, note, updated_at) VALUES
	('pf', '2014-09-01', '{"ceiling": 15000, "eps_pct": 8.33, "edli_pct": 0.5, "admin_pct": 0.5, "employee_pct": 12, "employer_pct": 12}', 'EPF: 12% each on Basic + DA; 8.33% of the employer share (on wages up to the ceiling) goes to pension.', '2026-10-13 14:04:09.899217+00'),
	('esi', '2019-07-01', '{"ceiling": 21000, "employee_pct": 0.75, "employer_pct": 3.25}', 'ESI: for employees with gross wages up to the ceiling.', '2026-10-13 14:04:09.899217+00'),
	('bonus', '2015-04-01', '{"pct": 8.33, "calc_ceiling": 7000, "wage_ceiling": 21000}', 'Payment of Bonus Act: minimum bonus on Basic + DA capped at the calculation ceiling, for wages up to the wage ceiling.', '2026-10-13 14:04:09.899217+00'),
	('gratuity', '2018-03-29', '{"cap": 2000000, "days": 15, "divisor": 26, "min_years": 5}', 'Payment of Gratuity Act: 15 days of last Basic + DA for each completed year, after five years.', '2026-10-13 14:04:09.899217+00'),
	('pt:AP', '2013-04-01', '{"slabs": [{"upto": 15000, "amount": 0}, {"upto": 20000, "amount": 150}, {"upto": null, "amount": 200}]}', 'Andhra Pradesh professional tax, monthly, on gross salary.', '2026-10-13 14:04:09.899217+00'),
	('pt:TS', '2014-06-02', '{"slabs": [{"upto": 15000, "amount": 0}, {"upto": 20000, "amount": 150}, {"upto": null, "amount": 200}]}', 'Telangana professional tax, monthly, on gross salary.', '2026-10-13 14:04:09.899217+00'),
	('pt:KA', '2023-04-01', '{"slabs": [{"upto": 24999, "amount": 0}, {"upto": null, "amount": 200}], "february_amount": 300}', 'Karnataka professional tax, monthly; Rs 300 in February.', '2026-10-13 14:04:09.899217+00'),
	('it:new', '2025-04-01', '{"slabs": [{"pct": 0, "upto": 400000}, {"pct": 5, "upto": 800000}, {"pct": 10, "upto": 1200000}, {"pct": 15, "upto": 1600000}, {"pct": 20, "upto": 2000000}, {"pct": 25, "upto": 2400000}, {"pct": 30, "upto": null}], "cess_pct": 4, "surcharge": [{"pct": 10, "above": 5000000}, {"pct": 15, "above": 10000000}, {"pct": 25, "above": 20000000}], "rebate_max": 60000, "rebate_income": 1200000, "marginal_relief": true, "standard_deduction": 75000}', 'New tax regime, FY 2025-26 slabs. Confirm against the Finance Act for each new year.', '2026-10-13 14:04:09.899217+00'),
	('it:old', '2023-04-01', '{"caps": {"c80": 150000, "d80": 75000, "nps_80ccd1b": 50000, "home_loan_interest": 200000}, "slabs": [{"pct": 0, "upto": 250000}, {"pct": 5, "upto": 500000}, {"pct": 20, "upto": 1000000}, {"pct": 30, "upto": null}], "cess_pct": 4, "surcharge": [{"pct": 10, "above": 5000000}, {"pct": 15, "above": 10000000}, {"pct": 25, "above": 20000000}, {"pct": 37, "above": 50000000}], "rebate_max": 12500, "rebate_income": 500000, "marginal_relief": false, "senior_exemption": 300000, "standard_deduction": 50000, "super_senior_exemption": 500000}', 'Old tax regime slabs and deduction caps.', '2026-10-13 14:04:09.899217+00');


--
-- PostgreSQL database dump complete
--


INSERT INTO public.platform_config (key, value, updated_by, updated_at) SELECT key, value, updated_by, updated_at FROM jsonb_populate_recordset(NULL::public.platform_config, '[{"key": "onboarding.self_serve", "value": false, "updated_at": "2026-09-25T14:59:45.362778+00:00"}]');
INSERT INTO public.ops_territories (id, name, level, parent_id, state, district, default_owner_id, created_at) SELECT id, name, level, parent_id, state, district, default_owner_id, created_at FROM jsonb_populate_recordset(NULL::public.ops_territories, '[{"id": "2111cd42-47ee-43f8-8dd4-8b43d603dfe5", "name": "Andhra Pradesh", "level": "state", "state": "Andhra Pradesh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "531880cb-d5b3-470f-b26a-6639dacd327b", "name": "Arunachal Pradesh", "level": "state", "state": "Arunachal Pradesh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "07702431-adb7-48ff-b79e-0d385b5279b3", "name": "Assam", "level": "state", "state": "Assam", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "0f8c7657-04c7-473e-88ee-56cf639bbdee", "name": "Bihar", "level": "state", "state": "Bihar", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "59291b9a-3157-4fe8-82ad-3a8fb2079ccc", "name": "Chhattisgarh", "level": "state", "state": "Chhattisgarh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "a3961d22-cd9b-46b8-ace4-ee494dbafd89", "name": "Goa", "level": "state", "state": "Goa", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "1d350941-40ce-4b32-b096-46765236e0f0", "name": "Gujarat", "level": "state", "state": "Gujarat", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "4fb75ffc-e88c-4425-9ac8-74cd84c0ef35", "name": "Haryana", "level": "state", "state": "Haryana", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "05ad8d21-8229-45af-a0c9-efb3d0daac5d", "name": "Himachal Pradesh", "level": "state", "state": "Himachal Pradesh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "d130b690-9f43-429a-b14e-8980c1cd5e31", "name": "Jharkhand", "level": "state", "state": "Jharkhand", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "2ce78821-c38e-4daf-a10a-940dd7a22bfe", "name": "Karnataka", "level": "state", "state": "Karnataka", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "0c92352d-e37b-489d-a846-b2be224f7d68", "name": "Kerala", "level": "state", "state": "Kerala", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "4a692fd8-985a-44ee-b361-1d441b12416a", "name": "Madhya Pradesh", "level": "state", "state": "Madhya Pradesh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "d72da484-4d64-4769-9669-4f9069817707", "name": "Maharashtra", "level": "state", "state": "Maharashtra", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "5cba9c44-9c1d-4fc9-8261-8b063684d235", "name": "Manipur", "level": "state", "state": "Manipur", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "29a1bde9-f971-4860-9e1a-f6e515b96c89", "name": "Meghalaya", "level": "state", "state": "Meghalaya", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "8668a731-6d91-4b75-b90d-79615918fe1e", "name": "Mizoram", "level": "state", "state": "Mizoram", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "b77cabe7-4cc9-4dd1-8b47-4e4f584b1ff8", "name": "Nagaland", "level": "state", "state": "Nagaland", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "448caf18-0a75-4912-a4b2-dc4f3dbdbc13", "name": "Odisha", "level": "state", "state": "Odisha", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "69c481b4-40ee-482d-b2f5-35e666ed2d9a", "name": "Punjab", "level": "state", "state": "Punjab", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "38e593d2-1b04-4f59-bee9-fb856d640f34", "name": "Rajasthan", "level": "state", "state": "Rajasthan", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "8604933e-e7e3-4c03-8462-82ae898b436d", "name": "Sikkim", "level": "state", "state": "Sikkim", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "e2659121-f820-4a62-b1e1-835ec3a0a53d", "name": "Tamil Nadu", "level": "state", "state": "Tamil Nadu", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "df374c69-4a91-4b39-9ad3-3a3d59af45dd", "name": "Telangana", "level": "state", "state": "Telangana", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "300b3668-c257-48e7-a89e-1ef3296677f8", "name": "Tripura", "level": "state", "state": "Tripura", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "e897da0f-1230-4e2e-a7c2-11d1586e0cb2", "name": "Uttar Pradesh", "level": "state", "state": "Uttar Pradesh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "c27af10d-c102-4be0-8c56-c70007a8d2e3", "name": "Uttarakhand", "level": "state", "state": "Uttarakhand", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "0a9b1030-3b6e-450c-8a30-c430baadef2e", "name": "West Bengal", "level": "state", "state": "West Bengal", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "6d511fc3-e7a7-41d0-b16b-31c640d84ef7", "name": "Andaman and Nicobar Islands", "level": "state", "state": "Andaman and Nicobar Islands", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "75b0dc8e-0c59-47df-a720-5884aa792c49", "name": "Chandigarh", "level": "state", "state": "Chandigarh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "10c3a565-64e9-4706-b05c-c25812d7cbfe", "name": "Dadra and Nagar Haveli and Daman and Diu", "level": "state", "state": "Dadra and Nagar Haveli and Daman and Diu", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "4d9d937b-a333-4d18-afeb-8b6ac1619513", "name": "Delhi", "level": "state", "state": "Delhi", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "bb755a67-f806-40fc-9ad4-e57ec1007cdc", "name": "Jammu and Kashmir", "level": "state", "state": "Jammu and Kashmir", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "87da6b06-4cc8-4e15-8df4-92de0a1c2ccd", "name": "Ladakh", "level": "state", "state": "Ladakh", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "485ae65e-bbca-4c6e-81ca-af411336a13f", "name": "Lakshadweep", "level": "state", "state": "Lakshadweep", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}, {"id": "f8c20404-1184-4636-bc14-5db954045bf5", "name": "Puducherry", "level": "state", "state": "Puducherry", "district": null, "parent_id": null, "created_at": "2026-10-13T20:20:43.553965+00:00"}]');

-- Storage buckets, cron jobs, realtime
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('captures', 'captures', 'false', 3145728, '{image/jpeg}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('copilot-images', 'copilot-images', 'false', 5242880, '{image/png,image/jpeg,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('ops-docs', 'ops-docs', 'false', 10485760, '{application/pdf,image/jpeg,image/png,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('qa-runs', 'qa-runs', 'false', 15728640, '{application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,application/xml,text/xml,text/plain}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('question-papers', 'question-papers', 'true', NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('staff-docs', 'staff-docs', 'false', 10485760, '{application/pdf,image/jpeg,image/png,image/webp}'::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('submissions', 'submissions', 'false', NULL, NULL) ON CONFLICT (id) DO NOTHING;
SELECT cron.schedule('hr-daily', '35 18 * * *', 'SELECT public.hr_daily()');
SELECT cron.schedule('request-log-prune', '15 19 * * *', 'DELETE FROM public.request_log WHERE at < now() - interval ''7 days''');
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.situations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_chats;
DROP EVENT TRIGGER IF EXISTS ensure_rls; CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();
