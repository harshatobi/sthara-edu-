/**
 * Families applying themselves (admissions phase 2b): the access codes the office gives a family, what the family is
 * shown about where their application stands, and the school's switch for online applications. Pure, so the apply
 * page, the parent portal, the office screens and the tests share it.
 */

// ── Access codes ────────────────────────────────────────────────────────────
/** Crockford base 32: no I, L, O or U, so a code read aloud or copied by hand survives. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;
export const CODE_DAYS = 30;

/** A new code from random bytes (one per character), shown as XXXX-XXXX. */
export function accessCodeFrom(bytes: Uint8Array): string {
  if (bytes.length < CODE_LENGTH) throw new Error('Not enough random bytes for an access code.');
  const raw = Array.from(bytes.subarray(0, CODE_LENGTH), b => CODE_ALPHABET[b % 32]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** What a family typed, as the code it stands for (O read as 0, I and L as 1), or null when it can't be one. */
export function normaliseAccessCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== CODE_LENGTH || [...s].some(c => !CODE_ALPHABET.includes(c))) return null;
  return s;
}

export const codeHint = (normalised: string) => normalised.slice(-2);

// ── The school's switch ─────────────────────────────────────────────────────
/** open: families can apply; enquiries: anyone can ask about admission without signing in (the form and QR poster). */
export interface OnlineSettings { open: boolean; enquiries: boolean; note: string | null }

/** settings.admissions.online: closed unless the school opened it. */
export function onlineOf(settings: unknown): OnlineSettings {
  const raw = (settings as { admissions?: { online?: Record<string, unknown> } } | null)?.admissions?.online;
  const note = typeof raw?.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;
  return { open: raw?.open === true, enquiries: raw?.enquiries === true, note };
}

/** The apply page for a school code (codes are matched in upper case, written in lower case in links). */
export const applyPath = (schoolCode: string) => `/apply/${encodeURIComponent(schoolCode.toLowerCase())}`;

/** At most this many open applications from one verified phone in one admission year. */
export const MAX_PER_PHONE = 5;

// ── Where an application stands, for the family ─────────────────────────────
export type FamilyTone = 'b' | 'a' | 'g' | 'r' | 'p';
export interface FamilyStatus { key: 'draft' | 'review' | 'offer' | 'admitted' | 'closed'; label: string; detail: string; tone: FamilyTone }

/**
 * The family sees a few plain states, not the office's working stages: a draft until they send it, with the school
 * while it is worked (the stage named, since schools call them things like "Interview"), an offer, admitted, closed.
 */
export function familyStatus(a: { stage: string; submitted_at: string | null; channel: string; student_id: string | null },
  stage: { label: string; system: string | null } | null): FamilyStatus {
  if (a.stage === 'withdrawn') return { key: 'closed', label: 'Withdrawn', detail: 'This application was withdrawn.', tone: 'a' };
  if (a.stage === 'rejected') return { key: 'closed', label: 'Closed', detail: 'The school has closed this application. Contact the admissions office with any questions.', tone: 'r' };
  if (a.student_id || stage?.system === 'enrolled') return { key: 'admitted', label: 'Admitted', detail: 'Admitted to the school. The office will be in touch about joining.', tone: 'g' };
  if (stage?.system === 'offer') return { key: 'offer', label: 'Offer', detail: 'The school has offered a place. The admissions office will contact you about accepting it.', tone: 'p' };
  if (!a.submitted_at && a.channel !== 'office') return { key: 'draft', label: 'Draft', detail: 'Not sent yet. Fill in the details, add the documents, then send it to the school.', tone: 'a' };
  return { key: 'review', label: 'With the school', detail: stage ? `At ${stage.label}. The admissions office will contact you about the next step.` : 'The admissions office is reviewing it.', tone: 'b' };
}

/**
 * Whether the family may still change the details: until they send it, and never once the applicant is at Offer or
 * beyond (an office applicant the family reaches with an access code may be). Documents can be sent until admission.
 */
export const familyCanEdit = (a: { submitted_at: string | null; stage: string; student_id: string | null }, stageSystem: string | null = null) =>
  !a.submitted_at && !a.student_id && !stageSystem && a.stage !== 'rejected' && a.stage !== 'withdrawn';

/** Documents can be sent while the application is open and the student is not yet on the register. */
export const familyCanSend = (a: { stage: string; student_id: string | null }) => !a.student_id && a.stage !== 'rejected' && a.stage !== 'withdrawn';
