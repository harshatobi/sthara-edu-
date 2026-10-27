import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { indiaDay, nextSession, sessionOf } from '@/lib/admin/format';
import { normaliseCode, schoolPolicy, type SchoolRow } from '@/lib/settings/registry';
import { maskPhone, toE164, whatsappConfig } from '@/lib/whatsapp/config';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { DOC_BUCKET } from '@/lib/students/documentsServer';
import { checklistFor, checklistOf, docLabel, type DocStatus } from '@/lib/students/documents';
import { cleanPhone, GRADES, type FamilyInput } from '@/lib/students/register';
import { ageCheck, ageRulesOf, checkForm, completeness, formOf, EMPTY_FORM, type ApplicationForm } from './application';
import { finishUpload, uploadUrl, type Actor, type AppCan } from './applicationServer';
import { flushSoon } from './crmServer';
import { assessmentFor, book, cancelBooking, rulesOf } from './meritServer';
import { feesFor } from './rteFeesServer';
import {
  accessCodeFrom, codeHint, CODE_DAYS, CODE_LENGTH, familyCanEdit, familyCanSend, familyStatus, MAX_PER_PHONE, normaliseAccessCode, onlineOf,
} from './familyAccess';

/**
 * Families applying themselves (admissions phase 2b), server side.
 *
 * Three ways in, none of them a Sthara login: a code sent to the family's phone on WhatsApp (every application from
 * that phone at the school), an access code the admissions office gives for one applicant, or the parent portal for a
 * parent who already has a child at the school (applying for a sibling). Each becomes a Principal, and every read and
 * write below is limited to the applications that principal reaches. The family fills the application the office
 * does (lib/admin/application), sends documents (they wait for the office's check) and sends the application; until
 * then it is a draft the office does not work.
 */

type Db = SupabaseClient;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

export type Principal =
  | { kind: 'phone'; schoolId: string; phone: string }
  | { kind: 'code'; schoolId: string; applicantId: string; codeId: string }
  | { kind: 'parent'; schoolId: string; parentId: string; name: string | null };

const SECRET = () => process.env.SUPABASE_SERVICE_ROLE_KEY || 'sthara';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const OTP_MINUTES = 10;
const SESSION_HOURS = 4;
export const SESSION_COOKIE = '__apply';

// ── The school ──────────────────────────────────────────────────────────────

export interface ApplySchool { id: string; name: string; code: string; open: boolean; enquiries: boolean; note: string | null; phoneSignIn: boolean; settings: unknown }

/**
 * A school's apply page, by its sign-in code. Phone sign-in needs WhatsApp to deliver the code: while the channel is
 * simulated it is offered only outside production (where the code is shown on screen for testing), and never for a
 * school whose WhatsApp is switched off. Families then use an access code from the office.
 */
export async function schoolByCode(db: Db, raw: unknown): Promise<ApplySchool | null> {
  const code = normaliseCode(raw);
  if (code.length < 3) return null;
  const { data } = await db.from('schools').select('id, name, institution_type, trial_expires_at, settings').eq('settings->>code', code).limit(2);
  if (!data || data.length !== 1) return null;
  const p = schoolPolicy(data[0] as SchoolRow);
  if (!p.active) return null;
  const online = onlineOf(data[0].settings);
  return { id: p.id, name: p.name, code, open: online.open, enquiries: online.enquiries, note: online.note, phoneSignIn: phoneSignInAvailable(p.off.includes('whatsapp')), settings: data[0].settings };
}

export const phoneSignInAvailable = (whatsappOff: boolean) => !whatsappOff && (whatsappConfig().mode === 'live' || process.env.VERCEL_ENV !== 'production');

// ── Sessions ────────────────────────────────────────────────────────────────

async function openSession(db: Db, row: { school_id: string; phone_e164?: string; access_code_id?: string }, until?: Date) {
  const token = randomBytes(32).toString('base64url');
  const max = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  const expires = until && until < max ? until : max;
  // Old sessions are cleared as new ones open, so the table never grows without bound.
  await db.from('admission_family_sessions').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());
  const { error } = await db.from('admission_family_sessions').insert({ token_hash: sha(token), ...row, expires_at: expires.toISOString() });
  if (error) throw new Error(error.message);
  return { token, expires };
}

