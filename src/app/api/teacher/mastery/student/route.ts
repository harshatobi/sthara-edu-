import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normSubject } from '@/lib/teacher/scope';
import { isUuid } from '@/lib/admin/serverAuth';
import { engagementAt, loadStudentEvidence } from '@/lib/tml/engine';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * GET ?student=&subject=   The evidence behind one student's TML in a subject, for the Mastery Tracker's score
 * waterfall and what-if (lib/tml/engine explainTopic / simulateTopic run in the browser on exactly this).
 * Only for a student in a class the teacher teaches that subject to (school office: academic health).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const studentId = str(req.nextUrl.searchParams.get('student'), 40);
  const subject = str(req.nextUrl.searchParams.get('subject'), 80);
  if (!isUuid(studentId) || !subject) return NextResponse.json({ error: 'Pick a student and subject.' }, { status: 400 });
  const { data: st } = await db.from('users').select('id, role, school_id, student_class').eq('id', studentId).maybeSingle();
  if (!st || st.role !== 'student' || st.school_id !== staff.schoolId) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  if (!(staff.role === 'admin' || inScope((staff as Staff).scope, st.student_class, subject))) return NextResponse.json({ error: 'You don’t teach this student that subject.' }, { status: 403 });
  try {
    const { evidence, flagged, engagementBase } = await loadStudentEvidence(db, studentId);
    const sk = normSubject(subject);
    const mine = evidence.filter(e => normSubject(e.subject) === sk);
    const ids = new Set(mine.map(e => e.assignmentId).filter(Boolean));
    const nowMs = Date.now();
    // Tutor practice volume counts sessions in every subject, so engagement is worked out from all the evidence.
    return NextResponse.json({ nowMs, evidence: mine, flagged: [...flagged].filter(id => ids.has(id)), engagement: engagementAt(engagementBase, evidence, nowMs) });
  } catch (e) {
    console.error('[teacher mastery student]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the evidence.' }, { status: 500 });
  }
}
