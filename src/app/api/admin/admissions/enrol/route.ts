import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { gradeOf } from '@/lib/admin/format';
import { createPeople } from '@/lib/ops/accounts';
import { displayClass, normClass } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

/**
 * Enrol an applicant who has an offer (admissions.manage): the admissions record becomes the student.
 *   POST { applicantId, className, rollNo, studentEmail?, parentEmail?, billFees? }
 * Creates the student's login (a school login ID when they have no email), links an existing parent account with
 * the guardian's email or creates one, adds the verified guardian link, bills the instalments already raised for
 * the grade this session (billFees), and moves the applicant to Enrolled. Temporary passwords come back once.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.applicantId)) return bad('Pick the applicant.');
  const { data: a } = await db.from('admission_applicants').select('*').eq('id', b.applicantId).eq('school_id', admin.schoolId).maybeSingle();
  if (!a) return bad('That applicant no longer exists.', 404);
  if (a.student_id) return bad(`${a.name} is already enrolled.`, 409);
  if (a.stage !== 'offer') return bad('Only an applicant with an offer can be enrolled. Move them to Offer first.', 409);

  const cls = displayClass(str(b.className, 40));
  if (!normClass(cls)) return bad('Pick the section they join.');
  if (gradeOf(cls) !== a.grade) return bad(`${a.name} applied for grade ${a.grade}, but ${cls} is grade ${gradeOf(cls) ?? '?'}.`);
  const rollNo = str(b.rollNo, 30);
  if (!rollNo) return bad('Give their admission number.');

  const { data: school } = await db.from('schools').select('settings').eq('id', admin.schoolId).single();
  const code = String(school?.settings?.code || 'school').toLowerCase().replace(/[^a-z0-9]/g, '') || 'school';
  const slug = a.name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '') || 'student';
  const studentEmail = (str(b.studentEmail, 160) || `${slug}.${rollNo.toLowerCase().replace(/[^a-z0-9]/g, '')}@${code}.students.sthara.in`).toLowerCase();
  const parentEmail = (str(b.parentEmail, 160) || a.guardian_email || '').toLowerCase();

  // The section must be on the school's list of classes (account checks use it).
  const { data: classes } = await db.from('classes').select('name').eq('school_id', admin.schoolId);
  if (!(classes || []).some(c => normClass(c.name) === normClass(cls))) {
    const { error } = await db.from('classes').insert({ school_id: admin.schoolId, name: cls, metadata: {} });
    if (error) return bad(`Could not add ${cls} to the classes list: ${error.message}`, 500);
  }

  // An existing parent account in this school with the guardian's email is linked, not duplicated.
  let existingParent: { id: string } | null = null;
  if (parentEmail) {
    const { data: u } = await db.from('users').select('id, role, school_id').eq('email', parentEmail).maybeSingle();
    if (u && (u.role !== 'parent' || u.school_id !== admin.schoolId)) return bad(`${parentEmail} is already used by another account. Use a different parent email.`, 409);
    existingParent = u ? { id: u.id } : null;
  }
  const people: any[] = [{ role: 'student', name: a.name, email: studentEmail, className: cls, rollNo }];
  if (parentEmail && !existingParent) people.push({ role: 'parent', name: a.guardian_name || `Parent of ${a.name}`, email: parentEmail, children: [rollNo] });
  const { issues, results } = await createPeople(db, admin.schoolId, admin.id, people);
  if (issues.length) return bad(issues.map(i => `${i.field}: ${i.message}`).join('; '), 400);
  const student = results.find(r => r.role === 'student');
  if (!student || student.status !== 'created') return bad(`Could not create the student's login: ${student?.message || 'unknown error'}`, 500);
  const parent = results.find(r => r.role === 'parent');
  if (existingParent) {
    await db.from('guardians').upsert({ parent_id: existingParent.id, student_id: student.userId, relationship: 'parent', verified: true }, { onConflict: 'parent_id,student_id' });
  }
  const parentId = existingParent?.id ?? (parent?.status === 'created' ? parent.userId : null);

  const { error: moveErr } = await db.from('admission_applicants').update({
    stage: 'enrolled', furthest_stage: 'enrolled', stage_changed_at: new Date().toISOString(), student_id: student.userId, parent_id: parentId,
  }).eq('id', a.id);
  if (moveErr) console.warn('[enrol] applicant not moved:', moveErr.message);
  await db.from('admission_events').insert({ applicant_id: a.id, school_id: admin.schoolId, from_stage: 'offer', to_stage: 'enrolled', note: `Enrolled into ${cls}, admission no. ${rollNo}`, actor_id: admin.id });

  let invoices = 0;
  if (b.billFees) {
    const { data, error } = await db.rpc('admin_invoice_student', { p_school: admin.schoolId, p_student: student.userId, p_session: a.session, p_actor: admin.id });
    if (error) console.warn('[enrol] invoices:', error.message); else invoices = data ?? 0;
  }
  return NextResponse.json({
    ok: true, cls, rollNo, invoices,
    student: { email: studentEmail, tempPassword: student.tempPassword },
    parent: parent?.status === 'created' ? { email: parentEmail, tempPassword: parent.tempPassword } : existingParent ? { email: parentEmail, linked: true } : null,
    parentError: parent && parent.status !== 'created' ? parent.message : null,
  });
}