/** The family signed in at this school, or null (no cookie, expired, another school's, or a code since ended). */
export async function readSession(db: Db, token: string | undefined, schoolId: string): Promise<Principal | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const { data: s } = await db.from('admission_family_sessions').select('school_id, phone_e164, access_code_id, expires_at').eq('token_hash', sha(token)).maybeSingle();
  if (!s || s.school_id !== schoolId || new Date(s.expires_at).getTime() < Date.now()) return null;
  if (s.phone_e164) return { kind: 'phone', schoolId, phone: s.phone_e164 };
  const { data: c } = await db.from('admission_access_codes').select('id, applicant_id, expires_at, revoked_at').eq('id', s.access_code_id).maybeSingle();
  if (!c || c.revoked_at || new Date(c.expires_at).getTime() < Date.now()) return null;
  return { kind: 'code', schoolId, applicantId: c.applicant_id, codeId: c.id };
}

export async function endSession(db: Db, token: string | undefined) {
  if (token) await db.from('admission_family_sessions').delete().eq('token_hash', sha(token));
}

// ── Phone code on WhatsApp ──────────────────────────────────────────────────

const otpHash = (schoolId: string, phone: string, code: string) => sha(`${SECRET()}:apply:${schoolId}:${phone}:${code}`);

export async function otpStart(db: Db, school: ApplySchool, b: { phone?: unknown; consent?: unknown }): Promise<Result<{ phone: string; testCode?: string }>> {
  if (!school.phoneSignIn) return fail('Signing in by phone isn’t available yet. Ask the admissions office for an access code.', 409);
  if (b.consent !== true) return fail('Tick the box to agree to the school contacting you on WhatsApp about this application.');
  const phone = toE164(b.phone);
  if (!phone) return fail('Enter a valid mobile number, e.g. 98765 43210.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await db.from('admission_otps').upsert({
    school_id: school.id, phone_e164: phone, otp_hash: otpHash(school.id, phone, code), attempts: 0,
    expires_at: new Date(Date.now() + OTP_MINUTES * 60_000).toISOString(), created_at: new Date().toISOString(),
  }, { onConflict: 'school_id,phone_e164' });
  if (error) { console.error('[apply otp]', error.message); return fail('Could not send a code. Try again.', 500); }
  const sent = await sendWhatsApp(db, {
    to: phone, schoolId: school.id, kind: 'otp', otpCode: code, meta: { purpose: 'admission_apply' },
    body: `${code} is your code to apply to ${school.name}. It expires in ${OTP_MINUTES} minutes. Don't share it.`,
  });
  if (!sent.ok) return fail('We couldn’t reach that number on WhatsApp. Check it, or ask the admissions office for an access code.', 502);
  // Nothing is delivered while WhatsApp is simulated (never in production, see phoneSignInAvailable): show the code.
  return { ok: true, phone: maskPhone(phone), ...(sent.status === 'simulated' ? { testCode: code } : {}) };
}

export async function otpVerify(db: Db, school: ApplySchool, b: { phone?: unknown; code?: unknown }): Promise<Result<{ token: string; expires: Date }>> {
  const phone = toE164(b.phone);
  const code = typeof b.code === 'string' ? b.code.replace(/\D/g, '') : '';
  if (!phone) return fail('Enter your mobile number again.');
  const { data: row } = await db.from('admission_otps').select('otp_hash, expires_at, attempts').eq('school_id', school.id).eq('phone_e164', phone).maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return fail('That code has expired. Send a new one.', 410);
  if (row.attempts >= 5) return fail('Too many wrong codes. Send a new one.', 429);
  // Each guess first claims one of the five attempts, only if the count is still what was read (as WhatsApp linking).
  const { data: claimed } = await db.from('admission_otps').update({ attempts: row.attempts + 1 })
    .eq('school_id', school.id).eq('phone_e164', phone).eq('attempts', row.attempts).select('phone_e164');
  if (!claimed?.length) return fail('Another attempt is in progress. Wait a moment and try again.', 429);
  if (code.length !== 6 || otpHash(school.id, phone, code) !== row.otp_hash) return fail('That code isn’t right. Check the latest message and try again.');
  await db.from('admission_otps').delete().eq('school_id', school.id).eq('phone_e164', phone);
  const s = await openSession(db, { school_id: school.id, phone_e164: phone });
  return { ok: true, ...s };
}

// ── Access codes ────────────────────────────────────────────────────────────

