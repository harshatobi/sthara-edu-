import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gradeOf } from '@/lib/admin/format';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { createPeople, type PersonResult } from './accounts';
import { PERSON_ROLES, type PersonInput, type RowIssue } from './people';

/**
 * Account requests: schools ask, Sthara operators approve (every login can use the AI features, which Sthara pays
 * for, so only operators create logins). Two kinds:
 *  - enrolment: an admissions applicant with an offer becomes a student in a section, with the parent's login
 *    (or a link to their existing one), optionally billed the instalments already raised for the grade;
 *  - accounts: staff, students and parents the school lists.
 * Approving creates the accounts with the operator as the actor; temporary passwords come back to the operator
 * once and are never stored (the request keeps emails and ids only).
 */

export interface EnrolOptions { className: string; rollNo: string; studentEmail?: string | null; parentEmail?: string | null; billFees?: boolean }
export interface AccountRequest {
  id: string; school_id: string; kind: 'enrolment' | 'accounts'; applicant_id: string | null;
  people: PersonInput[]; options: Partial<EnrolOptions>; note: string | null; status: string; requested_by: string | null;
}
export interface Issued { role: string; name: string; email: string; tempPassword?: string; linked?: boolean }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Checks a school's enrolment details against the applicant and the class list; returns the clean options or an error. */
export async function checkEnrolment(db: SupabaseClient, schoolId: string, a: { name: string; grade: number; stage: string; student_id: string | null }, raw: Record<string, unknown>)
  : Promise<{ options: EnrolOptions } | { error: string; status?: number }> {
  if (a.student_id) return { error: `${a.name} is already enrolled.`, status: 409 };
  if (a.stage !== 'offer') return { error: 'Only an applicant with an offer can be enrolled. Move them to Offer first.', status: 409 };
  const cls = displayClass(str(raw.className, 40));
  if (!normClass(cls)) return { error: 'Pick the section they join.' };
  if (gradeOf(cls) !== a.grade) return { error: `${a.name} applied for grade ${a.grade}, but ${cls} is grade ${gradeOf(cls) ?? '?'}.` };
  const { data: classes } = await db.from('classes').select('name').eq('school_id', schoolId);
  const hit = (classes || []).find(c => normClass(c.name) === normClass(cls));
  if (!hit) return { error: `${cls} isn't on your school's class list. Ask Sthara to add it.` };
  const rollNo = str(raw.rollNo, 30);
  if (!rollNo) return { error: 'Give their admission number.' };
  const studentEmail = str(raw.studentEmail, 160).toLowerCase() || null;
  const parentEmail = str(raw.parentEmail, 160).toLowerCase() || null;
  if (studentEmail && !EMAIL.test(studentEmail)) return { error: "The student's email doesn't look right." };
  if (parentEmail && !EMAIL.test(parentEmail)) return { error: "The parent's email doesn't look right." };
  return { options: { className: hit.name, rollNo, studentEmail, parentEmail, billFees: raw.billFees === true } };
}

/** Checks the people a school asks accounts for (roles, names, emails; classes and emails in use are checked again on approval). */
export function checkPeople(raw: unknown): { people: PersonInput[] } | { error: string } {
  if (!Array.isArray(raw) || !raw.length) return { error: 'Add at least one person.' };
  if (raw.length > 100) return { error: 'At most 100 people in one request.' };
  const people: PersonInput[] = [];
  for (const [i, x] of raw.entries()) {
    const r = (x ?? {}) as Record<string, unknown>;
    const role = r.role as PersonInput['role'];
    if (!PERSON_ROLES.includes(role)) return { error: `Row ${i + 1}: pick a role.` };
    const name = str(r.name, 120), email = str(r.email, 160).toLowerCase();
    if (!name) return { error: `Row ${i + 1}: add their name.` };
    if (!EMAIL.test(email)) return { error: `Row ${i + 1}: add a valid email.` };
    const p: PersonInput = { role, name, email };
    if (role === 'student') {
      p.className = str(r.className, 40); p.rollNo = str(r.rollNo, 30);
      if (!p.className || !p.rollNo) return { error: `Row ${i + 1}: a student needs a class and an admission number.` };
    }
    if (role === 'parent') p.children = (Array.isArray(r.children) ? r.children : str(r.children, 200).split(/[,\s]+/)).map(c => str(c, 30)).filter(Boolean).slice(0, 10);
    people.push(p);
  }
  return { people };
}

