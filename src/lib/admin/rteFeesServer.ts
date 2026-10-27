import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { priorities } from './meritServer';
import { checkPayment, FEE_LABEL, feeDue, feesOf, lotteryOrder, rupees, rteModeOf, type FeeKind } from './rteFees';

/**
 * The RTE quota and admission fees (admissions phase 4b), server side: what a family owes and has paid, receipts and
 * voids (the numbering and the deposit's effect on the offer are in the database), a gateway hook for later, RTE on an
 * applicant (the state portal's allotment), and the school's RTE lottery.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
const STATUS: Record<string, number> = { P0002: 404, '22023': 400, SA409: 409, '23505': 409 };
const rpcFail = (e: { code?: string; message?: string }, fallback: string) =>
  STATUS[e.code ?? ''] ? fail(e.message || fallback, STATUS[e.code!]) : (console.error('[admission fees]', e.code, e.message), fail(fallback, 500));
export interface Actor { id: string; schoolId: string }

async function settingsOf(db: Db, schoolId: string) {
  const { data } = await db.from('schools').select('name, settings').eq('id', schoolId).maybeSingle();
  return { name: (data?.name as string) ?? 'School', settings: data?.settings };
}

// ── Fees ────────────────────────────────────────────────────────────────────

const PCOLS = 'id, kind, amount, mode, reference, paid_on, receipt_no, received_by, voided_at, void_reason, created_at';

/** Each fee the school charges: what this applicant owes (after any concession), what is paid, the deposit's date. */
export async function feesFor(db: Db, schoolId: string, applicantId: string) {
  const { data: a } = await db.from('admission_applicants').select('id, form, guardian_phone, guardian_email, parent_id').eq('id', applicantId).eq('school_id', schoolId).maybeSingle();
  if (!a) return null;
  const [{ settings }, { data: pays }, { data: offer }, pri] = await Promise.all([
    settingsOf(db, schoolId),
    db.from('admission_payments').select(PCOLS).eq('applicant_id', applicantId).order('created_at', { ascending: false }).limit(50),
    db.from('admission_offers').select('status, deposit_due, deposit_paid_at').eq('applicant_id', applicantId).in('status', ['issued', 'accepted']).maybeSingle(),
    priorities(db, schoolId, [a]),
  ]);
  const rules = feesOf(settings);
  const who = pri.get(a.id) ?? { sibling: false, staff: false };
  const payments = (pays || []).map(p => ({ ...p, amount: Number(p.amount) }));
  const kinds = (['application', 'deposit', 'admission'] as FeeKind[]).filter(k => rules[k] > 0 || payments.some(p => p.kind === k));
  return {
    fees: kinds.map(k => ({ kind: k, label: FEE_LABEL[k], ...feeDue(k, rules, who), paid: payments.find(p => p.kind === k && !p.voided_at) ?? null })),
    payments, depositDue: offer?.deposit_due ?? null, depositPaid: !!offer?.deposit_paid_at, offerLive: !!offer,
  };
}

/** Whether the applicant has paid this fee, or does not need to (the school charges none). */
export async function feePaid(db: Db, schoolId: string, applicantId: string, kind: FeeKind, settings?: unknown) {
  const rules = feesOf(settings ?? (await settingsOf(db, schoolId)).settings);
  if (!(rules[kind] > 0)) return { required: false, paid: true, amount: 0 };
  const { data } = await db.from('admission_payments').select('id').eq('applicant_id', applicantId).eq('kind', kind).is('voided_at', null).limit(1);
  return { required: true, paid: !!data?.length, amount: rules[kind] };
}

export async function recordPayment(db: Db, a: Actor, applicantId: string, raw: unknown): Promise<Result<{ id: string; receiptNo: string }>> {
  const p = checkPayment(raw, isoDay());
  if ('error' in p) return fail(p.error);
  const { data, error } = await db.rpc('admission_pay', {
    p_school: a.schoolId, p_applicant: applicantId, p_kind: p.value.kind, p_amount: p.value.amount, p_mode: p.value.mode,
    p_reference: p.value.reference, p_paid_on: p.value.paid_on, p_actor: a.id, p_gateway: null,
  });
  if (error) return rpcFail(error, 'Could not record the payment.');
  const r = data as { id: string; receiptNo: string };
  await db.from('admission_contacts').insert({ school_id: a.schoolId, applicant_id: applicantId, kind: 'note', auto: true, actor_id: a.id,
    note: `${FEE_LABEL[p.value.kind]} ${rupees(p.value.amount)} received (${p.value.mode}${p.value.reference ? ` ${p.value.reference}` : ''}), receipt ${r.receiptNo}` });
  return { ok: true, ...r };
}

