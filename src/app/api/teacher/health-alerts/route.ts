import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { accessOf } from '@/lib/admin/serverAuth';
import { normClass } from '@/lib/teacher/scope';
import { classAlerts } from '@/lib/students/healthServer';

export const dynamic = 'force-dynamic';

/**
 * GET ?cls= — allergy and condition alerts for a class the caller teaches (or is class teacher of): the student and
 * one alert line each. Nothing else from the health record.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = (req.nextUrl.searchParams.get('cls') || '').trim().slice(0, 40);
  if (!cls) return NextResponse.json({ alerts: [] });
  let allowed = staff.scope.some(e => normClass(e.cls) === normClass(cls));
  if (!allowed) {
    const { data } = await db.from('users').select('teacher_class').eq('id', staff.id).maybeSingle();
    allowed = !!data?.teacher_class && normClass(data.teacher_class) === normClass(cls);
  }
  if (!allowed && staff.role === 'admin') allowed = (await accessOf(db, staff.id, staff.schoolId)).any('health.read', 'students.read');
  if (!allowed) return NextResponse.json({ error: 'Only teachers of this class see its alerts.' }, { status: 403 });
  return NextResponse.json({ alerts: await classAlerts(db, staff.schoolId, cls) });
}
