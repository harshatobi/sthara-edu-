/**
 * The admission application: what a school collects about an applicant before admitting them, checked with the
 * register's own rules (lib/students/register) so admission copies it onto the register as it is, and the
 * register then carries what the transfer certificate needs (name, date of birth, nationality, category, the
 * parents' names; the class and date of first admission are set at admission). Plus the checks a school can make a
 * stage require: the age for the grade on the cut-off date, and the documents on the checklist.
 * Pure, so the office screens, the family's form (phase 2b) and the tests share one set of rules.
 */
import {
  ADDRESS_PARTS, checkAddress, checkFamily, checkField, cleanPhone, FIELD, gradeLabel, GRADES,
  type Address, type Field, type FamilyInput,
} from '@/lib/students/register';
import { checklistFor, type ChecklistItem, type DocLite } from '@/lib/students/documents';

/**
 * Register fields an application collects, besides the name and date of birth the applicant row already holds.
 * Left to the office at admission: the date and class of admission (set then), Aadhaar (encrypted, typed by the
 * registrar), board numbers, and RTE reimbursement.
 */
export const APPLICATION_KEYS = [
  'aadhaar_name', 'gender', 'indian_national', 'pen', 'apaar_id', 'medium',
  'previous_status', 'previous_school', 'previous_class', 'previous_tc_no', 'rte_seat',
  'mother_tongue', 'social_category', 'religion', 'minority', 'bpl', 'aay', 'ews', 'family_income', 'distance_km',
] as const;
export const APPLICATION_FIELDS: Field[] = APPLICATION_KEYS.map(k => FIELD.get(k)!);

export const MAX_FAMILY = 6;

export interface ApplicationForm {
  fields: Record<string, string | number | boolean | null>;
  address: Address | null;
  permanent_same: boolean;
  permanent_address: Address | null;
  family: FamilyInput[];
}

export const EMPTY_FORM: ApplicationForm = { fields: {}, address: null, permanent_same: true, permanent_address: null, family: [] };

/** A stored form, read leniently (anything malformed reads as empty, never guessed). */
export function formOf(raw: unknown): ApplicationForm {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  return {
    fields: o.fields && typeof o.fields === 'object' ? o.fields : {},
    address: o.address ?? null,
    permanent_same: o.permanent_same !== false,
    permanent_address: o.permanent_same === false ? o.permanent_address ?? null : null,
    family: Array.isArray(o.family) ? o.family : [],
  };
}

/** Checks a form from the office (or, later, the family). Blank fields are left out, not stored as empty. */
export function checkForm(raw: unknown): { value: ApplicationForm } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fieldsIn = (o.fields && typeof o.fields === 'object' ? o.fields : {}) as Record<string, unknown>;
  const fields: ApplicationForm['fields'] = {};
  for (const f of APPLICATION_FIELDS) {
    if (!(f.key in fieldsIn)) continue;
    const v = fieldsIn[f.key];
    if (v === '' || v === null || v === undefined) continue;
    const r = checkField(f, v);
    if ('error' in r) return { error: r.error };
    if (r.value !== null) fields[f.key] = r.value;
  }
  const addr = checkAddress(o.address ?? null);
  if ('error' in addr) return { error: `Address: ${addr.error}` };
  const permanentSame = o.permanent_same !== false;
  let permanent: Address | null = null;
  if (!permanentSame) {
    const p = checkAddress(o.permanent_address ?? null);
    if ('error' in p) return { error: `Permanent address: ${p.error}` };
    permanent = p.value;
  }
  const famIn = Array.isArray(o.family) ? o.family : [];
  if (famIn.length > MAX_FAMILY) return { error: `At most ${MAX_FAMILY} family members on an application.` };
  const family: FamilyInput[] = [];
  for (const [i, m] of famIn.entries()) {
    const r = checkFamily((m ?? {}) as Record<string, unknown>);
    if ('error' in r) return { error: `Family member ${i + 1}: ${r.error}` };
    family.push(r.value);
  }
  if (family.filter(m => m.is_primary).length > 1) return { error: 'Mark one family member as the main contact.' };
  return { value: { fields, address: addr.value, permanent_same: permanentSame, permanent_address: permanent, family } };
}

