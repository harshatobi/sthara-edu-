-- service_role could not use the app schema, so trigger guards that call app.is_server() by name failed for the server:
-- "permission denied for schema app" (teacher wellness acknowledge, and service-role updates of notifications and
-- published timetable slots). anon and authenticated already have USAGE; the baseline missed service_role.
GRANT USAGE ON SCHEMA app TO service_role;
GRANT EXECUTE ON FUNCTION app.is_server() TO service_role;
