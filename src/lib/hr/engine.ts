/**
 * The employee master: who someone is at the school on a given date, where they are in the lifecycle, and what
 * needs HR's attention. Pure, shared by the People pages, the /api/admin/people routes, the import and tests.
 *
 * The staff register row (staff_members) holds the job in force today; staff_jobs holds every dated version of it.
 */
import { daysBetween } from '@/lib/admin/format';
import { toE164 } from '@/lib/whatsapp/config';
import type { Employment, StaffCategory } from '@/lib/schedule/types';

export const CATEGORIES: StaffCategory[] = ['teaching', 'office', 'support', 'assistant'];
export const EMPLOYMENTS: Employment[] = ['permanent', 'contract', 'visiting'];

export const JOB_ACTIONS = {
  hire: 'Joined', redesignation: 'Change of designation', transfer: 'Transfer', promotion: 'Promotion',
  employment_change: 'Change of employment', renewal: 'Contract renewal', rehire: 'Rejoined', correction: 'Correction',
} as const;
export type JobAction = keyof typeof JOB_ACTIONS;
/** Actions HR picks in the job change form (a hire and a rehire have their own flows). */
export const JOB_CHANGE_ACTIONS: JobAction[] = ['promotion', 'transfer', 'redesignation', 'employment_change', 'renewal', 'correction'];

export const DEPARTMENT_KINDS = { academic: 'Academic', administrative: 'Administrative', support: 'Support' } as const;
export const EXIT_KINDS = {
  resignation: 'Resignation', termination: 'Termination', retirement: 'Retirement', contract_end: 'End of contract',
  absconding: 'Absconding', death: 'Death in service',
} as const;
export type ExitKind = keyof typeof EXIT_KINDS;
export const DOC_KINDS = {
  photo: 'Photograph', id_proof: 'Identity proof', address_proof: 'Address proof', qualification: 'Qualification certificate',
  experience: 'Experience letter', appointment_letter: 'Appointment letter', contract: 'Contract', police_verification: 'Police verification',
  driving_licence: 'Driving licence', medical_fitness: 'Medical fitness', bank_proof: 'Bank proof', other: 'Other',
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const QUAL_KINDS = {
  school: 'School (X / XII)', diploma: 'Diploma', graduate: 'Graduate', postgraduate: 'Postgraduate', doctorate: 'Doctorate',
  d_el_ed: 'D.El.Ed', b_ed: 'B.Ed', m_ed: 'M.Ed', ctet: 'CTET', state_tet: 'State TET', net_set: 'NET / SET',
  certificate: 'Certificate', other: 'Other',
} as const;
export type QualKind = keyof typeof QUAL_KINDS;
export const EVENT_KINDS = {
  probation_set: 'Probation set', probation_extended: 'Probation extended', confirmed: 'Confirmed', exit_started: 'Exit started',
  exit_withdrawn: 'Exit withdrawn', exited: 'Left the school', rehired: 'Rejoined',
} as const;
export const GENDERS = { female: 'Female', male: 'Male', other: 'Other' } as const;
export const MARITAL = { single: 'Single', married: 'Married', widowed: 'Widowed', divorced: 'Divorced' } as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export interface Employee {
  id: string; userId: string | null; login: 'teacher' | 'admin' | null; email: string | null; name: string;
  category: StaffCategory; designation: string; employment: Employment; contractFrom: string | null; contractTo: string | null;
  departmentId: string | null; gradeId: string | null; managerId: string | null; wingId: string | null;
  phone: string | null; whatsappOptIn: boolean; employeeCode: string | null; joinedOn: string | null; active: boolean;
  probationUntil: string | null; confirmedOn: string | null; exitOn: string | null;
}
export interface Job {
  id: string; staffMemberId: string; effectiveFrom: string; action: JobAction; designation: string; category: StaffCategory;
  departmentId: string | null; gradeId: string | null; managerId: string | null; employment: Employment;
  contractFrom: string | null; contractTo: string | null; reason: string | null; authority: string | null; createdAt?: string;
}
export interface Department { id: string; name: string; kind: keyof typeof DEPARTMENT_KINDS; headId: string | null; active: boolean }
export interface Grade { id: string; name: string; category: StaffCategory | null; payMin: number | null; payMax: number | null; sort: number; active: boolean }
export interface Post { id: string; departmentId: string; gradeId: string | null; sanctioned: number; note: string | null }
export interface ExitRow {
  id: string; staffMemberId: string; kind: ExitKind; noticeOn: string; lastDay: string; reason: string | null;
  checklist: ChecklistItem[]; status: 'notice' | 'completed' | 'withdrawn'; loginFlaggedAt: string | null;
}
export interface ChecklistItem { key: string; label: string; done: boolean; by?: string | null; at?: string | null }
export interface DocRow { id: string; staffMemberId: string; kind: DocKind; title: string; issuedOn: string | null; expiresOn: string | null; hasFile: boolean; fileName: string | null; createdAt?: string }
export interface HrSettings { codePrefix: string; codeWidth: number; codeLastNo: number; probationMonths: number; noticeDays: number; alertDays: number }
export const DEFAULT_HR_SETTINGS: HrSettings = { codePrefix: 'EMP-', codeWidth: 4, codeLastNo: 0, probationMonths: 6, noticeDays: 30, alertDays: 30 };

// ── Dates ───────────────────────────────────────────────────────────────────
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date in YYYY-MM-DD, or null. */
export function day(v: unknown): string | null {
  if (typeof v !== 'string' || !ISO.test(v.trim())) return null;
  const s = v.trim(), d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}
/** The same day n months on; the 31st lands on the last day of a shorter month. */
export function addMonths(date: string, n: number): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1 + n, d = Number(date.slice(8, 10));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n)).toISOString().slice(0, 10);
}
/** "3 yr 2 mo", "5 mo", "12 days". */
export function tenure(from: string | null, to: string): string {
  if (!from || from > to) return '';
  let months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  if (Number(to.slice(8, 10)) < Number(from.slice(8, 10))) months--;
  if (months < 1) { const d = daysBetween(from, to); return `${d} day${d === 1 ? '' : 's'}`; }
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
}
export function ageOn(dob: string, today: string): number {
  let a = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5)) a--;
  return a;
}

