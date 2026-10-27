import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { normClass } from '@/lib/ops/people';
import { setLeft } from '@/lib/ops/support';
import { maskAadhaar, openAadhaar, parseAadhaar, piiReady, sealAadhaar } from './pii';
import {
  admissionFormat, checkAdmissionNo, checkFields, currentSession, nextSessionOf, rollRuleOf, ROLL_RULES, sessionSettings,
  type Outcome, type RollRule,
} from './register';
import { checklistOf } from './documents';
import { blocked, classProgress, isOutcome, stageOf, type ChainRow, type Step } from './outcomes';
import { familyOf } from './family';
import { checkAddress, checkFamily } from './register';
import { formOf } from '@/lib/admin/application';
import { moveDocsToStudent } from '@/lib/admin/applicationServer';

/**
 * The register, enrolment and the year-end chain on the server. Callers have been authorised already and pass the
 * school from that check, never from the request. Every write is scoped to that school.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; name: string; schoolId: string }

/** Every register column except the Aadhaar ciphertext and hash. */
const COLS = 'id, school_id, user_id, admission_no, status, full_name, aadhaar_name, gender, date_of_birth, photo_path, pen, apaar_id, aadhaar_last4, no_aadhaar, cbse_reg_no, board_roll_no, admitted_on, admitted_grade, previous_school, previous_status, previous_class, previous_tc_no, rte_seat, rte_amount, medium, indian_national, left_on, leaving_reason, cancelled_at, cancel_reason, applicant_id, mother_tongue, social_category, religion, minority, bpl, aay, ews, family_income, address, permanent_address, permanent_same, distance_km, family_code, created_at, updated_at';
const ECOLS = 'id, student_id, session, grade, section, class_id, class_name, roll_no, stream, languages, vocational, facilities, starts_on, ends_on, end_reason, proposed_outcome, proposed_note, proposed_by, proposed_at, approved_by, approved_at, returned_note, outcome, finalised_by, finalised_at, published_at, created_at';
const PHOTOS = 'student-photos';

async function audit(db: Db, a: Actor, action: string, rowId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action, table_name: 'students', row_id: rowId, school_id: a.schoolId, new_values: values });
  if (error) console.warn('[students audit]', error.message);
}

export async function schoolSettings(db: Db, schoolId: string): Promise<Record<string, unknown>> {
  const { data } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  return (data?.settings as Record<string, unknown>) || {};
}

const dbError = (e: { message: string; code?: string } | null, fallback: string) => {
  if (!e) return fail(fallback, 500);
  if (e.code === '23505') {
    if (/admission_no/.test(e.message)) return fail('That admission number is already on the register (numbers are never reused, even cancelled ones).', 409);
    if (/aadhaar/.test(e.message)) return fail('That Aadhaar number is already on another student at this school.', 409);
    return fail('That would duplicate another entry.', 409);
  }
  if (['22023', 'P0002', '23514'].includes(e.code ?? '')) return fail(e.message, e.code === 'P0002' ? 404 : 400);
  return fail(fallback, 500);
};

// ── The register ────────────────────────────────────────────────────────────

export interface ListRow {
  id: string; admissionNo: string; name: string; status: string; gender: string | null; dob: string | null; hasLogin: boolean;
  className: string | null; grade: number | null; section: string | null; rollNo: string | null; pen: boolean; apaar: boolean; aadhaar: boolean;
}

/** The register with each student's class in the current session, filtered and paged in memory. */
export async function listRegister(db: Db, schoolId: string, q: { search?: string; cls?: string; status?: string; page?: number; size?: number }) {
  const settings = await schoolSettings(db, schoolId);
  const session = currentSession(settings);
  const [st, en, cl] = await Promise.all([
    pageAll<any>((f, t) => db.from('students').select('id, admission_no, full_name, status, gender, date_of_birth, user_id, pen, apaar_id, aadhaar_last4, no_aadhaar')
      .eq('school_id', schoolId).order('id').range(f, t), 100_000),
    pageAll<any>((f, t) => db.from('enrolments').select('student_id, class_name, grade, section, roll_no, starts_on')
      .eq('school_id', schoolId).eq('session', session).order('id').range(f, t), 200_000),
    db.from('classes').select('name').eq('school_id', schoolId).order('name'),
  ]);
  if (st.error || en.error) throw new Error((st.error || en.error)!.message);
  const cur = new Map<string, any>();
  for (const e of en.data) { const p = cur.get(e.student_id); if (!p || e.starts_on > p.starts_on) cur.set(e.student_id, e); }
  let rows: ListRow[] = st.data.map(s => {
    const e = cur.get(s.id);
    return {
      id: s.id, admissionNo: s.admission_no, name: s.full_name, status: s.status, gender: s.gender, dob: s.date_of_birth, hasLogin: !!s.user_id,
      className: e?.class_name ?? null, grade: e?.grade ?? null, section: e?.section ?? null, rollNo: e?.roll_no ?? null,
      pen: !!s.pen, apaar: !!s.apaar_id, aadhaar: !!s.aadhaar_last4 || s.no_aadhaar,
    };
  });
  const status = q.status || 'active';
  if (status !== 'all') rows = rows.filter(r => r.status === status);
  if (q.cls) rows = rows.filter(r => normClass(r.className ?? '') === normClass(q.cls!));
  if (q.search) {
    const t = q.search.trim().toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(t) || r.admissionNo.toLowerCase().includes(t));
  }
  rows.sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.section ?? '').localeCompare(b.section ?? '')
    || (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || a.name.localeCompare(b.name));
  const size = Math.min(Math.max(q.size ?? 100, 20), 500), page = Math.max(q.page ?? 1, 1);
  const counts = {
    active: st.data.filter(s => s.status === 'active').length, left: st.data.filter(s => s.status === 'left').length,
    cancelled: st.data.filter(s => s.status === 'cancelled').length,
    missing: { pen: st.data.filter(s => s.status === 'active' && !s.pen).length, apaar: st.data.filter(s => s.status === 'active' && !s.apaar_id).length,
      aadhaar: st.data.filter(s => s.status === 'active' && !s.aadhaar_last4 && !s.no_aadhaar).length },
  };
  return { session, total: rows.length, page, size, rows: rows.slice((page - 1) * size, page * size), counts, classes: (cl.data || []).map(c => c.name as string) };
}