const codeHash = (schoolId: string, normalised: string) => sha(`${SECRET()}:access:${schoolId}:${normalised}`);

export async function codeSignIn(db: Db, school: ApplySchool, raw: unknown): Promise<Result<{ token: string; expires: Date }>> {
  const code = normaliseAccessCode(raw);
  if (!code) return fail(`An access code is ${CODE_LENGTH} letters and numbers, like K7QM-4XPA.`);
  const { data: c } = await db.from('admission_access_codes').select('id, expires_at, revoked_at').eq('school_id', school.id).eq('code_hash', codeHash(school.id, code)).maybeSingle();
  if (!c || c.revoked_at) return fail('That access code isn’t right, or the school has replaced it. Check it with the admissions office.', 404);
  if (new Date(c.expires_at).getTime() < Date.now()) return fail('That access code has expired. Ask the admissions office for a new one.', 410);
  await db.from('admission_access_codes').update({ last_used_at: new Date().toISOString() }).eq('id', c.id);
  const s = await openSession(db, { school_id: school.id, access_code_id: c.id }, new Date(c.expires_at));
  return { ok: true, ...s };
}

async function codeAudit(db: Db, a: { id: string; schoolId: string }, action: string, applicantId: string, values: Record<string, unknown>) {
  const { error } = await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action, table_name: 'admission_applicants', row_id: applicantId, school_id: a.schoolId, new_values: values });
  if (error) console.warn('[access code audit]', error.message);
}

/** The office gives the family a code for this applicant (any earlier one stops working). Shown once. */
export async function issueCode(db: Db, a: { id: string; schoolId: string }, applicantId: string): Promise<Result<{ code: string; expiresAt: string }>> {
  const { data: ap } = await db.from('admission_applicants').select('id, stage, student_id').eq('id', applicantId).eq('school_id', a.schoolId).maybeSingle();
  if (!ap) return fail('Applicant not found.', 404);
  if (!familyCanSend(ap)) return fail('This application is closed or the student is admitted: there is nothing for the family to send.', 409);
  const now = new Date().toISOString();
  await db.from('admission_access_codes').update({ revoked_at: now }).eq('applicant_id', applicantId).is('revoked_at', null);
  const code = accessCodeFrom(randomBytes(CODE_LENGTH));
  const norm = normaliseAccessCode(code)!;
  const expiresAt = new Date(Date.now() + CODE_DAYS * 86_400_000).toISOString();
  const { error } = await db.from('admission_access_codes').insert({
    school_id: a.schoolId, applicant_id: applicantId, code_hash: codeHash(a.schoolId, norm), hint: codeHint(norm), expires_at: expiresAt, created_by: a.id,
  });
  if (error) return fail(error.code === '23505' ? 'Another code was just given. Reload and try again.' : 'Could not make a code.', error.code === '23505' ? 409 : 500);
  await codeAudit(db, a, 'admission_access_code.given', applicantId, { hint: codeHint(norm), expires_at: expiresAt });
  return { ok: true, code, expiresAt };
}

export async function revokeCode(db: Db, a: { id: string; schoolId: string }, applicantId: string): Promise<Result> {
  const { error } = await db.from('admission_access_codes').update({ revoked_at: new Date().toISOString() })
    .eq('applicant_id', applicantId).eq('school_id', a.schoolId).is('revoked_at', null);
  if (error) return fail('Could not end the code.', 500);
  // Sessions opened with it end with it (readSession checks the code each time); clear them now too.
  const { data: ids } = await db.from('admission_access_codes').select('id').eq('applicant_id', applicantId).limit(50);
  if (ids?.length) await db.from('admission_family_sessions').delete().in('access_code_id', ids.map(r => r.id));
  await codeAudit(db, a, 'admission_access_code.ended', applicantId, {});
  return { ok: true };
}

/** The live code's last characters and dates, for the office (the code itself is never stored). */
export async function codeStatus(db: Db, schoolId: string, applicantId: string) {
  const { data } = await db.from('admission_access_codes').select('hint, expires_at, last_used_at, created_at')
    .eq('applicant_id', applicantId).eq('school_id', schoolId).is('revoked_at', null).maybeSingle();
  return data && new Date(data.expires_at).getTime() > Date.now() ? data : null;
}

// ── The family's applications ───────────────────────────────────────────────