// ── Status and job history ──────────────────────────────────────────────────
export type Status = 'exited' | 'notice' | 'probation' | 'contract' | 'confirmed';
export const STATUS: Record<Status, { label: string; tone: 'g' | 'a' | 'r' | 'b' | 'n' }> = {
  confirmed: { label: 'Confirmed', tone: 'g' }, probation: { label: 'On probation', tone: 'b' }, contract: { label: 'On contract', tone: 'b' },
  notice: { label: 'Serving notice', tone: 'a' }, exited: { label: 'Left', tone: 'n' },
};
/** Where someone is in the lifecycle. A permanent employee with no probation recorded counts as confirmed. */
export function statusOf(e: Pick<Employee, 'active' | 'employment' | 'probationUntil' | 'confirmedOn'>, hasOpenExit: boolean): Status {
  if (!e.active) return 'exited';
  if (hasOpenExit) return 'notice';
  if (e.employment !== 'permanent') return 'contract';
  if (e.probationUntil && !e.confirmedOn) return 'probation';
  return 'confirmed';
}

/** The job in force on a date: the latest row that had started by then. */
export function jobOn<T extends { effectiveFrom: string }>(jobs: T[], date: string): T | null {
  let best: T | null = null;
  for (const j of jobs) if (j.effectiveFrom <= date && (!best || j.effectiveFrom > best.effectiveFrom)) best = j;
  return best;
}
/** What a job row changed compared with the one before it, in words. */
export function jobDiff(prev: Job | null, j: Job, names: { dept: (id: string | null) => string; grade: (id: string | null) => string; person: (id: string | null) => string }): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const say = (label: string, a: string, b: string) => { if (a !== b) out.push(`${label}: ${a || 'none'} to ${b || 'none'}`); };
  say('Designation', prev.designation, j.designation);
  say('Department', names.dept(prev.departmentId), names.dept(j.departmentId));
  say('Grade', names.grade(prev.gradeId), names.grade(j.gradeId));
  say('Reports to', names.person(prev.managerId), names.person(j.managerId));
  say('Employment', prev.employment, j.employment);
  say('Category', prev.category, j.category);
  say('Contract to', prev.contractTo ?? '', j.contractTo ?? '');
  return out;
}

