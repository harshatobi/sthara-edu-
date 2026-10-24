/**
 * Discipline and counselling (brief 07), the pure parts: what an action is, who decides it, what leaves the record at
 * the next session, what a parent sees, and the steps of a child-protection case. No database here, so it is tested.
 */

export const ACTION_KINDS = ['warning', 'parent_meeting', 'detention', 'suspension'] as const;
export type ActionKind = typeof ACTION_KINDS[number];
export const ACTION_LABEL: Record<ActionKind, string> = { warning: 'Warning', parent_meeting: 'Parent meeting', detention: 'Detention', suspension: 'Suspension' };
export type ActionStatus = 'proposed' | 'approved' | 'returned' | 'cancelled';
export const STATUS_LABEL: Record<ActionStatus, string> = { proposed: 'Waiting for approval', approved: 'Approved', returned: 'Sent back', cancelled: 'Cancelled' };

/** Warnings and detentions leave the record and the parent view at the next session (kept in the archive). */
export const MINOR: ActionKind[] = ['warning', 'detention'];

/** The permission that approves an action: a suspension is the principal's alone. */
export const approverPerm = (kind: ActionKind) => (kind === 'suspension' ? 'discipline.suspend' : 'discipline.approve') as 'discipline.suspend' | 'discipline.approve';

export interface ActionInput { kind: ActionKind; on_date: string; until_date: string | null; reason: string; details: string | null }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: unknown): s is string => typeof s === 'string' && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Checks a proposed action. `today` is the school's day (YYYY-MM-DD). */
export function checkAction(b: Record<string, unknown>, today: string): { value: ActionInput } | { error: string } {
  if (!ACTION_KINDS.includes(b.kind as ActionKind)) return { error: 'Pick the action: warning, parent meeting, detention or suspension.' };
  const kind = b.kind as ActionKind;
  if (!validDay(b.onDate)) return { error: 'Give the date.' };
  const on = b.onDate;
  // A warning or detention records what happened; a meeting or suspension may be set for a coming day.
  if ((kind === 'warning') && on > today) return { error: 'A warning is recorded on or after the day it was given.' };
  const until = b.untilDate == null || b.untilDate === '' ? null : b.untilDate;
  if (until !== null && !validDay(until)) return { error: 'Give the last day as a date.' };
  if (kind === 'suspension' && !until) return { error: 'Give the last day of the suspension.' };
  if (until && until < on) return { error: 'The last day is before the first.' };
  if (until && (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${on}T00:00:00Z`)) / 86_400_000 > 60) return { error: 'A suspension longer than 60 days needs the school’s own process, not this form.' };
  const reason = typeof b.reason === 'string' ? b.reason.trim().replace(/\s+/g, ' ') : '';
  if (reason.length < 3) return { error: 'Say what it is for, in a line the parent can read.' };
  if (reason.length > 300) return { error: 'Keep the reason under 300 characters; put more in the details.' };
  const details = typeof b.details === 'string' ? b.details.trim().slice(0, 2000) || null : null;
  return { value: { kind, on_date: on, until_date: kind === 'warning' || kind === 'parent_meeting' ? null : until, reason, details } };
}

export interface ActionLite { kind: ActionKind; status: ActionStatus; session: string }

/** Archived: a warning or detention from an earlier session. Only discipline.archive sees it. */
export const archived = (a: Pick<ActionLite, 'kind' | 'session'>, currentSession: string) => MINOR.includes(a.kind) && a.session < currentSession;

/** What a parent sees: approved actions about their own child, minus the archived ones. */
export const parentSees = (a: ActionLite, currentSession: string) => a.status === 'approved' && !archived(a, currentSession);

/** The line a parent reads in the portal and the notification. */
export function parentLine(a: { kind: ActionKind; on_date: string; until_date: string | null; reason: string }, fmt: (d: string) => string): string {
  const when = a.until_date && a.until_date !== a.on_date ? `${fmt(a.on_date)} to ${fmt(a.until_date)}` : fmt(a.on_date);
  return `${ACTION_LABEL[a.kind]}, ${when}: ${a.reason}`;
}

// ── Counselling ─────────────────────────────────────────────────────────────

export type CaseStatus = 'open' | 'closed' | 'referred';
export const CASE_LABEL: Record<CaseStatus, string> = { open: 'Ongoing', closed: 'Closed', referred: 'Referred outside' };
export type ReferralStatus = 'new' | 'seen' | 'declined';
/** What a referrer is told: only that it was received and whether the counsellor has seen it. */
export const REFERRAL_LABEL: Record<ReferralStatus, string> = { new: 'Referred', seen: 'Seen by the counsellor', declined: 'Seen by the counsellor' };

export function checkReferral(b: Record<string, unknown>): { reason: string } | { error: string } {
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < 10) return { error: 'Say in a sentence or two why the student should see the counsellor.' };
  if (reason.length > 1000) return { error: 'Keep it under 1,000 characters; the counsellor will talk to you.' };
  return { reason };
}

export function checkNote(b: Record<string, unknown>, today: string): { on_date: string; notes: string } | { error: string } {
  if (!validDay(b.onDate) || b.onDate > today) return { error: 'Give the date of the session (not in the future).' };
  const notes = typeof b.notes === 'string' ? b.notes.trim() : '';
  if (notes.length < 3) return { error: 'Write the note.' };
  if (notes.length > 8000) return { error: 'Keep one note under 8,000 characters.' };
  return { on_date: b.onDate, notes };
}

// ── Child protection ────────────────────────────────────────────────────────

export const CP_STEPS = ['note', 'reported_police', 'reported_cwc', 'parent_informed', 'referred', 'closed'] as const;
export type CpStep = typeof CP_STEPS[number];
export const CP_STEP_LABEL: Record<CpStep, string> = {
  note: 'Note', reported_police: 'Reported to the police (SJPU / local police)', reported_cwc: 'Reported to the Child Welfare Committee',
  parent_informed: 'Parent or guardian informed', referred: 'Referred (counsellor, doctor, DCPU, other)', closed: 'Case closed',
};

/**
 * Where a child-protection case stands. Under POCSO s.19-21 suspected abuse must be reported to the police or the
 * Special Juvenile Police Unit; failing to report is an offence. The case says so until a report is recorded.
 */
export function cpState(steps: { kind: CpStep }[]): { reported: boolean; closed: boolean; nudge: string | null } {
  const reported = steps.some(s => s.kind === 'reported_police' || s.kind === 'reported_cwc');
  const closed = steps.some(s => s.kind === 'closed');
  return { reported, closed, nudge: reported ? null : 'No report to the police or the Child Welfare Committee is recorded. Under POCSO, suspected abuse must be reported without delay.' };
}

export function checkCpStep(b: Record<string, unknown>, today: string): { kind: CpStep; on_date: string; ref: string | null; details: string | null } | { error: string } {
  if (!CP_STEPS.includes(b.kind as CpStep)) return { error: 'Pick the step.' };
  if (!validDay(b.onDate) || b.onDate > today) return { error: 'Give the date (not in the future).' };
  const ref = typeof b.ref === 'string' ? b.ref.trim().slice(0, 80) || null : null;
  const details = typeof b.details === 'string' ? b.details.trim().slice(0, 8000) || null : null;
  if (b.kind === 'note' && !details) return { error: 'Write the note.' };
  if (b.kind === 'closed' && (!details || details.length < 10)) return { error: 'Record how the case was closed.' };
  return { kind: b.kind as CpStep, on_date: b.onDate, ref, details };
}
