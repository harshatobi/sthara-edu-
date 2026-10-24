import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from '@/lib/admin/format';
import { byIds, pageAll } from '@/lib/ops/page';
import { openText, piiReady, sealText } from '@/lib/students/pii';
import { checkNote, checkReferral, type CaseStatus, type ReferralStatus } from './rules';

/**
 * Counselling (brief 07), server side. Teachers, parents and office staff refer a student; the counsellor opens a
 * case and keeps a note per session. Notes and referral reasons are encrypted (STUDENT_PII_KEY) and only the
 * counsellor reads them, every look recorded. The principal and school admin see that a student has counselling,
 * its dates and status, never the content. The caller has been authorised and passes the school.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
export interface Actor { id: string; schoolId: string }
const NO_KEY = 'Counselling notes can’t be stored yet: the encryption key is not set on this server. Tell Sthara support.';

async function recordLook(db: Db, a: Actor, action: string, table: string, rowId: string) {
  await db.from('audit_log').insert({ actor_id: a.id, actor_role: 'admin', action, table_name: table, row_id: rowId, school_id: a.schoolId, new_values: {} });
}
async function names(db: Db, ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])];
  if (!want.length) return new Map<string, string>();
  const { data } = await byIds<{ id: string; name: string | null }>(want, (chunk, f, t) => db.from('users').select('id, name').in('id', chunk).order('id').range(f, t));
  return new Map(data.map(u => [u.id, u.name || 'Someone']));
}
const open = (c: string | null) => { if (!c) return ''; try { return openText(c); } catch { return '(could not be read: the key has changed)'; } };

/** Office accounts that hold the counsellor role today (who a referral goes to). */
export async function counsellorsOf(db: Db, schoolId: string): Promise<string[]> {
  const today = isoDay();
  const { data: g } = await db.from('role_grants').select('user_id, expires_on').eq('school_id', schoolId).eq('role_key', 'counsellor').is('revoked_at', null);
  const ids = [...new Set((g || []).filter(x => !x.expires_on || x.expires_on >= today).map(x => x.user_id as string))];
  if (!ids.length) return [];
  // bounded: the holders of one role in one school
  const { data: u } = await db.from('users').select('id, role, school_id').in('id', ids);
  return (u || []).filter(x => x.role === 'admin' && x.school_id === schoolId).map(x => x.id as string);
}

// ── Referrals ───────────────────────────────────────────────────────────────

/**
 * A referral to the counsellor. `studentId` is the register id. The counsellors get an in-app note that a referral
 * is waiting, never its reason or the student's name.
 */
export async function refer(db: Db, a: Actor & { kind: 'teacher' | 'parent' | 'office' }, studentId: string, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const c = checkReferral(b);
  if ('error' in c) return fail(c.error);
  if (!piiReady()) return fail(NO_KEY, 503);
  const { data: st } = await db.from('students').select('id, status').eq('id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!st || st.status !== 'active') return fail('That student is not on the register.', 404);
  const counsellors = await counsellorsOf(db, a.schoolId);
  if (!counsellors.length) return fail('The school has no counsellor in Sthara yet. Speak to the principal.', 409);
  // One open referral per referrer and student: a second press doesn't make a second one.
  const { data: dup } = await db.from('counselling_referrals').select('id').eq('student_id', st.id).eq('from_user', a.id).eq('status', 'new').maybeSingle();
  if (dup) return fail('You have already referred this student; the counsellor hasn’t seen it yet.', 409);
  const { data, error } = await db.from('counselling_referrals').insert({ school_id: a.schoolId, student_id: st.id, from_kind: a.kind, from_user: a.id, reason_cipher: sealText(c.reason) })
    .select('id').single();
  if (error || !data) return fail('Could not send the referral.', 500);
  await db.from('notifications').insert(counsellors.map(uid => ({
    school_id: a.schoolId, user_id: uid, type: 'counselling_referral', title: 'A new referral is waiting', body: 'Open Counselling to see it.', metadata: { referralId: data.id },
  })));
  return { ok: true, id: data.id };
}

/** What someone referred, with only the status they may know. */
export async function referredBy(db: Db, schoolId: string, userId: string) {
  const { data } = await db.from('counselling_referrals').select('id, student_id, status, created_at, seen_at, students!inner(full_name, admission_no)')
    .eq('school_id', schoolId).eq('from_user', userId).order('created_at', { ascending: false }).limit(100);
  return (data || []).map((r: any) => ({
    id: r.id as string, studentId: r.student_id as string, student: r.students.full_name as string, status: (r.status === 'new' ? 'new' : 'seen') as 'new' | 'seen',
    createdAt: r.created_at as string, seenAt: r.seen_at as string | null,
  }));
}

/** The counsellor's inbox: new referrals (and the last 90 days of seen ones), with their reasons. Recorded. */
export async function inbox(db: Db, a: Actor) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await pageAll<any>((f, t) => db.from('counselling_referrals').select('id, student_id, from_kind, from_user, reason_cipher, status, case_id, created_at, seen_at, students!inner(full_name, admission_no)')
    .eq('school_id', a.schoolId).or(`status.eq.new,created_at.gte.${since}`).order('created_at', { ascending: false }).order('id').range(f, t), 2_000);
  if (error) throw new Error(error.message);
  const who = await names(db, data.map(r => r.from_user));
  if (data.length) await recordLook(db, a, 'counselling.referrals_viewed', 'counselling_referrals', a.schoolId);
  return data.map(r => ({
    id: r.id as string, studentId: r.student_id as string, student: r.students.full_name as string, admissionNo: r.students.admission_no as string,
    fromKind: r.from_kind as string, from: r.from_user ? who.get(r.from_user) ?? null : null, reason: open(r.reason_cipher), status: r.status as ReferralStatus,
    caseId: r.case_id as string | null, createdAt: r.created_at as string,
  }));
}