const ACOLS = 'id, school_id, session, name, grade, date_of_birth, stage, channel, submitted_at, student_id, form, guardian_phone, created_at, applied_on';
interface Row {
  id: string; school_id: string; session: string; name: string; grade: number; date_of_birth: string | null; stage: string; channel: string;
  submitted_at: string | null; student_id: string | null; form: unknown; guardian_phone: string | null; created_at: string; applied_on: string | null;
}

function scoped(db: Db, p: Principal) {
  // bounded: one family's applications (each caller adds a limit or a single id)
  const q = db.from('admission_applicants').select(ACOLS).eq('school_id', p.schoolId);
  return p.kind === 'phone' ? q.eq('family_phone', p.phone) : p.kind === 'parent' ? q.eq('parent_id', p.parentId) : q.eq('id', p.applicantId);
}

async function one(db: Db, p: Principal, id: unknown): Promise<Row | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await scoped(db, p).eq('id', id).maybeSingle();
  return (data as Row | null) ?? null;
}

async function stagesOf(db: Db, schoolId: string) {
  await db.rpc('admission_ensure_stages', { p_school: schoolId });
  const { data } = await db.from('admission_stages').select('key, label, system, active, position').eq('school_id', schoolId).order('position');
  return new Map((data || []).map(s => [s.key as string, s as { key: string; label: string; system: string | null; active: boolean; position: number }]));
}

export async function listApplications(db: Db, p: Principal) {
  const [{ data }, stages] = await Promise.all([scoped(db, p).order('created_at', { ascending: false }).limit(20), stagesOf(db, p.schoolId)]);
  return ((data || []) as Row[]).map(a => ({
    id: a.id, name: a.name, grade: a.grade, session: a.session, createdAt: a.created_at, submittedAt: a.submitted_at,
    status: familyStatus(a, stages.get(a.stage) ?? null),
  }));
}

export interface FamilyDoc { id: string; kind: string; label: string; title: string; file_name: string; status: DocStatus; reject_note: string | null; source: 'office' | 'family'; created_at: string; canRemove: boolean }

/** One application as the family sees it: details, form, where it stands, the checklist and the documents sent. */
export async function loadForFamily(db: Db, p: Principal, id: unknown) {
  const a = await one(db, p, id);
  if (!a) return null;
  const [stages, { data: school }, { data: docs }] = await Promise.all([
    stagesOf(db, p.schoolId),
    db.from('schools').select('settings').eq('id', p.schoolId).maybeSingle(),
    db.from('admission_documents').select('id, kind, title, file_name, status, reject_note, source, created_at, moved_to, valid_until')
      .eq('applicant_id', a.id).eq('school_id', p.schoolId).order('created_at', { ascending: false }).limit(100),
  ]);
  const stage = stages.get(a.stage) ?? null;
  const form = formOf(a.form);
  const live = (docs || []).filter(d => !d.moved_to);
  const checklist = checklistFor(checklistOf(school?.settings), a.grade, live.map(d => ({ kind: d.kind, status: d.status, valid_until: d.valid_until })), indiaDay());
  return {
    id: a.id, name: a.name, grade: a.grade, dob: a.date_of_birth, session: a.session, channel: a.channel, submittedAt: a.submitted_at,
    status: familyStatus(a, stage),
    canEdit: familyCanEdit(a, stage?.system ?? null),
    canSend: familyCanSend(a),
    // An office applicant reached by an access code keeps the name and class the office set.
    canEditBasics: a.channel !== 'office' && familyCanEdit(a, stage?.system ?? null),
    assessment: await familyAssessment(db, p.schoolId, a),
    fees: await familyFees(db, p.schoolId, a.id),
    form,
    completeness: completeness(form, a.date_of_birth),
    age: ageCheck(a.date_of_birth, a.grade, a.session, ageRulesOf(school?.settings)).text,
    checklist: checklist.map(c => ({ kind: c.kind, label: c.label, state: c.state })),
    docs: live.map(d => ({
      id: d.id, kind: d.kind, label: docLabel(d.kind), title: d.title, file_name: d.file_name, status: d.status as DocStatus, reject_note: d.reject_note,
      source: d.source, created_at: d.created_at, canRemove: d.source === 'family' && d.status !== 'verified' && familyCanSend(a),
    })) as FamilyDoc[],
  };
}

