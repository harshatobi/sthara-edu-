-- Employee master, follow-ups — 2026-10-13
--
-- hr_link_login()     someone on the register with no login is given one: their record keeps its history and
--                     everything recorded against the register row (attendance, shifts, leave, duties, covers,
--                     lessons) moves to the login, in one transaction. The bare row the login got automatically
--                     is removed.
-- guard_published_slots  accepts that move on a published timetable: the same person, now under their login.
-- hr_reassign_reports() when someone leaves, their direct reports move to a new manager as a dated transfer.
-- hr_daily()          run each night: applies job changes whose day has come and tells HR what falls due
--                     (probation, contracts, last working days, documents) on the day the alert window opens,
--                     a week before, and on the day itself.
-- pg_cron             schedules hr_daily at 00:05 India time. If the extension can't be enabled here, job changes
--                     still take effect when People is opened, and the alerts stay in People > Needs attention.

-- ── A published timetable accepts a person moving from the register to their login ──────────────────────────
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

-- ── Link a login to someone already on the register ─────────────────────────
CREATE OR REPLACE FUNCTION public.hr_link_login(p_school uuid, p_member uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.hr_link_login(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_link_login(uuid, uuid, uuid) TO service_role;

-- ── Move someone's direct reports when they leave ───────────────────────────
-- Each report gets a dated transfer (their job unchanged but for the manager), so the history shows who they
-- reported to and when. p_to null leaves them with nobody set.
CREATE OR REPLACE FUNCTION public.hr_reassign_reports(p_school uuid, p_from uuid, p_to uuid, p_on date, p_reason text, p_by uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.hr_reassign_reports(uuid, uuid, uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_reassign_reports(uuid, uuid, uuid, date, text, uuid) TO service_role;

-- ── The nightly run ─────────────────────────────────────────────────────────
-- Alerts go to everyone who holds hr.manage, once per milestone: the day the alert window opens, a week before,
-- and the day itself. No state is kept; a night the job doesn't run is a milestone missed, and the item still
-- shows in People > Needs attention.
CREATE OR REPLACE FUNCTION public.hr_daily() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.hr_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_daily() TO service_role;

-- 00:05 India time is 18:35 UTC the day before.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'hr-daily';
  PERFORM cron.schedule('hr-daily', '35 18 * * *', 'SELECT public.hr_daily()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%): hr_daily is not scheduled. Job changes apply when People is opened.', SQLERRM;
END $$;