/** Marks a referral seen without opening a case (the counsellor talked to the student, nothing more needed). */
export async function closeReferral(db: Db, a: Actor, id: string): Promise<Result> {
  const { data } = await db.from('counselling_referrals').update({ status: 'declined', seen_by: a.id, seen_at: new Date().toISOString() })
    .eq('id', id).eq('school_id', a.schoolId).eq('status', 'new').select('id').maybeSingle();
  return data ? { ok: true } : fail('Already seen.', 409);
}

// ── Cases ───────────────────────────────────────────────────────────────────

/** Opens a case for a student (from a referral, which is then marked seen). One open case per student. */
export async function openCase(db: Db, a: Actor, b: { studentId?: unknown; referralId?: unknown }): Promise<Result<{ id: string }>> {
  let studentId = typeof b.studentId === 'string' ? b.studentId : null;
  let referral: { id: string; student_id: string } | null = null;
  if (typeof b.referralId === 'string') {
    const { data } = await db.from('counselling_referrals').select('id, student_id, status').eq('id', b.referralId).eq('school_id', a.schoolId).maybeSingle();
    if (!data) return fail('Referral not found.', 404);
    referral = data;
    studentId = data.student_id;
  }
  if (!studentId) return fail('Pick the student.');
  const { data: st } = await db.from('students').select('id, status').eq('id', studentId).eq('school_id', a.schoolId).maybeSingle();
  if (!st || st.status === 'cancelled') return fail('That student is not on the register.', 404);
  const { data: cur } = await db.from('counselling_cases').select('id').eq('student_id', st.id).eq('status', 'open').maybeSingle();
  const caseId = cur?.id ?? (await db.from('counselling_cases').insert({ school_id: a.schoolId, student_id: st.id, opened_on: isoDay(), counsellor_id: a.id }).select('id').single()).data?.id;
  if (!caseId) return fail('Could not open the case.', 500);
  if (referral) await db.from('counselling_referrals').update({ status: 'seen', seen_by: a.id, seen_at: new Date().toISOString(), case_id: caseId }).eq('id', referral.id).eq('status', 'new');
  return { ok: true, id: caseId };
}

export async function setCaseStatus(db: Db, a: Actor, id: string, status: unknown): Promise<Result> {
  if (status !== 'open' && status !== 'closed' && status !== 'referred') return fail('Pick the status.');
  const { data: c } = await db.from('counselling_cases').select('id, student_id, status').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!c) return fail('Case not found.', 404);
  if (status === 'open' && c.status !== 'open') {
    const { data: other } = await db.from('counselling_cases').select('id').eq('student_id', c.student_id).eq('status', 'open').neq('id', id).maybeSingle();
    if (other) return fail('The student already has an ongoing case.', 409);
  }
  const { error } = await db.from('counselling_cases').update({ status, closed_on: status === 'open' ? null : isoDay() }).eq('id', id);
  return error ? fail('Could not save.', 500) : { ok: true };
}

