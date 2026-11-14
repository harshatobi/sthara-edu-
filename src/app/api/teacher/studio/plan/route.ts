import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { todayIso, addDays } from '@/lib/teacher/course';
import { loadMaterial } from '@/lib/studio/materials';
import { absentees, chapterOf, createUnit, examMode, loadUnit, planRevision, repaceUnit, sendCatchup } from '@/lib/studio/plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Planning in the Studio (round 5): unit plans dated against the timetable, re-pacing, catch-ups for absentees, exam mode.
 *   GET  ?class=&subject=      this class's unit plans (with how far behind), lessons missed by absent students, exam mode
 *   GET  ?id=                  one unit or revision plan with its lessons
 *   POST { action: 'unit', class, subject, chapter, start? }        a chapter as dated draft lessons
 *        { action: 'repace', id }                                   move untaught lessons onto the next free periods
 *        { action: 'catchup', lessonId, studentIds[] }             send the catch-up the teacher confirmed
 *        { action: 'revision', class, subject, examDate? }         put the revision plan in the planner
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const p = req.nextUrl.searchParams;
  const id = p.get('id');
  if (id) {
    const m = await loadMaterial(db, staff, id);
    if (!m || !['unit_plan', 'revision_plan'].includes(m.content?.type)) return bad('Unknown plan.', 404);
    return NextResponse.json({ plan: { id: m.id, title: m.title, class: m.class, subject: m.subject, content: m.content, teacherId: m.teacher_id }, ...(await loadUnit(db, staff, m)) });
  }
  const cls = str(p.get('class'), 40), subject = str(p.get('subject'), 80);
  if (!cls || !subject) return bad('Pick a class and subject.');
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
  const examDate = ISO.test(p.get('examDate') || '') ? p.get('examDate') : null;
  // bounded: one teacher's plans (a handful per class)
  const { data: mats } = await db.from('studio_materials').select('id, title, class, subject, content, teacher_id, updated_at').eq('school_id', staff.schoolId).eq('teacher_id', staff.id)
    .eq('kind', 'lesson').neq('status', 'archived').order('updated_at', { ascending: false }).limit(60);
  const mine = (mats || []).filter(m => normClass(m.class) === normClass(cls) && normSubject(m.subject) === normSubject(subject) && ['unit_plan', 'revision_plan'].includes(m.content?.type)).slice(0, 8);
  const [units, missed, exam] = await Promise.all([
    Promise.all(mine.map(async m => { const u = await loadUnit(db, staff, m); return { id: m.id, title: m.title, type: m.content.type, lessons: u.lessons.length, taught: u.lessons.filter(l => l.taught).length, behind: u.behind, next: u.lessons.find(l => !l.taught) ?? null }; })),
    absentees(db, staff, cls, subject),
    examMode(db, staff, cls, subject, examDate),
  ]);
  return NextResponse.json({ units, missed, exam });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  try {
    switch (b?.action) {
      case 'unit': {
        const cls = str(b.class, 40), subject = str(b.subject, 80);
        if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
        const chapter = chapterOf(cls, subject, str(b.chapter));
        if (!chapter) return bad('Pick a chapter from the syllabus.');
        const today = todayIso();
        const start = ISO.test(b.start || '') && b.start >= today && b.start <= addDays(today, 200) ? b.start : today;
        return NextResponse.json(await createUnit(db, staff, { cls, subject, chapter, start }));
      }
      case 'repace': {
        const m = await loadMaterial(db, staff, str(b.id, 40));
        if (!m || m.teacher_id !== staff.id || !['unit_plan', 'revision_plan'].includes(m.content?.type)) return bad('Unknown plan.', 404);
        return NextResponse.json(await repaceUnit(db, staff, m));
      }
      case 'catchup': {
        const lessonId = str(b.lessonId, 40);
        if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return bad('Pick a lesson.');
        return NextResponse.json(await sendCatchup(db, staff, lessonId, Array.isArray(b.studentIds) ? b.studentIds : []));
      }
      case 'revision': {
        const cls = str(b.class, 40), subject = str(b.subject, 80);
        if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
        return NextResponse.json(await planRevision(db, staff, cls, subject, ISO.test(b.examDate || '') ? b.examDate : null));
      }
      default: return bad('Unknown action.');
    }
  } catch (e: any) {
    if (e?.status) return bad(e.message, e.status);
    console.error('[studio plan]', e?.message);
    return bad('That couldn’t be done just now. Try again.', 500);
  }
}