/** What the family owes and has paid (they pay at the school office; no amounts are typed in here). */
async function familyFees(db: Db, schoolId: string, applicantId: string) {
  const f = await feesFor(db, schoolId, applicantId);
  if (!f || !f.fees.length) return null;
  return {
    lines: f.fees.filter(x => x.kind !== 'deposit' || f.offerLive || x.paid).map(x => ({ kind: x.kind, label: x.label, amount: x.amount, why: x.why, paid: !!x.paid, receiptNo: x.paid?.receipt_no ?? null })),
    depositDue: f.depositPaid ? null : f.depositDue,
  };
}

/** The family's assessment booking and the slots they can pick, when the school lets families book once they have sent the application. */
async function familyAssessment(db: Db, schoolId: string, a: Row) {
  const sent = !!a.submitted_at || a.channel === 'office';
  if (!sent || !familyCanSend(a) || !(await rulesOf(db, schoolId)).familyBooking) return null;
  const r = await assessmentFor(db, schoolId, a.id);
  if (!r) return null;
  const strip = (s: { id: string; when: string; place: string | null; note: string | null } | null) => s && { id: s.id, when: s.when, place: s.place, note: s.note };
  const live = r.bookings.find(b => b.status === 'booked');
  const done = r.bookings.find(b => b.status === 'attended' || b.status === 'no_show');
  return {
    booking: live ? { slot: strip(live.slot) } : null,
    // Whether they sat it; the score stays with the school.
    sat: done ? done.status === 'attended' : null,
    open: r.open.map(s => strip(s)!),
  };
}

function basics(b: Record<string, unknown>): { value: { name: string; grade: number; dob: string | null } } | { error: string } {
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 120) return { error: 'Enter the child’s full name.' };
  const grade = Number(b.grade);
  if (!GRADES.includes(grade)) return { error: 'Pick the class you are applying for.' };
  const dob = typeof b.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dob) ? b.dob : null;
  if (b.dob && !dob) return { error: 'Enter the date of birth.' };
  if (dob && (dob > indiaDay() || dob < '1995-01-01')) return { error: 'Check the date of birth.' };
  return { value: { name, grade, dob } };
}

/** What a parent at the school already has on record (address and family), so a sibling's application starts filled. */
async function prefillFromSibling(db: Db, parentId: string, schoolId: string): Promise<{ form: ApplicationForm; phone: string | null; email: string | null }> {
  const empty = { form: EMPTY_FORM, phone: null, email: null };
  const { data: kids } = await db.from('guardians').select('student_id').eq('parent_id', parentId).eq('verified', true).limit(10);
  const userIds = (kids || []).map(k => k.student_id as string);
  if (!userIds.length) return empty;
  const { data: st } = await db.from('students').select('id, address, permanent_address, permanent_same').eq('school_id', schoolId).in('user_id', userIds)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!st) return empty;
  const { data: fam } = await db.from('family_members').select('relation, name, phone, email, education, occupation, annual_income, is_primary, lives_with, user_id')
    .eq('student_id', st.id).order('is_primary', { ascending: false }).limit(6);
  const family = ((fam || []) as (FamilyInput & { user_id: string | null })[])
    .filter(m => m.relation !== 'sibling')
    .map(({ user_id: _u, ...m }) => m);
  const me = (fam || []).find(m => m.user_id === parentId) ?? (fam || []).find(m => m.is_primary) ?? null;
  return {
    form: { fields: {}, address: st.address ?? null, permanent_same: st.permanent_same !== false, permanent_address: st.permanent_same === false ? st.permanent_address ?? null : null, family },
    phone: me?.phone ?? null, email: me?.email ?? null,
  };
}

