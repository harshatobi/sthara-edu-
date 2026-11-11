import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { pageAll, byIds } from '@/lib/ops/page';
import { courseChapters, getCurriculum, CURRENT_SESSION } from '@/lib/curriculum';
import { defaultTerm, todayIso, addDays } from '@/lib/teacher/course';
import { pace, readyFor, standing, week } from '@/lib/studio/home';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET /api/teacher/studio/home?class=&subject=
 * Where the class stands (mastery, who needs support, syllabus pace, next test), what's worth doing this week,
 * whether each of this teacher's periods this week is ready, and recently made materials.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = String(req.nextUrl.searchParams.get('class') || '').slice(0, 40);
  const subject = String(req.nextUrl.searchParams.get('subject') || '').slice(0, 80);
  if (!cls || !subject) return bad('Pick a class and subject.');
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) return bad(`You don't teach ${subject} to ${cls}.`, 403);
  const today = todayIso();
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));

  const [{ data: users }, { data: work }, { data: progress }, { data: plan }, { data: lessons }, { data: events }, { data: versions }, { data: mats }] = await Promise.all([
    pageAll<any>((a, b) => db.from('users').select('id, name, student_class').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b)),
    pageAll<any>((a, b) => db.from('assignments').select('id, class, subject, status, due_date, assigned_student_ids').eq('school_id', staff.schoolId).eq('status', 'published').order('id').range(a, b), 5000),
    db.from('syllabus_progress').select('chapter_key, topic, status').eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION),
    db.from('course_plans').select('term_start, term_end, periods_per_week').eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION).maybeSingle(),
    db.from('lesson_plans').select('id, lesson_date, period, title, chapter_name, status, materials, taught_on').eq('school_id', staff.schoolId).eq('teacher_id', staff.id)
      .eq('class', cls).eq('subject', subject).gte('lesson_date', monday).lte('lesson_date', addDays(today, 14)).order('lesson_date'),
    db.from('academic_events').select('kind, title, starts_on, ends_on, suspends_classes').eq('school_id', staff.schoolId).gte('ends_on', monday).lte('starts_on', addDays(today, 30)).order('starts_on'),
    db.from('timetable_versions').select('id, effective_from').eq('school_id', staff.schoolId).eq('status', 'published').lte('effective_from', today).order('effective_from', { ascending: false }).limit(1),
    db.from('studio_materials').select('id, title, kind, status, updated_at, assignment_ids').eq('school_id', staff.schoolId).eq('teacher_id', staff.id).eq('class', cls).neq('status', 'archived').order('updated_at', { ascending: false }).limit(6),
  ]);
  const roster = users.filter(u => normClass(u.student_class) === normClass(cls)).map(u => ({ id: u.id, name: u.name || 'Student' }));

  // Mastery from the latest TML per chapter in this subject.
  const { data: tml } = roster.length
    ? await byIds<any>(roster.map(r => r.id), (chunk, a, b) => db.from('tml_scores').select('student_id, subject, topic_name, score, computed_at').in('student_id', chunk).order('id').range(a, b))
    : { data: [] as any[] };
  const st = standing(roster, tml.filter(r => normSubject(r.subject) === normSubject(subject)));

  // Syllabus pace against the course plan (or the default term and six periods a week).
  const cur = getCurriculum(cls, subject);
  const chapters = cur ? courseChapters(cur) : [];
  const totalTopics = chapters.reduce((n, c) => n + c.topics.length, 0);
  const taught = (progress || []).filter(p => p.status === 'taught').length;
  const term = plan ? { termStart: plan.term_start, termEnd: plan.term_end } : defaultTerm();
  const behind = pace({ today, ...term, periodsPerWeek: plan?.periods_per_week ?? 6, totalTopics, taught });
  const started = new Set((progress || []).filter(p => p.status !== 'not_started').map(p => p.chapter_key)).size;

  // This teacher's periods with the class, from the timetable in force.
  const ver = versions?.[0];
  const { data: slots } = ver
    ? await db.from('timetable_slots').select('weekday, period_no, subject, class').eq('version_id', ver.id).eq('teacher_id', staff.id)
    : { data: [] as any[] };
  const mySlots = (slots || []).filter(s => normClass(s.class) === normClass(cls) && normSubject(s.subject) === normSubject(subject));
  const days = week({ today, slots: mySlots, lessons: lessons || [], events: events || [] });

  // Students with 2+ pieces of past-due work not handed in (this subject).
  const due = work.filter(a => normClass(a.class) === normClass(cls) && normSubject(a.subject) === normSubject(subject) && a.due_date && a.due_date < today);
  const { data: subs } = due.length
    ? await byIds<any>(due.map(a => a.id), (chunk, a, b) => db.from('submissions').select('assignment_id, student_id').in('assignment_id', chunk).order('id').range(a, b))
    : { data: [] as any[] };
  const handed = new Set(subs.map(s => `${s.assignment_id}|${s.student_id}`));
  const missing = roster.map(s => ({ ...s, count: due.filter(a => (!a.assigned_student_ids?.length || a.assigned_student_ids.includes(s.id)) && !handed.has(`${a.id}|${s.id}`)).length }))
    .filter(s => s.count >= 2).sort((a, b) => b.count - a.count);

  const next = (lessons || []).find(l => l.lesson_date && l.lesson_date > today && l.status !== 'taught');
  const nextExam = (events || []).find(e => e.kind === 'exam' && e.starts_on >= today) ?? null;
  const ready = readyFor({
    standing: st, className: cls, today, missing, nextExam,
    nextLesson: next ? { id: next.id, lesson_date: next.lesson_date, title: next.title, chapter_name: next.chapter_name, hasMaterials: Array.isArray(next.materials) && next.materials.length > 0 } : null,
    drafts: (mats || []).filter(m => m.status === 'draft'),
  });

  return NextResponse.json({
    tiles: {
      mastery: st.mastery, lowest: st.lowest, needSupport: st.belowForty, students: st.students,
      pace: behind, chaptersStarted: started, chapters: chapters.length,
      nextTest: nextExam ? { title: nextExam.title, on: nextExam.starts_on } : null,
    },
    ready, week: days, hasTimetable: mySlots.length > 0,
    recent: mats || [],
    chapters: chapters.map(c => ({ name: c.name, seq: c.seq, topics: c.topics })),
  });
}
