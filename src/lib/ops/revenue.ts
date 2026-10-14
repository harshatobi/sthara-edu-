/**
 * Partners, commissions and marketing spend: what is owed to whom when a deal is won, and what a lead or a school
 * cost to win. Shared by the Platform Manager and its API. Pure, so it is unit-tested.
 */

export const PARTNER_KINDS = { dealer: 'Dealer', referral: 'Referral partner', reseller: 'Reseller', consultant: 'Consultant', other: 'Other' } as const;
export type PartnerKind = keyof typeof PARTNER_KINDS;
export const isPartnerKind = (v: unknown): v is PartnerKind => typeof v === 'string' && Object.hasOwn(PARTNER_KINDS, v);

export const SOURCES = {
  website: 'Website', partner: 'Partner', referral: 'Referral', outbound: 'Outbound', event: 'Event', inbound_call: 'Inbound call', existing: 'Existing school', other: 'Other',
} as const;
export type Source = keyof typeof SOURCES;
export const isSource = (v: unknown): v is Source => typeof v === 'string' && Object.hasOwn(SOURCES, v);

export const CHANNELS = {
  search_ads: 'Search ads', social_ads: 'Social ads', event: 'Event', print: 'Print', outbound: 'Outbound', referral_programme: 'Referral programme',
  content: 'Content', partner: 'Partner', other: 'Other',
} as const;
export type Channel = keyof typeof CHANNELS;
export const isChannel = (v: unknown): v is Channel => typeof v === 'string' && Object.hasOwn(CHANNELS, v);

export const SPEND_CATEGORIES = { ads: 'Ads', event: 'Event', travel: 'Travel', print: 'Print', gifts: 'Gifts', agency: 'Agency', pilot_kit: 'Pilot kit', other: 'Other' } as const;
export type SpendCategory = keyof typeof SPEND_CATEGORIES;
export const isSpendCategory = (v: unknown): v is SpendCategory => typeof v === 'string' && Object.hasOwn(SPEND_CATEGORIES, v);

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Commissions ──────────────────────────────────────────────────────────────

export const COMMISSION_STATUS = { accrued: 'Accrued', approved: 'Approved', paid: 'Paid', cancelled: 'Cancelled' } as const;
export type CommissionStatus = keyof typeof COMMISSION_STATUS;
export const RULES = { deal_owner: 'The deal’s owner', owner_manager: 'The owner’s manager' } as const;
export type RuleKey = keyof typeof RULES;

export interface CommissionLine {
  payeeKind: 'partner' | 'operator'; partnerId: string | null; operatorId: string | null; payeeName: string; reason: string;
  basis: number; ratePct: number; amount: number;
}

/**
 * What a won deal owes: the partner who brought it (at the partner's own rate), then Sthara's own people by the
 * rules that are switched on. The basis is the deal's annual value. Nothing is owed on a zero rate or a zero deal.
 */
export function commissionLines(deal: {
  amount: number;
  partner: { id: string; name: string; pct: number } | null;
  owner: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
}, rules: Partial<Record<RuleKey, { ratePct: number; active: boolean }>>): CommissionLine[] {
  const out: CommissionLine[] = [];
  const line = (rate: number) => round2((deal.amount * rate) / 100);
  if (!(deal.amount > 0)) return out;
  if (deal.partner && deal.partner.pct > 0) {
    out.push({ payeeKind: 'partner', partnerId: deal.partner.id, operatorId: null, payeeName: deal.partner.name, reason: 'Partner commission', basis: deal.amount, ratePct: deal.partner.pct, amount: line(deal.partner.pct) });
  }
  const own = rules.deal_owner, mgr = rules.owner_manager;
  if (deal.owner && own?.active && own.ratePct > 0) {
    out.push({ payeeKind: 'operator', partnerId: null, operatorId: deal.owner.id, payeeName: deal.owner.name, reason: 'Sales commission', basis: deal.amount, ratePct: own.ratePct, amount: line(own.ratePct) });
  }
  if (deal.manager && mgr?.active && mgr.ratePct > 0 && deal.manager.id !== deal.owner?.id) {
    out.push({ payeeKind: 'operator', partnerId: null, operatorId: deal.manager.id, payeeName: deal.manager.name, reason: 'Manager override', basis: deal.amount, ratePct: mgr.ratePct, amount: line(mgr.ratePct) });
  }
  return out;
}