/** A new application: a family signed in by phone, or a parent at the school. The school must take them online. */
export async function createForFamily(db: Db, p: Principal, school: { open: boolean }, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  if (p.kind === 'code') return fail('Your access code is for one application. To apply for another child, ask the admissions office.', 403);
  if (!school.open) return fail('The school isn’t taking applications online at the moment. Contact the admissions office.', 409);
  const v = basics(b);
  if ('error' in v) return fail(v.error);
  const session = nextSession(sessionOf());
  const { data: open } = await scoped(db, p).eq('session', session).not('stage', 'in', '(rejected,withdrawn)').limit(MAX_PER_PHONE + 1);
  const count = open?.length ?? 0;
  if (count >= MAX_PER_PHONE) return fail(`You have ${count} applications open for ${session}. Contact the admissions office to add more.`, 409);
  const stages = [...(await stagesOf(db, p.schoolId)).values()].filter(s => !s.system && s.active).sort((x, y) => x.position - y.position);
  if (!stages.length) return fail('The school isn’t taking applications online at the moment. Contact the admissions office.', 409);
  const pre = p.kind === 'parent' ? await prefillFromSibling(db, p.parentId, p.schoolId) : null;
  const { data, error } = await db.from('admission_applicants').insert({
    school_id: p.schoolId, session, name: v.value.name, grade: v.value.grade, date_of_birth: v.value.dob,
    stage: stages[0].key, furthest_stage: stages[0].key,
    channel: p.kind === 'parent' ? 'portal' : 'online', source: p.kind === 'parent' ? 'sibling' : 'website',
    family_phone: p.kind === 'phone' ? p.phone : null,
    guardian_phone: p.kind === 'phone' ? p.phone : pre?.phone ?? null,
    parent_id: p.kind === 'parent' ? p.parentId : null, guardian_name: p.kind === 'parent' ? p.name : null, guardian_email: pre?.email ?? null,
    created_by: p.kind === 'parent' ? p.parentId : null, form: pre?.form ?? EMPTY_FORM,
  }).select('id').single();
  if (error || !data) { console.error('[apply create]', error?.message); return fail('Could not start the application. Try again.', 500); }
  return { ok: true, id: data.id };
}

/** Saves the family's draft: the child's details (unless the office set them) and the application form. */
export async function saveForFamily(db: Db, p: Principal, b: Record<string, unknown>): Promise<Result> {
  const app = await loadForFamily(db, p, b.id);
  if (!app) return fail('Application not found.', 404);
  if (!app.canEdit) return fail('This application has been sent to the school, so the details can’t be changed here. Contact the admissions office to correct anything.', 409);
  const f = checkForm(b.form);
  if ('error' in f) return fail(f.error);
  // RTE decides which seats an offer would hold; a draft has no offer, so the family's answer stands.
  const patch: Record<string, unknown> = { form: f.value, rte: f.value.fields.rte_seat === true };
  if (app.canEditBasics) {
    const v = basics(b);
    if ('error' in v) return fail(v.error);
    Object.assign(patch, { name: v.value.name, grade: v.value.grade, date_of_birth: v.value.dob });
  } else if (!app.dob && typeof b.dob === 'string' && b.dob) {
    // The office left the date of birth blank: the family may give it.
    const v = basics({ name: app.name, grade: app.grade, dob: b.dob });
    if ('error' in v) return fail(v.error);
    patch.date_of_birth = v.value.dob;
  }
  if (typeof f.value.fields.previous_school === 'string') patch.previous_school = f.value.fields.previous_school;
  // The main contact on the form is who the office calls (a phone sign-in keeps the verified phone).
  const main = f.value.family.find(m => m.is_primary) ?? f.value.family[0];
  if (main && app.channel !== 'office') {
    patch.guardian_name = main.name;
    if (main.email) patch.guardian_email = main.email;
    if (p.kind !== 'phone' && main.phone) patch.guardian_phone = cleanPhone(main.phone) ?? main.phone;
  }
  const { error } = await db.from('admission_applicants').update(patch).eq('id', app.id).eq('school_id', p.schoolId);
  if (error) { console.error('[apply save]', error.message); return fail('Could not save. Try again.', 500); }
  return { ok: true };
}

/** Sends the application to the school, once what the register and the transfer certificate need is filled in. */
export async function submitForFamily(db: Db, p: Principal, id: unknown): Promise<Result> {
  const app = await loadForFamily(db, p, id);
  if (!app) return fail('Application not found.', 404);
  if (!app.canEdit) return fail('This application has already been sent.', 409);
  if (!app.completeness.done) return fail(`Fill in before sending: ${app.completeness.missing.join(', ')}.`);
  const now = new Date().toISOString();
  const { data, error } = await db.from('admission_applicants').update({ submitted_at: now, applied_on: indiaDay() })
    .eq('id', app.id).eq('school_id', p.schoolId).is('submitted_at', null).select('stage');
  if (error) return fail('Could not send. Try again.', 500);
  if (!data?.length) return fail('This application has already been sent.', 409);
  await db.from('admission_events').insert({
    applicant_id: app.id, school_id: p.schoolId, from_stage: null, to_stage: data[0].stage, actor_id: p.kind === 'parent' ? p.parentId : null,
    note: p.kind === 'parent' ? 'Application sent from the parent portal' : 'Application sent online by the family',
  });
  flushSoon(db, p.schoolId);
  return { ok: true };
}

