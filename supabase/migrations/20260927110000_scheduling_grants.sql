-- The scheduling API routes write as service_role, and timetable_slots.class_key (a generated column) and the
-- one-home-room-per-section index both call app.norm_class. Harden_schema granted it to authenticated only,
-- so every slot write and home-room save failed with "permission denied for function norm_class".
GRANT EXECUTE ON FUNCTION app.norm_class(text) TO service_role;
