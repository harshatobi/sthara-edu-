import { checkCare, checkUdise } from './health';

/**
 * The student register: its fields (from the UDISE+ 2025-26 DCF section 4, APAAR and CBSE registration), how each
 * is checked, grade and outcome labels, and the school session. Pure, so the admin forms, the importer and the
 * tests all use the same rules. Aadhaar is checked in ./pii (it is encrypted, never stored as typed).
 */

export type FieldKind = 'text' | 'date' | 'enum' | 'bool' | 'grade' | 'amount' | 'digits';
export interface Field {
  key: string; label: string; kind: FieldKind; group: Group; max?: number; len?: number;
  values?: readonly string[]; labels?: Record<string, string>; hint?: string; required?: boolean;
}
export type Group = 'identity' | 'ids' | 'admission' | 'previous' | 'other' | 'background';
export const GROUPS: { key: Group; label: string }[] = [
  { key: 'identity', label: 'The student' }, { key: 'ids', label: 'Government and board IDs' },
  { key: 'admission', label: 'Admission' }, { key: 'previous', label: 'Before this school' }, { key: 'other', label: 'RTE and other' },
  { key: 'background', label: 'Background (UDISE+ and scholarships)' },
];

export const GENDERS = ['male', 'female', 'transgender'] as const;
export const PREVIOUS_STATUS = ['same_school', 'other_school', 'anganwadi_ecce', 'not_studying'] as const;
export const CATEGORIES = ['general', 'sc', 'st', 'obc'] as const;
export const RELIGIONS = ['hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'parsi', 'jain', 'other'] as const;

export const FIELDS: Field[] = [
  { key: 'full_name', label: 'Full name', kind: 'text', group: 'identity', max: 120, required: true },
  { key: 'aadhaar_name', label: 'Name as on Aadhaar', kind: 'text', group: 'identity', max: 120, hint: 'APAAR needs it to match the Aadhaar card exactly.' },
  { key: 'gender', label: 'Gender', kind: 'enum', group: 'identity', values: GENDERS, labels: { male: 'Male', female: 'Female', transgender: 'Transgender' } },
  { key: 'date_of_birth', label: 'Date of birth', kind: 'date', group: 'identity' },
  { key: 'indian_national', label: 'Indian national', kind: 'bool', group: 'identity' },
  { key: 'pen', label: 'PEN (UDISE+ student code)', kind: 'digits', len: 11, group: 'ids' },
  { key: 'apaar_id', label: 'APAAR ID', kind: 'digits', len: 12, group: 'ids' },
  { key: 'cbse_reg_no', label: 'CBSE registration number', kind: 'text', max: 20, group: 'ids', hint: 'Given at registration in Class 9 or 11.' },
  { key: 'board_roll_no', label: 'Board exam roll number', kind: 'text', max: 20, group: 'ids', hint: 'Class 10 or 12.' },
  { key: 'admitted_on', label: 'Date of admission', kind: 'date', group: 'admission' },
  { key: 'admitted_grade', label: 'Class admitted to', kind: 'grade', group: 'admission' },
  { key: 'medium', label: 'Medium of instruction', kind: 'text', max: 40, group: 'admission' },
  { key: 'previous_status', label: 'Status in the previous year', kind: 'enum', group: 'previous', values: PREVIOUS_STATUS,
    labels: { same_school: 'In this school', other_school: 'In another school', anganwadi_ecce: 'Anganwadi / ECCE centre', not_studying: 'Not studying' } },
  { key: 'previous_school', label: 'Previous school', kind: 'text', max: 200, group: 'previous' },
  { key: 'previous_class', label: 'Class in the previous school', kind: 'text', max: 40, group: 'previous' },
  { key: 'previous_tc_no', label: 'Transfer certificate number', kind: 'text', max: 40, group: 'previous' },
  { key: 'rte_seat', label: 'Admitted under RTE 12(1)(c)', kind: 'bool', group: 'other' },
  { key: 'rte_amount', label: 'RTE reimbursement claimed (₹)', kind: 'amount', group: 'other' },
  { key: 'mother_tongue', label: 'Mother tongue', kind: 'text', max: 40, group: 'background' },
  { key: 'social_category', label: 'Social category', kind: 'enum', group: 'background', values: CATEGORIES,
    labels: { general: 'General', sc: 'SC', st: 'ST', obc: 'OBC' } },
  { key: 'religion', label: 'Religion', kind: 'enum', group: 'background', values: RELIGIONS,
    labels: { hindu: 'Hindu', muslim: 'Muslim', christian: 'Christian', sikh: 'Sikh', buddhist: 'Buddhist', parsi: 'Parsi', jain: 'Jain', other: 'Other' } },
  { key: 'minority', label: 'Minority community', kind: 'bool', group: 'background' },
  { key: 'bpl', label: 'BPL card', kind: 'bool', group: 'background' },
  { key: 'aay', label: 'Antyodaya (AAY) card', kind: 'bool', group: 'background' },
  { key: 'ews', label: 'EWS / disadvantaged group', kind: 'bool', group: 'background' },
  { key: 'family_income', label: 'Family income a year (₹)', kind: 'amount', group: 'background' },
  { key: 'distance_km', label: 'Distance from school (km)', kind: 'amount', group: 'background' },
];
export const FIELD = new Map(FIELDS.map(f => [f.key, f]));

/** Grades the register knows: -2 Nursery, -1 LKG, 0 UKG, then Class 1 to 12. */
export const GRADES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export function gradeLabel(g: number | null | undefined): string {
  if (g == null) return '';
  return g === -2 ? 'Nursery' : g === -1 ? 'LKG' : g === 0 ? 'UKG' : `Class ${g}`;
}
/** "LKG", "Class 3", "III", "3", "12" -> grade; null when not a grade. */
export function parseGrade(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/^(class|grade|std\.?|standard)\s*/, '');
  if (/^(nursery|pre-?kg|pp-?1|playgroup)$/.test(t)) return -2;
  if (/^(lkg|pp-?2)$/.test(t)) return -1;
  if (/^(ukg|pp-?3)$/.test(t)) return 0;
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  if (t in roman) return roman[t];
  return /^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= 12 ? Number(t) : null;
}
/** "Class 10-A" -> A; "10 B" -> B; null without a section. */
export function sectionOf(cls: string | null | undefined): string | null {
  const m = (cls || '').match(/\d\s*[-\s/]?\s*([A-Za-z]{1,3})\s*$/);
  return m ? m[1].toUpperCase() : null;
}