/** True when making `managerId` the manager of `id` would put `id` above themselves. */
export function managerLoop(people: Pick<Employee, 'id' | 'managerId'>[], id: string, managerId: string | null): boolean {
  const up = new Map(people.map(p => [p.id, p.managerId]));
  const seen = new Set<string>();
  for (let at = managerId; at; at = up.get(at) ?? null) {
    if (at === id) return true;
    if (seen.has(at)) return false;
    seen.add(at);
  }
  return false;
}

/** Sanctioned posts against the people actually in them. A post with no grade counts the whole department. */
export function postFill(posts: Post[], people: Pick<Employee, 'active' | 'departmentId' | 'gradeId'>[]): (Post & { filled: number; vacant: number })[] {
  const active = people.filter(p => p.active);
  return posts.map(p => {
    const filled = active.filter(e => e.departmentId === p.departmentId && (!p.gradeId || e.gradeId === p.gradeId)).length;
    return { ...p, filled, vacant: p.sanctioned - filled };
  });
}

export const DEFAULT_EXIT_CHECKLIST: ChecklistItem[] = [
  ['handover', 'Classes, registers and work handed over'], ['timetable', 'Taken off the timetable and duty roster from the last day'],
  ['assets', 'Keys, ID card, laptop and library books returned'], ['dues', 'Advances and dues settled'],
  ['leave', 'Leave balance worked out'], ['letter', 'Relieving and experience letters issued'],
].map(([key, label]) => ({ key, label, done: false }));

// ── Attention ───────────────────────────────────────────────────────────────
export interface Attention { key: string; kind: 'probation' | 'contract' | 'exit' | 'document' | 'job' | 'record' | 'login'; tone: 'r' | 'a' | 'b'; personId: string; title: string; detail: string; due: string | null }

/**
 * What HR should look at, most urgent first: probation ending, contracts ending, exits to close, logins to
 * remove, documents expiring, job changes about to take effect, and records with gaps payroll will need filled.
 */