export async function getRecord(db: Db, schoolId: string, id: string) {
  const { data: s } = await db.from('students').select(COLS).eq('id', id).eq('school_id', schoolId).maybeSingle();
  if (!s) return null;
  const [en, ch, login, cls, fam] = await Promise.all([
    db.from('enrolments').select(ECOLS).eq('student_id', id).order('session', { ascending: false }).order('starts_on', { ascending: false }).limit(60),
    db.from('student_changes').select('id, field, old_value, new_value, reason, changed_by, changed_by_kind, changed_at').eq('student_id', id).order('changed_at', { ascending: false }).limit(200),
    s.user_id ? db.from('users').select('id, email, name').eq('id', s.user_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('classes').select('name').eq('school_id', schoolId).order('name'),
    familyOf(db, schoolId, id),
  ]);
  const people = new Set<string>([...(ch.data || []).map(c => c.changed_by), ...(en.data || []).flatMap(e => [e.proposed_by, e.approved_by, e.finalised_by])].filter(Boolean) as string[]);
  const names = new Map<string, string>();
  if (people.size) {
    const { data } = await byIds<{ id: string; name: string | null }>([...people], (chunk, f, t) => db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
    for (const p of data) names.set(p.id, p.name || 'Staff');
  }
  let photo: string | null = null;
  if (s.photo_path) {
    const { data } = await db.storage.from(PHOTOS).createSignedUrl(s.photo_path, 600);
    photo = data?.signedUrl ?? null;
  }
  return {
    student: { ...s, aadhaar: maskAadhaar(s.aadhaar_last4) },
    photo,
    login: login.data ? { email: (login.data as any).email as string } : null,
    classes: (cls.data || []).map(c => c.name as string).filter(Boolean),
    ...fam,
    enrolments: (en.data || []).map(e => ({ ...e, stage: stageOf(e as ChainRow), proposedBy: names.get(e.proposed_by) ?? null, approvedBy: names.get(e.approved_by) ?? null, finalisedBy: names.get(e.finalised_by) ?? null })),
    changes: (ch.data || []).map(c => ({ ...c, by: c.changed_by ? names.get(c.changed_by) ?? 'Staff' : c.changed_by_kind === 'import' ? 'Bulk import' : 'Sthara' })),
  };
}

/** The Aadhaar part of a form: a number to seal, "no Aadhaar", or nothing to change. */
function aadhaarPatch(input: { aadhaar?: unknown; noAadhaar?: unknown }): { patch: Record<string, unknown>; masked?: string; error?: string } {
  if (input.noAadhaar === true) return { patch: { no_aadhaar: true, aadhaar_cipher: null, aadhaar_last4: null, aadhaar_hash: null } };
  if (typeof input.aadhaar !== 'string' || !input.aadhaar.trim()) return { patch: input.noAadhaar === false ? { no_aadhaar: false } : {} };
  const a = parseAadhaar(input.aadhaar);
  if (!a.ok) return { patch: {}, error: a.error };
  if (!piiReady()) return { patch: {}, error: 'Aadhaar numbers can’t be stored yet: the encryption key isn’t set up. Ask Sthara support.' };
  const sealed = sealAadhaar(a.digits);
  return { patch: { ...sealed, no_aadhaar: false }, masked: maskAadhaar(sealed.aadhaar_last4)! };
}

/**
 * Admits a student onto the register: number from the form or the next one, the class from today (or the admission
 * date). From an admission application, what the application holds fills every field the office left blank (name,
 * date of birth, class admitted to, the register fields, address), its family becomes the family record, and its
 * documents move to the student record keeping their verification: so the register, and later the transfer
 * certificate, carry what the family gave at admission without anyone typing it twice.
 */
export async function admit(db: Db, a: Actor, input: Record<string, any>): Promise<Result<{ id: string; admissionNo: string; documents?: { moved: number; failed: number } }>> {
  let app: { id: string; name: string; grade: number; date_of_birth: string | null; previous_school: string | null; guardian_name: string | null;
    guardian_phone: string | null; guardian_email: string | null; form: unknown } | null = null;
  if (typeof input.applicantId === 'string') {
    const { data } = await db.from('admission_applicants').select('id, name, grade, date_of_birth, previous_school, guardian_name, guardian_phone, guardian_email, form')
      .eq('id', input.applicantId).eq('school_id', a.schoolId).maybeSingle();
    if (!data) return fail('That applicant isn’t at this school.', 404);
    app = data;
  }
  const form = app ? formOf(app.form) : null;
  // The application underneath, what the office typed on top (a blank on the form never wipes the application).
  const typed = Object.fromEntries(Object.entries(input.fields || {}).filter(([, v]) => v !== '' && v != null));
  const base = app ? { full_name: app.name, date_of_birth: app.date_of_birth, admitted_grade: app.grade, previous_school: app.previous_school, ...form!.fields } : {};
  const merged = Object.fromEntries(Object.entries({ ...base, ...typed }).filter(([, v]) => v !== '' && v != null));
  // The incoming transfer certificate's number, from the TC uploaded with the application, when nobody typed one.
  if (app && merged.previous_tc_no == null) {
    const { data: tc } = await db.from('admission_documents').select('document_no').eq('applicant_id', app.id).eq('kind', 'transfer_certificate')
      .neq('status', 'rejected').not('document_no', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (tc?.document_no) merged.previous_tc_no = String(tc.document_no).slice(0, 40);
  }
  const { values, errors } = checkFields(merged, { creating: true });
  if (form && input.address === undefined && form.address) {
    values.address = form.address;
    values.permanent_same = form.permanent_same;
    values.permanent_address = form.permanent_same ? null : form.permanent_address;
  }
  const ad = aadhaarPatch(input);
  if (ad.error) errors.aadhaar = ad.error;
  let admissionNo: string | null = null;
  if (input.admissionNo) { const n = checkAdmissionNo(input.admissionNo); if ('error' in n) errors.admission_no = n.error; else admissionNo = n.value; }
  const cls = typeof input.className === 'string' ? input.className.trim() : '';
  if (!cls) errors.class = 'Pick the class the student joins.';
  if (Object.keys(errors).length) return fail(Object.values(errors)[0]);
  const { data: classes } = await db.from('classes').select('name').eq('school_id', a.schoolId);
  const target = (classes || []).find(c => normClass(c.name) === normClass(cls))?.name;
  if (!target) return fail(`Class "${cls}" isn't set up for this school.`);
  if (!admissionNo) {
    const { data, error } = await db.rpc('student_next_admission_no', { p_school: a.schoolId });
    if (error || !data) return fail('Could not issue an admission number.', 500);
    admissionNo = data as string;
  }
  const applicant = app;
  if (applicant) {
    const { count } = await db.from('students').select('id', { count: 'exact', head: true }).eq('applicant_id', applicant.id);
    if (count) return fail('That applicant is already on the register.', 409);
  }
  const { data: row, error } = await db.from('students').insert({
    school_id: a.schoolId, admission_no: admissionNo, ...values, ...ad.patch, applicant_id: applicant?.id ?? null, created_by: a.id,
    admitted_on: values.admitted_on ?? new Date().toISOString().slice(0, 10),
  }).select('id, admission_no').single();
  if (error || !row) return dbError(error, 'Could not add the student.');
  const from = (values.admitted_on as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const mv = await db.rpc('student_move', { p_school: a.schoolId, p_student: row.id, p_class: target, p_from: from, p_reason: null });
  if (mv.error) return dbError(mv.error, 'The student was added, but their class could not be set.');
  // The application's family becomes the family record (its main contact, else the first member, is primary);
  // without one, the guardian from the enquiry is the first contact (the office checked it before saving).
  if (form?.family.length) {
    const primary = Math.max(0, form.family.findIndex(m => m.is_primary));
    const { error: fe } = await db.from('family_members').insert(form.family.map((m, i) => ({ ...m, is_primary: i === primary, school_id: a.schoolId, student_id: row.id, created_by: a.id })));
    if (fe) console.warn('[admit] family not copied:', fe.message);
  } else if (applicant?.guardian_name) {
    const g = checkFamily({ relation: input.guardianRelation || 'guardian', name: applicant.guardian_name, phone: applicant.guardian_phone ?? '', email: applicant.guardian_email ?? '', is_primary: true });
    if (!('error' in g)) await db.from('family_members').insert({ ...g.value, school_id: a.schoolId, student_id: row.id, created_by: a.id });
  }
  const documents = applicant ? await moveDocsToStudent(db, a.id, a.schoolId, applicant.id, row.id) : undefined;
  await audit(db, a, 'student.admitted', row.id, { admissionNo: row.admission_no, class: target, applicant: applicant?.id ?? null, documents: documents ?? null });
  return { ok: true, id: row.id, admissionNo: row.admission_no, documents };
}

/** Applicants marked enrolled who aren't on the register yet: the admission form pre-fills the new record. */
export async function admittable(db: Db, schoolId: string) {
  const { data: apps } = await pageAll<any>((f, t) => db.from('admission_applicants').select('id, name, grade, date_of_birth, previous_school, guardian_name, guardian_phone, guardian_email, session, form')
    .eq('school_id', schoolId).eq('stage', 'enrolled').order('id').range(f, t), 5_000);
  if (!apps.length) return [];
  const { data: done } = await byIds<{ applicant_id: string }>(apps.map(x => x.id), (chunk, f, t) => db.from('students').select('applicant_id').in('applicant_id', chunk).order('applicant_id').range(f, t));
  const on = new Set(done.map(d => d.applicant_id));
  const left = apps.filter(x => !on.has(x.id));
  // What moves across with each: the application's family and its documents (all but rejected ones).
  const { data: docs } = left.length
    ? await byIds<{ applicant_id: string }>(left.map(x => x.id), (chunk, f, t) => db.from('admission_documents').select('applicant_id').in('applicant_id', chunk)
      .is('moved_to', null).neq('status', 'rejected').order('applicant_id').range(f, t))
    : { data: [] as { applicant_id: string }[] };
  const docCount = new Map<string, number>();
  for (const d of docs) docCount.set(d.applicant_id, (docCount.get(d.applicant_id) ?? 0) + 1);
  return left.map(x => {
    const form = formOf(x.form);
    return { id: x.id, name: x.name, grade: x.grade, dob: x.date_of_birth, previousSchool: x.previous_school,
      guardian: x.guardian_name, phone: x.guardian_phone, email: x.guardian_email, session: x.session,
      family: form.family.length, fields: Object.keys(form.fields).length, documents: docCount.get(x.id) ?? 0 };
  });
}

/** Corrects register fields with one reason; every changed field keeps its old value in the history. */
export async function correct(db: Db, a: Actor, id: string, input: Record<string, any>): Promise<Result<{ changed: number }>> {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 3) return fail('Say why this is being corrected.');
  const { values, errors } = checkFields(input.fields || {});
  if (input.admissionNo !== undefined) { const n = checkAdmissionNo(input.admissionNo); if ('error' in n) errors.admission_no = n.error; else values.admission_no = n.value; }
  if ('full_name' in values && !values.full_name) errors.full_name = 'Full name is required.';
  const ad = aadhaarPatch(input);
  if (ad.error) errors.aadhaar = ad.error;
  for (const k of ['address', 'permanent_address'] as const) {
    if (input[k] === undefined) continue;
    const r = checkAddress(input[k]);
    if ('error' in r) errors[k] = r.error; else values[k] = r.value;
  }
  if (typeof input.permanent_same === 'boolean') values.permanent_same = input.permanent_same;
  if (values.permanent_same === true) values.permanent_address = null;
  if (Object.keys(errors).length) return fail(Object.values(errors)[0]);
  const { data: cur } = await db.from('students').select('aadhaar_last4').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!cur) return fail('Student not found.', 404);
  const patch = { ...values, ...ad.patch };
  if (!Object.keys(patch).length) return fail('Nothing to correct.');
  const masked = { old: { aadhaar_last4: maskAadhaar(cur.aadhaar_last4) }, new: { aadhaar_last4: ad.masked ?? null } };
  const { data, error } = await db.rpc('student_correct', { p_student: id, p_school: a.schoolId, p_actor: a.id, p_kind: 'staff', p_patch: patch, p_reason: reason, p_masked: masked });
  if (error) return dbError(error, 'Could not save the correction.');
  return { ok: true, changed: Number(data) || 0 };
}

/** A wrong entry: cancelled with a reason, its number kept forever. Only for entries without a login. */
export async function cancelEntry(db: Db, a: Actor, id: string, reason: string): Promise<Result> {
  if (reason.trim().length < 3) return fail('Say why this entry is being cancelled.');
  const { data: s } = await db.from('students').select('id, status, user_id, admission_no').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!s) return fail('Student not found.', 404);
  if (s.status === 'cancelled') return fail('Already cancelled.', 409);
  if (s.user_id) return fail('This student has a Sthara login. Mark them as left instead, or ask Sthara support to remove the login first.', 409);
  const today = new Date().toISOString().slice(0, 10);
  await db.from('enrolments').update({ ends_on: today, end_reason: 'correction' }).eq('student_id', id).is('ends_on', null);
  const { error } = await db.from('students').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason.trim().slice(0, 300) }).eq('id', id).eq('school_id', a.schoolId);
  if (error) return dbError(error, 'Could not cancel the entry.');
  await db.from('student_changes').insert({ school_id: a.schoolId, student_id: id, field: 'status', old_value: s.status, new_value: 'cancelled', reason: reason.trim().slice(0, 300), changed_by: a.id });
  return { ok: true };
}

