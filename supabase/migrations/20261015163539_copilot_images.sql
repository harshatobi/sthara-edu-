-- Illustrations the Teacher Copilot generates (Gemini image model), kept so they survive in the Copilot's history
-- and print. Private: paths are <school id>/<teacher id>/<uuid>.png, written and read only by the server
-- (api/teacher/copilot/image), which hands out short-lived signed links to staff of that school.
-- No storage policies: only the service role touches this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('copilot-images', 'copilot-images', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