export function attention(input: {
  today: string; alertDays: number; people: Employee[]; exits: ExitRow[]; documents: DocRow[]; upcoming: Job[];
  /** Per person, what their record lacks ('bank', 'pan', 'dob', 'joined'); only for those allowed to see it. */
  gaps?: Record<string, string[]>;
}): Attention[] {
  const { today, alertDays, people } = input;
  const by = new Map(people.map(p => [p.id, p]));
  const out: Attention[] = [];
  const inDays = (d: string) => daysBetween(today, d);
  const when = (d: string) => { const n = inDays(d); return n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; };
  const open = new Set(input.exits.filter(x => x.status === 'notice').map(x => x.staffMemberId));

  for (const p of people) {
    if (!p.active) continue;
    if (p.employment === 'permanent' && p.probationUntil && !p.confirmedOn && !open.has(p.id) && inDays(p.probationUntil) <= alertDays) {
      const late = p.probationUntil < today;
      out.push({ key: `probation:${p.id}`, kind: 'probation', tone: late ? 'r' : 'a', personId: p.id, due: p.probationUntil,
        title: `${p.name}'s probation ${late ? 'ended' : 'ends'} ${when(p.probationUntil)}`, detail: 'Confirm them or extend the probation.' });
    }
    if (p.employment !== 'permanent' && p.contractTo && !open.has(p.id) && inDays(p.contractTo) <= alertDays) {
      const late = p.contractTo < today;
      out.push({ key: `contract:${p.id}`, kind: 'contract', tone: late ? 'r' : 'a', personId: p.id, due: p.contractTo,
        title: `${p.name}'s contract ${late ? 'ended' : 'ends'} ${when(p.contractTo)}`, detail: late ? 'Renew it or record the exit; they are off schedules after the end date.' : 'Renew it or record the end of contract.' });
    }
  }
  for (const x of input.exits) {
    const p = by.get(x.staffMemberId);
    if (!p) continue;
    if (x.status === 'notice' && x.lastDay <= today) {
      out.push({ key: `exit:${x.id}`, kind: 'exit', tone: 'r', personId: p.id, due: x.lastDay,
        title: `${p.name}'s last day was ${when(x.lastDay)}`, detail: `${x.checklist.filter(c => !c.done).length} checklist item(s) open. Close the exit to take them off the register.` });
    } else if (x.status === 'notice' && inDays(x.lastDay) <= alertDays) {
      out.push({ key: `exit:${x.id}`, kind: 'exit', tone: 'a', personId: p.id, due: x.lastDay,
        title: `${p.name} leaves ${when(x.lastDay)}`, detail: `${EXIT_KINDS[x.kind]}. ${x.checklist.filter(c => !c.done).length} checklist item(s) open.` });
    } else if (x.status === 'completed' && x.loginFlaggedAt && p.userId) {
      out.push({ key: `login:${x.id}`, kind: 'login', tone: 'r', personId: p.id, due: x.lastDay,
        title: `${p.name} has left but still has a login`, detail: 'Remove the account in the user directory.' });
    }
  }
  for (const d of input.documents) {
    const p = by.get(d.staffMemberId);
    if (!p?.active || !d.expiresOn || inDays(d.expiresOn) > alertDays) continue;
    const late = d.expiresOn < today;
    out.push({ key: `doc:${d.id}`, kind: 'document', tone: late ? 'r' : 'a', personId: p.id, due: d.expiresOn,
      title: `${p.name}'s ${DOC_KINDS[d.kind].toLowerCase()} ${late ? 'expired' : 'expires'} ${when(d.expiresOn)}`, detail: d.title });
  }
  for (const j of input.upcoming) {
    const p = by.get(j.staffMemberId);
    if (!p || j.effectiveFrom <= today || inDays(j.effectiveFrom) > alertDays) continue;
    out.push({ key: `job:${j.id}`, kind: 'job', tone: 'b', personId: p.id, due: j.effectiveFrom,
      title: `${p.name}: ${JOB_ACTIONS[j.action].toLowerCase()} takes effect ${when(j.effectiveFrom)}`, detail: j.designation || 'Job change' });
  }
  const GAP: Record<string, string> = { bank: 'bank account', pan: 'PAN', dob: 'date of birth', joined: 'joining date', code: 'employee code', emergency: 'emergency contact' };
  for (const [id, gaps] of Object.entries(input.gaps || {})) {
    const p = by.get(id);
    if (!p?.active || !gaps.length) continue;
    out.push({ key: `record:${id}`, kind: 'record', tone: 'b', personId: id, due: null,
      title: `${p.name}'s record is incomplete`, detail: `Missing: ${gaps.map(g => GAP[g] || g).join(', ')}.` });
  }
  const rank = { r: 0, a: 1, b: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.due ?? '9').localeCompare(b.due ?? '9') || a.title.localeCompare(b.title));
}

// ── Personal and statutory details ──────────────────────────────────────────
const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
const squash = (v: unknown) => (typeof v === 'string' ? v.replace(/[\s-]/g, '').toUpperCase() : '');
type Cleaned<T> = { row: T } | { error: string };

