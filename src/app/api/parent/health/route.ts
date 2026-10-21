import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { parentHealth } from '@/lib/students/healthServer';
import { propose } from '@/lib/students/family';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * The health card of the parent's verified children (the UDISE+ part always; allergies, conditions, medication,
 * check-ups and vaccinations once health consent is given).
 *   POST { studentId, proposed: { blood_group?, allergies?, conditions?, medication? }, note? }   the health officer approves
 */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { data: kids } = await auth.db.from('guardians').select('student_id').eq('parent_id', auth.parent.id).eq('verified', true).limit(20);
  const children = await Promise.all((kids || []).map(async k => ({ studentId: k.student_id as string, view: await parentHealth(auth.db, auth.parent.id, k.student_id) })));
  return NextResponse.json({ children: children.filter(c => c.view) });
}

export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`parent-health:${auth.parent.id}`, 10, 60_000).allowed) return NextResponse.json({ error: 'Too many changes at once. Wait a minute.' }, { status: 429 });
  const b = (await req.json().catch(() => null)) || {};
  if (typeof b.studentId !== 'string') return NextResponse.json({ error: 'Pick your child.' }, { status: 400 });
  const out = await propose(auth.db, auth.parent.id, b.studentId, 'health', b.proposed, null, b.note);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
