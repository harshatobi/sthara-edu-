import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff, type Staff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { sanitizeQuestions, totalMarks } from '@/lib/teacher/questions';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Teacher assignment & quiz lifecycle.
 *   POST   create   { title, type, class, subject, dueDate, description?, chapter?, questions,
 *                     submissionMode, proctored, status: 'draft'|'published', assignedStudentIds? }
 *   PATCH  update   { id, ...any of the above }  (post a draft, withdraw, edit)
 *   DELETE remove   { id }
 * School, teacher and scope come from the caller's own row (requireStaff); a
 * teacher can only set work for a class + subject they teach, and only touch
 * their own assignments. Admins can act on any assignment in their school.
 */

const TYPES = ['homework', 'quiz', 'classwork'] as const;
type Kind = typeof TYPES[number];

interface Draft {
  title: string; type: Kind; cls: string; subject: string; dueDate: string | null; description: string;
  chapter: string | null; questions: unknown; submissionMode: 'typed' | 'handwritten'; proctored: boolean;
  status: 'draft' | 'published'; assignedStudentIds: string[];
}

const str = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function readDraft(b: any, base?: Partial<Draft>): Draft {
  const pick = <K extends keyof Draft>(k: K, v: Draft[K] | undefined) => (v !== undefined ? v : (base?.[k] as Draft[K]));
  const type = TYPES.includes(b?.type) ? b.type as Kind : undefined;
  return {
    title: pick('title', b?.title !== undefined ? str(b.title, 200) : undefined) ?? '',
    type: pick('type', type) ?? 'homework',
    cls: pick('cls', b?.class !== undefined ? str(b.class, 40) : undefined) ?? '',
    subject: pick('subject', b?.subject !== undefined ? str(b.subject, 60) : undefined) ?? '',
    dueDate: pick('dueDate', b?.dueDate !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : null) : undefined) ?? null,
    description: pick('description', b?.description !== undefined ? str(b.description, 2000) : undefined) ?? '',
    chapter: pick('chapter', b?.chapter !== undefined ? (str(b.chapter, 200) || null) : undefined) ?? null,
    questions: b?.questions !== undefined ? b.questions : base?.questions ?? [],
    submissionMode: pick('submissionMode', b?.submissionMode === 'typed' || b?.submissionMode === 'handwritten' ? b.submissionMode : undefined) ?? 'typed',
    proctored: pick('proctored', typeof b?.proctored === 'boolean' ? b.proctored : undefined) ?? false,
    status: pick('status', b?.status === 'draft' || b?.status === 'published' ? b.status : undefined) ?? 'draft',
    assignedStudentIds: pick('assignedStudentIds', Array.isArray(b?.assignedStudentIds)
      ? b.assignedStudentIds.filter((x: unknown) => typeof x === 'string').slice(0, 200) : undefined) ?? [],
  };
}

/** Validates a draft and returns the assignments row it becomes, or the first thing to fix. */
function toRow(d: Draft, staff: Staff): { row?: Record<string, unknown>; error?: string } {
  if (!d.title) return { error: 'Give it a title.' };
  if (!d.cls) return { error: 'Choose a class.' };
  if (!d.subject) return { error: 'Choose a subject.' };
  if (staff.role === 'teacher' && !inScope(staff.scope, d.cls, d.subject)) {
    return { error: `You don't teach ${d.subject} to ${d.cls}. Ask your school admin to add it to your classes.` };
  }
  const { questions, error } = sanitizeQuestions(d.questions);
  if (error) return { error };
  if (d.status === 'published') {
    if (!questions.length) return { error: 'Add at least one question before posting.' };
    if (!d.dueDate) return { error: 'Set a due date before posting.' };
  }
  const isQuiz = d.type === 'quiz';
  if (isQuiz && questions.some(q => q.type !== 'mcq')) return { error: 'Quizzes are multiple choice only, so they can be marked instantly.' };
  const mode = isQuiz ? 'typed' : d.submissionMode;
  return {
    row: {
      title: d.title,
      type: d.type,
      class: d.cls,
      subject: d.subject,
      due_date: d.dueDate,
      description: d.description,
      questions,
      total_marks: questions.length ? totalMarks(questions) : null,
      // The chapter is the TML topic key (evidenceTopicName reads units[0]).
      units: [d.chapter || d.title],
      submission_mode: mode,
      proctored: d.proctored,
      status: d.status,
      assigned_student_ids: d.assignedStudentIds,
    },
  };
}

