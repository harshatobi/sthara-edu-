-- Sthara Pay: this school keeps its own fee ledger, and Pay posts into it. Nothing here runs until a school is connected.

-- A receipt for money that came through a payment gateway.
ALTER TABLE public.fee_payments DROP CONSTRAINT fee_payments_mode_check;
ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_mode_check CHECK (mode IN ('upi', 'bank_transfer', 'card', 'cheque', 'cash', 'dd', 'online'));

-- One row per connected school. Keys are sealed by the app, and only the server can read this table.
CREATE TABLE public.pay_connections (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  book_id uuid NOT NULL,
  api_key_enc text NOT NULL,
  signing_secret_enc text NOT NULL,
  mode text NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'off')),
  connected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pay_connections ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pay_connections TO service_role;

-- What Pay has posted here. One row per posting and per record entry, which is what makes a repeat delivery harmless.
CREATE TABLE public.pay_book_postings (
  posting_id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('payment', 'refund', 'void', 'settlement')),
  -- The receipt that currently stands for this entry. A part refund replaces it, so this moves to the new one.
  payment_id uuid REFERENCES public.fee_payments(id) ON DELETE RESTRICT,
  book_ref text,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, entry_id)
);
CREATE INDEX pay_book_postings_payment ON public.pay_book_postings (payment_id);
ALTER TABLE public.pay_book_postings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pay_book_postings TO service_role;

-- Counter receipts on their way to Pay. Written in the same transaction as the receipt, so none can be missed.
CREATE TABLE public.pay_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.fee_payments(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('payment', 'void')),
  pay_entry_id uuid,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, action)
);
CREATE INDEX pay_outbox_due ON public.pay_outbox (next_attempt_at, id) WHERE sent_at IS NULL;
CREATE INDEX pay_outbox_school ON public.pay_outbox (school_id);
ALTER TABLE public.pay_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pay_outbox TO service_role;
GRANT USAGE ON SEQUENCE public.pay_outbox_id_seq TO service_role;

CREATE FUNCTION app.pay_outbox_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Receipts that Pay itself posted are already on its record, so they are never sent back.
  IF current_setting('app.pay_posting', true) = 'on' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pay_connections c WHERE c.school_id = NEW.school_id AND c.status = 'active') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pay_outbox (school_id, payment_id, action) VALUES (NEW.school_id, NEW.id, 'payment') ON CONFLICT DO NOTHING;
  ELSIF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    -- A receipt from before the connection was never reported, so Pay has nothing to reverse.
    IF EXISTS (SELECT 1 FROM public.pay_outbox o WHERE o.payment_id = NEW.id AND o.action = 'payment') THEN
      INSERT INTO public.pay_outbox (school_id, payment_id, action) VALUES (NEW.school_id, NEW.id, 'void') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pay_outbox AFTER INSERT OR UPDATE OF voided_at ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION app.pay_outbox_receipt();

