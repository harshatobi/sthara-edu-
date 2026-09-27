/** Leave entitlements and balances: pure, shared by the admin desk, the teacher page and both leave routes. */
import { LEAVE_TYPES } from './constants';
import { daysBetween, sessionStart } from './format';

/** Types a yearly policy sets. */
export const POLICY_TYPES = ['casual', 'sick', 'earned', 'maternity', 'paternity'] as const;
/**
 * Types a balance applies to. Duty and unpaid leave aren't drawn from an entitlement; compensatory
 * leave is capped at the comp-off days HR granted (none granted means none to take).
 */
export const BALANCE_TYPES = [...POLICY_TYPES, 'compensatory'] as const;
export const isCapped = (t: string) => (BALANCE_TYPES as readonly string[]).includes(t);

/** Common Indian school defaults, offered when a school first sets its policy. */
export const DEFAULT_POLICY: Record<string, number> = { casual: 12, sick: 10, earned: 15, maternity: 182, paternity: 15 };

export interface Balance { type: string; label: string; entitled: number | null; used: number; pending: number; left: number | null }

export const leaveDays = (from: string, to: string, halfDay: boolean) => (halfDay ? 0.5 : daysBetween(from, to) + 1);

/**
 * One staff member's balances for a session. `used` counts approved leave,
 * `pending` counts requests awaiting a decision; `left` = entitled − used − pending.
 * Types without a policy row have no cap (entitled null), except compensatory, capped at `compOffDays`.
 */
export function balances(policies: { leave_type: string; days_per_year: number | string }[], requests: any[], staffId: string, session: string, compOffDays = 0): Balance[] {
  const start = sessionStart(session);
  const end = `${Number(session.slice(0, 4)) + 1}-03-31`;
  const mine = requests.filter(r => r.staff_id === staffId && String(r.from_date) >= start && String(r.from_date) <= end);
  return BALANCE_TYPES.map(type => {
    const p = policies.find(x => x.leave_type === type);
    const entitled = type === 'compensatory' ? compOffDays : p ? Number(p.days_per_year) : null;
    const sum = (status: string) => mine.filter(r => r.leave_type === type && r.status === status)
      .reduce((n, r) => n + leaveDays(String(r.from_date), String(r.to_date), !!r.half_day), 0);
    const used = sum('approved');
    const pending = sum('pending');
    return { type, label: LEAVE_TYPES[type], entitled, used, pending, left: entitled === null ? null : entitled - used - pending };
  });
}

/** A hidden row: compensatory leave with nothing granted, taken or pending. */
export const showBalance = (b: Balance) => b.entitled !== null && !(b.type === 'compensatory' && !b.entitled && !b.used && !b.pending);

/** Comp-off days granted (and not revoked) to one account for duties in a session. */
export function compOffDaysIn(grants: { user_id: string | null; days: number | string; duty_on: string; revoked_at: string | null }[], userId: string, session: string): number {
  const start = sessionStart(session), end = `${Number(session.slice(0, 4)) + 1}-03-31`;
  return grants.filter(g => g.user_id === userId && !g.revoked_at && g.duty_on >= start && g.duty_on <= end).reduce((n, g) => n + Number(g.days), 0);
}

/** Why a request can't be taken from the balance, or null when it fits. `excluding` leaves one request out (when approving it). */
export function overBalance(policies: any[], requests: any[], staffId: string, session: string, type: string, days: number, excluding?: string, compOffDays = 0): string | null {
  if (!isCapped(type)) return null;
  const b = balances(policies, requests.filter(r => r.id !== excluding), staffId, session, compOffDays).find(x => x.type === type)!;
  if (type === 'compensatory' && days > b.left!) {
    return `That's ${days} day${days === 1 ? '' : 's'} of compensatory leave, but only ${Math.max(0, b.left!)} ${b.left === 1 ? 'is' : 'are'} left `
      + `(${b.entitled} granted for duties this session, ${b.used} taken${b.pending ? `, ${b.pending} awaiting approval` : ''}).`;
  }
  if (b.entitled === null || days <= b.left!) return null;
  return `That's ${days} day${days === 1 ? '' : 's'} of ${b.label.toLowerCase()}, but only ${Math.max(0, b.left!)} ${b.left === 1 ? 'is' : 'are'} left this session `
    + `(${b.entitled} a year, ${b.used} taken${b.pending ? `, ${b.pending} awaiting approval` : ''}).`;
}