/** How complete the application is, for the office's list: the fields that matter most for the register and TC. */
export const KEY_FIELDS = ['gender', 'indian_national', 'social_category'] as const;
export function completeness(f: ApplicationForm, dob: string | null) {
  const missing = [...(dob ? [] : ['Date of birth']), ...KEY_FIELDS.filter(k => f.fields[k] == null).map(k => FIELD.get(k)!.label)];
  if (!f.address) missing.push('Address');
  if (!f.family.some(m => m.relation === 'mother' || m.relation === 'father' || m.relation === 'guardian')) missing.push('A parent or guardian');
  return { missing, done: missing.length === 0 };
}

// ── Age for the grade ───────────────────────────────────────────────────────
/** On the cut-off date of the admission year: NEP and CBSE put Class 1 at 6, each class a year either side. */
export const DEFAULT_CUTOFF = '03-31';
export const defaultMinAge = (grade: number) => grade + 5;

export interface AgeRules { cutoff: string; min: Record<string, number>; max: Record<string, number> }
export const DEFAULT_AGE_RULES: AgeRules = { cutoff: DEFAULT_CUTOFF, min: {}, max: {} };

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The school's age rules (settings.admissions.age) over the default; anything malformed is dropped. */
export function ageRulesOf(settings: unknown): AgeRules {
  const raw = (settings as { admissions?: { age?: Record<string, unknown> } } | null)?.admissions?.age;
  if (!raw || typeof raw !== 'object') return DEFAULT_AGE_RULES;
  const pick = (x: unknown) => Object.fromEntries(Object.entries((x && typeof x === 'object' ? x : {}) as Record<string, unknown>)
    .filter(([g, v]) => GRADES.includes(Number(g)) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 25)) as Record<string, number>;
  return { cutoff: typeof raw.cutoff === 'string' && MMDD.test(raw.cutoff) ? raw.cutoff : DEFAULT_CUTOFF, min: pick(raw.min), max: pick(raw.max) };
}

/** Rules the school admin saves: a cut-off (MM-DD) and, per grade, a minimum and an optional maximum age. */
export function checkAgeRules(raw: unknown): { value: AgeRules } | { error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof o.cutoff !== 'string' || !MMDD.test(o.cutoff)) return { error: 'Pick the cut-off day and month.' };
  const out: AgeRules = { cutoff: o.cutoff, min: {}, max: {} };
  for (const key of ['min', 'max'] as const) {
    const m = (o[key] && typeof o[key] === 'object' ? o[key] : {}) as Record<string, unknown>;
    for (const [g, v] of Object.entries(m)) {
      if (v === null || v === '') continue;
      const grade = Number(g), n = Number(v);
      if (!GRADES.includes(grade)) return { error: 'Unknown class in the age rules.' };
      if (!Number.isInteger(n) || n < 1 || n > 25) return { error: `${gradeLabel(grade)}: ages are whole years from 1 to 25.` };
      out[key][String(grade)] = n;
    }
  }
  for (const g of GRADES) {
    const lo = minAgeFor(out, g), hi = out.max[String(g)];
    if (hi != null && hi < lo) return { error: `${gradeLabel(g)}: the oldest age is below the youngest.` };
  }
  return { value: out };
}

export const minAgeFor = (r: AgeRules, grade: number) => r.min[String(grade)] ?? defaultMinAge(grade);
export const maxAgeFor = (r: AgeRules, grade: number): number | null => r.max[String(grade)] ?? null;

/** The cut-off date for a session ('2027-28' with '03-31' is 2027-03-31). */
export const cutoffDate = (session: string, r: AgeRules) => `${session.slice(0, 4)}-${r.cutoff}`;

