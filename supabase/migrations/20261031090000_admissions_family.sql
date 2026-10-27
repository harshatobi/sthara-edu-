-- Admissions phase 2b: families apply themselves. A new family signs in to the school's apply page (/apply/<school
-- code>) with a code sent to their phone on WhatsApp, or with an access code the admissions office gives them for one
-- applicant; neither makes a Sthara login. A parent who already has a child at the school applies from the parent
-- portal. The family fills the same application the office does (lib/admin/application), sends documents, and
-- submits it; until then it is a draft the office does not work.
--
-- Everything here is read and written by the server only (service role), never through RLS.

-- ── The application, from the family ─────────────────────────────────────────
-- family_phone: the WhatsApp-verified phone (E.164) that owns an online application; submitted_at: when the family
-- sent it (an online or portal application is a draft until then, and stays off the office pipeline).
ALTER TABLE public.admission_applicants
  ADD COLUMN family_phone text CHECK (family_phone IS NULL OR family_phone ~ '^\+[1-9]\d{7,14}$'),
  ADD COLUMN submitted_at timestamptz;
CREATE INDEX admission_applicants_family_phone ON public.admission_applicants (school_id, family_phone) WHERE family_phone IS NOT NULL;
CREATE INDEX admission_applicants_parent ON public.admission_applicants (parent_id) WHERE parent_id IS NOT NULL;

-- ── Phone codes on WhatsApp ─────────────────────────────────────────────────
-- One live code per phone per school; five guesses, ten minutes.
CREATE TABLE public.admission_otps (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, phone_e164)
);

-- ── Access codes from the office ────────────────────────────────────────────
-- For one applicant, shown to the office once and kept only as a hash. Giving a new code ends the old one.
CREATE TABLE public.admission_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  -- The last two characters, so the office can tell which code a family has.
  hint text NOT NULL CHECK (hint ~ '^[0-9A-Z]{2}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admission_access_codes_live ON public.admission_access_codes (applicant_id) WHERE revoked_at IS NULL;
-- Audited by the server (who gave or ended a code, and its hint), not the row trigger, so no hash reaches the log.

-- ── Family sessions ─────────────────────────────────────────────────────────
-- The cookie holds a random token; this row holds its hash and what it may reach: every application of a verified
-- phone at the school, or the one applicant of an access code (ended with the code).
CREATE TABLE public.admission_family_sessions (
  token_hash text PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  phone_e164 text CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  access_code_id uuid REFERENCES public.admission_access_codes(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((phone_e164 IS NULL) <> (access_code_id IS NULL))
);
CREATE INDEX admission_family_sessions_expiry ON public.admission_family_sessions (expires_at);

ALTER TABLE public.admission_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_family_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_otps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admission_access_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admission_family_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admission_otps TO service_role;
GRANT ALL ON public.admission_access_codes TO service_role;
GRANT ALL ON public.admission_family_sessions TO service_role;
