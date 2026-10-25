import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { studentRecord } from '@/lib/cocurricular/server';

export const dynamic = 'force-dynamic';

/** GET: each verified child's house, clubs and teams, and approved Kirti (brief 06). */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { data: kids } = await auth.db.from('guardians').select('student_id').eq('parent_id', auth.parent.id).eq('verified', true).limit(20);
  const children = await Promise.all((kids || []).map(async k => {
    const { data: st } = await auth.db.from('students').select('id, school_id').eq('user_id', k.student_id).maybeSingle();
    return { studentId: k.student_id as string, record: st ? await studentRecord(auth.db, st.school_id, st.id, true) : null };
  }));
  return NextResponse.json({ children: children.filter(c => c.record) });
}
