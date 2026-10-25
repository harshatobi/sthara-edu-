import { NextResponse, type NextRequest } from 'next/server';
import { isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { confirmedSiblings } from '@/lib/students/family';

export const dynamic = 'force-dynamic';

/** GET ?user=<student login id> — the student's confirmed siblings at this school (for fee concessions). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['students.read', 'fees.concession.request']);
  if ('res' in auth) return auth.res;
  const user = req.nextUrl.searchParams.get('user');
  if (!isUuid(user)) return NextResponse.json({ siblings: [] });
  const { data: st } = await auth.db.from('students').select('id').eq('user_id', user).eq('school_id', auth.admin.schoolId).maybeSingle();
  if (!st) return NextResponse.json({ siblings: [] });
  const sibs = await confirmedSiblings(auth.db, auth.admin.schoolId, st.id);
  return NextResponse.json({ siblings: sibs.map(s => ({ name: s.full_name, admissionNo: s.admission_no, userId: s.user_id })) });
}