/** Left the school (or back again). A student with a login is handled the Sthara way: sign-in blocked, history kept. */
export async function setStudentLeft(db: Db, a: Actor, id: string, left: boolean, input: { on?: string; reason?: string; className?: string }): Promise<Result> {
  const reason = (input.reason || '').trim();
  if (left && reason.length < 3) return fail('Say why the student left.');
  const { data: s } = await db.from('students').select('id, status, user_id').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!s) return fail('Student not found.', 404);
  if (s.status === 'cancelled') return fail('This entry is cancelled.', 409);
  if ((s.status === 'left') === left) return fail(left ? 'Already marked as left.' : 'This student is active.', 409);
  const on = input.on && /^\d{4}-\d{2}-\d{2}$/.test(input.on) ? input.on : new Date().toISOString().slice(0, 10);
  if (s.user_id) {
    const r = await setLeft(db, a.schoolId, a.id, s.user_id, left, reason || 'Rejoined');
    if (!r.ok) return fail(r.error, r.status);
    return { ok: true };
  }
  if (left) {
    await db.from('enrolments').update({ ends_on: on, end_reason: 'left' }).eq('student_id', id).is('ends_on', null).lte('starts_on', on);
    const { error } = await db.from('students').update({ status: 'left', left_on: on, leaving_reason: reason.slice(0, 300) }).eq('id', id);
    if (error) return dbError(error, 'Could not mark the student as left.');
  } else {
    if (!input.className) return fail('Pick the class the student rejoins.');
    const { error } = await db.from('students').update({ status: 'active', left_on: null, leaving_reason: null }).eq('id', id);
    if (error) return dbError(error, 'Could not bring the student back.');
    const mv = await db.rpc('student_move', { p_school: a.schoolId, p_student: id, p_class: input.className, p_from: on, p_reason: null });
    if (mv.error) return dbError(mv.error, 'Could not set the class.');
  }
  await db.from('student_changes').insert({ school_id: a.schoolId, student_id: id, field: 'status', old_value: s.status, new_value: left ? 'left' : 'active', reason: reason.slice(0, 300) || 'Rejoined', changed_by: a.id });
  return { ok: true };
}

