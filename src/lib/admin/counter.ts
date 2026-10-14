/**
 * The fee counter's arithmetic: how one sum handed over at the counter is spread across a family's unpaid
 * invoices, and the day's till. Pure, so it is unit-tested.
 */
import type { Family, Invoice, Receipt } from './fees';

/** A family's invoices that still have a balance, oldest due date first. */
export const dues = (f: Family): Invoice[] => f.invoices.filter(i => !i.voided && i.balance > 0).sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.instalmentNo - b.instalmentNo);

export interface Split { invoice: Invoice; amount: number }

/**
 * Spreads `amount` over the invoices, oldest first, never more than each one's balance.
 * `left` is what could not be placed (the family handed over more than it owes).
 */
export function allocate(invoices: Invoice[], amount: number): { splits: Split[]; left: number } {
  let left = Math.round(amount * 100);
  const splits: Split[] = [];
  for (const invoice of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, Math.round(invoice.balance * 100));
    if (take > 0) { splits.push({ invoice, amount: take / 100 }); left -= take; }
  }
  return { splits, left: left / 100 };
}

/** Why this payment cannot be taken as entered, or null when it can. */
export function paymentProblem(amount: number, owed: number, mode: string, reference: string): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'Enter the amount received.';
  if (amount > owed + 0.001) return `That is more than the ${owed.toLocaleString('en-IN')} owed. Take only what is due.`;
  if (['cheque', 'bank_transfer', 'upi', 'dd'].includes(mode) && !reference.trim()) {
    return mode === 'cheque' ? 'Enter the cheque number.' : mode === 'upi' ? 'Enter the UPI transaction ID.' : 'Enter the transaction reference.';
  }
  return null;
}

export interface Till { count: number; total: number; byMode: { mode: string; count: number; total: number }[]; cash: number }

/** What was received on a day (receipts that are not void), in all and by mode, largest first. */
export function tillFor(receipts: Receipt[], day: string): Till {
  const live = receipts.filter(r => r.paidOn === day && !r.voided);
  const modes = new Map<string, { count: number; total: number }>();
  for (const r of live) { const m = modes.get(r.mode) ?? { count: 0, total: 0 }; m.count += 1; m.total += r.amount; modes.set(r.mode, m); }
  return {
    count: live.length, total: live.reduce((s, r) => s + r.amount, 0),
    byMode: [...modes].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.total - a.total),
    cash: modes.get('cash')?.total ?? 0,
  };
}

/** Families matching what the cashier typed (name, class or roll number), those who owe first. At most `max`. */
export function findFamilies(families: Family[], rollOf: Map<string, string>, q: string, max = 8): Family[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  // Punctuation and spacing are ignored, so "9a", "9-a" and "9 A" all find Class 9-A.
  const squash = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const words = needle.split(/\s+/).map(squash).filter(Boolean);
  if (!words.length) return [];
  return families
    .filter(f => { const hay = squash(`${f.name} ${f.cls} ${rollOf.get(f.studentId) ?? ''}`); return words.every(w => hay.includes(w)); })
    .sort((a, b) => Number(b.outstanding > 0) - Number(a.outstanding > 0) || a.name.localeCompare(b.name))
    .slice(0, max);
}
