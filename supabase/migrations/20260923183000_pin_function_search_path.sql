-- Pin search_path on the app.* helpers the Supabase security advisor flagged
-- (lint 0011). All of them only reference schema-qualified objects.
ALTER FUNCTION app.norm_class(text)             SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION app.is_server()                  SET search_path = public, pg_temp;
ALTER FUNCTION app.guard_wellness_update()      SET search_path = public, pg_temp;
ALTER FUNCTION app.guard_wellness_insert()      SET search_path = public, pg_temp;
ALTER FUNCTION app.guard_notification_update()  SET search_path = public, pg_temp;
ALTER FUNCTION app.touch_updated_at()           SET search_path = public, pg_temp;
