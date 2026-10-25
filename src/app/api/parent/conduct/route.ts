import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { forParent } from '@/lib/conduct/discipline';
import { counsellorsOf, refer, referredBy } from '@/lib/conduct/counselling';

export const dynamic = 'force-dynamic';

/**
 * Discipline and counselling for parents (brief 07).
 *   GET   for each verified child: the discipline actions the school approved (warnings and detentions of earlier
 *         sessions left out), and whether the parent's requests to see the counsellor were seen. Never counselling
 *         notes, incidents or child protection.
 *   POST  { action: 'refer', studentId (the child's login id), reason }   ask for the counsellor to see the child
 */
async function children(db: any, parentId: string) {
  const { data: kids } = await db.from('guardians').select('student_id').eq('parent_id', parentId).eq('verified', true).limit(20);
  const out: { userId: string; studentId: string; schoolId: string; name: string }[] = [];
  for (const k of kids || []) {
    const { data: st } = await db.from('students').select('id, school_id, full_name, status').eq('user_id', k.student_id).maybeSingle();
    if (st && st.status !== 'cancelled') out.push({ userId: k.student_id, studentId: st.id, schoolId: st.school_id, name: st.full_name });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  const kids = await children(db, parent.id);
  const mine = await referredBy(db, parent.schoolId, parent.id);
  const hasCounsellor = (await counsellorsOf(db, parent.schoolId)).length > 0;
  return NextResponse.json({
    hasCounsellor,
    children: await Promise.all(kids.map(async k => ({
      studentId: k.userId, name: k.name, actions: await forParent(db, k.schoolId, k.studentId),
      requests: mine.filter(r => r.studentId === k.studentId).map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
    }))),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  const b = (await req.json().catch(() => null)) || {};
  if (b.action !== 'refer') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const kid = (await children(db, parent.id)).find(k => k.userId === b.studentId);
  if (!kid) return NextResponse.json({ error: 'Pick your child.' }, { status: 404 });
  const out = await refer(db, { id: parent.id, schoolId: kid.schoolId, kind: 'parent' }, kid.studentId, b);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
