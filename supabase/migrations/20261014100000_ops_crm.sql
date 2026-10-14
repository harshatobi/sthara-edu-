-- Account 360 and the service desk for the Platform Manager.
--
-- ops_contacts         the people Sthara deals with at each school, with their part in the relationship.
-- ops_activities       calls, meetings, emails, WhatsApp chats, visits and notes, logged by hand against a school.
-- ops_tasks            follow-ups: something an operator owes, with a due date, on a school, enquiry or case.
-- ops_documents        contracts, MoUs, purchase orders and the like; files sit in the private bucket "ops-docs".
-- ops_cases            the service desk: one row per request from a school, with its clock (first response, resolution).
-- ops_case_messages    the conversation on a case; internal notes are for operators only and never reach the school.
-- ops_case_links       an error, a record or an audit entry attached to a case.
-- ops_sla_policies     how long each priority gets for a first response and for resolution (calendar hours).
-- ops_picklists        the configurable lists: case categories and contact roles.
-- ops_canned_replies   replies an operator can drop into a case.
--
-- Schools raise and follow their own cases through /api/admin/support; operators work them through /api/ops/desk.
-- All tables are server-only (service role), checked by those routes. No account's own token reads or writes them.

CREATE TABLE IF NOT EXISTS public.ops_picklists (
  kind    text NOT NULL CHECK (kind IN ('case_category', 'contact_role')),
  key     text NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  label   text NOT NULL CHECK (length(label) BETWEEN 2 AND 60),
  sort    integer NOT NULL DEFAULT 100,
  active  boolean NOT NULL DEFAULT true,
  PRIMARY KEY (kind, key)
);
INSERT INTO public.ops_picklists (kind, key, label, sort) VALUES
  ('case_category', 'sign_in', 'Sign-in and accounts', 10),
  ('case_category', 'data_fix', 'Data correction', 20),
  ('case_category', 'how_to', 'How do I', 30),
  ('case_category', 'bug', 'Something is broken', 40),
  ('case_category', 'fees_billing', 'Fees and billing', 50),
  ('case_category', 'setup', 'Setup and onboarding', 60),
  ('case_category', 'request', 'Feature request', 70),
  ('case_category', 'other', 'Other', 900),
  ('contact_role', 'correspondent', 'Correspondent / owner', 10),
  ('contact_role', 'principal', 'Principal', 20),
  ('contact_role', 'vice_principal', 'Vice principal', 30),
  ('contact_role', 'accounts', 'Accounts', 40),
  ('contact_role', 'it_coordinator', 'IT coordinator', 50),
  ('contact_role', 'office', 'Office administrator', 60),
  ('contact_role', 'academic_head', 'Academic head', 70),
  ('contact_role', 'other', 'Other', 900)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_sla_policies (
  priority                text PRIMARY KEY CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  first_response_minutes  integer NOT NULL CHECK (first_response_minutes BETWEEN 5 AND 43200),
  resolve_minutes         integer NOT NULL CHECK (resolve_minutes BETWEEN 30 AND 129600),
  CHECK (resolve_minutes >= first_response_minutes)
);
INSERT INTO public.ops_sla_policies VALUES ('urgent', 30, 240), ('high', 120, 1440), ('normal', 480, 4320), ('low', 1440, 10080)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_canned_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 80),
  body        text NOT NULL CHECK (length(body) BETWEEN 2 AND 4000),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  role        text NOT NULL DEFAULT 'other' CHECK (length(role) <= 40),
  title       text CHECK (title IS NULL OR length(title) <= 80),
  email       text CHECK (email IS NULL OR length(email) <= 200),
  phone       text CHECK (phone IS NULL OR length(phone) <= 30),
  is_primary  boolean NOT NULL DEFAULT false,
  decides     boolean NOT NULL DEFAULT false,
  note        text CHECK (note IS NULL OR length(note) <= 1000),
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_contacts_school ON public.ops_contacts (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_contacts_primary ON public.ops_contacts (school_id) WHERE is_primary AND active;

CREATE SEQUENCE IF NOT EXISTS public.ops_case_number_seq START 1001;
CREATE TABLE IF NOT EXISTS public.ops_cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number              bigint NOT NULL UNIQUE DEFAULT nextval('public.ops_case_number_seq'),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject             text NOT NULL CHECK (length(subject) BETWEEN 4 AND 160),
  category            text NOT NULL DEFAULT 'other' CHECK (length(category) <= 40),
  priority            text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'waiting_school', 'resolved', 'closed')),
  source              text NOT NULL DEFAULT 'operator' CHECK (source IN ('school_portal', 'operator', 'phone', 'email', 'whatsapp')),
  raised_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  raised_by_name      text CHECK (raised_by_name IS NULL OR length(raised_by_name) <= 120),
  contact_id          uuid REFERENCES public.ops_contacts(id) ON DELETE SET NULL,
  owner_id            uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL,
  first_response_due  timestamptz NOT NULL,
  resolve_due         timestamptz NOT NULL,
  first_responded_at  timestamptz,
  resolved_at         timestamptz,
  closed_at           timestamptz,
  reopened            integer NOT NULL DEFAULT 0,
  last_school_at      timestamptz,
  last_operator_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_cases_school ON public.ops_cases (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_ops_cases_open ON public.ops_cases (status, resolve_due) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS ix_ops_cases_owner ON public.ops_cases (owner_id) WHERE status NOT IN ('resolved', 'closed');

CREATE TABLE IF NOT EXISTS public.ops_case_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES public.ops_cases(id) ON DELETE CASCADE,
  author_kind  text NOT NULL CHECK (author_kind IN ('school', 'operator', 'system')),
  author_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name  text CHECK (author_name IS NULL OR length(author_name) <= 120),
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  internal     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Only an operator can write an internal note.
  CHECK (NOT internal OR author_kind = 'operator')
);
CREATE INDEX IF NOT EXISTS ix_ops_case_messages_case ON public.ops_case_messages (case_id, created_at);

