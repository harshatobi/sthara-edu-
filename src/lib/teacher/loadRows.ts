/**
 * Loads a teacher's desk rows (shaped by assembleDesk in desk.ts). Shared by the
 * /teacher area (browser client) and the School OS (server).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeskRows } from './desk';
import type { ScopeEntry } from './scope';

/**
 * The rows behind a teacher's desk. The browser passes its own client; the
 * School OS passes the service client, scoped here to the teacher's own
 * assignments and school.
 */
export async function loadTeacherRows(supabase: SupabaseClient, who: { schoolId: string; uid: string }, scope: ScopeEntry[]): Promise<DeskRows> {
  const school = who.schoolId;
  // Row-level security already limits a teacher to their own school.
  const [students, assignments] = await Promise.all([
    supabase.from('users').select('id, name, email, student_class, custom_student_id').eq('school_id', school).eq('role', 'student'),
    supabase.from('assignments').select('*').eq('school_id', school).eq('teacher_id', who.uid).order('created_at', { ascending: false }),
  ]);
  if (students.error) throw students.error;
  if (assignments.error) throw assignments.error;

  const ids = (assignments.data || []).map(a => a.id);
  const studentIds = (students.data || []).map(s => s.id);
  const subjects = [...new Set(scope.map(e => e.subject).filter(Boolean))];
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [subs, tml, alerts] = await Promise.all([
    ids.length
      ? supabase.from('submissions')
        .select('id, assignment_id, student_id, score, max_score, grade, teacher_approved, ai_graded, ai_result, ai_feedback, answers, image_urls, submitted_at, teacher_note, type')
        .in('assignment_id', ids)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase.from('tml_scores').select('student_id, subject, topic_name, score, confidence_band, components, item_count, computed_at')
        .in('student_id', studentIds).order('computed_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('proctor_alerts').select('id, student_id, student_name, assignment_id, assignment_title, switch_count, flagged_at')
      .eq('school_id', school).gte('flagged_at', since),
  ]);
  if (subs.error) throw subs.error;
  const gradedIds = (subs.data || []).filter((x: any) => x.teacher_approved === true).map((x: any) => x.id);
  const items = gradedIds.length
    ? await supabase.from('submission_items').select('submission_id, question_index, score').in('submission_id', gradedIds).eq('teacher_confirmed', true)
    : { data: [], error: null };
  // TML and proctoring degrade to "no evidence yet" rather than failing the desk.
  if (tml.error) console.warn('[teacher desk] tml_scores unavailable:', tml.error.message);
  if (alerts.error) console.warn('[teacher desk] proctor_alerts unavailable:', alerts.error.message);

  const tmlRows = (tml.data || []).filter((r: any) => !subjects.length || subjects.some(s => s.toLowerCase() === String(r.subject || '').toLowerCase()));
  return { students: students.data || [], assignments: assignments.data || [], submissions: subs.data || [], tml: tmlRows, alerts: alerts.data || [], items: items.data || [] };
}

