/**
 * When a student may see an assignment's answer key. The key is hidden from students
 * (assignments_student strips it) so it can't be passed to a classmate who hasn't handed in yet.
 * It is released once the whole class is graded: nothing is waiting for the teacher to confirm,
 * and either everyone on the roster has handed in or the due date has passed.
 */
export interface KeyRelease { released: boolean; reason: 'released' | 'awaiting-review' | 'not-everyone-in' }

export function answerKeyRelease(input: {
  roster: string[];
  submissions: { student_id: string; teacher_approved: boolean | null }[];
  dueDate: string | null;
  now: number;
}): KeyRelease {
  const onRoster = new Set(input.roster);
  const subs = input.submissions.filter(s => onRoster.has(s.student_id));
  if (subs.some(s => s.teacher_approved !== true)) return { released: false, reason: 'awaiting-review' };
  const allIn = input.roster.length > 0 && input.roster.every(id => subs.some(s => s.student_id === id));
  const due = input.dueDate ? Date.parse(input.dueDate) : NaN;
  if (allIn || (Number.isFinite(due) && due < input.now)) return { released: true, reason: 'released' };
  return { released: false, reason: 'not-everyone-in' };
}

/** The keyed option per MCQ, by question index. */
export function mcqKey(questions: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  (Array.isArray(questions) ? questions : []).forEach((q: any, i) => {
    const k = typeof q?.answer === 'number' ? q.answer : typeof q?.answer === 'string' && /^\d+$/.test(q.answer) ? Number(q.answer) : null;
    if (q?.type === 'mcq' && k !== null) out[i] = k;
  });
  return out;
}