CREATE TABLE IF NOT EXISTS public.ops_case_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     uuid NOT NULL REFERENCES public.ops_cases(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('error', 'record', 'audit', 'request', 'url')),
  ref         text NOT NULL CHECK (length(ref) BETWEEN 1 AND 400),
  label       text CHECK (label IS NULL OR length(label) <= 200),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, kind, ref)
);

CREATE TABLE IF NOT EXISTS public.ops_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('call', 'meeting', 'email', 'whatsapp', 'visit', 'note')),
  direction   text CHECK (direction IS NULL OR direction IN ('in', 'out')),
  subject     text NOT NULL CHECK (length(subject) BETWEEN 2 AND 160),
  body        text CHECK (body IS NULL OR length(body) <= 6000),
  happened_at timestamptz NOT NULL DEFAULT now(),
  contact_id  uuid REFERENCES public.ops_contacts(id) ON DELETE SET NULL,
  case_id     uuid REFERENCES public.ops_cases(id) ON DELETE SET NULL,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_activities_school ON public.ops_activities (school_id, happened_at DESC);

CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  enquiry_id  uuid REFERENCES public.enquiries(id) ON DELETE CASCADE,
  case_id     uuid REFERENCES public.ops_cases(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 200),
  note        text CHECK (note IS NULL OR length(note) <= 2000),
  due_on      date,
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  owner_id    uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);
CREATE INDEX IF NOT EXISTS ix_ops_tasks_owner ON public.ops_tasks (owner_id, due_on) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ix_ops_tasks_school ON public.ops_tasks (school_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.ops_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('contract', 'mou', 'purchase_order', 'proposal', 'invoice', 'other')),
  title         text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  signed_on     date,
  expires_on    date,
  storage_path  text NOT NULL,
  file_name     text NOT NULL CHECK (length(file_name) <= 200),
  mime          text NOT NULL,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  uploaded_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR signed_on IS NULL OR expires_on >= signed_on)
);
CREATE INDEX IF NOT EXISTS ix_ops_documents_school ON public.ops_documents (school_id, created_at DESC);

-- A case message is the record of what was said to a school: it is never edited or removed on its own.
CREATE OR REPLACE FUNCTION app.ops_case_messages_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'A case message cannot be changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.ops_cases WHERE id = OLD.case_id) THEN RAISE EXCEPTION 'A case message cannot be removed'; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_ops_case_messages_guard ON public.ops_case_messages;
CREATE TRIGGER trg_ops_case_messages_guard BEFORE UPDATE OR DELETE ON public.ops_case_messages
  FOR EACH ROW EXECUTE FUNCTION app.ops_case_messages_guard();

ALTER TABLE public.ops_picklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_canned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_case_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_picklists, public.ops_sla_policies, public.ops_canned_replies, public.ops_contacts, public.ops_cases,
  public.ops_case_messages, public.ops_case_links, public.ops_activities, public.ops_tasks, public.ops_documents FROM anon, authenticated;
GRANT ALL ON public.ops_picklists, public.ops_sla_policies, public.ops_canned_replies, public.ops_contacts, public.ops_cases,
  public.ops_case_links, public.ops_activities, public.ops_tasks, public.ops_documents TO service_role;
GRANT SELECT, INSERT ON public.ops_case_messages TO service_role;
REVOKE ALL ON SEQUENCE public.ops_case_number_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.ops_case_number_seq TO service_role;
REVOKE ALL ON FUNCTION app.ops_case_messages_guard() FROM PUBLIC, anon, authenticated;

-- Private bucket for account documents: no storage policies, so only the service role reads or writes it and
-- the API hands out short-lived signed links.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ops-docs', 'ops-docs', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
