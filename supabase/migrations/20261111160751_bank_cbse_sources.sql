-- Question bank: official CBSE material loaded by the rules-only pipeline (scripts/cbse-bank, no AI).
--   * source gains the other official CBSE kinds: question banks, practice questions, competency-based items and
--     skill-subject papers (cbse_sqp = sample paper with marking scheme, cbse_board = a past board paper)
--   * session: the CBSE session the item was published for ('2026-27'), so older sessions can be told apart
--   * bank-figures: the diagrams and maps cropped from CBSE's own PDFs. Public read (they are CBSE's published
--     papers, and a plain link lets them show on screen and in print), PNG only (no SVG: it can carry script),
--     and no storage policies, so only the server (service role) can write or list.

ALTER TABLE public.bank_items DROP CONSTRAINT IF EXISTS bank_items_source_check;
ALTER TABLE public.bank_items ADD CONSTRAINT bank_items_source_check CHECK (source IN (
  'cbse_sqp', 'cbse_board', 'cbse_qbank', 'cbse_practice', 'cbse_competency', 'cbse_skill',
  'ncert', 'sthara_ai', 'teacher', 'ai'));

ALTER TABLE public.bank_items ADD COLUMN session text CHECK (session IS NULL OR session ~ '^\d{4}-\d{2}$');
COMMENT ON COLUMN public.bank_items.session IS 'CBSE session the item was published for (2026-27); null for items Sthara or a school wrote.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bank-figures', 'bank-figures', true, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;