export interface StatutoryRow {
  pan: string | null; uan: string | null; esi_no: string | null; aadhaar_last4: string | null; bank_account: string | null;
  bank_ifsc: string | null; bank_name: string | null; bank_holder: string | null; nominee_name: string | null; nominee_relation: string | null;
}
/** Statutory and bank details from a form or an import row. Empty fields clear; a full Aadhaar number is refused. */
export function cleanStatutory(b: any): Cleaned<StatutoryRow> {
  const pan = squash(b?.pan), uan = squash(b?.uan), esi = squash(b?.esiNo ?? b?.esi_no), aad = squash(b?.aadhaarLast4 ?? b?.aadhaar_last4);
  const acct = squash(b?.bankAccount ?? b?.bank_account), ifsc = squash(b?.bankIfsc ?? b?.bank_ifsc);
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return { error: 'That PAN doesn\'t look right. It is five letters, four digits and a letter (ABCDE1234F).' };
  if (uan && !/^\d{12}$/.test(uan)) return { error: 'A UAN has 12 digits.' };
  if (esi && !/^\d{10}$/.test(esi)) return { error: 'An ESI insurance number has 10 digits.' };
  if (aad && !/^\d{4}$/.test(aad)) return { error: 'Enter only the last four digits of the Aadhaar number. Sthara never stores the full number.' };
  if (acct && !/^\d{6,18}$/.test(acct)) return { error: 'A bank account number has 6 to 18 digits.' };
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { error: 'That IFSC doesn\'t look right. It is 11 characters with a zero fifth (HDFC0001234).' };
  if (acct && !ifsc) return { error: 'Add the IFSC for that bank account.' };
  return { row: {
    pan: pan || null, uan: uan || null, esi_no: esi || null, aadhaar_last4: aad || null, bank_account: acct || null, bank_ifsc: ifsc || null,
    bank_name: text(b?.bankName ?? b?.bank_name, 80) || null, bank_holder: text(b?.bankHolder ?? b?.bank_holder, 120) || null,
    nominee_name: text(b?.nomineeName ?? b?.nominee_name, 120) || null, nominee_relation: text(b?.nomineeRelation ?? b?.nominee_relation, 60) || null,
  } };
}
/** All but the last four characters hidden. */
export const maskTail = (v: string | null | undefined) => (v ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : null);
export function maskStatutory(s: StatutoryRow | null): StatutoryRow | null {
  return s && { ...s, pan: maskTail(s.pan), uan: maskTail(s.uan), esi_no: maskTail(s.esi_no), bank_account: maskTail(s.bank_account) };
}

export interface ProfileRow {
  date_of_birth: string | null; gender: string | null; blood_group: string | null; marital_status: string | null; kin_name: string | null;
  personal_email: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null;
  emergency_name: string | null; emergency_relation: string | null; emergency_phone: string | null;
}
export function cleanProfile(b: any, today: string): Cleaned<ProfileRow> {
  const rawDob = b?.dateOfBirth ?? b?.date_of_birth, dob = rawDob ? day(rawDob) : null;
  if (rawDob && !dob) return { error: 'Pick the date of birth.' };
  if (dob && (ageOn(dob, today) < 18 || ageOn(dob, today) > 90)) return { error: 'Check the date of birth: staff are between 18 and 90.' };
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : null);
  const gender = b?.gender ? pick(String(b.gender).toLowerCase(), Object.keys(GENDERS)) : null;
  if (b?.gender && !gender) return { error: 'Gender is female, male or other.' };
  const blood = b?.bloodGroup ?? b?.blood_group ? pick(String(b.bloodGroup ?? b.blood_group).replace(/\s/g, '').toUpperCase(), BLOOD_GROUPS) : null;
  if ((b?.bloodGroup ?? b?.blood_group) && !blood) return { error: 'Blood group is one of A+, A-, B+, B-, AB+, AB-, O+, O-.' };
  const marital = b?.maritalStatus ?? b?.marital_status ? pick(String(b.maritalStatus ?? b.marital_status).toLowerCase(), Object.keys(MARITAL)) : null;
  const email = text(b?.personalEmail ?? b?.personal_email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'That personal email doesn\'t look right.' };
  const pin = squash(b?.pincode);
  if (pin && !/^[1-9]\d{5}$/.test(pin)) return { error: 'A PIN code has six digits.' };
  const rawPhone = b?.emergencyPhone ?? b?.emergency_phone, phone = rawPhone ? toE164(String(rawPhone)) : null;
  if (rawPhone && !phone) return { error: 'The emergency contact\'s number doesn\'t look right. Use a 10-digit mobile or +country code.' };
  return { row: {
    date_of_birth: dob, gender, blood_group: blood, marital_status: marital, kin_name: text(b?.kinName ?? b?.kin_name, 120) || null,
    personal_email: email || null, address: text(b?.address, 400) || null, city: text(b?.city, 80) || null, state: text(b?.state, 80) || null, pincode: pin || null,
    emergency_name: text(b?.emergencyName ?? b?.emergency_name, 120) || null, emergency_relation: text(b?.emergencyRelation ?? b?.emergency_relation, 60) || null,
    emergency_phone: phone,
  } };
}

