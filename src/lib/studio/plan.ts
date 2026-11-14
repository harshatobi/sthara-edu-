import 'server-only';
/**
 * Calendar-aware planning on the server (decisions of 2026-11-10, round 5):
 *   loadCalendar     this teacher's timetable periods with a class, the school calendar, and periods already planned
 *   createUnit       a whole chapter as dated draft lessons in the planner, plus a unit plan in My materials
 *   loadUnit         a unit plan's lessons, how far behind it is
 *   repaceUnit       untaught lessons moved onto the next free periods
 *   absentees        students absent on the day of a taught lesson, without a catch-up yet
 *   sendCatchup      the catch-up the teacher confirmed: a summary of the lesson and three bank questions
 *   examMode         the next exam, periods left before it, and chapters ranked by board marks x the class's gap
 * No AI anywhere here: lessons are drafted with AI from the planner when the teacher asks.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/teacher/serverAuth';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { topicKey } from '@/lib/teacher/topicKey';
import { addDays, defaultStages, todayIso } from '@/lib/teacher/course';
import { CURRENT_SESSION, courseChapters, getCurriculum, type CourseChapter } from '@/lib/curriculum';
import { officialName } from '@/lib/subjects/catalog';
import { pageAll, byIds } from '@/lib/ops/page';
import { sanitizeQuestions, totalMarks } from '@/lib/teacher/questions';
import { createMaterial } from './materials';
import { loadPool } from './server';
import { toQuestion } from './handout';
import { pickRetention } from './analysis';
import { behindBy, periodKey, periodsFor, planUnit, repace, revisionPlan, teachingPeriods, type CalEvent, type Slot } from './unitplan';

export interface Calendar { slots: Slot[]; events: CalEvent[]; taken: Set<string>; periodMinutes: number; termEnd: string }

export async function loadCalendar(db: SupabaseClient, staff: Pick<Staff, 'id' | 'schoolId'>, cls: string, subject: string, from: string, to: string): Promise<Calendar> {
  const [{ data: versions }, { data: events }, { data: lessons }, { data: plan }] = await Promise.all([
    db.from('timetable_versions').select('id, effective_from').eq('school_id', staff.schoolId).eq('status', 'published').lte('effective_from', from).order('effective_from', { ascending: false }).limit(1),
    // bounded: one school's calendar events over the planning window (a few dozen)
    db.from('academic_events').select('kind, starts_on, ends_on, suspends_classes').eq('school_id', staff.schoolId).gte('ends_on', from).lte('starts_on', to).limit(500),
    // bounded: one teacher's dated lessons with one class over the window (at most a few hundred)
    db.from('lesson_plans').select('lesson_date, period, class').eq('school_id', staff.schoolId).eq('teacher_id', staff.id).gte('lesson_date', from).lte('lesson_date', to).limit(1000),
    db.from('course_plans').select('term_end, period_minutes').eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION).maybeSingle(),
  ]);
  const ver = versions?.[0];
  const { data: slots } = ver
    // bounded: one teacher's periods in one timetable version (a few dozen)
    ? await db.from('timetable_slots').select('weekday, period_no, subject, class').eq('version_id', ver.id).eq('teacher_id', staff.id).limit(200)
    : { data: [] as any[] };
  return {
    slots: (slots || []).filter(s => normClass(s.class) === normClass(cls) && normSubject(s.subject) === normSubject(subject)).map(s => ({ weekday: s.weekday, period_no: s.period_no })),
    events: events || [],
    // Any of this teacher's lessons in a period (with any class) takes it.
    taken: new Set((lessons || []).filter(l => l.lesson_date && l.period).map(l => periodKey({ date: l.lesson_date, period: l.period }))),
    periodMinutes: plan?.period_minutes || 40,
    termEnd: plan?.term_end || addDays(from, 180),
  };
}

export const chapterOf = (cls: string, subject: string, name: string): CourseChapter | null => {
  const cur = getCurriculum(cls, subject);
  return cur ? courseChapters(cur).find(c => topicKey(c.name) === topicKey(name)) ?? null : null;
};

const UNIT_TITLE = { teach: '', practice: 'Practice: ', check: 'Chapter check: ' } as const;

export async function createUnit(db: SupabaseClient, staff: Staff, input: { cls: string; subject: string; chapter: CourseChapter; start: string }) {
  const { cls, chapter } = input;
  const subject = officialName(cls, input.subject);
  const cal = await loadCalendar(db, staff, cls, subject, input.start, addDays(input.start, 200));
  if (!cal.slots.length) throw Object.assign(new Error(`Your timetable has no ${subject} periods with ${cls}, so the lessons can't be dated. Ask the office to publish the timetable.`), { status: 409 });
  const n = periodsFor(chapter, cal.periodMinutes);
  const periods = teachingPeriods(input.start, cal.termEnd, cal.slots, cal.events, cal.taken, n);
  if (!periods.length) throw Object.assign(new Error('There are no free periods left this term to plan into.'), { status: 409 });
  const layout = planUnit(chapter.topics, periods.length);
  const key = topicKey(chapter.name);
  const rows = layout.map((u, i) => ({
    school_id: staff.schoolId, teacher_id: staff.id, class: cls, subject, session: CURRENT_SESSION,
    chapter_key: key, chapter_name: chapter.name, topics: u.topics.slice(0, 30),
    title: `${UNIT_TITLE[u.kind]}${u.kind === 'check' ? chapter.name : u.topics.join(', ')}`.slice(0, 200),
    lesson_date: periods[i].date, period: periods[i].period, duration_min: cal.periodMinutes,
    objectives: u.kind === 'teach' ? (chapter.outcomes || []).slice(0, 2) : [],
    stages: defaultStages(cal.periodMinutes), status: 'draft',
    check_for_understanding: u.kind === 'check' ? 'Chapter check: make it in the Studio (Unit test or Exit ticket).' : null,
  }));
  const { data: lessons, error } = await db.from('lesson_plans').insert(rows).select('id, lesson_date, period');
  if (error) throw new Error(error.message);
  const ids = (lessons || []).sort((a, b) => a.lesson_date.localeCompare(b.lesson_date) || a.period - b.period).map(l => l.id);
  const material = await createMaterial(db, staff, {
    class: cls, subject, chapter_key: key, chapter_name: chapter.name, kind: 'lesson', language: 'en',
    title: `Unit plan: ${chapter.name}`,
    content: { type: 'unit_plan', chapter: chapter.name, lessonIds: ids, periods: periods.length, wanted: n, made: todayIso() },
  });
  return { material, lessons: ids.length, wanted: n, first: periods[0], last: periods[periods.length - 1] };
}

export async function loadUnit(db: SupabaseClient, staff: Staff, m: any) {
  const ids: string[] = Array.isArray(m.content?.lessonIds) ? m.content.lessonIds.slice(0, 200) : [];
  const { data } = ids.length
    ? await byIds<any>(ids, (chunk, a, b) => db.from('lesson_plans').select('id, title, topics, lesson_date, period, status, taught_on, materials, ai_drafted').in('id', chunk).order('id').range(a, b))
    : { data: [] as any[] };
  const lessons = data.sort((a, b) => (a.lesson_date ?? '9999').localeCompare(b.lesson_date ?? '9999') || (a.period ?? 0) - (b.period ?? 0))
    .map(l => ({ id: l.id, title: l.title, topics: l.topics || [], date: l.lesson_date, period: l.period, status: l.status, taught: l.status === 'taught' || !!l.taught_on, aiDrafted: !!l.ai_drafted, materials: Array.isArray(l.materials) ? l.materials.length : 0 }));
  return { lessons, behind: behindBy(lessons, todayIso()), today: todayIso() };
}

export async function repaceUnit(db: SupabaseClient, staff: Staff, m: any) {
  const { lessons } = await loadUnit(db, staff, m);
  const today = todayIso();
  const cal = await loadCalendar(db, staff, m.class, m.subject, today, addDays(today, 200));
  // The unit's own untaught lessons free their periods for the re-plan.
  const own = new Set(lessons.filter(l => !l.taught && l.date && l.period).map(l => periodKey({ date: l.date!, period: l.period! })));
  const free = new Set([...cal.taken].filter(k => !own.has(k)));
  const periods = teachingPeriods(today, cal.termEnd, cal.slots, cal.events, free, lessons.filter(l => !l.taught).length);
  const moves = repace(lessons, periods);
  for (const mv of moves) await db.from('lesson_plans').update({ lesson_date: mv.date, period: mv.period }).eq('id', mv.id).eq('teacher_id', staff.id);
  const unplaced = lessons.filter(l => !l.taught).length - periods.length;
  return { moved: moves.length, unplaced: Math.max(0, unplaced) };
}

// ── Absentee catch-up ─────────────────────────────────────────────────────────
export interface MissedLesson { lessonId: string; date: string; title: string; chapter: string; topics: string[]; students: { id: string; name: string }[] }

/** Taught lessons of the last 10 days with students absent that day and no catch-up sent for that lesson yet. */
export async function absentees(db: SupabaseClient, staff: Staff, cls: string, subject: string): Promise<MissedLesson[]> {
  const today = todayIso();
  // bounded: one teacher's lessons with one class over ten days
  const { data: ls } = await db.from('lesson_plans').select('id, title, chapter_name, topics, lesson_date, taught_on, status, materials, class, subject')
    .eq('school_id', staff.schoolId).eq('teacher_id', staff.id).gte('lesson_date', addDays(today, -10)).lte('lesson_date', today).limit(100);
  const taught = (ls || []).filter(l => normClass(l.class) === normClass(cls) && normSubject(l.subject) === normSubject(subject) && (l.status === 'taught' || l.taught_on)
    && !(Array.isArray(l.materials) && l.materials.some((x: any) => x?.catchupAssignmentId)));
  if (!taught.length) return [];
  const days = [...new Set(taught.map(l => l.taught_on || l.lesson_date))];
  const { data: att } = await pageAll<any>((a, b) => db.from('attendance').select('student_id, class_name, day, status').eq('school_id', staff.schoolId).in('day', days).eq('status', 'absent').order('id').range(a, b));
  const absent = att.filter(r => normClass(r.class_name) === normClass(cls));
  if (!absent.length) return [];
  // bounded: names of at most a class's absentees (sliced)
  const { data: names } = await db.from('users').select('id, name').in('id', [...new Set(absent.map(r => r.student_id))].slice(0, 300));
  const nameOf = new Map((names || []).map(u => [u.id, u.name || 'Student']));
  return taught.map(l => {
    const day = l.taught_on || l.lesson_date;
    return { lessonId: l.id, date: day, title: l.title, chapter: l.chapter_name, topics: l.topics || [], students: absent.filter(r => r.day === day).map(r => ({ id: r.student_id, name: nameOf.get(r.student_id) ?? 'Student' })) };
  }).filter(x => x.students.length).sort((a, b) => b.date.localeCompare(a.date));
}

