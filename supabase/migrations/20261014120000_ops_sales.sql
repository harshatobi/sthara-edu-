-- The sales pipeline for the Platform Manager: opportunities, quotes and discount approval.
--
-- ops_opportunity_stages  the configurable stages a deal moves through, each with a win probability; one kind 'won', one 'lost'.
-- ops_opportunities       a deal: a new school, a pilot converting, a renewal or more seats. It may start from a website
--                         enquiry and may belong to a school already on Sthara. Placed in a territory and owned, like schools.
-- ops_opportunity_events  what happened on a deal: stage moves, notes, logged calls and meetings, quotes and approvals.
-- ops_quotes              a priced offer on a deal: tier, seats, price per student, the discount that is against list, and
--                         where it stands (draft, awaiting approval, approved, sent, accepted, declined, expired, rejected).
-- ops_quote_approvals     who approved or refused a quote's discount, and why.
-- ops_discount_limits     the largest discount each operator role may give without asking someone above them.
-- ops_tasks               gains opportunity_id, so a follow-up can sit on a deal.
-- ops_picklists           gains the 'loss_reason' list.
--
-- Server-only (service role), behind /api/ops/pipeline, which checks the operator's role and territory.

CREATE TABLE IF NOT EXISTS public.ops_opportunity_stages (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  label        text NOT NULL CHECK (length(label) BETWEEN 2 AND 60),
  sort         integer NOT NULL DEFAULT 100,
  probability  integer NOT NULL CHECK (probability BETWEEN 0 AND 100),
  kind         text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  active       boolean NOT NULL DEFAULT true
);
INSERT INTO public.ops_opportunity_stages (key, label, sort, probability, kind) VALUES
  ('qualify', 'Qualifying', 10, 10, 'open'),
  ('demo', 'Demo and discovery', 20, 25, 'open'),
  ('pilot_proposed', 'Pilot proposed', 30, 40, 'open'),
  ('pilot_running', 'Pilot running', 40, 60, 'open'),
  ('negotiation', 'Proposal and negotiation', 50, 80, 'open'),
  ('won', 'Won', 90, 100, 'won'),
  ('lost', 'Lost', 99, 0, 'lost')
ON CONFLICT DO NOTHING;

ALTER TABLE public.ops_picklists DROP CONSTRAINT IF EXISTS ops_picklists_kind_check;
ALTER TABLE public.ops_picklists ADD CONSTRAINT ops_picklists_kind_check CHECK (kind IN ('case_category', 'contact_role', 'loss_reason'));
INSERT INTO public.ops_picklists (kind, key, label, sort) VALUES
  ('loss_reason', 'price', 'Price', 10),
  ('loss_reason', 'competitor', 'Chose another product', 20),
  ('loss_reason', 'no_decision', 'No decision made', 30),
  ('loss_reason', 'timing', 'Wrong time of year', 40),
  ('loss_reason', 'fit', 'Product did not fit', 50),
  ('loss_reason', 'pilot_results', 'Pilot results', 60),
  ('loss_reason', 'no_response', 'Went quiet', 70),
  ('loss_reason', 'other', 'Other', 900)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_discount_limits (
  role     text PRIMARY KEY CHECK (role IN ('director', 'regional_lead', 'sales_rep', 'account_manager')),
  max_pct  numeric(5,2) NOT NULL CHECK (max_pct BETWEEN 0 AND 100)
);
INSERT INTO public.ops_discount_limits VALUES ('sales_rep', 5), ('account_manager', 5), ('regional_lead', 15), ('director', 100)
ON CONFLICT DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.ops_opportunity_number_seq START 1001;
CREATE TABLE IF NOT EXISTS public.ops_opportunities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number             bigint NOT NULL UNIQUE DEFAULT nextval('public.ops_opportunity_number_seq'),
  name               text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind               text NOT NULL DEFAULT 'new' CHECK (kind IN ('new', 'pilot_conversion', 'renewal', 'expansion')),
  stage              text NOT NULL REFERENCES public.ops_opportunity_stages(key),
  enquiry_id         uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  school_id          uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  plan               text CHECK (plan IS NULL OR plan IN ('pilot', 'aadhara', 'sthamba', 'shikhara', 'mandala')),
  students           integer CHECK (students IS NULL OR students BETWEEN 1 AND 999999),
  price_per_student  numeric(10,2) CHECK (price_per_student IS NULL OR price_per_student >= 0),
  amount             numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  expected_close     date,
  next_step          text CHECK (next_step IS NULL OR length(next_step) <= 300),
  contact_name       text CHECK (contact_name IS NULL OR length(contact_name) <= 120),
  contact_phone      text CHECK (contact_phone IS NULL OR length(contact_phone) <= 30),
  contact_email      text CHECK (contact_email IS NULL OR length(contact_email) <= 200),
  state              text CHECK (state IS NULL OR length(state) <= 60),
  district           text CHECK (district IS NULL OR length(district) <= 80),
  territory_id       uuid REFERENCES public.ops_territories(id) ON DELETE SET NULL,
  owner_id           uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL,
  loss_reason        text CHECK (loss_reason IS NULL OR length(loss_reason) <= 40),
  closed_note        text CHECK (closed_note IS NULL OR length(closed_note) <= 1000),
  closed_at          timestamptz,
  stage_changed_at   timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_stage ON public.ops_opportunities (stage);
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_owner ON public.ops_opportunities (owner_id);
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_territory ON public.ops_opportunities (territory_id);
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_school ON public.ops_opportunities (school_id);
-- One open deal per enquiry: converting an enquiry twice is refused.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_opportunities_enquiry ON public.ops_opportunities (enquiry_id) WHERE enquiry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ops_opportunity_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opportunity_id  uuid NOT NULL REFERENCES public.ops_opportunities(id) ON DELETE CASCADE,
  at              timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('created', 'stage', 'note', 'call', 'meeting', 'email', 'whatsapp', 'visit', 'quote', 'approval', 'owner', 'change')),
  body            text CHECK (body IS NULL OR length(body) <= 6000),
  from_stage      text,
  to_stage        text,
  by_id           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  by_name         text CHECK (by_name IS NULL OR length(by_name) <= 120)
);
CREATE INDEX IF NOT EXISTS ix_ops_opportunity_events_opp ON public.ops_opportunity_events (opportunity_id, at DESC);

