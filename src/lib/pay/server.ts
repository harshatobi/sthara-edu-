import 'server-only';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { indiaDay } from '@/lib/admin/format';
import { feeLinkKey, retryDelaySeconds, toPaise, unseal } from './book';

export interface PayConnection { schoolId: string; institutionId: string; bookId: string; apiKey: string; signingSecret: string; mode: 'test' | 'live' }

const url = () => process.env.STHARA_PAY_URL?.trim().replace(/\/$/, '') || '';
const sealKey = () => process.env.PAY_CONNECTION_KEY?.trim() || '';
/** Off until both are set, so every path below is inert on a deployment that has no Pay. */
export const payConfigured = () => !!url() && !!sealKey();

export async function payConnection(db: SupabaseClient, schoolId: string): Promise<PayConnection | null> {
  if (!payConfigured()) return null;
  const { data } = await db.from('pay_connections').select('*').eq('school_id', schoolId).eq('status', 'active').maybeSingle();
  if (!data) return null;
  return { schoolId, institutionId: data.institution_id, bookId: data.book_id, mode: data.mode, apiKey: unseal(data.api_key_enc, schoolId, sealKey()), signingSecret: unseal(data.signing_secret_enc, schoolId, sealKey()) };
}
/** Only the secret, for checking a posting: this route never needs the API key. */
export async function paySigningSecret(db: SupabaseClient, schoolId: string): Promise<string | null> {
  if (!sealKey()) return null;
  const { data } = await db.from('pay_connections').select('signing_secret_enc').eq('school_id', schoolId).eq('status', 'active').maybeSingle();
  return data ? unseal(data.signing_secret_enc, schoolId, sealKey()) : null;
}

async function payCall(c: PayConnection, path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${url()}/v1/institutions/${c.institutionId}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}`, ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok) throw new PayError(res.status, String(data?.message ?? `Pay answered ${res.status}`));
  return data;
}
export class PayError extends Error { constructor(public status: number, message: string) { super(message); } }

/** A payment link for what is due on this invoice right now. The amount always comes from the ledger, never the browser. */
export async function feePaymentLink(db: SupabaseClient, c: PayConnection, invoiceId: string, payerPhone: string | null, returnUrl: string | null) {
  const { data: inv } = await db.from('fee_invoices').select('id, school_id, student_id, invoice_no, label, amount, concession, voided_at').eq('id', invoiceId).eq('school_id', c.schoolId).maybeSingle();
  if (!inv || inv.voided_at) return { error: 'This invoice is no longer open.' as const };
  // bounded: the receipts of one invoice
  const { data: paid } = await db.from('fee_payments').select('amount').eq('invoice_id', invoiceId).is('voided_at', null);
  const balancePaise = toPaise(Number(inv.amount) - Number(inv.concession)) - (paid || []).reduce((n, p) => n + toPaise(Number(p.amount)), 0);
  if (balancePaise <= 0) return { error: 'This invoice is already paid.' as const };
  const { data: student } = await db.from('users').select('name').eq('id', inv.student_id).maybeSingle();
  const order = await payCall(c, '/orders', {
    payerRef: inv.student_id, payerName: student?.name || 'Student', ...(payerPhone ? { payerPhone } : {}),
    subjectType: 'fee_invoice', subjectRef: inv.id, subjectLabel: `${inv.label} (${inv.invoice_no})`, amountPaise: balancePaise, mode: c.mode, expiresInHours: 24, ...(returnUrl ? { returnUrl } : {}),
  }, { 'Idempotency-Key': feeLinkKey(inv.id, balancePaise, indiaDay()) });
  return { url: order.payUrl as string };
}

/**
 * Tells Pay about counter receipts and voids, oldest first. Stops for a school at its first failure, so a void can
 * never overtake the receipt it reverses. Pay ignores repeats, so a crash between sending and marking is harmless.
 */
export async function flushPayOutbox(db: SupabaseClient, schoolId: string | null = null, limit = 100): Promise<{ sent: number; failed: number }> {
  if (!payConfigured()) return { sent: 0, failed: 0 };
  let q = db.from('pay_outbox').select('id, school_id, payment_id, action, attempts').is('sent_at', null).lte('next_attempt_at', new Date().toISOString()).order('id').limit(limit);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data: due } = await q;
  const blocked = new Set<string>();
  const conns = new Map<string, PayConnection | null>();
  let sent = 0, failed = 0;
  for (const row of due || []) {
    if (blocked.has(row.school_id)) continue;
    try {
      if (!conns.has(row.school_id)) conns.set(row.school_id, await payConnection(db, row.school_id));
      const c = conns.get(row.school_id);
      if (!c) continue;
      const { data: p } = await db.from('fee_payments').select('id, amount, mode, reference, paid_on, receipt_no, student_id, invoice_id, void_reason').eq('id', row.payment_id).single();
      if (!p) continue;
      let entryId: string | null = null;
      if (row.action === 'payment') {
        const [{ data: inv }, { data: st }] = await Promise.all([
          db.from('fee_invoices').select('invoice_no, label').eq('id', p.invoice_id).maybeSingle(),
          db.from('users').select('name').eq('id', p.student_id).maybeSingle(),
        ]);
        const made = await payCall(c, '/record/manual', {
          bookId: c.bookId, sourceRef: p.receipt_no, channel: CHANNEL[p.mode] ?? 'cash', amountPaise: toPaise(Number(p.amount)), occurredAt: `${p.paid_on}T12:00:00+05:30`, dateOnly: true,
          ...(p.reference ? { reference: p.reference } : {}), payerRef: p.student_id, payerName: st?.name || 'Student', subjectType: 'fee_invoice', subjectRef: p.invoice_id, subjectLabel: `${inv?.label ?? 'Fee'} (${inv?.invoice_no ?? ''})`,
        });
        entryId = made.id;
      } else {
        const { data: orig } = await db.from('pay_outbox').select('pay_entry_id').eq('payment_id', row.payment_id).eq('action', 'payment').maybeSingle();
        if (!orig?.pay_entry_id) { blocked.add(row.school_id); continue; } // Its receipt has not gone yet; retried in order.
        await payCall(c, `/record/${orig.pay_entry_id}/void`, { reason: p.void_reason || 'Voided at the school office', sourceRef: `${p.receipt_no}/VOID` });
      }
      await db.from('pay_outbox').update({ sent_at: new Date().toISOString(), last_error: null, ...(entryId ? { pay_entry_id: entryId } : {}) }).eq('id', row.id);
      sent++;
    } catch (e) {
      failed++;
      blocked.add(row.school_id);
      const attempts = row.attempts + 1;
      await db.from('pay_outbox').update({ attempts, next_attempt_at: new Date(Date.now() + retryDelaySeconds(attempts) * 1000).toISOString(), last_error: (e instanceof Error ? e.message : 'Failed').slice(0, 300) }).eq('id', row.id);
    }
  }
  return { sent, failed };
}
const CHANNEL: Record<string, string> = { cash: 'cash', cheque: 'cheque', dd: 'dd', bank_transfer: 'bank_transfer', upi: 'upi_direct', card: 'card_pos' };

/** After the office's response has gone. The scheduled run covers anything this misses. */
export function flushPaySoon(db: SupabaseClient, schoolId: string) {
  if (!payConfigured()) return;
  const run = () => flushPayOutbox(db, schoolId).then(() => undefined, e => console.error('[pay outbox]', e instanceof Error ? e.message : e));
  try { after(run); } catch { void run(); }
}
