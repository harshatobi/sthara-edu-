import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { operatorFromRequest } from '@/lib/ops/auth';
import { createPeople } from '@/lib/ops/accounts';
import { PERSON_ROLES, type PersonRole } from '@/lib/ops/people';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/create-user
 * { role, name, email, schoolId, studentClass?, customStudentId?, assignments?, linkedStudents? }
 *
 * Creates one account in a school. Allowed for a platform operator, or an
 * admin of that same school. Never creates superadmins and never modifies an
 * existing login (it used to reset the password and role of any email it was
 * given). Returns a one-time temporary password.
 */
export async function POST(request: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(request.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const b = await request.json().catch(() => ({}));
  const role = b.role as PersonRole;
  const schoolId = typeof b.schoolId === 'string' ? b.schoolId : '';
  if (!PERSON_ROLES.includes(role) || !schoolId) {
    return NextResponse.json({ error: 'role (admin, teacher, student or parent) and schoolId are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const operator = await operatorFromRequest(request);
  if (!operator) {
    const { data: caller } = await admin.from('users').select('role, school_id').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'admin' || caller.school_id !== schoolId) {
      return NextResponse.json({ error: 'Forbidden: only an admin of this school can add accounts' }, { status: 403 });
    }
  }

  const { issues, results } = await createPeople(admin, schoolId, user.id, [{
    role,
    name: b.name,
    email: b.email,
    className: b.studentClass,
    rollNo: b.customStudentId,
    subjects: Array.isArray(b.assignments) ? b.assignments : [],
    classTeacherOf: b.teacherClass,
    children: Array.isArray(b.linkedStudents) ? b.linkedStudents : [],
  }]);
  if (issues.length) return NextResponse.json({ error: issues.map(i => i.message).join('; '), issues }, { status: 422 });
  const r = results[0];
  if (r.status !== 'created') return NextResponse.json({ error: r.message }, { status: 400 });
  return NextResponse.json({ success: true, userId: r.userId, tempPassword: r.tempPassword, message: `${role} account created for ${r.email}` });
}
