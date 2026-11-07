import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass } from '@/lib/teacher/scope';
import { pageAll } from '@/lib/ops/page';
import { tutorInsight } from '@/lib/tutor/insightServer';

export const dynamic = 'force-dynamic';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * GET ?class=&subject=   What the Socratic tutor has seen in a class and subject the teacher teaches: per chapter,
 * sessions, students, average depth, who is struggling, the misconceptions it tagged and the chapter's bank.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = str(req.nextUrl.searchParams.get('class'), 40);
  const subject = str(req.nextUrl.searchParams.get('subject'), 80);
  if (!cls || !subject) return NextResponse.json({ error: 'Pick a class and subject.' }, { status: 400 });
  if (!(staff.role === 'admin' || inScope((staff as Staff).scope, cls, subject))) return NextResponse.json({ error: 'You don’t teach that class and subject.' }, { status: 403 });
  try {
    const r = await pageAll<{ id: string; name: string | null; student_class: string | null }>((a, b) => db.from('users').select('id, name, student_class')
      .eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b));
    const roster = r.data.filter(s => normClass(s.student_class) === normClass(cls)).map(s => ({ id: s.id, name: s.name || 'Student' }));
    return NextResponse.json(await tutorInsight(db, staff.schoolId, cls, subject, roster));
  } catch (e) {
    console.error('[tutor insight]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load what the tutor has seen.' }, { status: 500 });
  }
}
