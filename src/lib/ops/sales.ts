/**
 * The sales pipeline's rules: what a quote comes to, who may approve its discount, what moving a deal to a stage
 * needs, and the forecast. Shared by the Platform Manager and its API. Pure, so it is unit-tested.
 */
import { PLAN_INFO, type Plan } from '@/lib/settings/registry';
import type { OperatorRole } from './roles';

export const OPP_KINDS = { new: 'New school', pilot_conversion: 'Pilot to paid', renewal: 'Renewal', expansion: 'More seats' } as const;
export type OppKind = keyof typeof OPP_KINDS;
export const isOppKind = (v: unknown): v is OppKind => typeof v === 'string' && Object.hasOwn(OPP_KINDS, v);

export interface Stage { key: string; label: string; sort: number; probability: number; kind: 'open' | 'won' | 'lost'; active: boolean }
export const oppRef = (n: number | string) => `OPP-${n}`;
export const quoteRef = (n: number | string, version = 1) => `Q-${n}${version > 1 ? `-v${version}` : ''}`;

/** Tiers a quote can be for (a pilot is priced at its tier). */
export const QUOTE_PLANS = ['aadhara', 'sthamba', 'shikhara', 'mandala'] as const;
export type QuotePlan = typeof QUOTE_PLANS[number];
export const isQuotePlan = (v: unknown): v is QuotePlan => typeof v === 'string' && (QUOTE_PLANS as readonly string[]).includes(v);
export const listPriceOf = (plan: Plan | QuotePlan): number | null => PLAN_INFO[plan].price;

export const GST_RATE = 0.18;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface QuoteMath {
  listPrice: number | null;
  /** Percent off list, to one decimal; 0 when there is no list price or the offer is at or above it. */
  discountPct: number;
  /** One year at the offered price. */
  annual: number;
  /** The whole term, before tax. */
  subtotal: number;
  gst: number;
  total: number;
}

export function quoteMath(plan: QuotePlan, students: number, pricePerStudent: number, termMonths = 12): QuoteMath {
  const listPrice = listPriceOf(plan);
  const discountPct = listPrice && pricePerStudent < listPrice ? Math.round(((listPrice - pricePerStudent) / listPrice) * 1000) / 10 : 0;
  const annual = round2(students * pricePerStudent);
  const subtotal = round2((annual * termMonths) / 12);
  const gst = round2(subtotal * GST_RATE);
  return { listPrice, discountPct, annual, subtotal, gst, total: round2(subtotal + gst) };
}

/** Why a quote cannot be saved as given, or null when it can. */
export function quoteProblem(q: { plan: unknown; students: number; pricePerStudent: number; termMonths: number; validUntil: string }, today: string): string | null {
  if (!isQuotePlan(q.plan)) return 'Pick the tier.';
  if (!Number.isInteger(q.students) || q.students < 1 || q.students > 999999) return 'Enter the number of students.';
  if (!(q.pricePerStudent > 0)) return 'Enter the price per student per year.';
  if (!Number.isInteger(q.termMonths) || q.termMonths < 1 || q.termMonths > 60) return 'The term is between 1 and 60 months.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.validUntil) || q.validUntil < today) return 'The quote must be valid until today or later.';
  return null;
}

/** The largest discount each role may give on its own word. Roles not listed cannot quote. */
export type DiscountLimits = Partial<Record<OperatorRole, number>>;
export const DEFAULT_LIMITS: DiscountLimits = { sales_rep: 5, account_manager: 5, regional_lead: 15, director: 100 };
const APPROVER_ORDER: ('regional_lead' | 'director')[] = ['regional_lead', 'director'];

/**
 * Who must approve a quote before it can go to the school: nobody (null) when the discount is within the writer's
 * own limit, else the lowest approver whose limit covers it. A tier with no list price (Mandala) is a custom price
 * and always goes to the director, unless a director wrote it.
 */
export function approvalNeeded(limits: DiscountLimits, writer: OperatorRole, plan: QuotePlan, discountPct: number): 'regional_lead' | 'director' | null {
  if (writer === 'director') return null;
  if (listPriceOf(plan) === null) return 'director';
  if (discountPct <= (limits[writer] ?? 0)) return null;
  return APPROVER_ORDER.find(r => discountPct <= (limits[r] ?? 0)) ?? 'director';
}

/** Whether this operator may decide this quote's approval: senior enough, limit high enough, and not their own quote. */
export function canDecide(limits: DiscountLimits, me: { id: string; role: OperatorRole }, q: { needsRole: string | null; discountPct: number; plan: QuotePlan; createdBy: string | null; status: string }): boolean {
  if (q.status !== 'pending_approval') return false;
  if (me.role === 'director') return true;
  if (q.createdBy === me.id) return false;
  if (q.needsRole !== 'regional_lead' || me.role !== 'regional_lead') return false;
  return listPriceOf(q.plan) !== null && q.discountPct <= (limits.regional_lead ?? 0);
}