/** The catch-up the teacher confirmed: what the lesson covered, and three quick bank questions on it. */
export async function sendCatchup(db: SupabaseClient, staff: Staff, lessonId: string, studentIds: string[]) {
  const { data: l } = await db.from('lesson_plans').select('*').eq('id', lessonId).eq('school_id', staff.schoolId).maybeSingle();
  if (!l || (staff.role === 'teacher' && l.teacher_id !== staff.id)) throw Object.assign(new Error('Unknown lesson.'), { status: 404 });
  const ids = [...new Set(studentIds.filter(x => typeof x === 'string'))].slice(0, 60);
  if (!ids.length) throw Object.assign(new Error('Pick who gets the catch-up.'), { status: 400 });
  const pool = await loadPool({ db, schoolId: staff.schoolId, cls: l.class, subject: l.subject }, l.chapter_key);
  const picked = pickRetention(pool, l.topics || [], new Set(), 3);
  const day = l.taught_on || l.lesson_date;
  const summary = [
    `You missed the ${l.subject} lesson on ${day}: ${l.chapter_name}.`,
    l.topics?.length ? `It covered: ${l.topics.join('; ')}.` : '',
    l.objectives?.length ? `By the end you should be able to: ${l.objectives.join('; ')}.` : '',
    l.check_for_understanding && !/^Chapter check:/.test(l.check_for_understanding) ? `Check yourself: ${l.check_for_understanding}` : '',
    `Read this part of your NCERT chapter, then answer ${picked.length ? 'the questions below' : 'the questions your teacher gives you'}. Ask your teacher about anything that isn't clear.`,
  ].filter(Boolean).join('\n\n');
  const { questions } = sanitizeQuestions(picked.map(toQuestion));
  const { data: a, error } = await db.from('assignments').insert({
    school_id: staff.schoolId, teacher_id: staff.id, title: `Catch-up: ${l.chapter_name}`.slice(0, 200), type: 'homework',
    class: l.class, subject: l.subject, due_date: addDays(todayIso(), 4), description: summary.slice(0, 2000),
    questions, total_marks: totalMarks(questions), units: [l.chapter_name], submission_mode: 'typed', proctored: false, status: 'published',
    assigned_student_ids: ids,
  }).select('id').single();
  if (error) throw new Error(error.message);
  if (picked.length) await db.from('bank_item_uses').insert(picked.map((it, i) => ({ item_id: it.bankId || it.id, school_id: staff.schoolId, assignment_id: a.id, question_index: i, used_by: staff.id })));
  const mats = Array.isArray(l.materials) ? l.materials : [];
  await db.from('lesson_plans').update({ materials: [...mats, { label: `Catch-up for ${ids.length} absent`, catchupAssignmentId: a.id }].slice(0, 20) }).eq('id', l.id);
  return { assignmentId: a.id, students: ids.length, questions: picked.length };
}

