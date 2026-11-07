import type { SupabaseClient } from '@supabase/supabase-js';
import { engagementAt, historyRow, istWeek, istWeekEndMs, loadStudentEvidence, scoreTopics } from './engine';

/**
 * Rebuilds one student's tml_history week by week from their graded evidence (Mastery Tracker trends, 2026-11-07).
 * Every India week from their first graded evidence to this week is scored as of the end of that week with the live
 * engine: later evidence is excluded and ages run from the week's end. Engagement uses today's values
 * (engagement_scores keeps no history). Weeks already written live are left alone; re-running is safe (upserts).
 * Returns the number of rows written (or that would be, when `dry`).
 */
export async function backfillStudentHistory(db: SupabaseClient, studentId: string, dry = false): Promise<number> {
  const { schoolId, evidence, flagged, engagementBase } = await loadStudentEvidence(db, studentId);
  if (!evidence.length) return 0;
  const { data: liveRows, error } = await db.from('tml_history').select('subject, topic_key, week').eq('student_id', studentId).eq('source', 'live');
  if (error) throw new Error(`reading tml_history: ${error.message}`);
  const live = new Set((liveRows || []).map((r: any) => `${r.subject}|${r.topic_key}|${r.week}`));
  const now = Date.now();
  const first = Math.min(...evidence.map(e => e.atMs));
  const thisWeek = istWeek(now);
  const computedAt = new Date(now).toISOString();
  const rows: ReturnType<typeof historyRow>[] = [];
  for (let wk = istWeek(first); wk <= thisWeek; wk = istWeek(istWeekEndMs(wk) + 1)) {
    const asOf = Math.min(istWeekEndMs(wk), now);
    const engagement = engagementAt(engagementBase, evidence, asOf);
    for (const t of scoreTopics(evidence, { nowMs: asOf, engagement, flagged })) {
      if (t.finalTml === null) continue;
      const row = historyRow(t, studentId, schoolId, wk, 'backfill', computedAt);
      if (!live.has(`${row.subject}|${row.topic_key}|${wk}`)) rows.push(row);
    }
    if (rows.length > 20_000) throw new Error(`${studentId}: runaway week loop at ${wk}`);
  }
  if (!dry) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await db.from('tml_history').upsert(rows.slice(i, i + 500), { onConflict: 'student_id,subject,topic_key,week' });
      if (e) throw new Error(`${studentId}: writing tml_history: ${e.message}`);
    }
  }
  return rows.length;
}
