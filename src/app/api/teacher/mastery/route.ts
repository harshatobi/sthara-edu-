import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { byIds, pageAll } from '@/lib/ops/page';
import { studentTrend, weeksBack, type HistoryRow, type StudentTrend } from '@/lib/teacher/masteryTrend';

export const dynamic = 'force-dynamic';

const WEEKS = 16;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * GET ?class=&subject=   Weekly mastery for every student in a class and subject the teacher teaches, from
 * tml_history: per student, each chapter's weekly score and the subject's (lib/teacher/masteryTrend).
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = str(req.nextUrl.searchParams.get('class'), 40);
  const subject = str(req.nextUrl.searchParams.get('subject'), 80);
  if (!cls || !subject) return NextResponse.json({ error: 'Pick a class and subject.' }, { status: 400 });
  if (!(staff.role === 'admin' || inScope((staff as Staff).scope, cls, subject))) return NextResponse.json({ error: 'You don’t teach that class and subject.' }, { status: 403 });
  try {
    const r = await pageAll<{ id: string; student_class: string | null }>((a, b) => db.from('users').select('id, student_class')
      .eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b));
    if (r.error) throw new Error(r.error.message);
    const ids = r.data.filter(s => normClass(s.student_class) === normClass(cls)).map(s => s.id);
    const weeks = weeksBack(WEEKS, Date.now());
    const h = await byIds<HistoryRow>(ids, (chunk, a, b) => db.from('tml_history').select('student_id, subject, topic_name, week, score')
      .eq('school_id', staff.schoolId).in('student_id', chunk).gte('week', weeks[0]).order('student_id').order('week').range(a, b));
    // Before the history table exists (migration not applied) trends are simply empty.
    if (h.error && h.error.code !== '42P01' && h.error.code !== 'PGRST205') throw new Error(h.error.message);
    const sk = normSubject(subject);
    const mine = new Map<string, HistoryRow[]>();
    for (const row of h.data) if (normSubject(row.subject) === sk) mine.set(row.student_id, [...(mine.get(row.student_id) ?? []), row]);
    // A chapter scored before the window starts still holds into it: carry its last earlier score in.
    const before = await byIds<HistoryRow>(ids, (chunk, a, b) => db.from('tml_history').select('student_id, subject, topic_name, week, score')
      .eq('school_id', staff.schoolId).in('student_id', chunk).lt('week', weeks[0]).order('student_id').order('week', { ascending: false }).range(a, b));
    const seen = new Set<string>();
    for (const row of before.data ?? []) {
      if (normSubject(row.subject) !== sk) continue;
      const k = `${row.student_id}|${row.topic_name.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      mine.set(row.student_id, [{ ...row, week: weeks[0] }, ...(mine.get(row.student_id) ?? [])]);
    }
    const students: Record<string, StudentTrend> = {};
    for (const id of ids) students[id] = studentTrend(mine.get(id) ?? [], weeks);
    return NextResponse.json({ weeks, students });
  } catch (e) {
    console.error('[teacher mastery]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load mastery trends.' }, { status: 500 });
  }
}
