import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { pageAll } from '@/lib/ops/page';
import { normClass } from '@/lib/teacher/scope';
import { answerKeyRelease, mcqKey } from '@/lib/student/answerKey';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * GET /api/student/work?assignment=<id> — what a student may see about their own graded work:
 * the marks their teacher confirmed per question, and the MCQ answer key once the whole class is
 * graded (lib/student/answerKey). Their answers and photos come from their own submission row
 * and /api/grading/pages; this route only adds what the student-facing view of the assignment hides.
 */
export async function GET(req: NextRequest) {
  const { user, error: authErr } = await verifyApiToken(req.headers.get('authorization'));
  if (!user || authErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'student') return NextResponse.json({ error: 'For students only.' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('assignment');
  if (!isUuid(id)) return NextResponse.json({ error: 'Unknown assignment.' }, { status: 404 });

  const db = createAdminClient();
  const [{ data: a }, { data: sub }] = await Promise.all([
    db.from('assignments').select('id, school_id, class, status, due_date, questions, assigned_student_ids').eq('id', id).maybeSingle(),
    db.from('submissions').select('id, teacher_approved').eq('assignment_id', id).eq('student_id', user.id).maybeSingle(),
  ]);
  // Only for work this student handed in: nothing here before they submit.
  if (!a || a.status === 'draft' || !sub) return NextResponse.json({ error: 'Unknown assignment.' }, { status: 404 });

  const confirmed = sub.teacher_approved === true;
  const { data: items } = confirmed
    ? await db.from('submission_items').select('question_index, score, max_score').eq('submission_id', sub.id).eq('teacher_confirmed', true)
    : { data: [] as { question_index: number; score: number; max_score: number }[] };
  const marks = Object.fromEntries((items || []).map(i => [i.question_index, { score: Number(i.score), max: Number(i.max_score) }]));

  const key = mcqKey(a.questions);
  if (!confirmed || !Object.keys(key).length) return NextResponse.json({ marks, key: null, keyStatus: confirmed ? 'none' : 'awaiting-review' });

  const targeted: string[] = Array.isArray(a.assigned_student_ids) ? a.assigned_student_ids : [];
  const [students, subs] = await Promise.all([
    pageAll<{ id: string; student_class: string | null }>((f, t) => db.from('users').select('id, student_class').eq('school_id', a.school_id).eq('role', 'student').order('id').range(f, t)),
    pageAll<{ student_id: string; teacher_approved: boolean | null }>((f, t) => db.from('submissions').select('student_id, teacher_approved').eq('assignment_id', id).order('id').range(f, t)),
  ]);
  if (students.error || subs.error) return NextResponse.json({ marks, key: null, keyStatus: 'awaiting-review' });
  const roster = students.data
    .filter(s => normClass(s.student_class) === normClass(a.class) && (!targeted.length || targeted.includes(s.id)))
    .map(s => s.id);
  const release = answerKeyRelease({ roster, submissions: subs.data, dueDate: a.due_date, now: Date.now() });
  return NextResponse.json({ marks, key: release.released ? key : null, keyStatus: release.reason });
}
