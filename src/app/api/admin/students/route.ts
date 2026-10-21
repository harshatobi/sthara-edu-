import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, str } from '@/lib/admin/serverAuth';
import { admit, listRegister } from '@/lib/students/server';

export const dynamic = 'force-dynamic';

/**
 * The student register (Admin › Students).
 *   GET ?search=&cls=&status=active|left|cancelled|all&page=   the register with each student's class this session (students.read)
 *   POST { fields, admissionNo?, aadhaar?, noAadhaar?, className, applicantId? }   admit a student (students.manage)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, 'students.read');
  if ('res' in auth) return auth.res;
  const p = req.nextUrl.searchParams;
  try {
    const out = await listRegister(auth.db, auth.admin.schoolId, { search: str(p.get('search'), 80), cls: str(p.get('cls'), 40), status: str(p.get('status'), 12), page: Number(p.get('page')) || 1 });
    return NextResponse.json({ ...out, can: { manage: auth.admin.access.can('students.manage'), aadhaar: auth.admin.access.can('students.aadhaar') } });
  } catch (e) {
    console.error('[admin/students]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the register.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'students.manage');
  if ('res' in auth) return auth.res;
  const { admin, db } = auth;
  const out = await admit(db, { id: admin.id, name: admin.name, schoolId: admin.schoolId }, (await req.json().catch(() => null)) || {});
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
