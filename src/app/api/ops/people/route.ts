import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { pageAll } from '@/lib/ops/page';
import { loadSight, visibleSchoolIds } from '@/lib/ops/scope';

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
const PAGE = 200;

/**
 * GET /api/ops/people?q=&role=&school=&page=&export=1  — the cross-school directory, for support:
 * find any account by name, email or roll number. 200 a page with the total matching; export=1 = every match
 * (up to 20,000) for the CSV.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'people.search');
  if (op instanceof Response) return op;
  const sp = req.nextUrl.searchParams;
  // Keep only characters that can appear in a name, email or roll number: nothing that means anything to PostgREST's or() syntax.
  const q = (sp.get('q') || '').replace(/[^\p{L}\p{N}@._\- ]/gu, '').trim().slice(0, 80);
  const role = sp.get('role') || '';
  const school = sp.get('school') || '';
  const page = Math.max(0, Math.min(100_000, Math.floor(Number(sp.get('page')) || 0)));
  const all = sp.get('export') === '1';

  const db = createAdminClient();
  const visible = await visibleSchoolIds(db, await loadSight(db, op));
  if (visible && !visible.size) return NextResponse.json({ people: [], total: 0, page, pageSize: PAGE });
  // A fresh query per page (a builder collects range/order calls rather than replacing them).
  const build = (count: boolean) => {
  let query = db.from('users')
    .select('id, name, email, role, school_id, student_class, custom_student_id, teacher_class, assignments, metadata, created_at', count ? { count: 'exact' } : {})
    .order('name').order('id');
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,custom_student_id.ilike.%${q}%`);
  if (ROLES.includes(role)) query = query.eq('role', role);
  if (UUID.test(school)) query = query.eq('school_id', school);
  // An operator who works a territory finds accounts in its schools only.
  if (visible) query = query.in('school_id', [...visible]);
  return query;
  };
  const [{ data, error, count, capped }, { data: schools }] = await Promise.all([
    all ? pageAll<any>((f, t) => build(false).range(f, t), 20_000).then(r => ({ ...r, count: r.data.length }))
      : build(true).range(page * PAGE, page * PAGE + PAGE - 1).then(r => ({ ...r, capped: false })),
    db.from('schools').select('id, name, settings'),
  ]);
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
    total: count ?? null, page, pageSize: PAGE, capped: !!capped,
  });
}
