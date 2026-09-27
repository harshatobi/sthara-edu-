import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { updateTeacherAssignments } from '@/lib/ops/accounts';
import { displayClass, normClass, normSubject } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

/**
 * A teacher's classes and subjects, set by the school (people.manage: school admin, principal).
 *   PUT { userId, subjects: [{ class, subject }], classTeacherOf? }
 * Only sections already on the school's class list (Sthara sets those up with the school, in ops); a section that
 * isn't there is refused with the names, so the school can ask Sthara to add it.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'people.manage');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.userId)) return bad('Pick a teacher.');
  const raw = Array.isArray(b.subjects) ? b.subjects.slice(0, 60) : [];
  const subjects: { class: string; subject: string }[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const cls = displayClass(str(s?.class, 40)), subject = str(s?.subject, 80);
    if (!normClass(cls) || !subject) return bad('Every row needs a class and a subject.');
    const k = `${normClass(cls)}|${normSubject(subject)}`;
    if (!seen.has(k)) { seen.add(k); subjects.push({ class: cls, subject }); }
  }
  const classTeacherOf = b.classTeacherOf ? displayClass(str(b.classTeacherOf, 40)) : null;
  const { data: classes } = await db.from('classes').select('name').eq('school_id', admin.schoolId);
  const known = new Set((classes || []).map(c => normClass(c.name)));
  const unknown = [...new Set([...subjects.map(s => s.class), ...(classTeacherOf ? [classTeacherOf] : [])])].filter(c => !known.has(normClass(c)));
  if (unknown.length) {
    return NextResponse.json({
      error: `${unknown.join(', ')} ${unknown.length === 1 ? "isn't a section" : "aren't sections"} on your school's class list. Ask Sthara to add ${unknown.length === 1 ? 'it' : 'them'}.`,
      unknown,
    }, { status: 400 });
  }
  const r = await updateTeacherAssignments(db, admin.schoolId, admin.id, b.userId, subjects, classTeacherOf, 'school_admin');
  return r.error ? bad(r.error) : NextResponse.json({ ok: true });
}
