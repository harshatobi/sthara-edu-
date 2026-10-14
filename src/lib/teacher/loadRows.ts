/**
 * Loads a teacher's desk rows (shaped by assembleDesk in desk.ts). Shared by the
 * /teacher area (browser client) and the School OS (server).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { all, allByIds } from '@/lib/admin/loadRows';
import type { DeskRows } from './desk';
import { normClass, type ScopeEntry } from './scope';

/**
 * The rows behind a teacher's desk. The browser passes its own client; the
 * School OS passes the service client, scoped here to the teacher's own
 * assignments and school.
 *
 * Every list is paged: the database stops at 1,000 rows without saying so, and a
 * 1,000-student school passes that on the roster, the submissions and the TML alike.
 * `warn` hears about the parts that degrade to "no evidence yet" instead of failing.
 */
export async function loadTeacherRows(
  supabase: SupabaseClient, who: { schoolId: string; uid: string }, scope: ScopeEntry[], warn: (msg: string) => void = m => console.warn(m),
): Promise<DeskRows> {
  const school = who.schoolId;
  // Row-level security already limits a teacher to their own school.
  const [students, assignments] = await Promise.all([
    all((a, b) => supabase.from('users').select('id, name, email, student_class, custom_student_id').eq('school_id', school).eq('role', 'student').order('id').range(a, b)),
    all((a, b) => supabase.from('assignments').select('*').eq('school_id', school).eq('teacher_id', who.uid).order('created_at', { ascending: false }).order('id').range(a, b)),
  ]);

  const ids = assignments.data.map(a => a.id);
  // Evidence only for the students this teacher can see on the desk: their classes and the classes they set work in.
  const classes = new Set([...scope.map(e => normClass(e.cls)), ...assignments.data.map(a => normClass(a.class))]);
  const studentIds = students.data.filter(s => classes.has(normClass(s.student_class))).map(s => s.id);
  const subjects = [...new Set(scope.map(e => e.subject).filter(Boolean))];
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const soft = <T,>(what: string, p: Promise<T>, empty: T) => p.catch(e => { warn(`[teacher desk] ${what} unavailable: ${e?.message || e}`); return empty; });
  const none = { data: [] as any[], missing: false };
  const [subs, tml, alerts] = await Promise.all([
    allByIds(ids, (chunk, a, b) => supabase.from('submissions')
      .select('id, assignment_id, student_id, score, max_score, grade, teacher_approved, ai_graded, ai_result, ai_feedback, answers, image_urls, submitted_at, teacher_note, type')
      .in('assignment_id', chunk).order('id').range(a, b)),
    // TML and proctoring degrade to "no evidence yet" rather than failing the desk.
    soft('tml_scores', allByIds(studentIds, (chunk, a, b) => {
      const q = supabase.from('tml_scores').select('student_id, subject, topic_name, score, confidence_band, components, item_count, computed_at').in('student_id', chunk);
      // Only this teacher's subjects (any letter case): the other subjects' scores are most of the rows.
      return (subjects.length ? q.or(subjects.map(s => `subject.ilike.${quote(s)}`).join(',')) : q).order('id').range(a, b);
    }), none),
    soft('proctor_alerts', all((a, b) => supabase.from('proctor_alerts').select('id, student_id, student_name, assignment_id, assignment_title, switch_count, flagged_at')
      .eq('school_id', school).gte('flagged_at', since).order('id').range(a, b)), none),
  ]);
  const gradedIds = subs.data.filter(x => x.teacher_approved === true).map(x => x.id);
  const items = await allByIds(gradedIds, (chunk, a, b) => supabase.from('submission_items').select('submission_id, question_index, score')
    .in('submission_id', chunk).eq('teacher_confirmed', true).order('submission_id').order('question_index').range(a, b));
  if (tml.missing) warn('[teacher desk] tml_scores table missing');
  if (alerts.missing) warn('[teacher desk] proctor_alerts table missing');

  const tmlRows = tml.data.filter(r => !subjects.length || subjects.some(s => s.toLowerCase() === String(r.subject || '').toLowerCase()));
  return { students: students.data, assignments: assignments.data, submissions: subs.data, tml: tmlRows, alerts: alerts.data, items: items.data };
}

/** A value for a PostgREST or() filter: quoted, with LIKE wildcards escaped so a subject name matches only itself. */
const quote = (v: string) => `"${v.replace(/[\\%_]/g, m => `\\${m}`).replace(/"/g, '\\"')}"`;