export const QUOTE_STATUS = {
  draft: 'Draft', pending_approval: 'Awaiting approval', approved: 'Approved', rejected: 'Approval refused',
  sent: 'Sent to the school', accepted: 'Accepted', declined: 'Declined', expired: 'Expired',
} as const;
export type QuoteStatus = keyof typeof QUOTE_STATUS;

/** A quote that was never accepted lapses once its date has passed. */
export function effectiveStatus(q: { status: QuoteStatus; validUntil: string }, today: string): QuoteStatus {
  return ['draft', 'approved', 'sent', 'pending_approval'].includes(q.status) && q.validUntil < today ? 'expired' : q.status;
}

/** The moves a quote can make from where it is. */
export function quoteMoves(status: QuoteStatus): ('submit' | 'send' | 'accept' | 'decline' | 'revise')[] {
  switch (status) {
    case 'draft': return ['submit'];
    case 'approved': return ['send', 'revise'];
    case 'sent': return ['accept', 'decline', 'revise'];
    case 'rejected': case 'declined': case 'expired': return ['revise'];
    default: return [];
  }
}

export interface Opp {
  id: string; stage: string; amount: number; expectedClose: string | null; ownerId: string | null; closedAt: string | null;
  stageChangedAt: string; kind: OppKind; lossReason: string | null;
}

/** Why a deal cannot move to this stage, or null when it can. */
export function moveProblem(stages: Stage[], o: { amount: number; stage: string }, to: string, lossReason: string | null): string | null {
  const s = stages.find(x => x.key === to);
  if (!s) return 'That stage does not exist.';
  if (!s.active && s.key !== o.stage) return 'That stage is retired.';
  if (s.kind === 'lost' && !lossReason) return 'Say why it was lost.';
  if (s.kind === 'won' && !(o.amount > 0)) return 'Set the tier, students and price before marking it won.';
  return null;
}

export interface Forecast {
  open: { count: number; amount: number; weighted: number };
  byStage: { key: string; label: string; kind: Stage['kind']; probability: number; count: number; amount: number; weighted: number }[];
  /** The next six months by expected close, starting with this one; deals with no date are in `undated`. */
  byMonth: { month: string; count: number; amount: number; weighted: number }[];
  undated: { count: number; amount: number };
  /** Open deals whose expected close has passed. */
  overdue: number;
  /** Closed in the last 90 days. */
  won: { count: number; amount: number };
  lost: { count: number; amount: number };
  /** Won as a share of won + lost in the last 90 days; null with nothing closed. */
  winRate: number | null;
  lossReasons: { reason: string; count: number }[];
}

export function forecast(opps: Opp[], stages: Stage[], today: string): Forecast {
  const stageOf = new Map(stages.map(s => [s.key, s]));
  const open = opps.filter(o => stageOf.get(o.stage)?.kind === 'open');
  const w = (o: Opp) => (o.amount * (stageOf.get(o.stage)?.probability ?? 0)) / 100;
  const sum = (list: Opp[], f: (o: Opp) => number) => Math.round(list.reduce((n, o) => n + f(o), 0));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86_400_000).toISOString();
  const closed = opps.filter(o => o.closedAt && o.closedAt >= since);
  const won = closed.filter(o => stageOf.get(o.stage)?.kind === 'won'), lost = closed.filter(o => stageOf.get(o.stage)?.kind === 'lost');
  const reasons = new Map<string, number>();
  for (const o of lost) reasons.set(o.lossReason ?? 'other', (reasons.get(o.lossReason ?? 'other') ?? 0) + 1);
  return {
    open: { count: open.length, amount: sum(open, o => o.amount), weighted: sum(open, w) },
    byStage: [...stages].sort((a, b) => a.sort - b.sort).map(s => {
      const list = opps.filter(o => o.stage === s.key && (s.kind === 'open' || (o.closedAt && o.closedAt >= since)));
      return { key: s.key, label: s.label, kind: s.kind, probability: s.probability, count: list.length, amount: sum(list, o => o.amount), weighted: sum(list, w) };
    }).filter(s => s.count > 0 || stageOf.get(s.key)?.active),
    byMonth: months.map((m, i) => {
      // Deals already past their date still have to close: they count in the current month.
      const list = open.filter(o => o.expectedClose && (o.expectedClose.slice(0, 7) === m || (i === 0 && o.expectedClose.slice(0, 7) < m)));
      return { month: m, count: list.length, amount: sum(list, o => o.amount), weighted: sum(list, w) };
    }),
    undated: { count: open.filter(o => !o.expectedClose).length, amount: sum(open.filter(o => !o.expectedClose), o => o.amount) },
    overdue: open.filter(o => o.expectedClose && o.expectedClose < today).length,
    won: { count: won.length, amount: sum(won, o => o.amount) },
    lost: { count: lost.length, amount: sum(lost, o => o.amount) },
    winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    lossReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** Days a deal has sat in its stage. */
export const daysInStage = (stageChangedAt: string, now: number) => Math.max(0, Math.floor((now - Date.parse(stageChangedAt)) / 86_400_000));