// ── Documents from the family ───────────────────────────────────────────────

const ALL: AppCan = { see: true, manage: true, health: true, manageHealth: true };
const actorOf = (p: Principal): Actor => ({ id: p.kind === 'parent' ? p.parentId : null, schoolId: p.schoolId, role: p.kind === 'parent' ? 'parent' : 'family' });

async function sendable(db: Db, p: Principal, id: unknown) {
  const a = await one(db, p, id);
  return a && familyCanSend(a) ? a : null;
}

/** A family may send any kind (its own child's records); the office, or the health officer for medical ones, checks it. */
export async function familyUploadUrl(db: Db, p: Principal, b: Record<string, unknown>) {
  const a = await sendable(db, p, b.applicantId);
  if (!a) return fail('This application can’t take documents now.', 409);
  return uploadUrl(db, actorOf(p), a.id, b, ALL);
}

export async function familyUploadDone(db: Db, p: Principal, b: Record<string, unknown>) {
  const a = await sendable(db, p, b.applicantId);
  if (!a) return fail('This application can’t take documents now.', 409);
  return finishUpload(db, actorOf(p), a.id, { ...b, verified: false }, ALL);
}

/** The family takes back a document it sent, while the office has not verified it. */
export async function familyRemoveDoc(db: Db, p: Principal, b: Record<string, unknown>): Promise<Result> {
  const a = await sendable(db, p, b.applicantId);
  if (!a || typeof b.docId !== 'string') return fail('Document not found.', 404);
  const { data: d } = await db.from('admission_documents').select('id, kind, source, status, storage_path, moved_to, file_name')
    .eq('id', b.docId).eq('applicant_id', a.id).eq('school_id', p.schoolId).maybeSingle();
  if (!d || d.source !== 'family' || d.moved_to) return fail('Document not found.', 404);
  if (d.status === 'verified') return fail('The school has verified this document, so it stays. Contact the admissions office if it is wrong.', 409);
  const { error } = await db.from('admission_documents').delete().eq('id', d.id);
  if (error) return fail('Could not remove the document.', 500);
  await db.storage.from(DOC_BUCKET).remove([d.storage_path]);
  const who = actorOf(p);
  await db.from('audit_log').insert({ actor_id: who.id, actor_role: who.role, action: 'admission_document.removed', table_name: 'admission_documents', row_id: d.id, school_id: p.schoolId, new_values: { kind: d.kind, applicant: a.id, file: d.file_name, by: 'family' } });
  return { ok: true };
}

// ── One entry point for the apply page and the parent portal ────────────────

export async function familyAction(db: Db, p: Principal, school: { open: boolean }, b: Record<string, unknown>): Promise<Result<Record<string, unknown>>> {
  switch (b.action) {
    case 'list': return { ok: true, applications: await listApplications(db, p) };
    case 'load': {
      const app = await loadForFamily(db, p, b.id);
      return app ? { ok: true, application: app } : fail('Application not found.', 404);
    }
    case 'create': return createForFamily(db, p, school, b);
    case 'save': return saveForFamily(db, p, b);
    case 'submit': return submitForFamily(db, p, b.id);
    case 'upload-url': return familyUploadUrl(db, p, b);
    case 'upload-done': return familyUploadDone(db, p, b);
    case 'remove-doc': return familyRemoveDoc(db, p, b);
    case 'book':
    case 'cancel-booking': {
      const app = await loadForFamily(db, p, b.applicantId);
      if (!app?.assessment) return fail('Booking isn’t open for this application. Contact the admissions office.', 409);
      return b.action === 'book' ? book(db, p.schoolId, b.slotId, app.id, null) : cancelBooking(db, p.schoolId, app.id, null);
    }
    default: return fail('Unknown action.');
  }
}

export const whoLabel = (p: Principal) => (p.kind === 'phone' ? maskPhone(p.phone) : p.kind === 'parent' ? p.name ?? 'Parent' : 'Access code');
