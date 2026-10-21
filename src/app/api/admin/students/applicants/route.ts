import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { admittable } from '@/lib/students/server';

export const dynamic = 'force-dynamic';

/** GET — applicants marked enrolled who aren't on the register yet, to pre-fill an admission (students.manage). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'students.manage');
  if ('res' in auth) return auth.res;
  return NextResponse.json({ applicants: await admittable(auth.db, auth.admin.schoolId) });
}
