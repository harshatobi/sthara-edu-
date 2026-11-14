/**
 * A student's own version of an assignment (per-student versions and A/B/C sets from the Studio).
 *
 * Every path that marks or shows an assignment for one student goes through `withVariant`, so a student with a
 * version is marked against their own questions and a student without one against `assignments.questions`, as
 * before. Typed submissions, photo marking, the teacher's review and the student's view all agree.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { marksOf, sanitizeQuestions, type Question } from '@/lib/teacher/questions';

export interface Variant { questions: Question[]; reason: string | null; access: string[]; label: string | null }

export async function variantFor(db: SupabaseClient, assignmentId: string, studentId: string): Promise<Variant | null> {
  const { data, error } = await db.from('assignment_variants').select('questions, reason, access, label')
    .eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle();
  // A missing table (migration not applied yet) or no row: the whole-class questions stand.
  if (error || !data) return null;
  const { questions } = sanitizeQuestions(data.questions);
  return questions.length ? { questions, reason: data.reason ?? null, access: Array.isArray(data.access) ? data.access : [], label: data.label ?? null } : null;
}

/** The assignment row as this student should be marked on it: their own questions and total, if they have a version. */
export async function withVariant<T extends { id: string; questions?: unknown; total_marks?: unknown }>(db: SupabaseClient, a: T, studentId: string): Promise<T & { variant: Variant | null }> {
  const v = await variantFor(db, a.id, studentId);
  if (!v) return { ...a, variant: null };
  return { ...a, questions: v.questions, total_marks: v.questions.reduce((n, q) => n + marksOf(q), 0), variant: v };
}

/** What a student may see of their questions before marking: no key, no worked answer (as app.strip_answer_key). */
export function stripKey(questions: Question[]): Omit<Question, 'answer' | 'why'>[] {
  return questions.map(({ answer: _a, why: _w, ...rest }) => rest);
}