// ── Exam mode ────────────────────────────────────────────────────────────────
export async function examMode(db: SupabaseClient, staff: Staff, cls: string, subject: string, examDate?: string | null) {
  const today = todayIso();
  // bounded: the school's exam events in the next four months
  const { data: exams } = await db.from('academic_events').select('title, starts_on, ends_on').eq('school_id', staff.schoolId).eq('kind', 'exam').gte('starts_on', today).lte('starts_on', addDays(today, 120)).order('starts_on').limit(10);
  const exam = examDate ? { title: 'Your exam date', starts_on: examDate } : exams?.[0] ?? null;
  const cur = getCurriculum(cls, subject);
  const chapters = cur ? courseChapters(cur) : [];
  // Class mastery per chapter: the latest TML per student per chapter, averaged.
  const { data: users } = await pageAll<any>((a, b) => db.from('users').select('id, student_class').eq('school_id', staff.schoolId).eq('role', 'student').order('id').range(a, b));
  const roster = users.filter(u => normClass(u.student_class) === normClass(cls)).map(u => u.id);
  const { data: tml } = roster.length
    ? await byIds<any>(roster, (chunk, a, b) => db.from('tml_scores').select('student_id, subject, topic_name, score, computed_at').in('student_id', chunk).order('id').range(a, b))
    : { data: [] as any[] };
  const latest = new Map<string, { score: number; at: string }>();
  for (const r of tml.filter(r => normSubject(r.subject) === normSubject(subject))) {
    const k = `${r.student_id}|${topicKey(r.topic_name)}`;
    const c = latest.get(k);
    if (!c || c.at < r.computed_at) latest.set(k, { score: Number(r.score), at: r.computed_at });
  }
  const byChapter = new Map<string, number[]>();
  for (const [k, v] of latest) { const ck = k.split('|')[1]; byChapter.set(ck, [...(byChapter.get(ck) ?? []), v.score]); }
  const scoreOf = (name: string) => { const xs = byChapter.get(topicKey(name)); return xs && xs.length >= Math.min(3, roster.length) ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };
  let periodsLeft = 0;
  if (exam) {
    const cal = await loadCalendar(db, staff, cls, officialName(cls, subject), today, exam.starts_on);
    periodsLeft = teachingPeriods(today, addDays(exam.starts_on, -1), cal.slots, cal.events, new Set(), 400).length;
  }
  const rows = revisionPlan(chapters.filter(c => !c.formativeOnly).map(c => ({ chapter: c.name, marks: Number(c.approxMarks) || 0, score: scoreOf(c.name) })), periodsLeft);
  return { exam, periodsLeft, rows, noMarks: !rows.length && chapters.length > 0 };
}