/** The full Aadhaar number, for someone allowed to see it. Every look is in the audit trail. */
export async function revealAadhaar(db: Db, a: Actor, id: string, why: string): Promise<Result<{ aadhaar: string }>> {
  if (why.trim().length < 3) return fail('Say why you need the full number.');
  const { data } = await db.from('students').select('aadhaar_cipher').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!data) return fail('Student not found.', 404);
  if (!data.aadhaar_cipher) return fail('No Aadhaar number on the register.', 404);
  if (!piiReady()) return fail('The encryption key isn’t set up. Ask Sthara support.', 503);
  let digits: string;
  try { digits = openAadhaar(data.aadhaar_cipher); } catch { return fail('The stored number could not be read. Ask Sthara support.', 500); }
  await audit(db, a, 'student.aadhaar_viewed', id, { why: why.trim().slice(0, 200) });
  return { ok: true, aadhaar: digits };
}

/** Where to upload a new photo; the server checks it arrived before it goes on the record. */
export async function photoUpload(db: Db, a: Actor, id: string, ext: string): Promise<Result<{ url: string; path: string }>> {
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return fail('A photo must be a JPG, PNG or WebP image.');
  const { data } = await db.from('students').select('id, status').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!data) return fail('Student not found.', 404);
  const path = `${a.schoolId}/${id}/${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const up = await db.storage.from(PHOTOS).createSignedUploadUrl(path);
  if (up.error || !up.data) return fail('Could not prepare the upload.', 500);
  return { ok: true, url: up.data.signedUrl, path };
}
export async function photoSet(db: Db, a: Actor, id: string, path: string): Promise<Result> {
  if (!path.startsWith(`${a.schoolId}/${id}/`)) return fail('That upload isn’t for this student.', 400);
  const { data } = await db.storage.from(PHOTOS).list(`${a.schoolId}/${id}`, { limit: 100 });
  if (!data?.some(f => `${a.schoolId}/${id}/${f.name}` === path)) return fail('The photo hasn’t arrived yet. Try the upload again.', 409);
  const { error } = await db.rpc('student_correct', { p_student: id, p_school: a.schoolId, p_actor: a.id, p_kind: 'staff', p_patch: { photo_path: path }, p_reason: 'Photo updated', p_masked: {} });
  return error ? dbError(error, 'Could not save the photo.') : { ok: true };
}

/** A mid-year move (section or class change, or a late join) from a given day. */
export async function moveStudent(db: Db, a: Actor, id: string, className: string, from: string, reason: string): Promise<Result> {
  if (reason.trim().length < 3) return fail('Say why the student is moving.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail('Pick the day the move takes effect.');
  const { data: classes } = await db.from('classes').select('name').eq('school_id', a.schoolId);
  const target = (classes || []).find(c => normClass(c.name) === normClass(className))?.name;
  if (!target) return fail(`Class "${className}" isn't set up for this school.`);
  const { error } = await db.rpc('student_move', { p_school: a.schoolId, p_student: id, p_class: target, p_from: from, p_reason: 'class_change' });
  if (error) return dbError(error, 'Could not move the student.');
  await audit(db, a, 'student.moved', id, { to: target, from, reason: reason.trim().slice(0, 300) });
  return { ok: true };
}