/** Runs an approved request. Returns what was created (with passwords, for the operator only) or the problems. */
export async function fulfil(db: SupabaseClient, req: AccountRequest, actorId: string)
  : Promise<{ ok: true; issued: Issued[]; summary: Record<string, unknown> } | { ok: false; error: string; issues?: RowIssue[] }> {
  if (req.kind === 'accounts') {
    const { issues, results } = await createPeople(db, req.school_id, actorId, req.people);
    if (issues.length) return { ok: false, error: 'Some rows need fixing before anything is created.', issues };
    const made = results.filter(r => r.status === 'created');
    const failed = results.filter(r => r.status !== 'created');
    return {
      ok: true,
      issued: made.map(r => ({ role: r.role, name: r.name, email: r.email, tempPassword: r.tempPassword })),
      summary: { created: made.map(r => ({ role: r.role, email: r.email, userId: r.userId })), failed: failed.map(r => ({ email: r.email, message: r.message })) },
    };
  }

  // Enrolment: re-check the applicant and the section (things may have moved since the school asked).
  const { data: a } = await db.from('admission_applicants').select('*').eq('id', req.applicant_id).eq('school_id', req.school_id).maybeSingle();
  if (!a) return { ok: false, error: 'That applicant no longer exists.' };
  const checked = await checkEnrolment(db, req.school_id, a, req.options as Record<string, unknown>);
  if ('error' in checked) return { ok: false, error: checked.error };
  const o = checked.options;

  const { data: school } = await db.from('schools').select('settings').eq('id', req.school_id).single();
  const code = String((school?.settings as { code?: string } | null)?.code || 'school').toLowerCase().replace(/[^a-z0-9]/g, '') || 'school';
  const slug = String(a.name).toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'student';
  const studentEmail = o.studentEmail || `${slug}.${o.rollNo.toLowerCase().replace(/[^a-z0-9]/g, '')}@${code}.students.sthara.in`;
  const parentEmail = o.parentEmail || (a.guardian_email ? String(a.guardian_email).toLowerCase() : '');

  // An existing parent account in this school with the guardian's email is linked, not duplicated.
  let existingParent: string | null = null;
  if (parentEmail) {
    const { data: u } = await db.from('users').select('id, role, school_id').eq('email', parentEmail).maybeSingle();
    if (u && (u.role !== 'parent' || u.school_id !== req.school_id)) return { ok: false, error: `${parentEmail} is already used by another account. Ask the school for a different parent email.` };
    existingParent = u?.id ?? null;
  }
  const people: PersonInput[] = [{ role: 'student', name: a.name, email: studentEmail, className: o.className, rollNo: o.rollNo }];
  if (parentEmail && !existingParent) people.push({ role: 'parent', name: a.guardian_name || `Parent of ${a.name}`, email: parentEmail, children: [o.rollNo] });
  const { issues, results } = await createPeople(db, req.school_id, actorId, people);
  if (issues.length) return { ok: false, error: issues.map(i => `${i.field}: ${i.message}`).join('; '), issues };
  const student = results.find(r => r.role === 'student') as PersonResult | undefined;
  if (!student || student.status !== 'created') return { ok: false, error: `Could not create the student's login: ${student?.message || 'unknown error'}` };
  const parent = results.find(r => r.role === 'parent');
  if (existingParent) {
    await db.from('guardians').upsert({ parent_id: existingParent, student_id: student.userId, relationship: 'parent', verified: true }, { onConflict: 'parent_id,student_id' });
  }
  const parentId = existingParent ?? (parent?.status === 'created' ? parent.userId ?? null : null);
  const { error: moveErr } = await db.from('admission_applicants').update({
    stage: 'enrolled', furthest_stage: 'enrolled', stage_changed_at: new Date().toISOString(), student_id: student.userId, parent_id: parentId,
  }).eq('id', a.id);
  if (moveErr) console.warn('[enrol] applicant not moved:', moveErr.message);
  await db.from('admission_events').insert({ applicant_id: a.id, school_id: req.school_id, from_stage: 'offer', to_stage: 'enrolled', note: `Enrolled into ${o.className}, admission no. ${o.rollNo}`, actor_id: actorId });

  let invoices = 0;
  if (o.billFees) {
    const { data, error } = await db.rpc('admin_invoice_student', { p_school: req.school_id, p_student: student.userId, p_session: a.session, p_actor: actorId });
    if (error) console.warn('[enrol] invoices:', error.message); else invoices = Number(data ?? 0);
  }
  const issued: Issued[] = [{ role: 'student', name: a.name, email: studentEmail, tempPassword: student.tempPassword }];
  if (parent?.status === 'created') issued.push({ role: 'parent', name: parent.name, email: parentEmail, tempPassword: parent.tempPassword });
  else if (existingParent) issued.push({ role: 'parent', name: a.guardian_name || 'Parent', email: parentEmail, linked: true });
  return {
    ok: true, issued,
    summary: {
      className: o.className, rollNo: o.rollNo, invoices, studentId: student.userId, studentEmail,
      parentId, parentEmail: parentEmail || null, parentLinked: !!existingParent,
      parentError: parent && parent.status !== 'created' ? parent.message : null,
    },
  };
}