/** Puts the revision plan in the planner: one dated draft lesson per revision period, highest priority first. */
export async function planRevision(db: SupabaseClient, staff: Staff, cls: string, subject: string, examDate?: string | null) {
  const mode = await examMode(db, staff, cls, subject, examDate);
  if (!mode.exam) throw Object.assign(new Error('No exam date found. Pick the exam date.'), { status: 400 });
  const today = todayIso();
  const official = officialName(cls, subject);
  const cal = await loadCalendar(db, staff, cls, official, today, mode.exam.starts_on);
  const periods = teachingPeriods(today, addDays(mode.exam.starts_on, -1), cal.slots, cal.events, cal.taken, 400);
  const order = mode.rows.flatMap(r => Array.from({ length: r.periods }, () => r));
  const rows = periods.slice(0, order.length).map((p, i) => {
    const r = order[i];
    const ch = chapterOf(cls, subject, r.chapter);
    return {
      school_id: staff.schoolId, teacher_id: staff.id, class: cls, subject: official, session: CURRENT_SESSION,
      chapter_key: topicKey(r.chapter), chapter_name: r.chapter, topics: (ch?.topics ?? []).slice(0, 30),
      title: `Revision: ${r.chapter}`, lesson_date: p.date, period: p.period, duration_min: cal.periodMinutes,
      objectives: [], stages: defaultStages(cal.periodMinutes), status: 'draft',
      check_for_understanding: `Board weight about ${r.marks} marks; class at ${r.score ?? 'unknown'}%.`,
    };
  });
  if (!rows.length) throw Object.assign(new Error('There are no free periods before the exam to plan into.'), { status: 409 });
  const { data: lessons, error } = await db.from('lesson_plans').insert(rows).select('id');
  if (error) throw new Error(error.message);
  const material = await createMaterial(db, staff, {
    class: cls, subject: official, chapter_key: null, chapter_name: null, kind: 'lesson', language: 'en',
    title: `Revision before ${mode.exam.title}`.slice(0, 200),
    content: { type: 'revision_plan', exam: mode.exam, rows: mode.rows, lessonIds: (lessons || []).map(l => l.id), made: today },
  });
  return { material, lessons: rows.length, skipped: Math.max(0, order.length - periods.length) };
}
