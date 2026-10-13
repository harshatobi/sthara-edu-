/**
 * The service desk's rules: priorities, statuses, the clock on each case, the queues operators work from,
 * and what a reply from either side does to a case. Shared by the Platform Manager, the school's support page
 * and their APIs. Pure, so it is unit-tested.
 */

export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export type Priority = typeof PRIORITIES[number];
export const isPriority = (v: unknown): v is Priority => typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v);
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };

/** How a school says how bad it is, and the priority that gives the case. */
export const URGENCIES: { key: Priority; label: string }[] = [
  { key: 'urgent', label: 'The school cannot work' },
  { key: 'high', label: 'Some people are blocked' },
  { key: 'normal', label: 'It can wait a day or two' },
  { key: 'low', label: 'A question or suggestion' },
];

export const STATUSES = ['new', 'open', 'waiting_school', 'resolved', 'closed'] as const;
export type CaseStatus = typeof STATUSES[number];
export const isCaseStatus = (v: unknown): v is CaseStatus => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
export const STATUS_LABEL: Record<CaseStatus, string> = { new: 'New', open: 'In progress', waiting_school: 'Waiting on school', resolved: 'Resolved', closed: 'Closed' };
/** The same status as the school reads it. */
export const STATUS_FOR_SCHOOL: Record<CaseStatus, string> = { new: 'Received', open: 'Sthara is working on it', waiting_school: 'Waiting for your reply', resolved: 'Resolved', closed: 'Closed' };
export const isLive = (s: CaseStatus) => s !== 'resolved' && s !== 'closed';

export const SOURCES = { school_portal: 'School, in the app', operator: 'Logged by Sthara', phone: 'Phone', email: 'Email', whatsapp: 'WhatsApp' } as const;
export type CaseSource = keyof typeof SOURCES;
export const isCaseSource = (v: unknown): v is CaseSource => typeof v === 'string' && Object.hasOwn(SOURCES, v);

export const caseRef = (n: number | string) => `CASE-${n}`;

export interface SlaPolicy { priority: Priority; firstResponseMinutes: number; resolveMinutes: number }
/** Used when the stored policies cannot be read: the defaults the database is seeded with. */
export const DEFAULT_SLA: SlaPolicy[] = [
  { priority: 'urgent', firstResponseMinutes: 30, resolveMinutes: 240 },
  { priority: 'high', firstResponseMinutes: 120, resolveMinutes: 1440 },
  { priority: 'normal', firstResponseMinutes: 480, resolveMinutes: 4320 },
  { priority: 'low', firstResponseMinutes: 1440, resolveMinutes: 10080 },
];

/** When a case of this priority, counted from `from`, must have a first reply and be resolved. Calendar time. */
export function slaDue(policies: SlaPolicy[], priority: Priority, from: number): { firstResponseDue: string; resolveDue: string } {
  const p = policies.find(x => x.priority === priority) ?? DEFAULT_SLA.find(x => x.priority === priority)!;
  return { firstResponseDue: new Date(from + p.firstResponseMinutes * 60_000).toISOString(), resolveDue: new Date(from + p.resolveMinutes * 60_000).toISOString() };
}

export interface Clocked {
  status: CaseStatus; createdAt: string; firstResponseDue: string; resolveDue: string;
  firstRespondedAt: string | null; resolvedAt: string | null;
}
export type SlaLevel = 'met' | 'ok' | 'soon' | 'breached' | 'paused';
export interface SlaState {
  /** The clock that matters now: first response until someone has replied, then resolution. */
  stage: 'first_response' | 'resolution' | 'done';
  level: SlaLevel;
  /** Minutes until the deadline (negative once past it); null when nothing is running. */
  minutesLeft: number | null;
  /** Whether either deadline was missed at any point in the case's life. */
  everBreached: boolean;
}

/** "Soon" is the last fifth of the time allowed, or the last hour, whichever comes first. */
const soonAt = (from: number, due: number) => Math.max(due - 60 * 60_000, due - (due - from) / 5);

export function slaState(c: Clocked, now: number): SlaState {
  const created = Date.parse(c.createdAt), firstDue = Date.parse(c.firstResponseDue), resolveDue = Date.parse(c.resolveDue);
  const firstLate = (c.firstRespondedAt ? Date.parse(c.firstRespondedAt) : Math.min(now, c.resolvedAt ? Date.parse(c.resolvedAt) : now)) > firstDue;
  const resolveLate = (c.resolvedAt ? Date.parse(c.resolvedAt) : now) > resolveDue;
  const everBreached = firstLate || resolveLate;
  if (!isLive(c.status)) return { stage: 'done', level: everBreached ? 'breached' : 'met', minutesLeft: null, everBreached };
  const stage = c.firstRespondedAt ? 'resolution' : 'first_response';
  const due = stage === 'first_response' ? firstDue : resolveDue;
  const minutesLeft = Math.round((due - now) / 60_000);
  // While Sthara waits on the school the resolution clock is shown as paused (it still counts against the deadline).
  if (stage === 'resolution' && c.status === 'waiting_school' && now <= due) return { stage, level: 'paused', minutesLeft, everBreached };
  return { stage, level: now > due ? 'breached' : now >= soonAt(created, due) ? 'soon' : 'ok', minutesLeft, everBreached };
}