export const OUTCOMES = ['promoted', 'detained', 'promoted_no_exam', 'repeater', 'dropout', 'left'] as const;
export type Outcome = typeof OUTCOMES[number];
export const OUTCOME_LABEL: Record<Outcome, string> = {
  promoted: 'Promoted', detained: 'Detained', promoted_no_exam: 'Promoted without exam', repeater: 'Repeating by choice',
  dropout: 'Dropped out', left: 'Left (TC)',
};
/** The UDISE+ year-end result each outcome is reported as. */
export const OUTCOME_UDISE: Record<Outcome, string> = {
  promoted: 'Promoted', detained: 'Detained', promoted_no_exam: 'Promoted without examination', repeater: 'Repeater by choice',
  dropout: 'Dropout', left: 'Left school (TC issued)',
};
export const parseOutcome = (raw: string): Outcome | null => {
  const t = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, Outcome> = {
    promoted: 'promoted', pass: 'promoted', passed: 'promoted', detained: 'detained', fail: 'detained', failed: 'detained',
    promotedwithoutexam: 'promoted_no_exam', promotednoexam: 'promoted_no_exam', repeater: 'repeater', repeaterbychoice: 'repeater',
    repeatingbychoice: 'repeater', dropout: 'dropout', droppedout: 'dropout', left: 'left', tc: 'left', lefttc: 'left', transferred: 'left',
  };
  return map[t] ?? null;
};

export const ROLL_RULES = ['alphabetical', 'admission', 'manual'] as const;
export type RollRule = typeof ROLL_RULES[number];
export const ROLL_RULE_LABEL: Record<RollRule, string> = {
  alphabetical: 'Alphabetical by name', admission: 'By admission number', manual: 'Set by hand',
};

