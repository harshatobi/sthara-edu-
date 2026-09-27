import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { updateTeacherAssignments } from '@/lib/ops/accounts';
import { displayClass, normClass } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

/**
 * A teacher's classes and subjects, set by the school (people.manage: school admin, principal).
 *   PUT { userId, subjects: [{ class, subject }], classTeacherOf? }
 * Sections the school uses but that aren't in the classes list yet (it was only filled from the operator
 * console) are added to it first, so the classes list becomes the one list of sections.
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
    const k = `${normClass(cls)}|${subject.toLowerCase()}`;
    if (!seen.has(k)) { seen.add(k); subjects.push({ class: cls, subject }); }
  }
  const classTeacherOf = b.classTeacherOf ? displayClass(str(b.classTeacherOf, 40)) : null;
  // Sections must be real: on students, in the classes list, or in a timetable of this school.
  const wanted = [...new Set([...subjects.map(s => s.class), ...(classTeacherOf ? [classTeacherOf] : [])])];
  const [{ data: classes }, { data: students }, { data: slots }] = await Promise.all([
    db.from('classes').select('name').eq('school_id', admin.schoolId),
    db.from('users').select('student_class').eq('school_id', admin.schoolId).eq('role', 'student').not('student_class', 'is', null),
    db.from('timetable_slots').select('class').eq('school_id', admin.schoolId).limit(5000),
  ]);
  const known = new Set([...(classes || []).map(c => normClass(c.name)), ...(students || []).map(s => normClass(s.student_class)), ...(slots || []).map(s => normClass(s.class))]);
  const unknown = wanted.filter(c => !known.has(normClass(c)));
  if (unknown.length && !b.newSections) {
    return NextResponse.json({ error: `${unknown.join(', ')} ${unknown.length === 1 ? 'isn\'t a section' : 'aren\'t sections'} this school has yet. Confirm to add ${unknown.length === 1 ? 'it' : 'them'}.`, unknown }, { status: 409 });
  }
  const inList = new Set((classes || []).map(c => normClass(c.name)));
  const add = wanted.filter(c => !inList.has(normClass(c)));
  if (add.length) {
    const { error } = await db.from('classes').insert(add.map(name => ({ school_id: admin.schoolId, name, metadata: {} })));
    if (error) return bad(`Could not add the section: ${error.message}`, 500);
  }
  const r = await updateTeacherAssignments(db, admin.schoolId, admin.id, b.userId, subjects, classTeacherOf);
  return r.error ? bad(r.error) : NextResponse.json({ ok: true, added: add });
}