CREATE SEQUENCE IF NOT EXISTS public.ops_quote_number_seq START 1001;
CREATE TABLE IF NOT EXISTS public.ops_quotes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number             bigint NOT NULL UNIQUE DEFAULT nextval('public.ops_quote_number_seq'),
  opportunity_id     uuid NOT NULL REFERENCES public.ops_opportunities(id) ON DELETE CASCADE,
  version            integer NOT NULL DEFAULT 1,
  plan               text NOT NULL CHECK (plan IN ('aadhara', 'sthamba', 'shikhara', 'mandala')),
  students           integer NOT NULL CHECK (students BETWEEN 1 AND 999999),
  list_price         numeric(10,2) CHECK (list_price IS NULL OR list_price > 0),
  price_per_student  numeric(10,2) NOT NULL CHECK (price_per_student > 0),
  discount_pct       numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  term_months        integer NOT NULL DEFAULT 12 CHECK (term_months BETWEEN 1 AND 60),
  valid_until        date NOT NULL,
  notes              text CHECK (notes IS NULL OR length(notes) <= 3000),
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'declined', 'expired')),
  needs_role         text CHECK (needs_role IS NULL OR needs_role IN ('regional_lead', 'director')),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, version)
);
CREATE INDEX IF NOT EXISTS ix_ops_quotes_status ON public.ops_quotes (status) WHERE status = 'pending_approval';

CREATE TABLE IF NOT EXISTS public.ops_quote_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.ops_quotes(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('requested', 'approved', 'rejected')),
  by_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  by_name     text,
  by_role     text,
  note        text CHECK (note IS NULL OR length(note) <= 1000),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_quote_approvals_quote ON public.ops_quote_approvals (quote_id, at);

ALTER TABLE public.ops_tasks ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.ops_opportunities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_ops_tasks_opportunity ON public.ops_tasks (opportunity_id) WHERE status = 'open';

-- A quote's price cannot be changed once it has left draft: a new version is made instead.
CREATE OR REPLACE FUNCTION app.ops_quotes_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.plan IS DISTINCT FROM OLD.plan OR NEW.students IS DISTINCT FROM OLD.students
     OR NEW.price_per_student IS DISTINCT FROM OLD.price_per_student OR NEW.list_price IS DISTINCT FROM OLD.list_price
     OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct OR NEW.term_months IS DISTINCT FROM OLD.term_months) THEN
    RAISE EXCEPTION 'A quote that has left draft cannot be repriced: make a new version';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_quotes_guard ON public.ops_quotes;
CREATE TRIGGER trg_ops_quotes_guard BEFORE UPDATE ON public.ops_quotes FOR EACH ROW EXECUTE FUNCTION app.ops_quotes_guard();

ALTER TABLE public.ops_opportunity_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_discount_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_opportunity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_quote_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_opportunity_stages, public.ops_discount_limits, public.ops_opportunities, public.ops_opportunity_events,
  public.ops_quotes, public.ops_quote_approvals FROM anon, authenticated;
GRANT ALL ON public.ops_opportunity_stages, public.ops_discount_limits, public.ops_opportunities, public.ops_quotes TO service_role;
GRANT SELECT, INSERT ON public.ops_opportunity_events, public.ops_quote_approvals TO service_role;
REVOKE ALL ON SEQUENCE public.ops_opportunity_number_seq, public.ops_quote_number_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.ops_opportunity_number_seq, public.ops_quote_number_seq TO service_role;
REVOKE ALL ON FUNCTION app.ops_quotes_guard() FROM PUBLIC, anon, authenticated;