export async function voidPayment(db: Db, a: Actor, paymentId: string, reason: unknown): Promise<Result> {
  const { data: p } = await db.from('admission_payments').select('applicant_id, kind, receipt_no').eq('id', paymentId).eq('school_id', a.schoolId).maybeSingle();
  const { error } = await db.rpc('admission_void_payment', { p_school: a.schoolId, p_payment: paymentId, p_actor: a.id, p_reason: typeof reason === 'string' ? reason : '' });
  if (error) return rpcFail(error, 'Could not void the receipt.');
  if (p) await db.from('admission_contacts').insert({ school_id: a.schoolId, applicant_id: p.applicant_id, kind: 'note', auto: true, actor_id: a.id,
    note: `Receipt ${p.receipt_no} (${FEE_LABEL[p.kind as FeeKind].toLowerCase()}) voided: ${String(reason).trim().slice(0, 300)}` });
  return { ok: true };
}

/**
 * The hook for a payment gateway, when one is connected: called by its verified webhook (never by a person), it
 * records the fee as mode 'gateway' with the gateway's payment id and what it reported, with the next receipt number.
 */
export async function recordGatewayPayment(db: Db, x: { schoolId: string; applicantId: string; kind: FeeKind; amount: number; paymentId: string; payload: Record<string, unknown> }) {
  const { data, error } = await db.rpc('admission_pay', {
    p_school: x.schoolId, p_applicant: x.applicantId, p_kind: x.kind, p_amount: x.amount, p_mode: 'gateway', p_reference: x.paymentId,
    p_paid_on: isoDay(), p_actor: null, p_gateway: x.payload,
  });
  return error ? rpcFail(error, 'Could not record the payment.') : { ok: true as const, ...(data as { id: string; receiptNo: string }) };
}

