/**
 * Working enquiries (admissions phase 3): the contact log's vocabulary, the follow-up queue, likely duplicates and
 * the stage messages families get on WhatsApp. Pure, so the office screens, the server and the tests share it.
 */
import { phoneKey } from './application';

export const CONTACT_KINDS = { call: 'Call', whatsapp: 'WhatsApp', visit: 'Visit', email: 'Email', sms: 'SMS', note: 'Note' } as const;
export type ContactKind = keyof typeof CONTACT_KINDS;
export const OUTCOMES = {
  reached: 'Spoke to them', no_answer: 'No answer', busy: 'Busy', wrong_number: 'Wrong number', callback: 'Asked to call back',
  interested: 'Interested', not_interested: 'Not interested',
} as const;
export type Outcome = keyof typeof OUTCOMES;

/** A contact to log, checked: a call has an outcome; a follow-up date is today or later. */
export function checkContact(raw: unknown, today: string): { value: { kind: ContactKind; direction: 'out' | 'in' | null; outcome: Outcome | null; note: string | null; follow_up_on: string | null } } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = String(o.kind ?? '');
  if (!(kind in CONTACT_KINDS)) return { error: 'Pick how you were in touch.' };
  const outcome = o.outcome ? String(o.outcome) : null;
  if (outcome && !(outcome in OUTCOMES)) return { error: 'Pick how the call went.' };
  if (kind === 'call' && !outcome) return { error: 'Say how the call went.' };
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim().slice(0, 1000) : null;
  if (kind === 'note' && !note) return { error: 'Write the note.' };
  const direction = o.direction === 'in' ? 'in' : kind === 'note' ? null : 'out';
  const f = typeof o.followUpOn === 'string' && o.followUpOn ? o.followUpOn : null;
  if (f && (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f < today)) return { error: 'The next follow-up is today or later.' };
  return { value: { kind: kind as ContactKind, direction, outcome: outcome as Outcome | null, note, follow_up_on: f } };
}

// ── The follow-up queue ─────────────────────────────────────────────────────
export interface Workable { id: string; name: string; open: boolean; ownerId: string | null; followUpOn: string | null }
export interface Queue<T> { overdue: T[]; today: T[]; upcoming: T[]; unset: T[]; unowned: T[] }

/** Open applicants by when they are next due (oldest first), and those nobody owns or has a date for. */
export function followUps<T extends Workable>(list: T[], today: string, ownerId?: string | null): Queue<T> {
  const mine = list.filter(a => a.open && (ownerId === undefined || a.ownerId === ownerId));
  const dated = mine.filter(a => a.followUpOn).sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!));
  return {
    overdue: dated.filter(a => a.followUpOn! < today),
    today: dated.filter(a => a.followUpOn === today),
    upcoming: dated.filter(a => a.followUpOn! > today),
    unset: mine.filter(a => !a.followUpOn),
    unowned: list.filter(a => a.open && !a.ownerId),
  };
}

// ── Duplicates ──────────────────────────────────────────────────────────────
/** A child's name for matching: case, spaces, dots and initials' punctuation don't count. */
export const nameKey = (n: string | null | undefined) => (n ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export interface Dupable { id: string; name: string; dob: string | null; guardianPhone: string | null; guardianEmail: string | null }
export interface DupMatch { id: string; why: string }

/**
 * Likely the same child entered twice: the same name with the same date of birth, phone or email. The same phone
 * with a different name is a sibling, not a duplicate.
 */
export function sameChild(a: Dupable, b: Dupable): string | null {
  if (a.id === b.id || !nameKey(a.name) || nameKey(a.name) !== nameKey(b.name)) return null;
  if (a.dob && a.dob === b.dob) return 'same name and date of birth';
  const pa = phoneKey(a.guardianPhone), pb = phoneKey(b.guardianPhone);
  if (pa && pa === pb) return 'same name and phone';
  if (a.guardianEmail && b.guardianEmail && a.guardianEmail.toLowerCase() === b.guardianEmail.toLowerCase()) return 'same name and email';
  return null;
}

export function duplicatesOf<T extends Dupable>(x: Dupable, list: T[]): DupMatch[] {
  return list.flatMap(y => { const why = sameChild(x, y); return why ? [{ id: y.id, why }] : []; });
}

/** Every applicant with a likely duplicate, for the list. */
export function duplicateMap<T extends Dupable>(list: T[]): Map<string, DupMatch[]> {
  const out = new Map<string, DupMatch[]>();
  const byName = new Map<string, T[]>();
  for (const a of list) { const k = nameKey(a.name); if (k) byName.set(k, [...(byName.get(k) || []), a]); }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const a of group) { const m = duplicatesOf(a, group); if (m.length) out.set(a.id, m); }
  }
  return out;
}

// ── Stage messages ──────────────────────────────────────────────────────────
export const MESSAGE_MAX = 600;
export const OPT_OUT_LINE = 'Reply STOP to stop messages about this application.';

/** A stage message as the family reads it ({child}, {school} and {stage} filled in), with how to stop them. */
export function renderMessage(template: string, v: { child: string; school: string; stage: string }) {
  return `${template.replaceAll('{child}', v.child).replaceAll('{school}', v.school).replaceAll('{stage}', v.stage)}\n\n${OPT_OUT_LINE}`;
}

/** Starting points the office can use or rewrite. */
export const MESSAGE_SUGGESTIONS: Record<string, string> = {
  enquiry: 'Thank you for your interest in {school}. We have noted your enquiry for {child}, and our admissions office will call you soon.',
  application: 'We have received the application for {child} at {school}. We will be in touch about the next step.',
  assessment: '{child} is invited for the admission assessment at {school}. The admissions office will confirm the date and time.',
  offer: 'Good news: {school} is offering {child} a place. Please contact the admissions office to accept it before the reply-by date.',
  enrolled: 'Welcome to {school}! {child} is now enrolled. We will share joining details shortly.',
};

/** STOP and START from a family about their application (same words as the parent channel). */
export function optCommand(text: string): 'stop' | 'start' | null {
  const c = text.toUpperCase().replace(/[^A-Z]/g, '');
  return ['STOP', 'UNSUBSCRIBE', 'STOPALL'].includes(c) ? 'stop' : c === 'START' ? 'start' : null;
}