// ── Checking values ─────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** One field from a form or a file. Blank is null (clears an optional field); a wrong value is an error. */
export function checkField(f: Field, raw: unknown): { value: string | number | boolean | null } | { error: string } {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return f.required ? { error: `${f.label} is required.` } : { value: null };
  }
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : raw;
  switch (f.kind) {
    case 'text': {
      if (typeof s !== 'string') return { error: `${f.label} must be text.` };
      return s.length > (f.max ?? 200) ? { error: `${f.label} is longer than ${f.max} characters.` } : { value: s };
    }
    case 'date': {
      if (typeof s !== 'string' || !validDay(s)) return { error: `${f.label} must be a date.` };
      if (s < '1980-01-01' || s > '2100-01-01') return { error: `${f.label} is out of range.` };
      return { value: s };
    }
    case 'enum': {
      const v = String(s).toLowerCase().replace(/[\s/-]+/g, '_');
      const hit = f.values!.find(x => x === v) ?? Object.entries(f.labels ?? {}).find(([, l]) => l.toLowerCase() === String(s).toLowerCase())?.[0];
      return hit ? { value: hit } : { error: `${f.label} must be one of: ${f.values!.map(x => f.labels?.[x] ?? x).join(', ')}.` };
    }
    case 'bool': {
      if (typeof s === 'boolean') return { value: s };
      const t = String(s).toLowerCase();
      if (['yes', 'y', 'true', '1'].includes(t)) return { value: true };
      if (['no', 'n', 'false', '0'].includes(t)) return { value: false };
      return { error: `${f.label} must be yes or no.` };
    }
    case 'grade': {
      const g = typeof s === 'number' ? (GRADES.includes(s) ? s : null) : parseGrade(String(s));
      return g == null ? { error: `${f.label} must be a class (Nursery, LKG, UKG or 1 to 12).` } : { value: g };
    }
    case 'amount': {
      const n = typeof s === 'number' ? s : Number(String(s).replace(/[₹,\s]/g, ''));
      return Number.isFinite(n) && n >= 0 && n < 1e8 ? { value: Math.round(n * 100) / 100 } : { error: `${f.label} must be an amount in rupees.` };
    }
    case 'digits': {
      const d = String(s).replace(/[\s-]/g, '');
      return new RegExp(`^\\d{${f.len}}$`).test(d) ? { value: d } : { error: `${f.label} has ${f.len} digits.` };
    }
  }
}

/** A set of register fields from a form: only known keys; every error named. */
export function checkFields(input: Record<string, unknown>, opts: { creating?: boolean } = {}): { values: Record<string, unknown>; errors: Record<string, string> } {
  const values: Record<string, unknown> = {}; const errors: Record<string, string> = {};
  for (const [k, raw] of Object.entries(input)) {
    const f = FIELD.get(k);
    if (!f) continue;
    const r = checkField(f, raw);
    if ('error' in r) errors[k] = r.error; else values[k] = r.value;
  }
  if (opts.creating && !('full_name' in values)) errors.full_name = 'Full name is required.';
  if (values.rte_amount != null && values.rte_seat === false) errors.rte_amount = 'An RTE amount needs the RTE seat ticked.';
  if (typeof values.date_of_birth === 'string' && typeof values.admitted_on === 'string' && values.admitted_on < values.date_of_birth) {
    errors.admitted_on = 'The admission date is before the date of birth.';
  }
  return { values, errors };
}

// ── Address ─────────────────────────────────────────────────────────────────