/** Whole years and months between a date of birth and a date. */
export function ageOn(dob: string, on: string): { years: number; months: number } {
  const [y1, m1, d1] = dob.split('-').map(Number), [y2, m2, d2] = on.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

export type AgeState = 'ok' | 'young' | 'old' | 'unknown';
export interface AgeCheck { state: AgeState; on: string; age: { years: number; months: number } | null; min: number; max: number | null; text: string }

export function ageCheck(dob: string | null, grade: number, session: string, r: AgeRules): AgeCheck {
  const on = cutoffDate(session, r), min = minAgeFor(r, grade), max = maxAgeFor(r, grade);
  const need = max != null ? `${min} to ${max} years` : `${min} years or more`;
  if (!dob) return { state: 'unknown', on, age: null, min, max, text: `Add the date of birth: ${gradeLabel(grade)} needs ${need} on ${dmyShort(on)}.` };
  const age = ageOn(dob, on);
  const shown = `${age.years} y ${age.months} m on ${dmyShort(on)}`;
  if (age.years < min) return { state: 'young', on, age, min, max, text: `Too young for ${gradeLabel(grade)}: ${shown}, needs ${need}.` };
  // "Up to 8" admits a child who is 8 years and some months on the cut-off date.
  if (max != null && age.years > max) return { state: 'old', on, age, min, max, text: `Over the age for ${gradeLabel(grade)}: ${shown}, needs ${need}.` };
  return { state: 'ok', on, age, min, max, text: `Right age for ${gradeLabel(grade)}: ${shown}.` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dmyShort(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ── Siblings and staff wards ────────────────────────────────────────────────
/** Phones as 10 digits for an Indian mobile, so +91 98…, 098… and 98… match. */
export const phoneKey = (p: string | null | undefined) => (p ? cleanPhone(p) : null);

/** Every phone and email the application gives for the family, for matching. */
export function familyContacts(f: ApplicationForm, guardian: { phone: string | null; email: string | null }) {
  const phones = new Set<string>(), emails = new Set<string>();
  for (const p of [guardian.phone, ...f.family.map(m => m.phone)]) { const k = phoneKey(p); if (k) phones.add(k); }
  for (const e of [guardian.email, ...f.family.map(m => m.email)]) if (e) emails.add(e.toLowerCase());
  return { phones: [...phones], emails: [...emails] };
}

export interface Match { id: string; name: string; detail: string }
export interface Checks {
  age: AgeCheck;
  documents: ReturnType<typeof checklistFor>;
  documentsDone: boolean;
  siblings: Match[];
  staff: Match[];
}

export function assembleChecks(a: { grade: number; session: string; dob: string | null }, rules: AgeRules, checklist: ChecklistItem[],
  docs: DocLite[], today: string, siblings: Match[], staff: Match[]): Checks {
  const documents = checklistFor(checklist, a.grade, docs, today);
  return { age: ageCheck(a.dob, a.grade, a.session, rules), documents, documentsDone: documents.every(d => d.state === 'verified'), siblings, staff };
}

export type Requirement = 'documents' | 'age';
export const REQUIREMENT_LABEL: Record<Requirement, string> = { documents: 'Every checklist document verified', age: 'Right age for the class' };

/** Why an applicant can't leave a stage that requires these checks, or null when they pass. */
export function gateError(requires: readonly string[], c: Checks, stageLabel: string): string | null {
  const why: string[] = [];
  if (requires.includes('age') && c.age.state !== 'ok') why.push(c.age.text);
  if (requires.includes('documents') && !c.documentsDone) {
    const left = c.documents.filter(d => d.state !== 'verified').map(d => d.label.toLowerCase());
    why.push(`Documents still to verify: ${left.join(', ')}.`);
  }
  return why.length ? `${stageLabel} needs these before moving on. ${why.join(' ')}` : null;
}

export { ADDRESS_PARTS };
