-- Quality: test runs in the ops console — 2026-10-15
--
-- The test pack (qa/) uploads every regression run here: which stages passed, the counts, the failing tests and
-- the files it produced (the five test workbooks, JUnit and Playwright results, stage logs). Files go to a private
-- bucket of their own, qa-runs, under qa/<run id>/ (ops-docs takes only PDFs and images, and holds schools'
-- documents); this table keeps the run and the file list.
--
-- qa_upload_tokens  machine credentials for the pack: one per machine or person, stored hashed, revocable.
--                   A token can only upload runs; it can read nothing.
-- qa_runs           one row per run. Results are kept for good (for trends); files are removed after 90 days
--                   unless the run is pinned (a sign-off run), and files_purged_at says when.
--
-- Access: service role only. /api/qa/* (the pack, by upload token) and /api/ops/qa (operators with qa.read,
-- qa.manage) are the only ways in.

CREATE TABLE IF NOT EXISTS public.qa_upload_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  token_hash    text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.qa_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        uuid REFERENCES public.qa_upload_tokens(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'pass', 'fail')),
  started_at      timestamptz NOT NULL,
  finished_at     timestamptz NOT NULL,
  machine         text CHECK (length(machine) <= 120),
  git_commit      text CHECK (git_commit ~ '^[0-9a-f]{7,40}$'),
  git_branch      text CHECK (length(git_branch) <= 200),
  git_dirty       boolean NOT NULL DEFAULT false,
  target          text CHECK (length(target) <= 300),
  stages          jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(stages) = 'array'),
  totals          jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(totals) = 'object'),
  failures        jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(failures) = 'array'),
  files           jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(files) = 'array'),
  pinned          boolean NOT NULL DEFAULT false,
  pin_note        text CHECK (length(pin_note) <= 300),
  files_purged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_qa_runs_started ON public.qa_runs (started_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qa_upload_tokens', 'qa_runs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- The bucket: private, workbooks / JSON / XML / text only, 15 MB a file. No storage policies: only the service role
-- (the two APIs above) reads or writes it, and operators download through two-minute signed links.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qa-runs', 'qa-runs', false, 15728640, ARRAY[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json', 'application/xml', 'text/xml', 'text/plain'
])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
