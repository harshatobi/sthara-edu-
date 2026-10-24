import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { pageAll } from '@/lib/ops/page';
import { loadCardSettings } from '@/lib/exams/server';
import { currentSession, gradeLabel, OUTCOME_LABEL, sessionSettings, sessionStartDay, type Outcome } from '@/lib/students/register';
import { setStudentLeft } from '@/lib/students/server';
import {
  BUILT_IN, DEFAULT_BODY, DEFAULT_PREFIX, KIND_TITLE, TC_KEYS, TC_REQUIRED, checkPrefix, classFiguresWords, dateWords, dmy, duesMayBlock,
  financialYear, pronouns, renderBody, unknownPlaceholders, type CertKind, type CertStatus,
} from './certs';
import { certificatePdf, type CertPdf } from './pdf';
import { tcFields } from '@/lib/cocurricular/server';

/**
 * Certificates out (brief 05), server side. The caller has been authorised: it passes the school and what the person
 * may do. The registrar prepares (certificates.prepare); the principal approves, cancels and issues duplicates
 * (certificates.approve); the school admin or principal sets them up (certificates.setup). Issued certificates are a
 * permanent register: the database refuses to change or delete one.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; name: string; schoolId: string }

export const CERT_BUCKET = 'certificates';
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sthara.in').replace(/\/+$/, '');
export const verifyUrl = (token: string) => `${SITE}/verify/${token}`;

export interface CertType { id: string; kind: CertKind; title: string; body: string | null; prefix: string; needs_approval: boolean; active: boolean }
const TCOLS = 'id, kind, title, body, prefix, needs_approval, active';
const CCOLS = 'id, student_id, type_id, status, serial, number, copy_no, duplicate_of, data, issued_on, dues, dues_override, prepared_by, submitted_at, returned_note, approved_by, approved_at, cancelled_by, cancelled_at, cancel_reason, verify_token, pdf_path, source, portal_ref, created_at, updated_at';
export interface Cert {
  id: string; student_id: string; type_id: string; status: CertStatus; serial: number | null; number: string | null; copy_no: number; duplicate_of: string | null;
  data: Record<string, any>; issued_on: string | null; dues: number | null; dues_override: string | null; prepared_by: string | null; submitted_at: string | null;
  returned_note: string | null; approved_by: string | null; approved_at: string | null; cancelled_by: string | null; cancelled_at: string | null; cancel_reason: string | null;
  verify_token: string; pdf_path: string | null; source: 'sthara' | 'portal' | 'import'; portal_ref: string | null; created_at: string; updated_at: string;
}

async function audit(db: Db, a: Actor, action: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action, table_name: 'certificates', row_id: rowId, school_id: a.schoolId, new_values: values });
  if (error) console.warn('[certificates audit]', error.message);
}

// ── Setup ───────────────────────────────────────────────────────────────────

/** The school's kinds; the four built-in ones are made the first time they are needed. */
export async function types(db: Db, schoolId: string): Promise<CertType[]> {
  const { data, error } = await db.from('certificate_types').select(TCOLS).eq('school_id', schoolId).order('created_at').limit(200);
  if (error) throw new Error(error.message);
  const have = new Set((data || []).map(t => t.kind));
  const missing = BUILT_IN.filter(k => !have.has(k));
  if (!missing.length) return data as CertType[];
  // One insert per kind: the (school_id, kind) index is partial, so ON CONFLICT can't name it, and a duplicate
  // just means another request created that kind first.
  for (const k of missing) {
    const { error: ins } = await db.from('certificate_types').insert({
      school_id: schoolId, kind: k, title: KIND_TITLE[k], prefix: DEFAULT_PREFIX[k], body: k === 'bonafide' || k === 'character' ? DEFAULT_BODY[k] : null, needs_approval: true,
    });
    if (ins && ins.code !== '23505') throw new Error(ins.message);
  }
  const again = await db.from('certificate_types').select(TCOLS).eq('school_id', schoolId).order('created_at').limit(200);
  return (again.data || []) as CertType[];
}

export interface CertSettings { tcMode: 'sthara' | 'portal'; udiseCode: string | null; principalName: string | null; signature: string | null; stamp: string | null }
export async function settings(db: Db, schoolId: string): Promise<CertSettings> {
  const { data } = await db.from('certificate_settings').select('tc_mode, udise_code, principal_name, signature, stamp').eq('school_id', schoolId).maybeSingle();
  return { tcMode: data?.tc_mode === 'portal' ? 'portal' : 'sthara', udiseCode: data?.udise_code ?? null, principalName: data?.principal_name ?? null, signature: data?.signature ?? null, stamp: data?.stamp ?? null };
}