export interface Address { line1: string; locality: string | null; town: string | null; district: string | null; state: string | null; pin: string | null }
export const ADDRESS_PARTS: { key: keyof Address; label: string; max: number }[] = [
  { key: 'line1', label: 'House and street', max: 160 }, { key: 'locality', label: 'Locality', max: 80 }, { key: 'town', label: 'Village or town', max: 80 },
  { key: 'district', label: 'District', max: 60 }, { key: 'state', label: 'State', max: 60 }, { key: 'pin', label: 'PIN', max: 6 },
];
/** An address from a form or a file: house and street required once anything is given; PIN six digits. */
export function checkAddress(raw: unknown): { value: Address | null } | { error: string } {
  if (raw == null) return { value: null };
  if (typeof raw !== 'object') return { error: 'An address has house and street, locality, town, district, state and PIN.' };
  const r = raw as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const p of ADDRESS_PARTS) {
    const v = typeof r[p.key] === 'string' ? (r[p.key] as string).trim().replace(/\s+/g, ' ') : '';
    if (v.length > p.max) return { error: `${p.label} is longer than ${p.max} characters.` };
    out[p.key] = v || null;
  }
  if (Object.values(out).every(v => v == null)) return { value: null };
  if (!out.line1) return { error: 'An address needs the house and street.' };
  if (out.pin && !/^[1-9]\d{5}$/.test(out.pin)) return { error: 'A PIN code has six digits and does not start with 0.' };
  return { value: out as unknown as Address };
}
export const addressLine = (a: Partial<Address> | null | undefined) =>
  a ? [a.line1, a.locality, a.town, a.district, a.state && a.pin ? `${a.state} ${a.pin}` : a.state || a.pin].filter(Boolean).join(', ') : '';

// ── Family ──────────────────────────────────────────────────────────────────

export const RELATIONS = ['mother', 'father', 'guardian', 'grandparent', 'sibling', 'other'] as const;
export type Relation = typeof RELATIONS[number];
export const RELATION_LABEL: Record<Relation, string> = { mother: 'Mother', father: 'Father', guardian: 'Guardian', grandparent: 'Grandparent', sibling: 'Sibling', other: 'Other' };
export const EDUCATION = ['none', 'primary', 'upper_primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate', 'other'] as const;
export type Education = typeof EDUCATION[number];
export const EDUCATION_LABEL: Record<Education, string> = {
  none: 'No schooling', primary: 'Primary', upper_primary: 'Upper primary', secondary: 'Secondary (Class 10)', higher_secondary: 'Higher secondary (Class 12)',
  graduate: 'Graduate', post_graduate: 'Post-graduate', other: 'Other',
};
/** A phone as stored: 10 digits for an Indian mobile (a leading +91 or 0 dropped), else + and the digits. */
export function cleanPhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, '');
  const digits = d.replace(/\D/g, '');
  if (/^(91)?[6-9]\d{9}$/.test(digits) || /^0[6-9]\d{9}$/.test(digits)) return digits.slice(-10);
  return /^\+\d{11,13}$/.test(d) ? d : null;
}
export interface FamilyInput { relation: Relation; name: string; phone: string | null; email: string | null; education: Education | null; occupation: string | null; annual_income: number | null; is_primary: boolean; lives_with: boolean }
/** A family member from a form or a file. */
export function checkFamily(raw: Record<string, unknown>): { value: FamilyInput } | { error: string } {
  const rel = String(raw.relation ?? '').trim().toLowerCase();
  if (!(RELATIONS as readonly string[]).includes(rel)) return { error: `Relation is one of: ${RELATIONS.map(r => RELATION_LABEL[r]).join(', ')}.` };
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 120) return { error: 'A name of up to 120 characters is required.' };
  let phone: string | null = null;
  if (typeof raw.phone === 'string' && raw.phone.trim()) { phone = cleanPhone(raw.phone); if (!phone) return { error: 'That isn’t a phone number (10 digits for an Indian mobile).' }; }
  let email: string | null = null;
  if (typeof raw.email === 'string' && raw.email.trim()) { email = raw.email.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return { error: 'That isn’t an email address.' }; }
  const edu = raw.education == null || raw.education === '' ? null : String(raw.education);
  if (edu && !(EDUCATION as readonly string[]).includes(edu)) return { error: 'Pick the education level from the list.' };
  const occupation = typeof raw.occupation === 'string' ? raw.occupation.trim().slice(0, 80) || null : null;
  const inc = raw.annual_income == null || raw.annual_income === '' ? null : Number(String(raw.annual_income).replace(/[₹,\s]/g, ''));
  if (inc != null && !(Number.isFinite(inc) && inc >= 0 && inc < 1e10)) return { error: 'Income is an amount in rupees a year.' };
  return { value: { relation: rel as Relation, name, phone, email, education: edu as Education | null, occupation, annual_income: inc, is_primary: raw.is_primary === true, lives_with: raw.lives_with !== false } };
}

