-- Partners, commissions and marketing spend for the Platform Manager.
--
-- ops_partners           dealers, referrers and resellers who bring schools, with the commission each is paid by default.
-- ops_commission_rules   Sthara's own sales commission: what a deal's owner, and the owner's manager, earn on a win.
-- ops_commissions        one line per payee per won deal: accrued when the deal is won, then approved, then paid.
--                        Lines can also be added by hand (a one-off referral fee, a finder's bonus).
-- ops_campaigns          a marketing effort with a budget and a code (the utm_campaign that marks its enquiries).
-- ops_marketing_spend    money spent: on a campaign (shared by the leads it brought), or directly on one enquiry,
--                        deal or school (travel to a demo, a pilot kit).
-- enquiries              gain source, campaign and the UTM tags the website captured.
-- ops_opportunities      gain source, campaign and partner.
--
-- Server-only (service role), behind /api/ops/partners and /api/ops/marketing.

CREATE TABLE IF NOT EXISTS public.ops_partners (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  kind              text NOT NULL DEFAULT 'dealer' CHECK (kind IN ('dealer', 'referral', 'reseller', 'consultant', 'other')),
  contact_name      text CHECK (contact_name IS NULL OR length(contact_name) <= 120),
  phone             text CHECK (phone IS NULL OR length(phone) <= 30),
  email             text CHECK (email IS NULL OR length(email) <= 200),
  state             text CHECK (state IS NULL OR length(state) <= 60),
  district          text CHECK (district IS NULL OR length(district) <= 80),
  pan               text CHECK (pan IS NULL OR length(pan) <= 20),
  gstin             text CHECK (gstin IS NULL OR length(gstin) <= 20),
  commission_pct    numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
  commission_basis  text NOT NULL DEFAULT 'first_year' CHECK (commission_basis IN ('first_year', 'every_year')),
  notes             text CHECK (notes IS NULL OR length(notes) <= 2000),
  active            boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_partners_name ON public.ops_partners (lower(name));

CREATE TABLE IF NOT EXISTS public.ops_commission_rules (
  key       text PRIMARY KEY CHECK (key IN ('deal_owner', 'owner_manager')),
  rate_pct  numeric(5,2) NOT NULL DEFAULT 0 CHECK (rate_pct BETWEEN 0 AND 100),
  active    boolean NOT NULL DEFAULT false
);
INSERT INTO public.ops_commission_rules VALUES ('deal_owner', 0, false), ('owner_manager', 0, false) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  code        text NOT NULL CHECK (code ~ '^[a-z0-9_-]{2,60}$'),
  channel     text NOT NULL DEFAULT 'other' CHECK (channel IN ('search_ads', 'social_ads', 'event', 'print', 'outbound', 'referral_programme', 'content', 'partner', 'other')),
  starts_on   date,
  ends_on     date,
  budget      numeric(14,2) CHECK (budget IS NULL OR budget >= 0),
  notes       text CHECK (notes IS NULL OR length(notes) <= 2000),
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_campaigns_code ON public.ops_campaigns (code);

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS source text CHECK (source IS NULL OR length(source) <= 40),
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.ops_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS utm jsonb;
CREATE INDEX IF NOT EXISTS ix_enquiries_campaign ON public.enquiries (campaign_id);

ALTER TABLE public.ops_opportunities
  ADD COLUMN IF NOT EXISTS source text CHECK (source IS NULL OR source IN ('website', 'partner', 'referral', 'outbound', 'event', 'inbound_call', 'existing', 'other')),
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.ops_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.ops_partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_campaign ON public.ops_opportunities (campaign_id);
CREATE INDEX IF NOT EXISTS ix_ops_opportunities_partner ON public.ops_opportunities (partner_id);

CREATE TABLE IF NOT EXISTS public.ops_marketing_spend (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid REFERENCES public.ops_campaigns(id) ON DELETE CASCADE,
  opportunity_id  uuid REFERENCES public.ops_opportunities(id) ON DELETE CASCADE,
  enquiry_id      uuid REFERENCES public.enquiries(id) ON DELETE CASCADE,
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  spent_on        date NOT NULL,
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  category        text NOT NULL DEFAULT 'other' CHECK (category IN ('ads', 'event', 'travel', 'print', 'gifts', 'agency', 'pilot_kit', 'other')),
  note            text CHECK (note IS NULL OR length(note) <= 500),
  entered_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Every rupee is spent on something: a campaign, or one lead, deal or school.
  CHECK (campaign_id IS NOT NULL OR opportunity_id IS NOT NULL OR enquiry_id IS NOT NULL OR school_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_ops_marketing_spend_campaign ON public.ops_marketing_spend (campaign_id);
CREATE INDEX IF NOT EXISTS ix_ops_marketing_spend_opp ON public.ops_marketing_spend (opportunity_id);
CREATE INDEX IF NOT EXISTS ix_ops_marketing_spend_school ON public.ops_marketing_spend (school_id);

CREATE TABLE IF NOT EXISTS public.ops_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid REFERENCES public.ops_opportunities(id) ON DELETE SET NULL,
  school_id       uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  payee_kind      text NOT NULL CHECK (payee_kind IN ('partner', 'operator', 'other')),
  partner_id      uuid REFERENCES public.ops_partners(id) ON DELETE SET NULL,
  operator_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  payee_name      text NOT NULL CHECK (length(payee_name) BETWEEN 2 AND 160),
  reason          text NOT NULL CHECK (length(reason) BETWEEN 2 AND 200),
  basis_amount    numeric(14,2) CHECK (basis_amount IS NULL OR basis_amount >= 0),
  rate_pct        numeric(5,2) CHECK (rate_pct IS NULL OR rate_pct BETWEEN 0 AND 100),
  amount          numeric(14,2) NOT NULL CHECK (amount > 0),
  status          text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'approved', 'paid', 'cancelled')),
  auto            boolean NOT NULL DEFAULT false,
  accrued_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  paid_on         date,
  payment_ref     text CHECK (payment_ref IS NULL OR length(payment_ref) <= 120),
  note            text CHECK (note IS NULL OR length(note) <= 500),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_ops_commissions_opp ON public.ops_commissions (opportunity_id);
CREATE INDEX IF NOT EXISTS ix_ops_commissions_partner ON public.ops_commissions (partner_id);
CREATE INDEX IF NOT EXISTS ix_ops_commissions_status ON public.ops_commissions (status);

-- A paid commission is a record of money that left: its amount and payee do not change afterwards.
CREATE OR REPLACE FUNCTION app.ops_commissions_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'paid') THEN RAISE EXCEPTION 'An approved or paid commission cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'paid' AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.paid_on IS DISTINCT FROM OLD.paid_on) THEN
    RAISE EXCEPTION 'A paid commission cannot be changed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_commissions_guard ON public.ops_commissions;
CREATE TRIGGER trg_ops_commissions_guard BEFORE UPDATE OR DELETE ON public.ops_commissions
  FOR EACH ROW EXECUTE FUNCTION app.ops_commissions_guard();

ALTER TABLE public.ops_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_marketing_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_partners, public.ops_commission_rules, public.ops_campaigns, public.ops_marketing_spend, public.ops_commissions FROM anon, authenticated;
GRANT ALL ON public.ops_partners, public.ops_commission_rules, public.ops_campaigns, public.ops_marketing_spend, public.ops_commissions TO service_role;
REVOKE ALL ON FUNCTION app.ops_commissions_guard() FROM PUBLIC, anon, authenticated;