/** The moves a commission can make from where it is. A paid one is final. */
export function commissionMoves(status: CommissionStatus): ('approve' | 'pay' | 'cancel' | 'reopen')[] {
  switch (status) {
    case 'accrued': return ['approve', 'cancel'];
    case 'approved': return ['pay', 'cancel'];
    case 'cancelled': return ['reopen'];
    case 'paid': return [];
  }
}

export interface CommissionTotals { accrued: number; approved: number; paid: number; owed: number }
export function commissionTotals(rows: { status: CommissionStatus; amount: number }[]): CommissionTotals {
  const sum = (s: CommissionStatus) => round2(rows.filter(r => r.status === s).reduce((n, r) => n + r.amount, 0));
  const accrued = sum('accrued'), approved = sum('approved');
  return { accrued, approved, paid: sum('paid'), owed: round2(accrued + approved) };
}

// ── Marketing ────────────────────────────────────────────────────────────────

/** A campaign code as stored and as matched against a visitor's utm_campaign: lower case, dashes for anything odd. */
export function campaignCode(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) : '';
}

/** The UTM tags worth keeping from a landing URL's query, tidied; null when there are none. */
export function utmFrom(q: Record<string, unknown>): { source?: string; medium?: string; campaign?: string } | null {
  const pick = (k: string) => (typeof q[k] === 'string' ? (q[k] as string).trim().slice(0, 80) : '');
  const out = { source: pick('utm_source'), medium: pick('utm_medium'), campaign: pick('utm_campaign') };
  const kept = Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  return Object.keys(kept).length ? kept : null;
}

export interface CampaignStats {
  spend: number; leads: number; deals: number; won: number; wonValue: number;
  /** Spend per lead, per won school, and won annual value per rupee spent; null when the divisor is zero. */
  costPerLead: number | null; costPerWin: number | null; returnMultiple: number | null;
  /** Spend as a share of budget; null with no budget. */
  budgetUsedPct: number | null;
}

/**
 * A campaign's numbers. A lead is an enquiry attributed to it, or a deal attributed to it that did not come from one
 * of those enquiries (so a lead that became a deal is counted once).
 */
export function campaignStats(c: { id: string; budget: number | null },
  spend: { campaignId: string | null; amount: number }[],
  enquiries: { id: string; campaignId: string | null }[],
  deals: { campaignId: string | null; enquiryId: string | null; amount: number; outcome: 'open' | 'won' | 'lost' }[]): CampaignStats {
  const total = round2(spend.filter(s => s.campaignId === c.id).reduce((n, s) => n + s.amount, 0));
  const enq = new Set(enquiries.filter(e => e.campaignId === c.id).map(e => e.id));
  const mine = deals.filter(d => d.campaignId === c.id || (d.enquiryId && enq.has(d.enquiryId)));
  const leads = enq.size + mine.filter(d => !d.enquiryId || !enq.has(d.enquiryId)).length;
  const won = mine.filter(d => d.outcome === 'won');
  const wonValue = round2(won.reduce((n, d) => n + d.amount, 0));
  return {
    spend: total, leads, deals: mine.length, won: won.length, wonValue,
    costPerLead: leads ? round2(total / leads) : null, costPerWin: won.length ? round2(total / won.length) : null,
    returnMultiple: total > 0 ? Math.round((wonValue / total) * 10) / 10 : null,
    budgetUsedPct: c.budget && c.budget > 0 ? Math.round((total / c.budget) * 100) : null,
  };
}

/** What one lead or school cost to win: what was spent on it directly, plus its even share of its campaign's spend. */
export function acquisitionCost(direct: number, campaignSpend: number, campaignLeads: number): { direct: number; share: number; total: number } {
  const share = campaignLeads > 0 ? round2(campaignSpend / campaignLeads) : 0;
  return { direct: round2(direct), share, total: round2(direct + share) };
}
