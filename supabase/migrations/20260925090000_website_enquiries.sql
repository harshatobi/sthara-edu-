-- Website enquiries — 2026-09-25
--
-- The marketing site's contact form (www.sthara.in/contact) stores each enquiry here, in
-- Sthara's own database (Mumbai), and platform operators work through them in /ops/enquiries.
-- Written only by the /api/contact route (service role) and read only by operators through
-- /api/ops/*: RLS is on with no policies, so no browser session can read or write it.
-- submission_id makes a retried submission idempotent. No IP address is stored.

CREATE TABLE IF NOT EXISTS public.enquiries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  school        text NOT NULL CHECK (char_length(school) BETWEEN 2 AND 160),
  role          text NOT NULL CHECK (role IN ('school-leader', 'administrator', 'teacher', 'parent', 'other')),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 30),
  message       text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 3000),
  consent       boolean NOT NULL CHECK (consent),
  source_origin text NOT NULL,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  note          text CHECK (note IS NULL OR char_length(note) <= 2000),
  handled_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON public.enquiries (status, created_at DESC);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enquiries FROM anon, authenticated;
GRANT ALL ON public.enquiries TO service_role;

DROP TRIGGER IF EXISTS trg_touch_enquiries ON public.enquiries;
CREATE TRIGGER trg_touch_enquiries BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
