/**
 * The RTE quota and admission fees (admissions phase 4b): the school's settings, what a family owes, receipts, and
 * the RTE lottery's order. Pure, so the office screens, the server and the tests share it.
 */

// ── Fees ────────────────────────────────────────────────────────────────────
export type FeeKind = 'application' | 'deposit' | 'admission';
export const FEE_LABEL: Record<FeeKind, string> = { application: 'Application fee', deposit: 'Seat deposit', admission: 'Admission fee' };
export const PAY_MODES = { cash: 'Cash', upi: 'UPI', card: 'Card', cheque: 'Cheque', bank: 'Bank transfer' } as const;
export type PayMode = keyof typeof PAY_MODES | 'gateway';

export interface FeeRules {
  application: number; deposit: number; admission: number;
  /** Days after an offer goes out to pay the deposit (blank: the days to accept). */
  depositDays: number | null;
  /** Concessions on the admission fee, in per cent, for a sibling at the school and a staff ward (the larger applies). */
  siblingPct: number; staffPct: number;
}
export const NO_FEES: FeeRules = { application: 0, deposit: 0, admission: 0, depositDays: null, siblingPct: 0, staffPct: 0 };

const amount = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1e7 ? Math.round(n * 100) / 100 : 0; };
const pct = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : 0; };

/** settings.admissions.fees over none; anything malformed reads as no fee. */
export function feesOf(settings: unknown): FeeRules {
  const raw = (settings as { admissions?: { fees?: Record<string, unknown> } } | null)?.admissions?.fees;
  if (!raw || typeof raw !== 'object') return NO_FEES;
  const d = Number(raw.depositDays);
  return {
    application: amount(raw.application), deposit: amount(raw.deposit), admission: amount(raw.admission),
    depositDays: Number.isInteger(d) && d >= 1 && d <= 90 ? d : null, siblingPct: pct(raw.siblingPct), staffPct: pct(raw.staffPct),
  };
}

export function checkFees(raw: unknown): { value: FeeRules } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: FeeRules = { ...NO_FEES };
  for (const k of ['application', 'deposit', 'admission'] as const) {
    const v = o[k];
    if (v === '' || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e7) return { error: `${FEE_LABEL[k]}: an amount in rupees up to 1 crore.` };
    if (Math.round(n * 100) !== n * 100) return { error: `${FEE_LABEL[k]}: at most two decimals.` };
    out[k] = n;
  }
  if (o.depositDays !== '' && o.depositDays != null) {
    const d = Number(o.depositDays);
    if (!Number.isInteger(d) || d < 1 || d > 90) return { error: 'Days to pay the deposit run from 1 to 90.' };
    out.depositDays = d;
  }
  for (const k of ['siblingPct', 'staffPct'] as const) {
    const v = o[k];
    if (v === '' || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Concessions are a per cent from 0 to 100.' };
    out[k] = n;
  }
  return { value: out };
}

/** What a family owes for one fee: the admission fee less the larger of their concessions, to the rupee. */
export function feeDue(kind: FeeKind, r: FeeRules, who: { sibling: boolean; staff: boolean }) {
  const base = r[kind];
  if (kind !== 'admission' || !base) return { amount: base, concession: 0, why: null as string | null };
  const s = who.sibling ? r.siblingPct : 0, t = who.staff ? r.staffPct : 0;
  const off = Math.max(s, t);
  if (!off) return { amount: base, concession: 0, why: null };
  const concession = Math.round(base * off) / 100;
  return { amount: Math.round((base - concession) * 100) / 100, concession, why: `${off}% ${t > s ? 'staff ward' : 'sibling'} concession` };
}

/** A payment as typed: an amount, a mode, and the reference every mode but cash needs. */
export function checkPayment(raw: unknown, today: string): { value: { kind: FeeKind; amount: number; mode: Exclude<PayMode, 'gateway'>; reference: string | null; paid_on: string } } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = String(o.kind ?? '') as FeeKind;
  if (!(kind in FEE_LABEL)) return { error: 'Pick which fee.' };
  const n = Number(o.amount);
  if (!Number.isFinite(n) || n <= 0 || n > 1e7 || Math.round(n * 100) !== n * 100) return { error: 'Enter the amount received, in rupees.' };
  const mode = String(o.mode ?? '');
  if (!(mode in PAY_MODES)) return { error: 'Pick how it was paid.' };
  const reference = typeof o.reference === 'string' ? o.reference.trim().slice(0, 80) || null : null;
  if (mode !== 'cash' && !reference) return { error: mode === 'upi' ? 'Enter the UPI transaction ID.' : mode === 'cheque' ? 'Enter the cheque number.' : 'Enter the payment reference.' };
  const paid = typeof o.paidOn === 'string' && o.paidOn ? o.paidOn : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid) || paid > today) return { error: 'The day it was paid is today or earlier.' };
  return { value: { kind, amount: n, mode: mode as Exclude<PayMode, 'gateway'>, reference, paid_on: paid } };
}

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ── RTE ─────────────────────────────────────────────────────────────────────
export type RteMode = 'portal' | 'lottery';
export const RTE_MODE_LABEL: Record<RteMode, string> = { portal: 'The state portal allots seats', lottery: 'The school runs a lottery' };

/** settings.admissions.rte: the state portal unless the school runs its own lottery. */
export const rteModeOf = (settings: unknown): RteMode =>
  (settings as { admissions?: { rte?: { mode?: unknown } } } | null)?.admissions?.rte?.mode === 'lottery' ? 'lottery' : 'portal';

/** At least a quarter of the class (RTE Act s.12(1)(c)), rounded up. */
export const suggestRteSeats = (capacity: number) => Math.ceil(capacity / 4);

/**
 * The lottery's order: each entrant's hash of the seed and their id, lowest first. Anyone with the published seed and
 * the list of entrants gets the same order. `hash` is sha256 as lowercase hex (node's on the server, the browser's
 * when a family or inspector checks it).
 */
export function lotteryOrder(seed: string, entrants: string[], hash: (s: string) => string): string[] {
  return [...entrants].map(id => ({ id, h: hash(`${seed}:${id}`) })).sort((a, b) => a.h.localeCompare(b.h) || a.id.localeCompare(b.id)).map(x => x.id);
}
