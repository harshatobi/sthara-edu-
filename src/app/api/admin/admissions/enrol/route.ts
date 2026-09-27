import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { checkEnrolment } from '@/lib/ops/requests';

export const dynamic = 'force-dynamic';

/**
 * Ask Sthara to enrol an applicant who has an offer (admissions.manage). Logins are created by Sthara operators
 * only, so this files a request; approving it in the ops console creates the student's login and the parent's
 * (or links their existing account), adds the guardian link, bills the grade's instalments (billFees) and moves
 * the applicant to Enrolled.
 *   POST   { applicantId, className, rollNo, studentEmail?, parentEmail?, billFees? }
 *   DELETE { applicantId }   withdraw the pending request
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.applicantId)) return bad('Pick the applicant.');
  const { data: a } = await db.from('admission_applicants').select('id, name, grade, stage, student_id').eq('id', b.applicantId).eq('school_id', admin.schoolId).maybeSingle();
  if (!a) return bad('That applicant no longer exists.', 404);
  const checked = await checkEnrolment(db, admin.schoolId, a, b);
  if ('error' in checked) return bad(checked.error, checked.status ?? 400);
  const { data: open } = await db.from('account_requests').select('id').eq('applicant_id', a.id).eq('status', 'pending').maybeSingle();
  if (open) return bad(`${a.name}'s enrolment is already with Sthara.`, 409);
  const { data, error } = await db.from('account_requests').insert({
    school_id: admin.schoolId, kind: 'enrolment', applicant_id: a.id, options: checked.options, requested_by: admin.id,
  }).select('id').single();
  if (error) {
    console.error('[enrol request]', error.message);
    return bad(error.code === '23505' ? `${a.name}'s enrolment is already with Sthara.` : 'Could not send the request. Try again.', error.code === '23505' ? 409 : 500);
  }
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'admissions.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.applicantId)) return bad('Pick the applicant.');
  const { data, error } = await db.from('account_requests').update({ status: 'cancelled', decided_by: admin.id, decided_at: new Date().toISOString() })
    .eq('applicant_id', b.applicantId).eq('school_id', admin.schoolId).eq('status', 'pending').select('id');
  if (error) return bad('Could not withdraw the request.', 500);
  if (!data?.length) return bad('There is no pending request to withdraw.', 404);
  return NextResponse.json({ ok: true });
}
