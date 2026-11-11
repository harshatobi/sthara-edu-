import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { courseChapters, getCurriculum } from '@/lib/curriculum';
import { topicKey } from '@/lib/teacher/topicKey';
import { loadPool, saveToBank } from '@/lib/studio/server';
import { parseItem } from '@/lib/studio/items';
import { normalise } from '@/lib/studio/fingerprint';
import { COMPETENCIES } from '@/lib/studio/types';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * The question bank, for "Add from bank" and the bank browser.
 *   GET  ?class=&subject=&chapter=&competency=&marks=&q=   Sthara's and this school's questions for a chapter, with results
 *   POST { class, subject, chapter, item }                 a teacher's own question into the school bank (unreviewed)
 * Students never read the bank.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const p = req.nextUrl.searchParams;
  const cls = String(p.get('class') || '').slice(0, 40), subject = String(p.get('subject') || '').slice(0, 80);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
  const chapterKey = topicKey(String(p.get('chapter') || ''));
  if (!chapterKey) return bad('Pick a chapter.');
  let items = await loadPool({ db, schoolId: staff.schoolId, cls, subject }, chapterKey);
  const comp = p.get('competency'), marks = Number(p.get('marks')), q = normalise(String(p.get('q') || ''));
  if (comp && (COMPETENCIES as readonly string[]).includes(comp)) items = items.filter(i => i.competency === comp);
  if (marks) items = items.filter(i => i.marks === marks);
  if (q) items = items.filter(i => normalise(`${i.text} ${i.topic}`).includes(q));
  return NextResponse.json({ items: items.slice(0, 200), total: items.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const cls = String(b?.class || '').slice(0, 40), subject = String(b?.subject || '').slice(0, 80);
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
  const cur = getCurriculum(cls, subject);
  const chapter = cur ? courseChapters(cur).find(c => topicKey(c.name) === topicKey(String(b?.chapter || ''))) : null;
  if (!chapter) return bad('Pick a chapter from the syllabus.');
  const item = parseItem({ ...b?.item, source: 'teacher', chapterKey: topicKey(chapter.name), check: { status: 'passed', notes: ['Written by a teacher.'] } });
  if (!item) return bad('Fill in the question (and every option, with the right one marked).');
  const ids = await saveToBank({ db, schoolId: staff.schoolId, userId: staff.id, cls, subject }, [item]);
  const id = ids.get(item.id);
  return id ? NextResponse.json({ item: { ...item, bankId: id } }) : bad('Could not add it to the bank.', 500);
}