/** What a record still lacks for payroll and safety. `statutory`/`profile` null means nothing entered yet. */
export function recordGaps(e: Pick<Employee, 'joinedOn' | 'employeeCode'>, profile: Partial<ProfileRow> | null, statutory: Partial<StatutoryRow> | null): string[] {
  const g: string[] = [];
  if (!e.employeeCode) g.push('code');
  if (!e.joinedOn) g.push('joined');
  if (!profile?.date_of_birth) g.push('dob');
  if (!profile?.emergency_phone) g.push('emergency');
  if (!statutory?.pan) g.push('pan');
  if (!statutory?.bank_account) g.push('bank');
  return g;
}

// ── Import ──────────────────────────────────────────────────────────────────
/** Template columns, in order: [field, header, example]. Headers are matched loosely (case, spaces, punctuation). */
export const IMPORT_COLUMNS: [string, string, string][] = [
  ['employeeCode', 'Employee code', 'EMP-0012'], ['name', 'Name', 'Lakshmi Devi'], ['email', 'Login email', ''],
  ['category', 'Category', 'support'], ['designation', 'Designation', 'Ayah'], ['department', 'Department', 'Housekeeping'],
  ['grade', 'Grade', 'S1'], ['reportsTo', 'Reports to', 'EMP-0003'], ['employment', 'Employment', 'permanent'],
  ['contractTo', 'Contract to', ''], ['joinedOn', 'Joined on', '2022-06-01'], ['phone', 'Mobile', '9812345678'],
  ['dateOfBirth', 'Date of birth', '1988-04-17'], ['gender', 'Gender', 'female'], ['bloodGroup', 'Blood group', 'B+'],
  ['kinName', 'Father or spouse', 'Ravi Kumar'], ['address', 'Address', '12 Temple Street'], ['city', 'City', 'Vijayawada'],
  ['state', 'State', 'Andhra Pradesh'], ['pincode', 'PIN code', '520001'], ['emergencyName', 'Emergency contact', 'Ravi Kumar'],
  ['emergencyRelation', 'Emergency relation', 'Husband'], ['emergencyPhone', 'Emergency mobile', '9898989898'],
  ['pan', 'PAN', 'ABCDE1234F'], ['uan', 'UAN', '100200300400'], ['esiNo', 'ESI number', ''], ['aadhaarLast4', 'Aadhaar last 4', '1234'],
  ['bankAccount', 'Bank account', '50100123456789'], ['bankIfsc', 'IFSC', 'HDFC0001234'], ['bankName', 'Bank name', 'HDFC Bank'],
  ['bankHolder', 'Account holder', 'Lakshmi Devi'], ['nomineeName', 'Nominee', 'Ravi Kumar'], ['nomineeRelation', 'Nominee relation', 'Husband'],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Names and headers compared loosely: case, spaces and punctuation don't matter. */
export const nameKey = norm;
const HEADER_ALIASES: Record<string, string> = {
  empcode: 'employeeCode', code: 'employeeCode', employeeid: 'employeeCode', staffname: 'name', fullname: 'name', email: 'email',
  type: 'category', dept: 'department', manager: 'reportsTo', reportingmanager: 'reportsTo', doj: 'joinedOn', dateofjoining: 'joinedOn',
  joiningdate: 'joinedOn', phone: 'phone', mobilenumber: 'phone', dob: 'dateOfBirth', birthdate: 'dateOfBirth', fatherorspousename: 'kinName',
  fathername: 'kinName', pin: 'pincode', pincode: 'pincode', pannumber: 'pan', uannumber: 'uan', esi: 'esiNo', esinumber: 'esiNo',
  aadhaar: 'aadhaarLast4', aadhaarlastfour: 'aadhaarLast4', accountnumber: 'bankAccount', bankaccountnumber: 'bankAccount', ifsccode: 'bankIfsc',
  bank: 'bankName', accountholdername: 'bankHolder', nomineename: 'nomineeName', contractend: 'contractTo', contractenddate: 'contractTo',
};
export type ImportRow = Record<string, string> & { line: string };

/** A sheet (first row headers) as rows keyed by field. Unknown columns are reported and ignored. */
export function parseImport(table: string[][]): { rows: ImportRow[]; problems: string[] } {
  const problems: string[] = [];
  if (table.length < 2) return { rows: [], problems: ['The file has no rows under the header row.'] };
  const byHeader = new Map(IMPORT_COLUMNS.map(([f, h]) => [norm(h), f]));
  const fields = table[0].map(h => byHeader.get(norm(h)) ?? HEADER_ALIASES[norm(h)] ?? null);
  const unknown = table[0].filter((h, i) => h && !fields[i]);
  if (unknown.length) problems.push(`Ignored column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`);
  if (!fields.includes('name')) return { rows: [], problems: ['There is no "Name" column. Start from the template.'] };
  const rows = table.slice(1).map((r, i) => {
    const row = { line: String(i + 2) } as ImportRow;
    fields.forEach((f, c) => { if (f && r[c]) row[f] = r[c]; });
    return row;
  }).filter(r => Object.keys(r).length > 1);
  if (rows.length > 1000) return { rows: [], problems: ['That file has more than 1,000 people. Split it and import in parts.'] };
  return { rows, problems };
}

/** Dates as Excel and people write them: 2022-06-01, 01/06/2022, 1-6-22, 01 Jun 2022. Day comes before month. */
export function looseDay(v: string | undefined): string | null | undefined {
  if (!v?.trim()) return undefined;
  const s = v.trim();
  if (ISO.test(s.slice(0, 10))) return day(s.slice(0, 10));
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const m = s.match(/^(\d{1,2})[\s/.-]+(\d{1,2}|[A-Za-z]{3,9})[\s/.,-]+(\d{2}|\d{4})$/);
  if (!m) return null;
  const mo = /^\d+$/.test(m[2]) ? Number(m[2]) : MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  const y = m[3].length === 2 ? (Number(m[3]) > 40 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
  if (mo < 1) return null;
  return day(`${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
}

const CATEGORY_WORDS: Record<string, StaffCategory> = {
  teaching: 'teaching', teacher: 'teaching', faculty: 'teaching', office: 'office', admin: 'office', administrative: 'office',
  support: 'support', supportstaff: 'support', nonteaching: 'support', assistant: 'assistant', lab: 'assistant', library: 'assistant', it: 'assistant',
};
export interface ImportPlan {
  line: string; name: string; match: { id: string; how: 'code' | 'email' | 'name' } | null;
  core: { name: string; category?: StaffCategory; designation?: string; employment?: Employment; contractTo?: string | null; joinedOn?: string; phone?: string; employeeCode?: string; department?: string; grade?: string; reportsTo?: string };
  profile: ProfileRow | null; statutory: StatutoryRow | null; problems: string[]; notes: string[];
}
/**
 * One import row checked against the school: who it matches (employee code, then login email, then a name only
 * one person has), what it would set, and what is wrong with it. Blank cells leave existing values alone.
 */
export function planImportRow(r: ImportRow, ctx: { today: string; people: Pick<Employee, 'id' | 'name' | 'email' | 'employeeCode'>[]; departments: string[]; grades: string[] }): ImportPlan {
  const problems: string[] = [], notes: string[] = [];
  const name = text(r.name, 120);
  if (!name) problems.push('No name.');
  const code = text(r.employeeCode, 40), email = text(r.email, 200).toLowerCase();
  const byCode = code ? ctx.people.find(p => p.employeeCode?.toLowerCase() === code.toLowerCase()) : undefined;
  const byEmail = email ? ctx.people.find(p => p.email?.toLowerCase() === email) : undefined;
  const sameName = name ? ctx.people.filter(p => norm(p.name) === norm(name)) : [];
  let match: ImportPlan['match'] = null;
  if (byCode) match = { id: byCode.id, how: 'code' };
  else if (byEmail) match = { id: byEmail.id, how: 'email' };
  else if (email) problems.push(`No login with the email ${email}. Logins are created by Sthara; leave the email blank for staff with no login.`);
  else if (sameName.length === 1) match = { id: sameName[0].id, how: 'name' };
  else if (sameName.length > 1) problems.push(`${sameName.length} people are called ${name}. Add their employee code or login email.`);
  if (byCode && byEmail && byCode.id !== byEmail.id) problems.push('The employee code and the email belong to different people.');

  const core: ImportPlan['core'] = { name };
  if (r.category) { const c = CATEGORY_WORDS[norm(r.category)]; if (c) core.category = c; else problems.push(`Category "${r.category}" isn't one of teaching, office, support, assistant.`); }
  else if (!match) problems.push('A new person needs a category (teaching, office, support or assistant).');
  if (r.designation) core.designation = text(r.designation, 80);
  if (r.employment) { const e = norm(r.employment) as Employment; if (EMPLOYMENTS.includes(e)) core.employment = e; else problems.push(`Employment "${r.employment}" isn't permanent, contract or visiting.`); }
  const date = (v: string | undefined, label: string) => { const d = looseDay(v); if (d === null) problems.push(`${label} "${v}" isn't a date. Use 2022-06-01 or 01/06/2022.`); return d || undefined; };
  const joined = date(r.joinedOn, 'Joined on');
  if (joined && joined > ctx.today) problems.push('The joining date is in the future. Add future joiners with the hire form.'); else if (joined) core.joinedOn = joined;
  const to = date(r.contractTo, 'Contract to');
  if (to) core.contractTo = to;
  if (core.employment && core.employment !== 'permanent' && !to && !match) problems.push(`A ${core.employment} member of staff needs a contract end date.`);
  if (r.phone) { const p = toE164(r.phone); if (p) core.phone = p; else problems.push(`Mobile "${r.phone}" doesn't look right.`); }
  if (code && !byCode) core.employeeCode = code;
  if (r.department) { core.department = text(r.department, 80); if (!ctx.departments.some(d => norm(d) === norm(core.department!))) notes.push(`New department: ${core.department}`); }
  if (r.grade) { core.grade = text(r.grade, 60); if (!ctx.grades.some(g => norm(g) === norm(core.grade!))) notes.push(`New grade: ${core.grade}`); }
  if (r.reportsTo) core.reportsTo = text(r.reportsTo, 120);

  const has = (...ks: string[]) => ks.some(k => r[k]?.trim());
  let profile: ProfileRow | null = null, statutory: StatutoryRow | null = null;
  if (has('dateOfBirth', 'gender', 'bloodGroup', 'kinName', 'address', 'city', 'state', 'pincode', 'emergencyName', 'emergencyRelation', 'emergencyPhone')) {
    const dob = date(r.dateOfBirth, 'Date of birth');
    const c = cleanProfile({ ...r, dateOfBirth: dob }, ctx.today);
    if ('error' in c) problems.push(c.error); else profile = c.row;
  }
  if (has('pan', 'uan', 'esiNo', 'aadhaarLast4', 'bankAccount', 'bankIfsc', 'bankName', 'bankHolder', 'nomineeName', 'nomineeRelation')) {
    const c = cleanStatutory(r);
    if ('error' in c) problems.push(c.error); else statutory = c.row;
  }
  return { line: r.line, name, match, core, profile, statutory, problems, notes };
}

/** Problems that only show across rows: the same person or the same new code twice. */
export function crossRowProblems(plans: ImportPlan[]): void {
  const seen = new Map<string, string>();
  for (const p of plans) {
    for (const k of [p.match ? `id:${p.match.id}` : '', p.core.employeeCode ? `code:${p.core.employeeCode.toLowerCase()}` : ''].filter(Boolean)) {
      const first = seen.get(k);
      if (first) p.problems.push(k.startsWith('id:') ? `This is the same person as row ${first}.` : `Row ${first} uses the same employee code.`);
      else seen.set(k, p.line);
    }
  }
}
