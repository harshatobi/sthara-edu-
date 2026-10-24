import { gradeLabel } from '@/lib/students/register';

/**
 * Certificates out (brief 05): the kinds, the TC fields (CBSE Examination Bye-Laws Annexure-I, in its order, plus the
 * header additions Moses signed off), the wording placeholders for bonafide, character and the school's own
 * certificates, numbering, figures in words, and the RTE rule on dues. Pure: the screens, the PDF, the importer and
 * the tests share it.
 */

export type CertKind = 'tc' | 'bonafide' | 'character' | 'fee_paid' | 'custom';
export const BUILT_IN: Exclude<CertKind, 'custom'>[] = ['tc', 'bonafide', 'character', 'fee_paid'];
export const KIND_TITLE: Record<CertKind, string> = {
  tc: 'Transfer Certificate', bonafide: 'Bonafide Certificate', character: 'Character Certificate', fee_paid: 'Fee Paid Certificate', custom: 'Certificate',
};
export const DEFAULT_PREFIX: Record<Exclude<CertKind, 'custom'>, string> = { tc: 'TC', bonafide: 'BON', character: 'CC', fee_paid: 'FEE' };

export type CertStatus = 'draft' | 'pending' | 'issued' | 'cancelled';

// ── The transfer certificate ────────────────────────────────────────────────

export interface TcField { key: string; label: string; n?: number; long?: boolean }

/** Above the numbered fields: the numbers that identify the pupil (Annexure-I's header plus the signed-off additions). */
export const TC_HEADER: TcField[] = [
  { key: 'book_no', label: 'Book No.' },
  { key: 'admission_no', label: 'Admission No.' },
  { key: 'affiliation_no', label: 'Affiliation No.' },
  { key: 'udise_code', label: 'School UDISE code' },
  { key: 'pen', label: 'PEN' },
  { key: 'apaar_id', label: 'APAAR ID' },
];

/** Annexure-I, fields 1 to 22, with mother's name after field 2 (unnumbered, as CBSE schools print it). */
export const TC_FIELDS: TcField[] = [
  { key: 'pupil_name', n: 1, label: 'Name of pupil' },
  { key: 'mother_name', label: 'Mother’s name' },
  { key: 'father_name', n: 2, label: 'Father’s / Guardian’s name' },
  { key: 'nationality', n: 3, label: 'Nationality' },
  { key: 'sc_st', n: 4, label: 'Whether the candidate belongs to Scheduled Caste or Scheduled Tribe' },
  { key: 'first_admission', n: 5, label: 'Date of first admission in the school, with class' },
  { key: 'dob', n: 6, label: 'Date of birth (in Christian era) according to the admission register (in figures and in words)', long: true },
  { key: 'last_class', n: 7, label: 'Class in which the pupil last studied (in figures and in words)' },
  { key: 'last_exam', n: 8, label: 'School / Board annual examination last taken, with result' },
  { key: 'failed', n: 9, label: 'Whether failed; if so, once or twice in the same class' },
  { key: 'subjects', n: 10, label: 'Subjects studied', long: true },
  { key: 'promotion', n: 11, label: 'Whether qualified for promotion to the higher class; if so, to which class (in figures and in words)', long: true },
  { key: 'dues_paid_upto', n: 12, label: 'Month up to which the pupil has paid school dues' },
  { key: 'concession', n: 13, label: 'Any fee concession availed of; if so, the nature of such concession' },
  { key: 'working_days', n: 14, label: 'Total number of working days' },
  { key: 'days_present', n: 15, label: 'Total number of working days present' },
  { key: 'ncc', n: 16, label: 'Whether NCC cadet / Boy Scout / Girl Guide (details may be given)' },
  { key: 'activities', n: 17, label: 'Games played or extra-curricular activities in which the pupil usually took part (mention achievement level therein)', long: true },
  { key: 'conduct', n: 18, label: 'General conduct' },
  { key: 'applied_on', n: 19, label: 'Date of application for certificate' },
  { key: 'issued_on', n: 20, label: 'Date of issue of certificate' },
  { key: 'reason', n: 21, label: 'Reason for leaving the school' },
  { key: 'remarks', n: 22, label: 'Any other remarks', long: true },
];
export const TC_KEYS = [...TC_HEADER, ...TC_FIELDS].map(f => f.key);
/** Typed by the registrar when Sthara can't know them. The rest come from the record and can be corrected. */
export const TC_REQUIRED = ['pupil_name', 'father_name', 'nationality', 'dob', 'last_class', 'conduct', 'applied_on', 'reason', 'leaving_on'];

/** The leaving date isn't printed as its own field on Annexure-I, but it marks the student left when the TC is approved. */
export const TC_EXTRA: TcField[] = [{ key: 'leaving_on', label: 'Date of leaving (marks the student as left on approval)' }];

// ── Wording with placeholders ───────────────────────────────────────────────

export const PLACEHOLDERS: Record<string, string> = {
  student_name: 'The student’s full name',
  admission_no: 'Admission number',
  father_name: 'Father’s or guardian’s name',
  mother_name: 'Mother’s name',
  child_of: '"son of", "daughter of" or "ward of"',
  he_she: '"he", "she" or "they"',
  his_her: '"his", "her" or "their"',
  class: 'The current class, as "Class 7 B"',
  session: 'The academic session, as 2026-27',
  date_of_birth: 'Date of birth, DD-MM-YYYY',
  date_of_birth_words: 'Date of birth in words',
  admitted_on: 'Date of admission',
  school_name: 'The school’s name',
  today: 'The date of issue',
  purpose: 'What it is for (typed when the certificate is prepared)',
  conduct: 'Conduct (typed when prepared)',
};

