-- app.audit() is SECURITY DEFINER, so inside it current_user is the owner and
-- app.is_server() is always true: every change was logged as actor_role
-- 'server'. Decide from the JWT instead: no signed-in user = server/service key.
CREATE OR REPLACE FUNCTION app.audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