const IMG = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export async function saveSettings(db: Db, a: Actor, b: Record<string, unknown>): Promise<Result> {
  const row: Record<string, unknown> = { school_id: a.schoolId, updated_by: a.id };
  if (b.tcMode !== undefined) { if (b.tcMode !== 'sthara' && b.tcMode !== 'portal') return fail('Pick how TCs are made.'); row.tc_mode = b.tcMode; }
  if (b.udiseCode !== undefined) {
    const u = typeof b.udiseCode === 'string' ? b.udiseCode.trim() : '';
    if (u && !/^\d{11}$/.test(u)) return fail('A UDISE code has 11 digits.');
    row.udise_code = u || null;
  }
  if (b.principalName !== undefined) row.principal_name = typeof b.principalName === 'string' ? b.principalName.trim().slice(0, 120) || null : null;
  for (const k of ['signature', 'stamp'] as const) {
    if (b[k] === undefined) continue;
    if (b[k] === null) { row[k] = null; continue; }
    if (typeof b[k] !== 'string' || !IMG.test(b[k] as string) || (b[k] as string).length > 400000) return fail(`The ${k} must be a PNG or JPEG under 300 KB.`);
    row[k] = b[k];
  }
  const { error } = await db.from('certificate_settings').upsert(row, { onConflict: 'school_id' });
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** Saves a kind: the prefix, wording and approval of a built-in one, or the school's own certificate. */
export async function saveType(db: Db, a: Actor, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const all = await types(db, a.schoolId);
  const cur = typeof b.id === 'string' ? all.find(t => t.id === b.id) : null;
  if (b.id && !cur) return fail('That certificate isn’t set up here.', 404);
  const kind: CertKind = cur?.kind ?? 'custom';
  const p = checkPrefix(b.prefix ?? cur?.prefix);
  if ('error' in p) return fail(p.error);
  if (all.some(t => t.prefix === p.value && t.id !== cur?.id)) return fail(`Another certificate already uses the prefix ${p.value}.`);
  const title = kind === 'custom' ? (typeof b.title === 'string' ? b.title.trim().replace(/\s+/g, ' ') : cur?.title ?? '') : KIND_TITLE[kind];
  if (!title || title.length > 80) return fail('Give the certificate a title, up to 80 characters.');
  let body: string | null = cur?.body ?? null;
  if (kind !== 'tc' && b.body !== undefined) {
    body = typeof b.body === 'string' ? b.body.trim() : '';
    if (!body || body.length > 4000) return fail('Write the wording, up to 4,000 characters.');
    const bad = unknownPlaceholders(body);
    if (bad.length) return fail(`Sthara doesn’t know ${bad.map(x => `{${x}}`).join(', ')}. Use the fields listed.`);
  }
  if (kind === 'custom' && !body) return fail('Write the wording.');
  const needs = kind === 'tc' ? true : typeof b.needsApproval === 'boolean' ? b.needsApproval : cur?.needs_approval ?? true;
  const row = { title, body: kind === 'tc' || kind === 'fee_paid' ? null : body, prefix: p.value, needs_approval: needs, active: typeof b.active === 'boolean' && kind === 'custom' ? b.active : cur?.active ?? true };
  if (cur) {
    const { error } = await db.from('certificate_types').update(row).eq('id', cur.id);
    return error ? fail('Could not save.', 500) : { ok: true, id: cur.id };
  }
  const { data, error } = await db.from('certificate_types').insert({ ...row, school_id: a.schoolId, kind: 'custom', created_by: a.id }).select('id').single();
  return error || !data ? fail('Could not save.', 500) : { ok: true, id: data.id };
}

// ── What a certificate says, from the record ────────────────────────────────

interface StudentRow {
  id: string; user_id: string | null; status: string; admission_no: string; full_name: string; gender: string | null; date_of_birth: string | null;
  indian_national: boolean | null; social_category: string | null; admitted_on: string | null; admitted_grade: number | null; pen: string | null;
  apaar_id: string | null; left_on: string | null; leaving_reason: string | null;
}
const SCOLS = 'id, user_id, status, admission_no, full_name, gender, date_of_birth, indian_national, social_category, admitted_on, admitted_grade, pen, apaar_id, left_on, leaving_reason';

async function studentOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('students').select(SCOLS).eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data as StudentRow | null;
}

