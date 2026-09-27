import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

/** "Mathematics: Class 10-A, Class 9-B · class teacher Class 10-A", or that they teach nothing yet. */
function teacherDetail(assignments: unknown, classTeacherOf: string | null) {
  const bySubject = new Map<string, string[]>();
  for (const a of Array.isArray(assignments) ? assignments : []) {
    const { class: c, subject: s } = (a ?? {}) as { class?: unknown; subject?: unknown };
    if (typeof c !== 'string' || typeof s !== 'string') continue;
    bySubject.set(s, [...(bySubject.get(s) ?? []), c]);
  }
  const taught = [...bySubject].map(([s, cs]) => `${s}: ${cs.join(', ')}`).join('; ');
  return [taught || 'No classes or subjects assigned', classTeacherOf && `class teacher ${classTeacherOf}`].filter(Boolean).join(' · ');
}

const ROLES = ['admin', 'teacher', 'student', 'parent', 'superadmin'];
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/ops/people?q=&role=&school=  — the cross-school directory, for support:
 * find any account by name, email or roll number. At most 200 rows.
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const sp = req.nextUrl.searchParams;
  // Keep only characters that can appear in a name, email or roll number: nothing that means anything to PostgREST's or() syntax.
  const q = (sp.get('q') || '').replace(/[^\p{L}\p{N}@._\- ]/gu, '').trim().slice(0, 80);
  const role = sp.get('role') || '';
  const school = sp.get('school') || '';

  const db = createAdminClient();
  let query = db.from('users')
    .select('id, name, email, role, school_id, student_class, custom_student_id, teacher_class, assignments, metadata, created_at')
    .order('name').limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,custom_student_id.ilike.%${q}%`);
  if (ROLES.includes(role)) query = query.eq('role', role);
  if (UUID.test(school)) query = query.eq('school_id', school);
  const [{ data, error }, { data: schools }] = await Promise.all([query, db.from('schools').select('id, name, settings')]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const names = new Map((schools || []).map(s => [s.id, { name: s.name as string, code: (s.settings as { code?: string } | null)?.code ?? null }]));
  return NextResponse.json({
    people: (data || []).map(p => ({
      id: p.id, name: p.name, email: p.email, role: p.role,
      schoolId: p.school_id, school: p.school_id ? names.get(p.school_id)?.name ?? 'Deleted school' : null,
      schoolCode: p.school_id ? names.get(p.school_id)?.code ?? null : null,
      detail: p.role === 'student' ? [p.student_class, p.custom_student_id && `roll ${p.custom_student_id}`].filter(Boolean).join(' · ')
        : p.role === 'teacher' ? teacherDetail(p.assignments, p.teacher_class)
        : p.role === 'parent' ? `${((p.metadata as { linkedStudents?: unknown[] } | null)?.linkedStudents ?? []).length} linked child(ren)` : '',
      tempPassword: !!(p.metadata as { mustChangePassword?: boolean } | null)?.mustChangePassword,
      createdAt: p.created_at,
    })),
    capped: (data || []).length === 200,
  });
}