/** A roll number set by hand on the current row (manual rule, or a one-off). */
export async function setRoll(db: Db, a: Actor, id: string, roll: string): Promise<Result> {
  const r = roll.trim();
  if (r && !/^[A-Za-z0-9-]{1,12}$/.test(r)) return fail('A roll number has up to 12 letters and digits.');
  const { data: s } = await db.from('students').select('id').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!s) return fail('Student not found.', 404);
  const { error } = await db.from('enrolments').update({ roll_no: r || null }).eq('student_id', id).is('ends_on', null);
  return error ? dbError(error, 'Could not set the roll number.') : { ok: true };
}

export async function renumberClass(db: Db, a: Actor, className: string): Promise<Result<{ changed: number; rule: RollRule }>> {
  const settings = await schoolSettings(db, a.schoolId);
  const rule = rollRuleOf(settings);
  if (rule === 'manual') return fail('Roll numbers are set by hand at this school. Change the rule in Students › Settings to number a class.');
  const { data, error } = await db.rpc('student_renumber', { p_school: a.schoolId, p_session: currentSession(settings), p_class: className, p_rule: rule });
  if (error) return dbError(error, 'Could not number the class.');
  return { ok: true, changed: Number(data) || 0, rule };
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function readSettings(db: Db, schoolId: string) {
  const s = await schoolSettings(db, schoolId);
  const sess = sessionSettings(s);
  const { data: counter } = await db.from('doc_counters').select('last_no').eq('school_id', schoolId).eq('kind', 'admission').eq('session', 'all').maybeSingle();
  const fmt = admissionFormat(s);
  return { session: { ...sess, current: currentSession(s) }, admission: { ...fmt, last: counter?.last_no ?? 0, next: `${fmt.prefix}${String((counter?.last_no ?? 0) + 1).padStart(fmt.pad, '0')}` }, rollRule: rollRuleOf(s), checklist: checklistOf(s) };
}

async function patchSettings(db: Db, schoolId: string, patch: Record<string, unknown>) {
  const s = await schoolSettings(db, schoolId);
  const { error } = await db.from('schools').update({ settings: { ...s, ...patch } }).eq('id', schoolId);
  return error;
}

/** Numbering and the roll-number rule (registrar). */
export async function saveNumbering(db: Db, a: Actor, input: { prefix?: unknown; pad?: unknown; rollRule?: unknown }): Promise<Result> {
  const s = await schoolSettings(db, a.schoolId);
  const fmt = admissionFormat(s);
  const prefix = typeof input.prefix === 'string' ? input.prefix.trim() : fmt.prefix;
  if (prefix.length > 12 || !/^[A-Za-z0-9/.\- ]*$/.test(prefix)) return fail('A prefix has up to 12 letters, digits and / - .');
  const pad = input.pad === undefined ? fmt.pad : Number(input.pad);
  if (!Number.isInteger(pad) || pad < 1 || pad > 9) return fail('The number width is 1 to 9 digits.');
  const rollRule = input.rollRule === undefined ? rollRuleOf(s) : input.rollRule;
  if (!(ROLL_RULES as readonly unknown[]).includes(rollRule)) return fail('Pick how roll numbers are given.');
  const error = await patchSettings(db, a.schoolId, { admission: { prefix, pad }, rollRule });
  return error ? fail('Could not save.', 500) : { ok: true };
}

/** The session start month (school admin). Only while no session has been opened under the old month. */
export async function saveSessionStart(db: Db, a: Actor, month: unknown): Promise<Result> {
  const m = Number(month);
  if (!Number.isInteger(m) || m < 1 || m > 12) return fail('Pick the month the session starts.');
  const s = await schoolSettings(db, a.schoolId);
  const cur = sessionSettings(s);
  const error = await patchSettings(db, a.schoolId, { session: { ...cur, startMonth: m } });
  if (error) return fail('Could not save.', 500);
  await audit(db, a, 'school.session_start_changed', a.schoolId, { from: cur.startMonth, to: m });
  return { ok: true };
}

/** What stops the school opening the next session: classes whose outcomes aren't final and promoted. */
export async function sessionBlockers(db: Db, schoolId: string) {
  const s = await schoolSettings(db, schoolId);
  const session = currentSession(s);
  const rows = await yearRows(db, schoolId, session);
  const byClass = new Map<string, ChainRow[]>();
  for (const r of rows) { const k = r.class_name || 'No class'; byClass.set(k, [...(byClass.get(k) ?? []), r]); }
  const open = [...byClass].map(([cls, rs]) => ({ cls, ...classProgress(rs) })).filter(c => !c.allPromoted);
  return { session, next: nextSessionOf(session), open };
}

/** Opens the next session (school admin). Every class promoted, or an override with a reason. */
export async function openNextSession(db: Db, a: Actor, override?: string): Promise<Result<{ session: string; synced: number }>> {
  const b = await sessionBlockers(db, a.schoolId);
  if (b.open.length && (override ?? '').trim().length < 10) {
    return fail(`${b.open.length} class${b.open.length === 1 ? '' : 'es'} still ha${b.open.length === 1 ? 's' : 've'} year-end outcomes to finish (${b.open.slice(0, 4).map(c => c.cls).join(', ')}${b.open.length > 4 ? ', ...' : ''}). Finish them, or give a reason to open the session anyway.`, 409);
  }
  const s = await schoolSettings(db, a.schoolId);
  const cur = sessionSettings(s);
  const error = await patchSettings(db, a.schoolId, { session: { ...cur, current: b.next } });
  if (error) return fail('Could not open the session.', 500);
  const { data } = await db.rpc('student_sync_school', { p_school: a.schoolId });
  await audit(db, a, 'school.session_opened', a.schoolId, { from: b.session, to: b.next, override: override?.trim() || null, unfinished: b.open.map(c => c.cls) });
  return { ok: true, session: b.next, synced: Number(data) || 0 };
}

// ── Year end ────────────────────────────────────────────────────────────────

/** Each active student's open (or this year's closing) row in a session. */
async function yearRows(db: Db, schoolId: string, session: string, cls?: string) {
  const { data, error } = await pageAll<any>((f, t) => {
    let q = db.from('enrolments').select(`${ECOLS}, students!inner(id, full_name, admission_no, status, user_id)`).eq('school_id', schoolId).eq('session', session)
      .in('students.status', ['active', 'left']).order('id').range(f, t);
    if (cls) q = q.eq('class_name', cls);
    return q;
  }, 100_000);
  if (error) throw new Error(error.message);
  // The latest row of the session per student: the one the year ends on.
  const last = new Map<string, any>();
  for (const e of data) { const p = last.get(e.student_id); if (!p || e.starts_on > p.starts_on) last.set(e.student_id, e); }
  return [...last.values()].filter(e => e.students.status === 'active' || e.end_reason === 'left' && e.outcome);
}

/** Every class in the current session with where its year end stands. */
export async function yearBoard(db: Db, schoolId: string) {
  const settings = await schoolSettings(db, schoolId);
  const session = currentSession(settings);
  const rows = await yearRows(db, schoolId, session);
  const byClass = new Map<string, ChainRow[]>();
  for (const r of rows) { const k = r.class_name || 'No class'; byClass.set(k, [...(byClass.get(k) ?? []), r]); }
  const { data: teachers } = await pageAll<{ name: string | null; teacher_class: string }>((f, t) => db.from('users').select('id, name, teacher_class')
    .eq('school_id', schoolId).eq('role', 'teacher').not('teacher_class', 'is', null).order('id').range(f, t));
  const ct = new Map(teachers.map(t => [normClass(t.teacher_class), t.name || 'Teacher']));
  const classes = [...byClass].map(([cls, rs]) => ({ cls, classTeacher: ct.get(normClass(cls)) ?? null, ...classProgress(rs) }))
    .sort((a, b) => a.cls.localeCompare(b.cls, 'en', { numeric: true }));
  return { session, next: nextSessionOf(session), classes };
}

/** One class: each student, the report card result to decide from, and where their outcome stands. */
export async function classYear(db: Db, schoolId: string, cls: string) {
  const settings = await schoolSettings(db, schoolId);
  const session = currentSession(settings);
  const rows = await yearRows(db, schoolId, session, cls);
  const ids = rows.map(r => r.students.user_id).filter(Boolean) as string[];
  const cards = new Map<string, { status: string | null; pct: number | null; grade: string | null; term: string | null; final: boolean }>();
  if (ids.length) {
    const { data } = await byIds<any>(ids, (chunk, f, t) => db.from('report_cards').select('student_id, snapshot, published_at')
      .in('student_id', chunk).is('superseded_at', null).eq('school_id', schoolId).order('student_id').order('published_at', { ascending: false }).range(f, t));
    // Newest first: the final term card of this session wins, else the latest card of the session.
    for (const c of data) {
      const snap = c.snapshot || {};
      if (snap.session !== session) continue;
      const have = cards.get(c.student_id);
      if (have && (have.final || !snap.term?.isFinal)) continue;
      cards.set(c.student_id, { status: snap.result?.status ?? null, pct: snap.aggregate?.pct ?? null, grade: snap.aggregate?.grade ?? null, term: snap.term?.name ?? null, final: !!snap.term?.isFinal });
    }
  }
  const out = rows.map(r => {
    const card = r.students.user_id ? cards.get(r.students.user_id) ?? null : null;
    const suggested: Outcome | null = card?.status === 'pass' ? 'promoted' : card?.status === 'fail' ? 'detained' : null;
    return {
      enrolmentId: r.id, studentId: r.student_id, name: r.students.full_name, admissionNo: r.students.admission_no, rollNo: r.roll_no,
      stage: stageOf(r), proposed: r.proposed_outcome, proposedNote: r.proposed_note, returnedNote: r.returned_note, outcome: r.outcome,
      published: !!r.published_at, card, suggested,
    };
  }).sort((a, b) => (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || a.name.localeCompare(b.name));
  return { session, next: nextSessionOf(session), cls, rows: out, progress: classProgress(rows) };
}

/** Is this teacher the class teacher of the class? */
export async function isClassTeacher(db: Db, schoolId: string, teacherId: string, cls: string) {
  const { data } = await db.from('users').select('teacher_class').eq('id', teacherId).eq('school_id', schoolId).eq('role', 'teacher').maybeSingle();
  return !!data?.teacher_class && normClass(data.teacher_class) === normClass(cls);
}

async function loadChain(db: Db, schoolId: string, ids: string[]) {
  const { data } = await byIds<any>(ids, (chunk, f, t) => db.from('enrolments').select(`${ECOLS}, school_id`).in('id', chunk).eq('school_id', schoolId).order('id').range(f, t));
  return data;
}

/** One step of the chain for a set of rows of one class. Rows that can't take it are refused as a whole. */
export async function chainStep(db: Db, a: Actor, step: Step | 'propose', items: { id: string; outcome?: unknown; note?: unknown }[], cls: string, note?: string): Promise<Result<{ done: number }>> {
  if (!items.length || items.length > 500) return fail('Pick between 1 and 500 students.');
  const rows = await loadChain(db, a.schoolId, items.map(i => i.id));
  if (rows.length !== new Set(items.map(i => i.id)).size || rows.some(r => normClass(r.class_name ?? '') !== normClass(cls))) return fail('Every student must be in this class at this school.', 404);
  const problems = rows.map(r => blocked(step, r as ChainRow)).filter(Boolean);
  if (problems.length) return fail(`${problems.length} of these can’t take this step: ${problems[0]}`, 409);
  const now = new Date().toISOString();
  const byId = new Map(items.map(i => [i.id, i]));
  if (step === 'return' && (note ?? '').trim().length < 3) return fail('Say what the class teacher should look at again.');
  // Every row is checked before any is written, so a bad row never leaves the class half-done.
  if (step === 'propose' && items.some(it => !isOutcome(it.outcome))) return fail('Pick an outcome for every student.');
  if (step === 'finalise' && rows.some(r => { const it = byId.get(r.id)!; return isOutcome(it.outcome) && it.outcome !== r.proposed_outcome && (typeof it.note !== 'string' || it.note.trim().length < 3); }))
    return fail('Changing the approved outcome needs a reason.');
  for (const r of rows) {
    const it = byId.get(r.id)!;
    let patch: Record<string, unknown>;
    if (step === 'propose') {
      patch = { proposed_outcome: it.outcome, proposed_note: typeof it.note === 'string' ? it.note.trim().slice(0, 300) || null : null, proposed_by: a.id, proposed_at: now, returned_note: null };
    } else if (step === 'approve') patch = { approved_by: a.id, approved_at: now, returned_note: null };
    else if (step === 'return') patch = { approved_by: null, approved_at: null, returned_note: note!.trim().slice(0, 300) };
    else if (step === 'finalise') {
      const over = isOutcome(it.outcome) && it.outcome !== r.proposed_outcome ? it.outcome : null;
      patch = { outcome: over ?? r.proposed_outcome, finalised_by: a.id, finalised_at: now };
      if (over) await audit(db, a, 'student.outcome_changed', r.student_id, { from: r.proposed_outcome, to: over, why: String(it.note).trim().slice(0, 300) });
    } else patch = { outcome: null, finalised_by: null, finalised_at: null, approved_by: null, approved_at: null };
    const { error } = await db.from('enrolments').update(patch).eq('id', r.id).eq('school_id', a.schoolId).is('published_at', null);
    if (error) return dbError(error, 'Could not save.');
  }
  await audit(db, a, `outcomes.${step}`, a.schoolId, { cls, students: rows.length, note: note?.trim() || null });
  return { ok: true, done: rows.length };
}

/** Promotes a class whose outcomes are all final; then numbers the new classes by the school rule. */
export async function promote(db: Db, a: Actor, cls: string, toClass: string, sameClass: string): Promise<Result<{ promoted: number; retained: number; left: number }>> {
  const settings = await schoolSettings(db, a.schoolId);
  const session = currentSession(settings);
  const { data: classes } = await db.from('classes').select('name').eq('school_id', a.schoolId);
  const find = (n: string) => (classes || []).find(c => normClass(c.name) === normClass(n))?.name ?? null;
  const to = find(toClass), same = find(sameClass || cls);
  const grade = Number((cls.match(/\d{1,2}/) || [])[0]);
  if (!to && !(grade >= 12)) return fail(`Class "${toClass}" isn't set up yet. Add next session's classes first.`);
  const { data, error } = await db.rpc('student_promote', { p_school: a.schoolId, p_session: session, p_class: cls, p_to_class: to ?? cls, p_same_class: same ?? cls, p_actor: a.id });
  if (error) return dbError(error, 'Could not promote the class.');
  const res = data as { promoted: number; retained: number; left: number };
  const rule = rollRuleOf(settings);
  if (rule !== 'manual') {
    for (const c of new Set([to, same].filter(Boolean) as string[])) await db.rpc('student_renumber', { p_school: a.schoolId, p_session: nextSessionOf(session), p_class: c, p_rule: rule });
  }
  await audit(db, a, 'outcomes.promoted', a.schoolId, { cls, to, same, ...res });
  return { ok: true, ...res };
}

/** Publishes a promoted class to the student and parent portals once every student has a class for next session. */
export async function publish(db: Db, a: Actor, cls: string): Promise<Result<{ published: number }>> {
  const settings = await schoolSettings(db, a.schoolId);
  const session = currentSession(settings);
  const rows = (await yearRows(db, a.schoolId, session, cls)).filter(r => r.ends_on && r.outcome && !r.published_at);
  if (!rows.length) return fail('Nothing to publish: promote the class first.', 409);
  const staying = rows.filter(r => r.end_reason !== 'left').map(r => r.student_id);
  if (staying.length) {
    const { data: next } = await byIds<any>(staying, (chunk, f, t) => db.from('enrolments').select('student_id, class_id').in('student_id', chunk).eq('session', nextSessionOf(session)).order('student_id').range(f, t));
    const placed = new Set(next.filter(n => n.class_id).map(n => n.student_id));
    const missing = staying.filter(s => !placed.has(s)).length;
    if (missing) return fail(`${missing} student${missing === 1 ? ' has' : 's have'} no class for next session yet. Set the classes first.`, 409);
  }
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 150) {
    const { error } = await db.from('enrolments').update({ published_at: now }).in('id', rows.slice(i, i + 150).map(r => r.id)).eq('school_id', a.schoolId);
    if (error) return dbError(error, 'Could not publish.');
  }
  await audit(db, a, 'outcomes.published', a.schoolId, { cls, students: rows.length });
  return { ok: true, published: rows.length };
}

/** The published year-end result for a student login (portal card), or null. */
export async function yearEndFor(db: Db, userId: string) {
  const { data: s } = await db.from('students').select('id, school_id').eq('user_id', userId).maybeSingle();
  if (!s) return null;
  const { data: rows } = await db.from('enrolments').select('session, class_name, outcome, published_at').eq('student_id', s.id)
    .not('published_at', 'is', null).order('session', { ascending: false }).limit(1);
  const done = rows?.[0];
  if (!done) return null;
  const { data: next } = await db.from('enrolments').select('class_name, roll_no, session').eq('student_id', s.id).eq('session', nextSessionOf(done.session)).order('starts_on').limit(1);
  return { session: done.session, outcome: done.outcome as Outcome, from: done.class_name, next: next?.[0] ? { session: next[0].session, cls: next[0].class_name, rollNo: next[0].roll_no } : null, publishedAt: done.published_at };
}

