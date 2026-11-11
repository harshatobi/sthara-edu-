import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { normClass } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { accessOf } from '@/lib/admin/serverAuth';
import { pageAll } from '@/lib/ops/page';
import { parseNeeds } from '@/lib/studio/items';
import { suggestedNeeds } from '@/lib/studio/handout';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Students' access needs (large print, read aloud, extra time, text instead of figures, simpler wording).
 *   GET ?class=<class>[&suggest=1]    the class's students and their needs. With suggest=1, office staff who may
 *                                     read health records also get suggested needs from it (needs only).
 *   PUT { studentId, needs[], note? } set by the class teacher, the counsellor, or the office.
 * Teachers of the class read the needs. Nobody here ever sees an impairment or a diagnosis.
 */
interface Who { staff: Staff; db: any; classTeacherOf: string | null; access: Awaited<ReturnType<typeof accessOf>> | null }

async function who(req: NextRequest): Promise<Who | { res: NextResponse }> {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth;
  const { staff, db } = auth;
  const [{ data: me }, access] = await Promise.all([
    db.from('users').select('teacher_class').eq('id', staff.id).maybeSingle(),
    staff.role === 'admin' ? accessOf(db, staff.id, staff.schoolId) : Promise.resolve(null),
  ]);
  return { staff, db, classTeacherOf: me?.teacher_class ? normClass(me.teacher_class) : null, access };
}

const canRead = (w: Who, cls: string) => w.staff.role === 'admin'
  ? !!w.access && (w.access.can('students.read') || w.access.can('academics.read') || w.access.can('counselling.notes') || w.access.can('health.read'))
  : w.staff.scope.some(e => normClass(e.cls) === normClass(cls)) || w.classTeacherOf === normClass(cls);

const canEdit = (w: Who, cls: string) => w.staff.role === 'admin'
  ? !!w.access && (w.access.can('students.manage') || w.access.can('counselling.notes') || w.access.can('health.manage'))
  : w.classTeacherOf === normClass(cls);

export async function GET(req: NextRequest) {
  const w = await who(req);
  if ('res' in w) return w.res;
  const { staff, db, access } = w;
  const cls = String(req.nextUrl.searchParams.get('class') || '').slice(0, 40);
  if (!cls) return bad('Pick a class.');
  if (!canRead(w, cls)) return bad(`You don't teach ${cls}.`, 403);
  const { data: users } = await pageAll<any>((a, b) => db.from('users').select('id, name, student_class, custom_student_id').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b));
  const roster = users.filter(u => normClass(u.student_class) === normClass(cls)).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  const ids = roster.map(r => r.id);
  const { data: rows } = ids.length ? await db.from('student_access_needs').select('student_id, needs, note').eq('school_id', staff.schoolId).in('student_id', ids) : { data: [] as any[] };
  const byId = new Map<string, any>((rows || []).map((r: any) => [r.student_id, r]));
  const suggest = new Map<string, string[]>();
  if (req.nextUrl.searchParams.get('suggest') === '1' && access?.can('health.read') && ids.length) {
    // Health records hang off the student spine; match through its link to the login.
    const { data: spine } = await db.from('students').select('id, user_id').eq('school_id', staff.schoolId).in('user_id', ids);
    const userOf = new Map<string, string>((spine || []).map((s: any) => [s.id, s.user_id]));
    const { data: health } = userOf.size ? await db.from('student_health').select('student_id, impairments').in('student_id', [...userOf.keys()]) : { data: [] as any[] };
    for (const h of health || []) {
      const n = suggestedNeeds(h.impairments || []);
      const u = userOf.get(h.student_id);
      if (u && n.length) suggest.set(u, n);
    }
  }
  return NextResponse.json({
    canEdit: canEdit(w, cls),
    students: roster.map(u => ({ id: u.id, name: u.name || 'Student', roll: u.custom_student_id || '', needs: byId.get(u.id)?.needs ?? [], note: byId.get(u.id)?.note ?? null, suggested: suggest.get(u.id) ?? null })),
  });
}

export async function PUT(req: NextRequest) {
  const w = await who(req);
  if ('res' in w) return w.res;
  const { staff, db } = w;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const studentId = typeof b?.studentId === 'string' ? b.studentId : '';
  const { data: s } = await db.from('users').select('id, role, school_id, student_class').eq('id', studentId).maybeSingle();
  if (!s || s.role !== 'student' || s.school_id !== staff.schoolId) return bad('Unknown student.', 404);
  if (!canEdit(w, s.student_class || '')) return bad('Only the class teacher, the counsellor or the office can set access needs.', 403);
  const needs = parseNeeds(b?.needs);
  const note = typeof b?.note === 'string' ? b.note.trim().slice(0, 300) || null : null;
  const { error } = await db.from('student_access_needs').upsert({ student_id: s.id, school_id: staff.schoolId, needs, note, set_by: staff.id }, { onConflict: 'student_id' });
  if (error) { console.error('[access-needs]', error.message); return bad('Could not save.', 500); }
  return NextResponse.json({ studentId: s.id, needs, note });
}
