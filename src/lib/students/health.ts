/**
 * The health record (brief 03): what each part holds, how it is checked, and the alert a teacher sees. Pure.
 * UDISE+ part: blood group, height and weight, special needs and impairments, disability, screening. Consented
 * part: allergies, conditions, medication, and the dated check-ups and vaccinations.
 */

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const IMPAIRMENTS = ['blindness', 'low_vision', 'hearing', 'speech', 'locomotor', 'mental_illness', 'specific_learning', 'cerebral_palsy', 'autism', 'multiple', 'intellectual', 'other'] as const;
export type Impairment = typeof IMPAIRMENTS[number];
export const IMPAIRMENT_LABEL: Record<Impairment, string> = {
  blindness: 'Blindness', low_vision: 'Low vision', hearing: 'Hearing impairment', speech: 'Speech and language', locomotor: 'Locomotor disability',
  mental_illness: 'Mental illness', specific_learning: 'Specific learning disability', cerebral_palsy: 'Cerebral palsy', autism: 'Autism spectrum disorder',
  multiple: 'Multiple disabilities', intellectual: 'Intellectual disability', other: 'Other',
};
export const SCREENS = ['sld', 'asd', 'adhd'] as const;
export const SCREEN_LABEL: Record<typeof SCREENS[number], string> = { sld: 'Specific learning disability (SLD)', asd: 'Autism (ASD)', adhd: 'ADHD' };
export const SCREEN_RESULTS = ['not_screened', 'negative', 'referred', 'confirmed'] as const;
export const SCREEN_RESULT_LABEL: Record<typeof SCREEN_RESULTS[number], string> = { not_screened: 'Not screened', negative: 'Screened, negative', referred: 'Referred', confirmed: 'Confirmed' };
export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = typeof SEVERITIES[number];
export const ALLERGY_KINDS = ['food', 'drug', 'insect', 'other'] as const;

