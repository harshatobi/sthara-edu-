/**
 * Reporting windows for the Usage page, in Indian Standard Time days
 * (UTC+5:30, no daylight saving). `to` is exclusive.
 */

const IST_MS = 330 * 60_000;
const DAY = 86_400_000;
const MAX_DAYS = 366;

export const RANGES = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'This month',
  lastmonth: 'Last month',
} as const;
export type RangeKey = keyof typeof RANGES;

export interface UsageWindow { from: Date; to: Date; label: string; days: number; key: RangeKey | 'custom' }

/** Midnight IST of the IST calendar day containing `d`, as a UTC instant. */
function istMidnight(d: Date) {
  const shifted = new Date(d.getTime() + IST_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_MS;
}
/** IST y/m (0-based month) of `d`. */
function istYm(d: Date) {
  const s = new Date(d.getTime() + IST_MS);
  return [s.getUTCFullYear(), s.getUTCMonth()] as const;
}
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d ? t - IST_MS : null;
};

export function usageWindow(q: { range?: string | null; from?: string | null; to?: string | null }, now = new Date()): UsageWindow | { error: string } {
  const today = istMidnight(now);
  if (q.from || q.to) {
    if (!q.from || !q.to || !ymd.test(q.from) || !ymd.test(q.to)) return { error: 'Give both dates as YYYY-MM-DD.' };
    const f = fromYmd(q.from), t = fromYmd(q.to);
    if (f === null || t === null) return { error: 'That isn’t a real date.' };
    if (t < f) return { error: 'The end date is before the start date.' };
    const days = Math.round((t - f) / DAY) + 1;
    if (days > MAX_DAYS) return { error: `Pick a window of at most ${MAX_DAYS} days.` };
    return { from: new Date(f), to: new Date(t + DAY), label: `${q.from} to ${q.to}`, days, key: 'custom' };
  }
  const key = (q.range && q.range in RANGES ? q.range : '30d') as RangeKey;
  const end = today + DAY;
  const [y, m] = istYm(now);
  switch (key) {
    case 'today': return { from: new Date(today), to: new Date(end), label: RANGES[key], days: 1, key };
    case '7d': return { from: new Date(end - 7 * DAY), to: new Date(end), label: RANGES[key], days: 7, key };
    case '90d': return { from: new Date(end - 90 * DAY), to: new Date(end), label: RANGES[key], days: 90, key };
    case 'mtd': {
      const f = Date.UTC(y, m, 1) - IST_MS;
      return { from: new Date(f), to: new Date(end), label: RANGES[key], days: Math.round((end - f) / DAY), key };
    }
    case 'lastmonth': {
      const f = Date.UTC(y, m - 1, 1) - IST_MS, t = Date.UTC(y, m, 1) - IST_MS;
      return { from: new Date(f), to: new Date(t), label: RANGES[key], days: Math.round((t - f) / DAY), key };
    }
    default: return { from: new Date(end - 30 * DAY), to: new Date(end), label: RANGES['30d'], days: 30, key: '30d' };
  }
}

/** Days in the IST month containing `d` (for month-end projections). */
export function daysInIstMonth(d = new Date()) {
  const [y, m] = istYm(d);
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
