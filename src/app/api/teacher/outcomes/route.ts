import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { chainStep, classYear } from '@/lib/students/server';

export const dynamic = 'force-dynamic';

/**
 * Year-end outcomes for the class teacher (their own class only).
 *   GET                                         my class, student by student, with each report card result and a suggestion
 *   POST { items: [{ id, outcome, note? }] }    propose outcomes (again after a return); the principal approves next
 */
async function myClass(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth;
  const { data } = await auth.db.from('users').select('teacher_class').eq('id', auth.staff.id).maybeSingle();
  const cls = data?.teacher_class?.trim();
  if (auth.staff.role !== 'teacher' || !cls) return { res: NextResponse.json({ error: 'Only a class teacher proposes year-end outcomes.' }, { status: 403 }) };
  return { ...auth, cls };
}

export async function GET(req: NextRequest) {
  const auth = await myClass(req);
  if ('res' in auth) return auth.res;
  try {
    return NextResponse.json(await classYear(auth.db, auth.staff.schoolId, auth.cls));
  } catch (e) {
    console.error('[teacher/outcomes]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load your class.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await myClass(req);
  if ('res' in auth) return auth.res;
  const b = (await req.json().catch(() => null)) || {};
  const items = Array.isArray(b.items) ? b.items.filter((i: any) => i && typeof i.id === 'string').slice(0, 500) : [];
  const out = await chainStep(auth.db, { id: auth.staff.id, name: auth.staff.name, schoolId: auth.staff.schoolId }, 'propose', items, auth.cls);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