-- Takes one posting from Pay and writes it to the fee ledger through the same rules as the office counter. A refusal
-- raises 22023 with words for the accountant (a closed day, more than the balance), and Pay queues it for a person.
CREATE FUNCTION public.pay_book_post(p_school uuid, p_posting uuid, p_entry jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entry uuid := (p_entry->>'id')::uuid;
  v_kind text := p_entry->>'kind';
  v_paise bigint := (p_entry->>'amount_paise')::bigint;
  v_ref text := p_entry->>'subject_ref';
  v_seen public.pay_book_postings;
  v_invoice uuid; v_charge bigint; v_fee numeric; v_mode text; v_row public.fee_payments; v_orig public.pay_book_postings; v_new public.fee_payments;
  v_remainder numeric; v_book text;
BEGIN
  -- One at a time per entry, so two deliveries of the same posting cannot both write.
  PERFORM pg_advisory_xact_lock(hashtextextended('pay-book:' || p_school || ':' || v_entry, 0));
  SELECT * INTO v_seen FROM public.pay_book_postings WHERE school_id = p_school AND entry_id = v_entry;
  IF FOUND THEN RETURN jsonb_build_object('bookRef', v_seen.book_ref, 'repeat', true); END IF;
  PERFORM set_config('app.pay_posting', 'on', true);

  IF v_kind = 'payment' THEN
    IF v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_invoice FROM public.fee_invoices WHERE id = v_ref::uuid AND school_id = p_school;
    ELSE
      SELECT id INTO v_invoice FROM public.fee_invoices WHERE invoice_no = v_ref AND school_id = p_school AND voided_at IS NULL;
    END IF;
    IF v_invoice IS NULL THEN RAISE EXCEPTION 'No invoice here matches the reference %.', coalesce(v_ref, '(none)') USING ERRCODE = '22023'; END IF;
    -- A convenience charge is not fee: the receipt is for the fee, and the charge stays in the posting detail.
    v_charge := coalesce((p_entry->'meta'->>'payerChargePaise')::bigint, 0);
    v_fee := (v_paise - v_charge) / 100.0;
    IF v_fee <= 0 THEN RAISE EXCEPTION 'The amount received does not cover any of the fee.' USING ERRCODE = '22023'; END IF;
    v_mode := CASE p_entry->>'channel' WHEN 'gateway' THEN 'online' WHEN 'cash' THEN 'cash' WHEN 'cheque' THEN 'cheque' WHEN 'dd' THEN 'dd'
      WHEN 'bank_transfer' THEN 'bank_transfer' WHEN 'upi_direct' THEN 'upi' WHEN 'card_pos' THEN 'card' END;
    IF v_mode IS NULL THEN RAISE EXCEPTION 'Unknown payment channel.' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_row FROM public.admin_record_payment(p_school, v_invoice, v_fee, v_mode,
      coalesce(p_entry->>'gateway_ref', p_entry->'meta'->>'reference'), (p_entry->>'india_day')::date, NULL);
    v_book := v_row.receipt_no;
    INSERT INTO public.pay_book_postings (posting_id, school_id, entry_id, kind, payment_id, book_ref, meta)
      VALUES (p_posting, p_school, v_entry, v_kind, v_row.id, v_book, jsonb_build_object('payerChargePaise', v_charge));
    RETURN jsonb_build_object('bookRef', v_book);
  END IF;

  IF v_kind IN ('refund', 'void') THEN
    SELECT * INTO v_orig FROM public.pay_book_postings WHERE school_id = p_school AND entry_id = (p_entry->>'reverses_entry_id')::uuid FOR UPDATE;
    -- The original never became a receipt here (a second payment refused as over the balance), so no receipt changes.
    IF NOT FOUND OR v_orig.payment_id IS NULL THEN
      INSERT INTO public.pay_book_postings (posting_id, school_id, entry_id, kind, meta) VALUES (p_posting, p_school, v_entry, v_kind, '{"noReceipt": true}');
      RETURN jsonb_build_object('bookRef', NULL);
    END IF;
    SELECT * INTO v_row FROM public.fee_payments WHERE id = v_orig.payment_id AND school_id = p_school FOR UPDATE;
    IF v_row.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Receipt % was already voided here. Check it by hand.', v_row.receipt_no USING ERRCODE = '22023'; END IF;
    v_remainder := v_row.amount - ((-v_paise) / 100.0);
    -- The ledger guard refuses this on a closed day, and the accountant reopens that day as they would at the counter.
    UPDATE public.fee_payments SET voided_at = now(), void_reason = CASE v_kind WHEN 'refund' THEN 'Refunded through Sthara Pay' ELSE coalesce(left(p_entry->'meta'->>'reason', 280), 'Voided in Sthara Pay') END WHERE id = v_row.id;
    v_book := v_row.receipt_no || ' voided';
    -- Receipts are never edited, so a part refund voids the receipt and issues a new one for what remains.
    IF v_remainder > 0 THEN
      SELECT * INTO v_new FROM public.admin_record_payment(p_school, v_row.invoice_id, v_remainder, v_row.mode, v_row.reference, v_row.paid_on, NULL);
      UPDATE public.pay_book_postings SET payment_id = v_new.id, book_ref = v_new.receipt_no WHERE posting_id = v_orig.posting_id;
      v_book := v_new.receipt_no;
    END IF;
    INSERT INTO public.pay_book_postings (posting_id, school_id, entry_id, kind, payment_id, book_ref, meta)
      VALUES (p_posting, p_school, v_entry, v_kind, coalesce(v_new.id, v_row.id), v_book, jsonb_build_object('voidedReceipt', v_row.receipt_no));
    RETURN jsonb_build_object('bookRef', v_book);
  END IF;

  IF v_kind = 'settlement' THEN
    v_book := coalesce(p_entry->'meta'->>'utr', p_entry->>'gateway_ref');
    INSERT INTO public.pay_book_postings (posting_id, school_id, entry_id, kind, book_ref, meta) VALUES (p_posting, p_school, v_entry, v_kind, v_book, coalesce(p_entry->'meta', '{}'));
    RETURN jsonb_build_object('bookRef', v_book);
  END IF;
  RAISE EXCEPTION 'This book does not take entries of kind %.', v_kind USING ERRCODE = '22023';
END $$;
REVOKE ALL ON FUNCTION public.pay_book_post(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_book_post(uuid, uuid, jsonb) TO service_role;