/** A receipt to print. */
export async function receipt(db: Db, schoolId: string, paymentId: string) {
  const { data: p } = await db.from('admission_payments').select(`${PCOLS}, applicant_id`).eq('id', paymentId).eq('school_id', schoolId).maybeSingle();
  if (!p) return null;
  const [{ name }, { data: a }, { data: by }] = await Promise.all([
    settingsOf(db, schoolId),
    db.from('admission_applicants').select('name, grade, session, guardian_name').eq('id', p.applicant_id).maybeSingle(),
    p.received_by ? db.from('users').select('name').eq('id', p.received_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { school: name, ...p, amount: Number(p.amount), applicant: a, receivedBy: (by as { name?: string } | null)?.name ?? null };
}

// ── RTE ─────────────────────────────────────────────────────────────────────

/** An applicant is (or is not) applying under RTE, with the state portal's allotment when there is one. */
export async function setRte(db: Db, a: Actor, applicantId: string, b: Record<string, unknown>): Promise<Result> {
  const { data: ap } = await db.from('admission_applicants').select('id, form, stage').eq('id', applicantId).eq('school_id', a.schoolId).maybeSingle();
  if (!ap) return fail('Applicant not found.', 404);
  const rte = b.rte === true;
  const { data: live } = await db.from('admission_offers').select('status').eq('applicant_id', applicantId).in('status', ['proposed', 'waitlisted', 'issued', 'accepted']).maybeSingle();
  const allotmentNo = typeof b.allotmentNo === 'string' ? b.allotmentNo.trim().slice(0, 60) || null : null;
  const allottedOn = typeof b.allottedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.allottedOn) ? b.allottedOn : null;
  if (allottedOn && allottedOn > isoDay()) return fail('The allotment date is today or earlier.');
  const { data: cur } = await db.from('admission_applicants').select('rte').eq('id', applicantId).maybeSingle();
  // Changing pools under an offer would move the seat without approval.
  if (live && cur && cur.rte !== rte) return fail('This applicant has an offer in progress. Cancel or close it before changing RTE.', 409);
  const form = (ap.form && typeof ap.form === 'object' ? ap.form : {}) as Record<string, any>;
  const fields = { ...(form.fields || {}), rte_seat: rte };
  const { error } = await db.from('admission_applicants').update({
    rte, rte_allotment_no: rte ? allotmentNo : null, rte_allotted_on: rte ? allottedOn : null, form: { ...form, fields },
  }).eq('id', applicantId);
  if (error) return fail('Could not save.', 500);
  return { ok: true };
}

/** The RTE applicants of a class who are still open, for the lottery. */
async function rteEntrants(db: Db, schoolId: string, session: string, grade: number) {
  const { data } = await db.from('admission_applicants').select('id, name, rte_rank, created_at')
    .eq('school_id', schoolId).eq('session', session).eq('grade', grade).eq('rte', true)
    .not('stage', 'in', '(rejected,withdrawn)').is('student_id', null).or('submitted_at.not.is.null,channel.in.(office,import)').order('created_at').limit(2000);
  return data || [];
}

export async function lotteryFor(db: Db, schoolId: string, session: string, grade: number) {
  const [{ settings }, { data: lot }, entrants] = await Promise.all([
    settingsOf(db, schoolId),
    db.from('admission_rte_lotteries').select('id, seed, seats, entrants, ranked, drawn_by, drawn_at, note').eq('school_id', schoolId).eq('session', session).eq('grade', grade).maybeSingle(),
    rteEntrants(db, schoolId, session, grade),
  ]);
  const { data: seat } = await db.from('admission_seats').select('capacity, rte_seats').eq('school_id', schoolId).eq('session', session).eq('grade', grade).maybeSingle();
  const ids = lot ? (lot.ranked as string[]) : [];
  const { data: drawnNames } = ids.length ? await db.from('admission_applicants').select('id, name').in('id', ids).limit(ids.length) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map([...(drawnNames || []), ...entrants].map(x => [x.id, x.name]));
  const { data: by } = lot?.drawn_by ? await db.from('users').select('name').eq('id', lot.drawn_by).maybeSingle() : { data: null };
  return {
    mode: rteModeOf(settings), rteSeats: seat?.rte_seats ?? null,
    lottery: lot ? { ...lot, drawnBy: by?.name ?? null, ranked: (lot.ranked as string[]).map((id, i) => ({ id, rank: i + 1, name: nameOf.get(id) ?? 'Applicant no longer listed' })) } : null,
    // After a draw, applicants who joined later rank after everyone drawn, in the order they applied.
    waiting: entrants.filter(e => !lot || !(lot.entrants as string[]).includes(e.id)).map(e => ({ id: e.id, name: e.name })),
  };
}

/**
 * Draws the RTE lottery of a class, once: a random seed, published with the result, orders the open RTE applicants
 * by sha256(seed:id); each gets their place (rte_rank), which orders offers from the RTE seats.
 */
export async function drawLottery(db: Db, a: Actor, session: string, grade: number, note: unknown): Promise<Result<{ drawn: number }>> {
  const { settings } = await settingsOf(db, a.schoolId);
  if (rteModeOf(settings) !== 'lottery') return fail('Your school takes RTE allotments from the state portal. Switch to a school lottery in Set up first.', 409);
  const entrants = await rteEntrants(db, a.schoolId, session, grade);
  if (!entrants.length) return fail('No open RTE applicants in this class to draw.');
  const { data: seat } = await db.from('admission_seats').select('rte_seats').eq('school_id', a.schoolId).eq('session', session).eq('grade', grade).maybeSingle();
  const seed = randomBytes(16).toString('hex');
  const ids = entrants.map(e => e.id);
  const ranked = lotteryOrder(seed, ids, s => createHash('sha256').update(s).digest('hex'));
  const { error } = await db.from('admission_rte_lotteries').insert({
    school_id: a.schoolId, session, grade, seed, seats: seat?.rte_seats ?? null, entrants: ids, ranked, drawn_by: a.id,
    note: typeof note === 'string' ? note.trim().slice(0, 300) || null : null,
  });
  if (error) return error.code === '23505' ? fail('The lottery for this class has already been drawn. Its result stands.', 409) : fail('Could not draw the lottery.', 500);
  for (const [i, id] of ranked.entries()) await db.from('admission_applicants').update({ rte_rank: i + 1 }).eq('id', id);
  await db.from('admission_contacts').insert(ranked.map((id, i) => ({ school_id: a.schoolId, applicant_id: id, kind: 'note', auto: true, actor_id: a.id,
    note: `RTE lottery drawn: place ${i + 1} of ${ranked.length}` })));
  return { ok: true, drawn: ranked.length };
}