export async function addNote(db: Db, a: Actor, caseId: string, b: Record<string, unknown>): Promise<Result<{ id: string }>> {
  const n = checkNote(b, isoDay());
  if ('error' in n) return fail(n.error);
  if (!piiReady()) return fail(NO_KEY, 503);
  const { data: c } = await db.from('counselling_cases').select('id').eq('id', caseId).eq('school_id', a.schoolId).maybeSingle();
  if (!c) return fail('Case not found.', 404);
  const { data, error } = await db.from('counselling_sessions').insert({ school_id: a.schoolId, case_id: caseId, on_date: n.on_date, notes_cipher: sealText(n.notes), counsellor_id: a.id })
    .select('id').single();
  return error || !data ? fail('Could not save the note.', 500) : { ok: true, id: data.id };
}

export interface CaseRow { id: string; studentId: string; student: string; admissionNo: string; status: CaseStatus; openedOn: string; closedOn: string | null; sessions: number; lastSession: string | null; counsellor: string | null }

/** Every case in the school, newest first: dates, status and how many sessions. No content, so the overview uses it too. */
export async function cases(db: Db, schoolId: string, studentId?: string): Promise<CaseRow[]> {
  let q = db.from('counselling_cases').select('id, student_id, status, opened_on, closed_on, counsellor_id, students!inner(full_name, admission_no)').eq('school_id', schoolId);
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await pageAll<any>((f, t) => q.order('opened_on', { ascending: false }).order('id').range(f, t), 10_000);
  if (error) throw new Error(error.message);
  const { data: s } = await byIds<{ case_id: string; on_date: string }>(data.map(c => c.id), (chunk, f, t) =>
    db.from('counselling_sessions').select('case_id, on_date').in('case_id', chunk).order('id').range(f, t));
  const who = await names(db, data.map(c => c.counsellor_id));
  return data.map(c => {
    const mine = s.filter(x => x.case_id === c.id).map(x => x.on_date).sort();
    return {
      id: c.id, studentId: c.student_id, student: c.students.full_name, admissionNo: c.students.admission_no, status: c.status, openedOn: c.opened_on, closedOn: c.closed_on,
      sessions: mine.length, lastSession: mine.at(-1) ?? null, counsellor: c.counsellor_id ? who.get(c.counsellor_id) ?? null : null,
    };
  });
}

/** One case with its notes, for the counsellor. Recorded. */
export async function caseNotes(db: Db, a: Actor, id: string) {
  const { data: c } = await db.from('counselling_cases').select('id, student_id, status, opened_on, closed_on, students!inner(full_name, admission_no)').eq('id', id).eq('school_id', a.schoolId).maybeSingle();
  if (!c) return null;
  const [{ data: notes }, { data: refs }] = await Promise.all([
    db.from('counselling_sessions').select('id, on_date, notes_cipher, counsellor_id, created_at').eq('case_id', id).order('on_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    db.from('counselling_referrals').select('id, from_kind, reason_cipher, created_at').eq('case_id', id).order('created_at').limit(50),
  ]);
  const who = await names(db, (notes || []).map(n => n.counsellor_id));
  await recordLook(db, a, 'counselling.viewed', 'counselling_cases', id);
  const st = (c as any).students;
  return {
    id: c.id, studentId: c.student_id, student: st.full_name as string, admissionNo: st.admission_no as string, status: c.status as CaseStatus, openedOn: c.opened_on, closedOn: c.closed_on,
    notes: (notes || []).map(n => ({ id: n.id as string, onDate: n.on_date as string, text: open(n.notes_cipher), by: n.counsellor_id ? who.get(n.counsellor_id) ?? null : null })),
    referrals: (refs || []).map(r => ({ id: r.id as string, fromKind: r.from_kind as string, reason: open(r.reason_cipher), createdAt: r.created_at as string })),
  };
}

/** Students on the register to open a case for. */
export async function searchStudents(db: Db, schoolId: string, q: string) {
  const t = q.trim().replace(/[%_,()]/g, ' ');
  if (t.length < 2) return [];
  const { data } = await db.from('students').select('id, full_name, admission_no').eq('school_id', schoolId).eq('status', 'active')
    .or(`full_name.ilike.%${t}%,admission_no.ilike.%${t}%`).order('full_name').limit(20);
  return (data || []).map(s => ({ id: s.id as string, name: s.full_name as string, admissionNo: s.admission_no as string }));
}