export interface Allergy { kind: typeof ALLERGY_KINDS[number]; what: string; severity: Severity; action: string | null }
export interface Condition { name: string; plan: string | null; serious: boolean }
export interface Medication { name: string; dose: string | null; timing: string | null; schoolGives: boolean }
export interface HealthCard {
  blood_group: string | null; height_cm: number | null; weight_kg: number | null; measured_on: string | null; cwsn: boolean;
  impairments: Impairment[]; disability_certificate: boolean | null; disability_percent: number | null; screening: Partial<Record<typeof SCREENS[number], string>>;
  allergies: Allergy[]; conditions: Condition[]; medication: Medication[];
}

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** The UDISE+ part from a form or a file. */
export function checkUdise(raw: Record<string, unknown>): { value: Partial<HealthCard> } | { error: string } {
  const out: Partial<HealthCard> = {};
  if (raw.blood_group !== undefined) {
    // "O+", "o +ve", "AB negative" -> O+, O+, AB-
    const t = txt(raw.blood_group, 20).toUpperCase().replace(/\s+/g, '');
    const m = t.match(/^(AB|A|B|O)(\+|-|\+VE|-VE|POS|POSITIVE|NEG|NEGATIVE)$/);
    const b = m ? m[1] + (/^(\+|POS)/.test(m[2]) ? '+' : '-') : t;
    if (b && !(BLOOD_GROUPS as readonly string[]).includes(b)) return { error: 'Blood group is one of A+, A-, B+, B-, AB+, AB-, O+, O-.' };
    out.blood_group = b || null;
  }
  for (const [k, lo, hi, label] of [['height_cm', 30, 250, 'Height (cm)'], ['weight_kg', 5, 250, 'Weight (kg)']] as const) {
    if (raw[k] === undefined) continue;
    if (raw[k] === null || raw[k] === '') { out[k] = null; continue; }
    const n = Number(raw[k]);
    if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${label} must be between ${lo} and ${hi}.` };
    out[k] = Math.round(n * 10) / 10;
  }
  if (raw.measured_on !== undefined) {
    const d = txt(raw.measured_on, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: 'The measurement date must be a date.' };
    out.measured_on = d || null;
  }
  if (raw.cwsn !== undefined) out.cwsn = raw.cwsn === true;
  if (raw.impairments !== undefined) {
    const list = Array.isArray(raw.impairments) ? raw.impairments.map(String) : [];
    const bad = list.find(i => !(IMPAIRMENTS as readonly string[]).includes(i));
    if (bad) return { error: `Unknown impairment "${bad}".` };
    out.impairments = [...new Set(list)] as Impairment[];
    if (out.impairments.length) out.cwsn = true;
  }
  if (raw.disability_certificate !== undefined) out.disability_certificate = raw.disability_certificate == null ? null : raw.disability_certificate === true;
  if (raw.disability_percent !== undefined) {
    if (raw.disability_percent === null || raw.disability_percent === '') out.disability_percent = null;
    else {
      const p = Number(raw.disability_percent);
      if (!Number.isInteger(p) || p < 0 || p > 100) return { error: 'Disability percentage is a whole number from 0 to 100.' };
      out.disability_percent = p;
    }
  }
  if (raw.screening !== undefined) {
    const s = (raw.screening && typeof raw.screening === 'object' ? raw.screening : {}) as Record<string, unknown>;
    const sc: Record<string, string> = {};
    for (const k of SCREENS) {
      if (s[k] == null || s[k] === '') continue;
      if (!(SCREEN_RESULTS as readonly string[]).includes(String(s[k]))) return { error: `${SCREEN_LABEL[k]}: pick a screening result.` };
      sc[k] = String(s[k]);
    }
    out.screening = sc;
  }
  return { value: out };
}

/** The consented part: allergies, conditions, medication. */
export function checkCare(raw: Record<string, unknown>): { value: Partial<HealthCard> } | { error: string } {
  const out: Partial<HealthCard> = {};
  if (raw.allergies !== undefined) {
    if (!Array.isArray(raw.allergies) || raw.allergies.length > 20) return { error: 'Up to 20 allergies.' };
    const list: Allergy[] = [];
    for (const a of raw.allergies as Record<string, unknown>[]) {
      const what = txt(a?.what, 80);
      if (!what) return { error: 'Each allergy needs what the student is allergic to.' };
      const kind = (ALLERGY_KINDS as readonly string[]).includes(String(a.kind)) ? a.kind as Allergy['kind'] : 'other';
      const severity = (SEVERITIES as readonly string[]).includes(String(a.severity)) ? a.severity as Severity : 'moderate';
      list.push({ kind, what, severity, action: txt(a.action, 200) || null });
    }
    out.allergies = list;
  }
  if (raw.conditions !== undefined) {
    if (!Array.isArray(raw.conditions) || raw.conditions.length > 20) return { error: 'Up to 20 conditions.' };
    const list: Condition[] = [];
    for (const c of raw.conditions as Record<string, unknown>[]) {
      const name = txt(c?.name, 80);
      if (!name) return { error: 'Each condition needs a name.' };
      list.push({ name, plan: txt(c.plan, 300) || null, serious: c.serious === true });
    }
    out.conditions = list;
  }
  if (raw.medication !== undefined) {
    if (!Array.isArray(raw.medication) || raw.medication.length > 20) return { error: 'Up to 20 medicines.' };
    const list: Medication[] = [];
    for (const m of raw.medication as Record<string, unknown>[]) {
      const name = txt(m?.name, 80);
      if (!name) return { error: 'Each medicine needs a name.' };
      list.push({ name, dose: txt(m.dose, 60) || null, timing: txt(m.timing, 60) || null, schoolGives: m.schoolGives === true });
    }
    out.medication = list;
  }
  return { value: out };
}

/** "Peanut (severe); Penicillin" from a file cell, as allergies. Severity in brackets, food unless said otherwise. */
export function parseAllergyList(cell: string): Allergy[] {
  return cell.split(/[;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 20).map(x => {
    const m = x.match(/^(.*?)\s*\((mild|moderate|severe)\)\s*$/i);
    const what = (m ? m[1] : x).trim().slice(0, 80);
    const drug = /(cillin|sulfa|aspirin|ibuprofen|drug|medicine)/i.test(what);
    return { kind: drug ? 'drug' : 'food', what, severity: (m ? m[2].toLowerCase() : 'moderate') as Severity, action: null };
  });
}
export const parseNameList = (cell: string) => cell.split(/[;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 20);

export interface CheckupData { vision_left?: string; vision_right?: string; hearing?: string; dental?: string; height_cm?: number; weight_kg?: number; bmi?: number; remarks?: string }
/** One dated entry: a check-up or a vaccination. */
export function checkEvent(raw: Record<string, unknown>): { value: { kind: 'checkup' | 'vaccination'; on_date: string; data: Record<string, unknown>; note: string | null } } | { error: string } {
  const kind = raw.kind === 'vaccination' ? 'vaccination' : raw.kind === 'checkup' ? 'checkup' : null;
  if (!kind) return { error: 'An entry is a check-up or a vaccination.' };
  const on = txt(raw.on_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on < '1990-01-01' || on > '2100-01-01') return { error: 'Give the date.' };
  const d = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (kind === 'vaccination') {
    const vaccine = txt(d.vaccine, 60);
    if (!vaccine) return { error: 'Name the vaccine.' };
    data.vaccine = vaccine;
    if (txt(d.dose, 20)) data.dose = txt(d.dose, 20);
  } else {
    for (const k of ['vision_left', 'vision_right', 'hearing', 'dental', 'remarks'] as const) if (txt(d[k], k === 'remarks' ? 300 : 60)) data[k] = txt(d[k], k === 'remarks' ? 300 : 60);
    for (const [k, lo, hi] of [['height_cm', 30, 250], ['weight_kg', 5, 250]] as const) {
      if (d[k] == null || d[k] === '') continue;
      const n = Number(d[k]);
      if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${k === 'height_cm' ? 'Height' : 'Weight'} is out of range.` };
      data[k] = Math.round(n * 10) / 10;
    }
    if (typeof data.height_cm === 'number' && typeof data.weight_kg === 'number') data.bmi = bmi(data.height_cm, data.weight_kg);
    if (!Object.keys(data).length) return { error: 'A check-up needs at least one result.' };
  }
  return { value: { kind, on_date: on, data, note: txt(raw.note, 500) || null } };
}
export const bmi = (cm: number, kg: number) => Math.round((kg / ((cm / 100) ** 2)) * 10) / 10;

/** What a teacher sees next to the student: severe or any allergy, serious conditions, with what to do. Empty when none. */
export function alertOf(card: Pick<HealthCard, 'allergies' | 'conditions'>): string | null {
  const parts = [
    ...card.allergies.map(a => `Allergic to ${a.what}${a.severity === 'severe' ? ' (severe)' : ''}${a.action ? `: ${a.action}` : ''}`),
    ...card.conditions.filter(c => c.serious).map(c => `${c.name}${c.plan ? `: ${c.plan}` : ''}`),
  ];
  return parts.length ? parts.join('. ') : null;
}