/** Admission numbers as schools write them: letters, digits and / - . (1 to 30 characters). */
export function checkAdmissionNo(raw: unknown): { value: string } | { error: string } {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return { error: 'The admission number is required.' };
  if (s.length > 30 || !/^[A-Za-z0-9/.\- ]+$/.test(s)) return { error: 'An admission number has up to 30 letters, digits, spaces and / - .' };
  return { value: s };
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface SessionSettings { startMonth: number; current: string | null }

/** The school session setting, with April and the session of today as defaults. */
export function sessionSettings(settings: unknown): SessionSettings {
  const s = (settings && typeof settings === 'object' ? (settings as Record<string, any>).session : null) || {};
  const m = Number(s.startMonth);
  return { startMonth: Number.isInteger(m) && m >= 1 && m <= 12 ? m : 4, current: typeof s.current === 'string' && /^\d{4}-\d{2}$/.test(s.current) ? s.current : null };
}
/** "2026-27" for a day, when sessions start in `startMonth` (1-12). */
export function sessionFor(day: Date, startMonth = 4): string {
  const y = day.getMonth() + 1 >= startMonth ? day.getFullYear() : day.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
export const nextSessionOf = (s: string) => { const y = Number(s.slice(0, 4)) + 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };
/** The school current session: the one it has opened, else the one today falls in. */
export const currentSession = (settings: unknown, today = new Date()) => {
  const s = sessionSettings(settings);
  return s.current ?? sessionFor(today, s.startMonth);
};
export const sessionStartDay = (session: string, startMonth = 4) => `${session.slice(0, 4)}-${String(startMonth).padStart(2, '0')}-01`;

/** Numbering: prefix and width of the admission numbers Sthara issues for the school. */
export function admissionFormat(settings: unknown): { prefix: string; pad: number } {
  const a = (settings && typeof settings === 'object' ? (settings as Record<string, any>).admission : null) || {};
  const pad = Number(a.pad);
  return { prefix: typeof a.prefix === 'string' ? a.prefix.slice(0, 12) : '', pad: Number.isInteger(pad) && pad >= 1 && pad <= 9 ? pad : 4 };
}
export const rollRuleOf = (settings: unknown): RollRule => {
  const r = settings && typeof settings === 'object' ? (settings as Record<string, any>).rollRule : null;
  return (ROLL_RULES as readonly string[]).includes(r) ? r : 'alphabetical';
};

// ── Requests from parents ───────────────────────────────────────────────────

export type RequestKind = 'address' | 'family' | 'emergency' | 'health';

/** What a parent may propose, checked as the office would check it. */
export function checkProposal(kind: RequestKind, proposed: Record<string, unknown>): { value: Record<string, unknown> } | { error: string } {
  if (kind === 'address') {
    const cur = checkAddress(proposed.address);
    if ('error' in cur) return cur;
    const same = proposed.permanent_same !== false;
    const perm = same ? { value: null } : checkAddress(proposed.permanent_address);
    if ('error' in perm) return perm;
    return { value: { address: cur.value, permanent_same: same, permanent_address: perm.value } };
  }
  if (kind === 'health') {
    // Parents propose the allergies, conditions, medication and blood group they know; the health officer checks.
    const pick = Object.fromEntries(['blood_group', 'allergies', 'conditions', 'medication'].filter(k => proposed[k] !== undefined).map(k => [k, proposed[k]]));
    if (!Object.keys(pick).length) return { error: 'Say what should change.' };
    const u = checkUdise(pick), c = checkCare(pick);
    if ('error' in u) return u;
    if ('error' in c) return c;
    return { value: { ...u.value, ...c.value } };
  }
  if (kind === 'family') {
    const c = checkFamily(proposed);
    return 'error' in c ? c : { value: { ...c.value, is_primary: false } };
  }
  const list = Array.isArray(proposed.list) ? proposed.list.slice(0, 3) : null;
  if (!list) return { error: 'Up to three emergency contacts.' };
  return { value: { list } };
}