/** Unpaid dues today (instalments already due), and the instalment up to which everything is paid. */
export async function duesOf(db: Db, schoolId: string, userId: string | null) {
  if (!userId) return { outstanding: 0, paidUpto: '', concessions: [] as string[] };
  const [inv, pay] = await Promise.all([
    pageAll<any>((f, t) => db.from('fee_invoices').select('id, label, due_on, amount, concession, concession_reason').eq('school_id', schoolId).eq('student_id', userId).is('voided_at', null).order('due_on').order('id').range(f, t), 5_000),
    pageAll<any>((f, t) => db.from('fee_payments').select('invoice_id, amount').eq('school_id', schoolId).eq('student_id', userId).is('voided_at', null).order('id').range(f, t), 20_000),
  ]);
  if (inv.error || pay.error) throw new Error((inv.error || pay.error)!.message);
  const paid = new Map<string, number>();
  for (const p of pay.data) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount));
  const today = isoDay();
  let outstanding = 0, paidUpto = '', gap = false;
  for (const i of inv.data) {
    const left = Math.max(0, Number(i.amount) - Number(i.concession) - (paid.get(i.id) ?? 0));
    if (i.due_on <= today) outstanding += left;
    if (left > 0.004) gap = true;
    else if (!gap) paidUpto = `${i.label} (due ${new Date(`${i.due_on}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })})`;
  }
  const concessions = inv.data.filter(i => Number(i.concession) > 0).map(i => `${i.label}: ₹${Number(i.concession).toLocaleString('en-IN')} (${i.concession_reason})`);
  return { outstanding: Math.round(outstanding * 100) / 100, paidUpto, concessions };
}

async function family(db: Db, studentId: string) {
  const { data } = await db.from('family_members').select('relation, name, is_primary').eq('student_id', studentId).limit(30);
  const of = (r: string) => (data || []).find(f => f.relation === r)?.name ?? '';
  return { mother: of('mother'), father: of('father') || of('guardian') || (data || []).find(f => f.relation !== 'mother')?.name || '' };
}

async function enrolmentsOf(db: Db, studentId: string) {
  const { data } = await db.from('enrolments').select('session, grade, section, class_name, class_id, outcome, starts_on, ends_on').eq('student_id', studentId).order('starts_on', { ascending: false }).limit(60);
  return (data || []) as { session: string; grade: number | null; section: string | null; class_name: string | null; class_id: string | null; outcome: Outcome | null; starts_on: string; ends_on: string | null }[];
}

/** Everything a certificate can say about the student, as printed strings. */
async function facts(db: Db, schoolId: string, st: StudentRow) {
  const [fam, en, schoolQ, set, brand] = await Promise.all([
    family(db, st.id), enrolmentsOf(db, st.id), db.from('schools').select('name, settings').eq('id', schoolId).maybeSingle(), settings(db, schoolId), loadCardSettings(db, schoolId),
  ]);
  const cur = en.find(e => !e.ends_on) ?? en[0] ?? null;
  const session = currentSession(schoolQ.data?.settings);
  const p = pronouns(st.gender);
  return {
    en, cur, session, set, brand, schoolName: (schoolQ.data?.name as string) || 'the school', startMonth: sessionSettings(schoolQ.data?.settings).startMonth,
    values: {
      student_name: st.full_name, admission_no: st.admission_no, father_name: fam.father, mother_name: fam.mother, ...p,
      class: cur ? cur.class_name ?? gradeLabel(cur.grade) : '', session: cur?.session ?? session, date_of_birth: dmy(st.date_of_birth),
      date_of_birth_words: dateWords(st.date_of_birth), admitted_on: dmy(st.admitted_on), school_name: (schoolQ.data?.name as string) || '', today: dmy(isoDay()),
    } as Record<string, string>,
  };
}

/** The TC's values from the record. What Sthara can't know is left blank for the registrar. */
async function tcValues(db: Db, schoolId: string, st: StudentRow, f: Awaited<ReturnType<typeof facts>>) {
  const { cur, en } = f;
  const done = en.find(e => e.outcome) ?? null;
  const from = sessionStartDay(cur?.session ?? f.session, f.startMonth), to = st.left_on ?? isoDay();
  const [subjects, att, dues] = await Promise.all([
    cur?.class_id ? db.from('class_subjects').select('subject_name').eq('class_id', cur.class_id).order('subject_name').limit(40) : Promise.resolve({ data: [] as { subject_name: string }[] }),
    st.user_id ? Promise.all([
      db.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', st.user_id).gte('day', from).lte('day', to),
      db.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', st.user_id).gte('day', from).lte('day', to).in('status', ['present', 'late']),
    ]) : Promise.resolve(null),
    duesOf(db, schoolId, st.user_id),
  ]);
  // Fields 16 and 17 from approved co-curricular records (brief 06); the registrar can still edit them.
  const cc = await tcFields(db, schoolId, st.id);
  const failedTimes = cur?.grade == null ? 0 : en.filter(e => e.grade === cur.grade && e.outcome === 'detained').length;
  const promoted = done && (done.outcome === 'promoted' || done.outcome === 'promoted_no_exam') && done.grade != null;
  const v: Record<string, string> = {
    book_no: '', admission_no: st.admission_no, affiliation_no: f.brand.affiliation ?? '', udise_code: f.set.udiseCode ?? '', pen: st.pen ?? '', apaar_id: st.apaar_id ?? '',
    pupil_name: st.full_name, mother_name: f.values.mother_name, father_name: f.values.father_name,
    nationality: st.indian_national === false ? '' : 'Indian',
    sc_st: st.social_category === 'sc' ? 'Yes, Scheduled Caste' : st.social_category === 'st' ? 'Yes, Scheduled Tribe' : st.social_category ? 'No' : '',
    first_admission: [dmy(st.admitted_on), st.admitted_grade != null ? gradeLabel(st.admitted_grade) : ''].filter(Boolean).join(', '),
    dob: st.date_of_birth ? `${dmy(st.date_of_birth)} (${dateWords(st.date_of_birth)})` : '',
    last_class: classFiguresWords(cur?.grade),
    last_exam: done ? `School annual examination ${done.session}: ${done.outcome === 'detained' ? 'Failed' : done.outcome && ['promoted', 'promoted_no_exam'].includes(done.outcome) ? 'Passed' : OUTCOME_LABEL[done.outcome!]}` : '',
    failed: failedTimes === 0 ? 'No' : failedTimes === 1 ? 'Once' : 'Twice',
    subjects: (subjects.data || []).map(s => s.subject_name).join(', '),
    promotion: promoted ? `Yes, to Class ${classFiguresWords(done!.grade! + 1)}` : done?.outcome === 'detained' ? 'No' : '',
    dues_paid_upto: dues.paidUpto, concession: dues.concessions.join('; ') || 'No',
    working_days: att ? String(att[0].count ?? 0) : '', days_present: att ? String(att[1].count ?? 0) : '',
    ncc: cc.ncc || 'No', activities: cc.activities, conduct: '', applied_on: dmy(isoDay()), issued_on: '', reason: st.leaving_reason ?? '', remarks: '',
    leaving_on: st.left_on ?? isoDay(),
  };
  return { v, dues: dues.outstanding };
}

async function feeRows(db: Db, schoolId: string, userId: string | null, fyStart: number) {
  const fy = financialYear(fyStart);
  if (!userId) return { fy, rows: [] as { date: string; receipt: string; label: string; amount: number }[], total: 0 };
  const { data, error } = await pageAll<any>((f, t) => db.from('fee_payments').select('paid_on, receipt_no, amount, fee_invoices!inner(label)')
    .eq('school_id', schoolId).eq('student_id', userId).is('voided_at', null).gte('paid_on', fy.from).lte('paid_on', fy.to).order('paid_on').order('id').range(f, t), 2_000);
  if (error) throw new Error(error.message);
  const rows = data.map(p => ({ date: p.paid_on as string, receipt: p.receipt_no as string, label: p.fee_invoices.label as string, amount: Number(p.amount) }));
  return { fy, rows, total: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 };
}

// ── The lifecycle ───────────────────────────────────────────────────────────

async function certOf(db: Db, schoolId: string, id: string) {
  const { data } = await db.from('certificates').select(CCOLS).eq('id', id).eq('school_id', schoolId).maybeSingle();
  return data as Cert | null;
}

/** A new draft, filled from the record. Bonafide and similar take the purpose; the fee certificate a financial year. */
export async function prepare(db: Db, a: Actor, studentId: string, b: { typeId?: unknown; purpose?: unknown; conduct?: unknown; fyStart?: unknown }): Promise<Result<{ id: string }>> {
  const st = await studentOf(db, a.schoolId, studentId);
  if (!st) return fail('Student not found.', 404);
  if (st.status === 'cancelled') return fail('This entry is cancelled.', 409);
  const t = (await types(db, a.schoolId)).find(x => x.id === b.typeId && x.active);
  if (!t) return fail('Pick a certificate.');
  if (t.kind === 'tc') {
    const { count } = await db.from('certificates').select('id', { count: 'exact', head: true }).eq('student_id', st.id).eq('type_id', t.id).in('status', ['draft', 'pending', 'issued']).eq('copy_no', 0);
    if (count) return fail('This student already has a TC (drafted or issued). Open it, or cancel it first; a lost one is reissued as a duplicate.', 409);
  }
  const f = await facts(db, a.schoolId, st);
  let data: Record<string, unknown>;
  let dues: number | null = null;
  if (t.kind === 'tc') {
    const tc = await tcValues(db, a.schoolId, st, f);
    data = tc.v; dues = tc.dues;
  } else if (t.kind === 'fee_paid') {
    const y = Number(b.fyStart);
    if (!Number.isInteger(y) || y < 2000 || y > Number(isoDay().slice(0, 4))) return fail('Pick the financial year.');
    const fee = await feeRows(db, a.schoolId, st.user_id, y);
    data = {
      fy: fee.fy.label, rows: fee.rows, total: fee.total,
      body: renderBody('This is to certify that {student_name}, {child_of} {father_name} (admission number {admission_no}), a student of {class}, has paid the following fees to {school_name} in the financial year ' + `${fee.fy.label} (${dmy(fee.fy.from)} to ${dmy(fee.fy.to)}).`, f.values),
    };
  } else {
    const purpose = typeof b.purpose === 'string' ? b.purpose.trim().slice(0, 200) : '';
    const conduct = typeof b.conduct === 'string' ? b.conduct.trim().slice(0, 60) : '';
    data = { purpose, conduct, body: renderBody(t.body ?? '', { ...f.values, purpose, conduct }) };
  }
  const { data: row, error } = await db.from('certificates').insert({ school_id: a.schoolId, student_id: st.id, type_id: t.id, data, dues, prepared_by: a.id }).select('id').single();
  if (error || !row) return fail('Could not start the certificate.', 500);
  return { ok: true, id: row.id };
}

/** The registrar corrects a draft (only the fields the certificate has). */
export async function saveDraft(db: Db, a: Actor, id: string, input: unknown): Promise<Result> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  if (c.status !== 'draft') return fail(c.status === 'pending' ? 'It is with the principal. Ask for it back to change it.' : 'An issued certificate can’t change.', 409);
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const t = (await types(db, a.schoolId)).find(x => x.id === c.type_id)!;
  const keys = t.kind === 'tc' ? TC_KEYS.filter(k => k !== 'issued_on').concat('leaving_on') : ['body', 'purpose', 'conduct'];
  const next = { ...c.data };
  for (const k of keys) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== 'string') return fail('Check the values.');
    const s = (v[k] as string).trim();
    if (s.length > (k === 'body' ? 4000 : 400)) return fail(k === 'body' ? 'The wording is too long.' : 'One of the values is too long.');
    next[k] = s;
  }
  if (t.kind === 'tc' && next.leaving_on && !/^\d{4}-\d{2}-\d{2}$/.test(String(next.leaving_on))) return fail('Check the date of leaving.');
  const { error } = await db.from('certificates').update({ data: next }).eq('id', c.id).eq('status', 'draft');
  return error ? fail('Could not save.', 500) : { ok: true };
}

const missingOf = (kind: CertKind, data: Record<string, any>) =>
  kind === 'tc' ? TC_REQUIRED.filter(k => !String(data[k] ?? '').trim()) : !String(data.body ?? '').trim() || /_{6,}/.test(String(data.body)) ? ['body'] : [];

/** Sends a draft to the principal, or issues it straight away when the kind doesn't need approval. */
export async function submit(db: Db, a: Actor, id: string): Promise<Result<{ issued: boolean }>> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  if (c.status !== 'draft') return fail('Only a draft can be sent.', 409);
  const t = (await types(db, a.schoolId)).find(x => x.id === c.type_id)!;
  const missing = missingOf(t.kind, c.data);
  if (missing.length) return fail(t.kind === 'tc' ? `Fill in: ${missing.join(', ').replace(/_/g, ' ')}.` : 'Fill in the blanks in the wording first.');
  if (!t.needs_approval) {
    const out = await issue(db, a, c, t, null);
    return out.ok ? { ok: true, issued: true } : out;
  }
  const { error } = await db.from('certificates').update({ status: 'pending', submitted_at: new Date().toISOString(), returned_note: null }).eq('id', c.id).eq('status', 'draft');
  return error ? fail('Could not send it.', 500) : { ok: true, issued: false };
}

/** The principal sends a pending certificate back with a note. */
export async function sendBack(db: Db, a: Actor, id: string, note: string): Promise<Result> {
  if (note.trim().length < 3) return fail('Say what to change.');
  const { data, error } = await db.from('certificates').update({ status: 'draft', returned_note: note.trim().slice(0, 300) }).eq('id', id).eq('school_id', a.schoolId).eq('status', 'pending').select('id');
  if (error) return fail('Could not send it back.', 500);
  return data?.length ? { ok: true } : fail('It is no longer waiting for approval.', 409);
}

/** The principal approves: dues checked for a TC (not for Classes 1-8), numbered, frozen, PDF stored; a TC marks the student left. */
export async function approve(db: Db, a: Actor, id: string, override: string): Promise<Result<{ number: string | null }>> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  if (c.status !== 'pending') return fail('Only a certificate waiting for approval can be approved.', 409);
  const t = (await types(db, a.schoolId)).find(x => x.id === c.type_id)!;
  const missing = missingOf(t.kind, c.data);
  if (missing.length) return fail('Some required values are blank. Send it back to the registrar.', 409);
  return issue(db, a, c, t, override);
}

async function issue(db: Db, a: Actor, c: Cert, t: CertType, override: string | null): Promise<Result<{ number: string | null }>> {
  const st = (await studentOf(db, a.schoolId, c.student_id))!;
  let dues: number | null = c.dues;
  let why: string | null = null;
  if (t.kind === 'tc') {
    dues = (await duesOf(db, a.schoolId, st.user_id)).outstanding;
    const grade = (await enrolmentsOf(db, st.id)).find(e => !e.ends_on)?.grade ?? null;
    if (dues > 0 && duesMayBlock(grade)) {
      if ((override ?? '').trim().length < 3) return fail(`₹${dues.toLocaleString('en-IN')} is unpaid. Collect it first, or approve anyway with a reason (recorded).`, 409);
      why = override!.trim().slice(0, 300);
    }
  }
  const set = await settings(db, a.schoolId);
  const issuedOn = isoDay();
  const data = t.kind === 'tc' ? { ...c.data, issued_on: dmy(issuedOn) } : c.data;
  // A state-board TC from the state portal gets its number there; Sthara records it afterwards.
  if (t.kind === 'tc' && set.tcMode === 'portal' && c.copy_no === 0) {
    const { error } = await db.from('certificates').update({ status: 'issued', source: 'portal', data, issued_on: issuedOn, dues, dues_override: why, approved_by: a.id, approved_at: new Date().toISOString() })
      .eq('id', c.id).in('status', ['draft', 'pending']);
    if (error) return fail('Could not approve.', 500);
  } else {
    const { error } = await db.rpc('certificate_issue', { p_cert: c.id, p_school: a.schoolId, p_actor: a.id, p_data: data, p_issued_on: issuedOn, p_dues: dues, p_override: why });
    if (error) return fail(error.code === '55000' ? 'It has already been issued.' : 'Could not issue the certificate.', error.code === '55000' ? 409 : 500);
  }
  await audit(db, a, 'certificate.issued', c.id, { kind: t.kind, dues, override: why });
  if (t.kind === 'tc' && c.copy_no === 0 && st.status === 'active') {
    const left = await setStudentLeft(db, a, st.id, true, { on: String(c.data.leaving_on || issuedOn), reason: `TC issued: ${String(c.data.reason || 'left the school')}`.slice(0, 300) });
    if (!left.ok) console.warn('[certificates] TC issued, but marking left failed:', left.error);
  }
  const fresh = (await certOf(db, a.schoolId, c.id))!;
  if (fresh.source !== 'portal') await storePdf(db, a.schoolId, fresh).catch(e => console.warn('[certificates] pdf', e instanceof Error ? e.message : e));
  return { ok: true, number: fresh.number };
}

/** Cancels an issued certificate (it stays on the register, marked CANCELLED), or throws away a draft. */
export async function cancel(db: Db, a: Actor, id: string, reason: string): Promise<Result> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  if (c.status === 'cancelled') return fail('Already cancelled.', 409);
  if (c.status === 'draft' || c.status === 'pending') {
    const { error } = await db.from('certificates').delete().eq('id', c.id).in('status', ['draft', 'pending']);
    return error ? fail('Could not discard it.', 500) : { ok: true };
  }
  if (reason.trim().length < 3) return fail('Say why it is being cancelled.');
  const { error } = await db.from('certificates').update({ status: 'cancelled', cancel_reason: reason.trim().slice(0, 300), cancelled_by: a.id, cancelled_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'issued');
  if (error) return fail('Could not cancel it.', 500);
  await audit(db, a, 'certificate.cancelled', c.id, { number: c.number, reason: reason.trim().slice(0, 300) });
  if (c.source !== 'portal') await storePdf(db, a.schoolId, { ...c, status: 'cancelled' }).catch(() => undefined);
  return { ok: true };
}

/** A lost certificate: a new draft marked DUPLICATE that keeps the original's number once approved. */
export async function duplicate(db: Db, a: Actor, id: string): Promise<Result<{ id: string }>> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  if (c.status !== 'issued' || !c.number) return fail('Only an issued certificate with a number can be reissued as a duplicate.', 409);
  const original = c.duplicate_of ?? c.id;
  const { data: copies } = await db.from('certificates').select('copy_no, status').or(`id.eq.${original},duplicate_of.eq.${original}`).limit(30);
  if ((copies || []).some(x => x.copy_no > 0 && (x.status === 'draft' || x.status === 'pending'))) return fail('A duplicate is already being prepared.', 409);
  const copyNo = Math.max(0, ...(copies || []).map(x => x.copy_no)) + 1;
  const { issued_on: _drop, ...rest } = c.data;
  void _drop;
  const { data, error } = await db.from('certificates').insert({ school_id: a.schoolId, student_id: c.student_id, type_id: c.type_id, copy_no: copyNo, duplicate_of: original, data: rest, prepared_by: a.id }).select('id').single();
  return error || !data ? fail('Could not start the duplicate.', 500) : { ok: true, id: data.id };
}

/** A state-board TC made on the portal: its number there, and the PDF the portal gave. */
export async function recordPortal(db: Db, a: Actor, id: string, b: { ref?: unknown; path?: unknown }): Promise<Result> {
  const c = await certOf(db, a.schoolId, id);
  if (!c || c.source !== 'portal' || c.status !== 'issued') return fail('Only an approved TC waiting for the portal can take its number.', 404);
  const ref = typeof b.ref === 'string' ? b.ref.trim() : '';
  if (!ref || ref.length > 60) return fail('Give the TC number from the portal.');
  const path = typeof b.path === 'string' ? b.path : null;
  if (path && !path.startsWith(`${a.schoolId}/portal/${c.id}/`)) return fail('That upload isn’t for this certificate.');
  const { error } = await db.from('certificates').update({ portal_ref: ref, ...(path ? { pdf_path: path } : {}) }).eq('id', c.id);
  if (error) return fail('Could not save.', 500);
  await audit(db, a, 'certificate.portal_recorded', c.id, { ref });
  return { ok: true };
}

export async function portalUploadUrl(db: Db, a: Actor, id: string, ext: string): Promise<Result<{ url: string; path: string }>> {
  const c = await certOf(db, a.schoolId, id);
  if (!c || c.source !== 'portal') return fail('Certificate not found.', 404);
  if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) return fail('Upload the portal’s PDF (or a photo of the TC).');
  const path = `${a.schoolId}/portal/${c.id}/${Date.now()}.${ext}`;
  const up = await db.storage.from(CERT_BUCKET).createSignedUploadUrl(path);
  return up.error || !up.data ? fail('Could not prepare the upload.', 500) : { ok: true, url: up.data.signedUrl, path };
}

// ── PDFs ────────────────────────────────────────────────────────────────────

async function pdfOf(db: Db, schoolId: string, c: Cert) {
  const [t, set, brand, school] = await Promise.all([
    types(db, schoolId).then(ts => ts.find(x => x.id === c.type_id)!), settings(db, schoolId), loadCardSettings(db, schoolId),
    db.from('schools').select('name').eq('id', schoolId).maybeSingle(),
  ]);
  const doc: CertPdf = {
    school: { name: (school.data?.name as string) || 'School', address: brand.address, affiliation: brand.affiliation, logo: brand.logo, udise: set.udiseCode },
    kind: t.kind, title: t.title, number: c.number, issuedOn: c.issued_on, state: c.status === 'cancelled' ? 'cancelled' : c.status === 'issued' ? 'issued' : 'draft',
    duplicate: c.copy_no > 0, signature: c.status === 'issued' || c.status === 'cancelled' ? set.signature : null, stamp: c.status === 'issued' || c.status === 'cancelled' ? set.stamp : null,
    principalName: set.principalName, verifyUrl: c.status === 'issued' || c.status === 'cancelled' ? verifyUrl(c.verify_token) : null,
    ...(t.kind === 'tc' ? { tc: Object.fromEntries(Object.entries(c.data).map(([k, v]) => [k, String(v ?? '')])) } : { body: String(c.data.body ?? '') }),
    ...(t.kind === 'fee_paid' ? { fee: { rows: (c.data.rows as any[]) ?? [], total: Number(c.data.total ?? 0) } } : {}),
  };
  return certificatePdf(doc);
}

async function storePdf(db: Db, schoolId: string, c: Cert) {
  const { bytes } = await pdfOf(db, schoolId, c);
  const path = `${schoolId}/issued/${c.id}.pdf`;
  const up = await db.storage.from(CERT_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(up.error.message);
  if (c.pdf_path !== path) await db.from('certificates').update({ pdf_path: path }).eq('id', c.id);
  return path;
}

/** A two-minute link to the PDF: the stored one once issued (made now if missing), a fresh DRAFT preview before. */
export async function pdfLink(db: Db, a: Actor, id: string): Promise<Result<{ url: string; dropped: string[] }>> {
  const c = await certOf(db, a.schoolId, id);
  if (!c) return fail('Certificate not found.', 404);
  let path = c.pdf_path, dropped: string[] = [];
  if (c.status === 'draft' || c.status === 'pending') {
    const out = await pdfOf(db, a.schoolId, c);
    dropped = out.dropped;
    path = `${a.schoolId}/drafts/${c.id}.pdf`;
    const up = await db.storage.from(CERT_BUCKET).upload(path, out.bytes, { contentType: 'application/pdf', upsert: true });
    if (up.error) return fail('Could not make the preview.', 500);
  } else if (!path) {
    if (c.source === 'portal') return fail('Upload the portal’s TC first.', 409);
    path = await storePdf(db, a.schoolId, c);
  }
  const signed = await db.storage.from(CERT_BUCKET).createSignedUrl(path!, 120);
  if (signed.error || !signed.data?.signedUrl) return fail('Could not open the certificate.', 500);
  await audit(db, a, 'certificate.viewed', c.id, { number: c.number });
  return { ok: true, url: signed.data.signedUrl, dropped };
}

// ── Reading ─────────────────────────────────────────────────────────────────

async function names(db: Db, ids: (string | null)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await db.from('users').select('id, name').in('id', want).limit(want.length);
  return new Map((data || []).map(u => [u.id as string, (u.name as string) || 'Someone']));
}

/** The register: every certificate of the school (or one student), newest first, with who prepared and approved it. */
export async function register(db: Db, schoolId: string, q: { studentId?: string; status?: string; search?: string } = {}) {
  let query = db.from('certificates').select(`${CCOLS}, students!inner(full_name, admission_no)`).eq('school_id', schoolId);
  if (q.studentId) query = query.eq('student_id', q.studentId);
  if (q.status && ['draft', 'pending', 'issued', 'cancelled'].includes(q.status)) query = query.eq('status', q.status);
  const { data, error } = await pageAll<any>((f, t) => query.order('created_at', { ascending: false }).order('id').range(f, t), 20_000);
  if (error) throw new Error(error.message);
  const ts = new Map((await types(db, schoolId)).map(t => [t.id, t]));
  const who = await names(db, data.flatMap(c => [c.prepared_by, c.approved_by]));
  const s = (q.search ?? '').trim().toLowerCase();
  return data.filter(c => !s || [c.number, c.portal_ref, c.students.full_name, c.students.admission_no].some(x => String(x ?? '').toLowerCase().includes(s))).map(c => ({
    id: c.id as string, studentId: c.student_id as string, student: c.students.full_name as string, admissionNo: c.students.admission_no as string,
    kind: ts.get(c.type_id)?.kind ?? 'custom', title: ts.get(c.type_id)?.title ?? 'Certificate', status: c.status as CertStatus, number: c.number as string | null,
    copyNo: c.copy_no as number, issuedOn: c.issued_on as string | null, source: c.source as string, portalRef: c.portal_ref as string | null,
    hasPdf: !!c.pdf_path, preparedBy: c.prepared_by ? who.get(c.prepared_by) ?? null : null, approvedBy: c.approved_by ? who.get(c.approved_by) ?? null : null,
    returnedNote: c.returned_note as string | null, cancelReason: c.cancel_reason as string | null, dues: c.dues == null ? null : Number(c.dues), createdAt: c.created_at as string,
  }));
}

/** One certificate with its values, for the preparing screen. */
export async function one(db: Db, schoolId: string, id: string) {
  const c = await certOf(db, schoolId, id);
  if (!c) return null;
  const t = (await types(db, schoolId)).find(x => x.id === c.type_id)!;
  const st = (await studentOf(db, schoolId, c.student_id))!;
  const grade = (await enrolmentsOf(db, st.id)).find(e => !e.ends_on)?.grade ?? null;
  const dues = t.kind === 'tc' && (c.status === 'draft' || c.status === 'pending') ? (await duesOf(db, schoolId, st.user_id)).outstanding : c.dues;
  const set = await settings(db, schoolId);
  return { cert: c, type: t, student: { id: st.id, name: st.full_name, admissionNo: st.admission_no, status: st.status }, dues, duesBlock: duesMayBlock(grade), tcMode: set.tcMode, missing: missingOf(t.kind, c.data) };
}

/** The public check behind the QR: no date of birth, parents, Aadhaar or marks (brief 05). */
export async function verify(db: Db, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const { data } = await db.from('certificates').select('number, copy_no, issued_on, status, portal_ref, school_id, type_id, students!inner(full_name)').eq('verify_token', token).in('status', ['issued', 'cancelled']).maybeSingle();
  if (!data) return null;
  const [school, t] = await Promise.all([db.from('schools').select('name').eq('id', data.school_id).maybeSingle(), db.from('certificate_types').select('title').eq('id', data.type_id).maybeSingle()]);
  const s: any = Array.isArray(data.students) ? data.students[0] : data.students;
  return { school: (school.data?.name as string) ?? '', title: (t.data?.title as string) ?? 'Certificate', number: (data.number ?? data.portal_ref) as string | null,
    duplicate: data.copy_no > 0, student: s.full_name as string, issuedOn: data.issued_on as string | null, valid: data.status === 'issued' };
}