export const DEFAULT_BODY: Record<'bonafide' | 'character', string> = {
  bonafide: 'This is to certify that {student_name}, {child_of} {father_name}, is a bonafide student of {school_name}, studying in {class} in the academic session {session}. '
    + '{his_her_cap} admission number is {admission_no} and {his_her} date of birth as per the school records is {date_of_birth} ({date_of_birth_words}).\n\n'
    + 'This certificate is issued on request for {purpose}.',
  character: 'This is to certify that {student_name}, {child_of} {father_name}, was a student of {school_name} (admission number {admission_no}). '
    + 'During {his_her} time in the school, {his_her} conduct and character were {conduct}.\n\nWe wish {him_her} every success.',
};
/** Capitalised and object forms are allowed too: {He_she}, {His_her}, {him_her}, {his_her_cap}. */
const EXTRA_KEYS = ['he_she_cap', 'his_her_cap', 'him_her', 'He_she', 'His_her'];

/** The placeholders a wording uses that Sthara doesn't know, so the school admin fixes them before saving. */
export function unknownPlaceholders(body: string): string[] {
  const known = new Set([...Object.keys(PLACEHOLDERS), ...EXTRA_KEYS]);
  return [...new Set([...body.matchAll(/\{([a-zA-Z_]+)\}/g)].map(m => m[1]).filter(k => !known.has(k)))];
}

export function pronouns(gender: string | null | undefined) {
  if (gender === 'male') return { child_of: 'son of', he_she: 'he', his_her: 'his', him_her: 'him' };
  if (gender === 'female') return { child_of: 'daughter of', he_she: 'she', his_her: 'her', him_her: 'her' };
  return { child_of: 'ward of', he_she: 'they', his_her: 'their', him_her: 'them' };
}

/** Fills a wording. A value Sthara doesn't have is left as a blank line to write in by hand, never invented. */
export function renderBody(body: string, v: Record<string, string | null | undefined>): string {
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const all: Record<string, string | null | undefined> = { ...v, he_she_cap: cap(v.he_she ?? ''), his_her_cap: cap(v.his_her ?? ''), He_she: cap(v.he_she ?? ''), His_her: cap(v.his_her ?? '') };
  return body.replace(/\{([a-zA-Z_]+)\}/g, (_, k: string) => {
    const x = all[k];
    return x == null || x === '' ? '__________' : x;
  });
}

// ── Numbers ─────────────────────────────────────────────────────────────────

/** A prefix the school sets: letters, digits and / - . only, up to 12. */
export function checkPrefix(p: unknown): { value: string } | { error: string } {
  const s = typeof p === 'string' ? p.trim().toUpperCase() : '';
  if (!s || s.length > 12 || !/^[A-Z0-9/.-]+$/.test(s)) return { error: 'A prefix has up to 12 letters, digits and / - .' };
  return { value: s.replace(/\/+$/, '') };
}
/** TC/0001: running forever, never reset. */
export const certNumber = (prefix: string, serial: number) => `${prefix}/${String(serial).padStart(4, '0')}`;
/** The serial an imported number carries (its last run of digits), so Sthara continues past it. */
export function serialOf(number: string): number | null {
  const m = number.match(/(\d{1,9})\D*$/);
  return m ? Number(m[1]) : null;
}

// ── Words ───────────────────────────────────────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n === 0) return 'Zero';
  const below100 = (x: number) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ''}`);
  const parts: string[] = [];
  if (n >= 1000) parts.push(`${ONES[Math.floor(n / 1000)]} Thousand`);
  const h = Math.floor((n % 1000) / 100);
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (n % 100) parts.push(below100(n % 100));
  return parts.join(' ');
}
const ORD: Record<string, string> = { One: 'First', Two: 'Second', Three: 'Third', Five: 'Fifth', Eight: 'Eighth', Nine: 'Ninth', Twelve: 'Twelfth' };
export function ordinalWords(n: number): string {
  const w = numberWords(n).split(' ');
  const last = w.pop()!;
  const o = ORD[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...w, o].join(' ');
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 2014-03-12 -> "Twelfth March Two Thousand Fourteen". */
export function dateWords(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  return `${ordinalWords(Number(m[3]))} ${MONTHS[Number(m[2]) - 1]} ${numberWords(Number(m[1]))}`;
}
/** 2014-03-12 -> 12-03-2014, as dates print on a TC. */
export const dmy = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
/** A class in figures and in words: "VII (Seventh)"; Nursery to UKG by name. */
export function classFiguresWords(grade: number | null | undefined): string {
  if (grade == null) return '';
  if (grade < 1) return gradeLabel(grade);
  return `${ROMAN[grade] ?? grade} (${ordinalWords(grade)})`;
}

// ── Dues ────────────────────────────────────────────────────────────────────

/**
 * Whether unpaid dues may stop a TC. Not for Classes 1 to 8: RTE s.5(3) says the TC is issued immediately there,
 * dues or not (they still show on the TC request). Elsewhere they block, unless the principal overrides with a reason.
 */
export const duesMayBlock = (grade: number | null | undefined) => grade == null || grade < 1 || grade > 8;

/** The financial year an Indian fee certificate covers, from its start year: 2025 -> 2025-04-01 .. 2026-03-31. */
export function financialYear(startYear: number) {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, label: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}` };
}