async function loadOwned(db: SupabaseClient, staff: Staff, id: unknown) {
  if (typeof id !== 'string' || !id) return { error: NextResponse.json({ error: 'id is required' }, { status: 400 }) };
  const { data: a } = await db.from('assignments').select('*').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
  if (!a) return { error: NextResponse.json({ error: 'Assignment not found.' }, { status: 404 }) };
  if (staff.role === 'teacher' && a.teacher_id !== staff.id) {
    return { error: NextResponse.json({ error: 'You can only change your own assignments.' }, { status: 403 }) };
  }
  const { count } = await db.from('submissions').select('id', { count: 'exact', head: true }).eq('assignment_id', id);
  return { a, submissions: count ?? 0 };
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`assignments:${staff.id}`, 60, 10 * 60_000).allowed) {
    return NextResponse.json({ error: 'Too many changes at once. Try again in a few minutes.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const { row, error } = toRow(readDraft(body), staff);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { data, error: dbErr } = await db.from('assignments')
    .insert({ ...row, school_id: staff.schoolId, teacher_id: staff.id }).select('*').single();
  if (dbErr) {
    console.error('[teacher/assignments POST]', dbErr.message);
    return NextResponse.json({ error: 'Could not save the assignment.' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const body = await req.json().catch(() => null);
  const owned = await loadOwned(db, staff, body?.id);
  if ('error' in owned) return owned.error;
  const { a, submissions } = owned;

  const base: Partial<Draft> = {
    title: a.title, type: a.type, cls: a.class, subject: a.subject, dueDate: a.due_date, description: a.description || '',
    chapter: Array.isArray(a.units) ? a.units[0] ?? null : null, questions: a.questions, submissionMode: a.submission_mode,
    proctored: a.proctored, status: a.status, assignedStudentIds: a.assigned_student_ids || [],
  };
  const next = readDraft(body, base);
  if (submissions > 0) {
    // Once students have handed work in, what they answered must stay what's graded.
    if (next.status === 'draft') return NextResponse.json({ error: `${submissions} student${submissions === 1 ? ' has' : 's have'} already submitted, so it can't go back to draft.` }, { status: 409 });
    const locked: (keyof Draft)[] = ['questions', 'type', 'cls', 'subject', 'submissionMode'];
    if (locked.some(k => body?.[k === 'cls' ? 'class' : k] !== undefined && JSON.stringify(next[k]) !== JSON.stringify(base[k]))) {
      return NextResponse.json({ error: 'Students have already submitted, so the questions, class and type are locked. You can still change the title, description and due date.' }, { status: 409 });
    }
  }
  const { row, error } = toRow(next, staff);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const { data, error: dbErr } = await db.from('assignments').update(row!).eq('id', a.id).select('*').single();
  if (dbErr) {
    console.error('[teacher/assignments PATCH]', dbErr.message);
    return NextResponse.json({ error: 'Could not update the assignment.' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const body = await req.json().catch(() => null);
  const owned = await loadOwned(db, staff, body?.id);
  if ('error' in owned) return owned.error;
  if (owned.submissions > 0) {
    return NextResponse.json({ error: `${owned.submissions} student${owned.submissions === 1 ? ' has' : 's have'} submitted work for this. Graded evidence feeds TML, so it can't be deleted.` }, { status: 409 });
  }
  const { error } = await db.from('assignments').delete().eq('id', owned.a.id);
  if (error) return NextResponse.json({ error: 'Could not delete the assignment.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
