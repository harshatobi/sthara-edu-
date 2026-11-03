-- Supabase grants new public functions and tables to anon and authenticated by default, and revoking from PUBLIC does
-- not remove those direct grants. Only the server may post to the ledger or read Pay keys.
REVOKE ALL ON FUNCTION public.pay_book_post(uuid, uuid, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION app.pay_outbox_receipt() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.pay_connections, public.pay_book_postings, public.pay_outbox FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.pay_outbox_id_seq FROM anon, authenticated;
