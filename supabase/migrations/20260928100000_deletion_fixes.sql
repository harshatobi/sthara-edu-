-- Deleting a teacher (or a school) failed in two places — 2026-09-28
--
-- 1. Published timetables are frozen (app.guard_published_slots), but deleting a teacher, a register member or a
--    room clears it from their lessons (ON DELETE SET NULL), which is an UPDATE the guard refused: nobody who had
--    ever appeared in a published timetable could be deleted, and so no school with one could be deleted either.
--    The guard now lets a deletion clear those three columns; everything else about a published lesson stays frozen.
-- 2. A teacher's parent threads require a teacher (school_threads_check: audience 'teacher' <=> staff_id set), so the
--    same SET NULL broke the check and blocked deleting any teacher a parent had written to. Their threads now move
--    to the school office before the account goes, so no conversation is lost.

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
  IF EXISTS (SELECT 1 FROM public.timetable_versions v
             WHERE v.id = coalesce(NEW.version_id, OLD.version_id) AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'this timetable is published; copy it to a new draft to change it' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION app.release_staff_threads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.school_threads SET audience = 'office', staff_id = NULL WHERE staff_id = OLD.id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION app.release_staff_threads() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_release_staff_threads ON public.users;
CREATE TRIGGER trg_release_staff_threads BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.release_staff_threads();