/** "in 25 min", "in 3 h", "in 2 days", "40 min late". */
export function dueText(minutesLeft: number): string {
  const m = Math.abs(minutesLeft);
  const span = m < 90 ? `${m} min` : m < 36 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
  return minutesLeft < 0 ? `${span} late` : `in ${span}`;
}

export const QUEUES = ['mine', 'unassigned', 'open', 'breaching', 'waiting', 'resolved', 'all'] as const;
export type Queue = typeof QUEUES[number];
export const isQueue = (v: unknown): v is Queue => typeof v === 'string' && (QUEUES as readonly string[]).includes(v);
export const QUEUE_LABEL: Record<Queue, string> = {
  mine: 'Mine', unassigned: 'Unassigned', open: 'All open', breaching: 'Late or nearly', waiting: 'Waiting on school', resolved: 'Resolved', all: 'All',
};

export function inQueue(c: Clocked & { ownerId: string | null }, q: Queue, me: string, now: number): boolean {
  const live = isLive(c.status);
  switch (q) {
    case 'mine': return live && c.ownerId === me;
    case 'unassigned': return live && !c.ownerId;
    case 'open': return live;
    case 'breaching': { const l = slaState(c, now).level; return live && (l === 'breached' || l === 'soon'); }
    case 'waiting': return c.status === 'waiting_school';
    case 'resolved': return !live;
    case 'all': return true;
  }
}

/** Most pressing first: late before nearly late before the rest, then by deadline; finished cases newest first. */
export function byUrgency<T extends Clocked>(now: number) {
  const rank: Record<SlaLevel, number> = { breached: 0, soon: 1, ok: 2, paused: 3, met: 4 };
  return (a: T, b: T) => {
    const x = slaState(a, now), y = slaState(b, now);
    if (x.stage === 'done' || y.stage === 'done') return x.stage === y.stage ? b.createdAt.localeCompare(a.createdAt) : x.stage === 'done' ? 1 : -1;
    return rank[x.level] - rank[y.level] || (x.minutesLeft ?? 0) - (y.minutesLeft ?? 0);
  };
}

export type ReplyThen = 'none' | 'wait' | 'resolve';

/**
 * What an operator's message does to a case. A reply the school can see answers the first-response clock;
 * an internal note changes nothing but takes a new case into progress.
 */
export function afterOperatorMessage(c: { status: CaseStatus; firstRespondedAt: string | null }, internal: boolean, then: ReplyThen, at: string) {
  const patch: { status?: CaseStatus; firstRespondedAt?: string; resolvedAt?: string | null } = {};
  if (!internal && !c.firstRespondedAt) patch.firstRespondedAt = at;
  if (c.status === 'closed') return patch;
  if (!internal && then === 'resolve') { patch.status = 'resolved'; patch.resolvedAt = at; }
  else if (!internal && then === 'wait') { patch.status = 'waiting_school'; patch.resolvedAt = null; }
  else if (c.status === 'new') patch.status = 'open';
  return patch;
}

/** What a school's reply does: it comes back to Sthara, and reopens a resolved case. A closed case takes no more replies. */
export function afterSchoolMessage(c: { status: CaseStatus; reopened: number }): { ok: true; status: CaseStatus; reopened: number; resolvedAt?: null } | { ok: false; error: string } {
  if (c.status === 'closed') return { ok: false, error: 'This case is closed. Raise a new one and mention this number.' };
  if (c.status === 'resolved') return { ok: true, status: 'open', reopened: c.reopened + 1, resolvedAt: null };
  return { ok: true, status: c.status === 'waiting_school' ? 'open' : c.status, reopened: c.reopened };
}

// ── Account 360 ──────────────────────────────────────────────────────────────

export const ACTIVITY_KINDS = { call: 'Call', meeting: 'Meeting', email: 'Email', whatsapp: 'WhatsApp', visit: 'School visit', note: 'Note' } as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;
export const isActivityKind = (v: unknown): v is ActivityKind => typeof v === 'string' && Object.hasOwn(ACTIVITY_KINDS, v);

export const DOC_KINDS = { contract: 'Contract', mou: 'MoU', purchase_order: 'Purchase order', proposal: 'Proposal', invoice: 'Invoice', other: 'Other' } as const;
export type DocKind = keyof typeof DOC_KINDS;
export const isDocKind = (v: unknown): v is DocKind => typeof v === 'string' && Object.hasOwn(DOC_KINDS, v);

export const TASK_PRIORITIES = ['high', 'normal', 'low'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

/** Where an open task stands against today (YYYY-MM-DD, India time). */
export function taskDue(dueOn: string | null, today: string): 'overdue' | 'today' | 'upcoming' | 'no_date' {
  return !dueOn ? 'no_date' : dueOn < today ? 'overdue' : dueOn === today ? 'today' : 'upcoming';
}

/** Days until a document expires (negative once expired), or null when it has no expiry. */
export function expiresIn(expiresOn: string | null, today: string): number | null {
  return expiresOn ? Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
}
