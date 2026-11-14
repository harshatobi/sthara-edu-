import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope, normClass, normSubject } from '@/lib/teacher/scope';
import { aiGate } from '@/lib/settings/server';
import { aiConfigured } from '@/lib/ai/generate';
import { ASSIGNMENT_COLS, loadMarked, misconceptions, type Misconception } from '@/lib/studio/after';
import { FLAG_TEXT, proposeRetest } from '@/lib/studio/analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET /api/teacher/studio/analysis?assignmentId=
 * How a marked assignment went, question by question: share of marks, how many got full marks, how well each
 * question separated stronger from weaker students, which options were picked, the misconception behind a popular
 * wrong answer with a five-minute reteach move, the weakest topics, and the retest it proposes (students who missed a
 * weak topic, each on their own). Nothing is made or assigned from here: the teacher confirms in the Studio.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const id = req.nextUrl.searchParams.get('assignmentId') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Pick a piece of work.');
  const { data: a } = await db.from('assignments').select(ASSIGNMENT_COLS).eq('id', id).maybeSingle();
  if (!a || a.school_id !== staff.schoolId) return bad('Unknown work.', 404);
  if (staff.role === 'teacher' && a.teacher_id !== staff.id && !inScope(staff.scope, a.class, a.subject)) return bad('You can only see work for classes you teach.', 403);

  const [marked, { data: mats }, { data: followup }] = await Promise.all([
    loadMarked(db, a),
    // bounded: the Studio materials that handed this assignment out (one, at most a few)
    db.from('studio_materials').select('id, title, chapter_name, chapter_key').eq('school_id', staff.schoolId).contains('assignment_ids', [a.id]).limit(3),
    db.from('studio_followups').select('id, due_on, status, note, assignment_id').eq('source_assignment_id', a.id).maybeSingle(),
  ]);
  const material = mats?.[0] ?? null;
  const chapter = material?.chapter_name || (Array.isArray(a.units) && a.units[0]) || null;

  // The wording is a help, not the analysis: without AI (or with the allowance spent) the numbers still show.
  let wording: Record<string, Misconception> = {};
  let wordingNote: string | null = null;
  if (marked.analysis.marked >= 3 && aiConfigured()) {
    const blocked = await aiGate(staff.id, 'teacherTools');
    if (blocked) wordingNote = 'The AI allowance is spent, so misconceptions aren’t named this time. The numbers are all here.';
    else wording = await misconceptions(db, marked, { userId: staff.id, chapter });
  }

  const practiceSheets = await practiceSheetsFor(db, staff.schoolId, a.class, a.subject);
  const qBy = new Map(marked.questions.map(q => [q.key, q]));
  const nameOf = new Map(marked.students.map(s => [s.id, s.name]));
  return NextResponse.json({
    assignment: { id: a.id, title: a.title, class: a.class, subject: a.subject, type: a.type, due: a.due_date, mode: a.submission_mode },
    material: material ? { id: material.id, title: material.title, chapter: material.chapter_name } : null,
    chapter,
    counts: { students: marked.students.length, handedIn: marked.handedIn, marked: marked.analysis.marked },
    questions: marked.analysis.questions.map((r, i) => {
      const q = qBy.get(r.key)!;
      return {
        ...r, n: i + 1, answers: r.n, text: q.text, marks: q.marks, topic: q.topic, options: q.options, answer: q.answer, bank: !!q.bankId,
        missedNames: r.missed.map(id => nameOf.get(id) ?? 'Student'),
        flagText: r.flags.map(f => FLAG_TEXT[f]),
        misconception: wording[r.key] ?? null,
      };
    }),
    topics: marked.analysis.topics.map(t => ({ ...t, missedNames: t.missed.map(id => nameOf.get(id) ?? 'Student') })),
    students: marked.analysis.students,
    retest: proposeRetest(marked.analysis),
    retention: followup ?? null,
    practiceSheets,
    wordingNote,
  });
}

/**
 * Open marks sheets of practice assessments (Exams kind 'practice': never on a report card) for this class and subject,
 * so a mock's marks can be filled into Exams from here.
 */
async function practiceSheetsFor(db: any, schoolId: string, cls: string, subject: string) {
  // bounded: a school's practice assessments (a handful a year)
  const { data: as } = await db.from('exam_assessments').select('id, code, name').eq('school_id', schoolId).eq('kind', 'practice').limit(100);
  if (!as?.length) return [];
  // bounded: open sheets of those assessments (classes x subjects, a few hundred at most)
  const { data: sheets } = await db.from('exam_sheets').select('id, assessment_id, class_id, class_subject_id').eq('school_id', schoolId).eq('status', 'open').in('assessment_id', as.map((x: any) => x.id)).limit(2000);
  if (!sheets?.length) return [];
  // bounded: the classes and subjects of at most 2,000 sheets, each list limited
  const [{ data: classes }, { data: subjects }] = await Promise.all([
    db.from('classes').select('id, name').in('id', [...new Set(sheets.map((s: any) => s.class_id))]).limit(1000),
    db.from('class_subjects').select('id, subject_name').in('id', [...new Set(sheets.map((s: any) => s.class_subject_id))]).limit(2000),
  ]);
  const clsOf = new Map((classes || []).map((c: any) => [c.id, c.name]));
  const subOf = new Map((subjects || []).map((c: any) => [c.id, c.subject_name]));
  const aOf = new Map(as.map((x: any) => [x.id, x]));
  return sheets
    .filter((s: any) => normClass(String(clsOf.get(s.class_id) ?? '')) === normClass(cls) && normSubject(String(subOf.get(s.class_subject_id) ?? '')) === normSubject(subject))
    .map((s: any) => ({ id: s.id, code: (aOf.get(s.assessment_id) as any)?.code, name: (aOf.get(s.assessment_id) as any)?.name }));
}
