// Rebuilds tml_history week by week from graded evidence (Mastery Tracker trends, 2026-11-07).
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/tml-backfill.ts <school id | all> [--dry]
//
// For each student, every India week from their first graded evidence to this week is scored as of the end of that
// week with the live engine (lib/tml/engine scoreTopics): later evidence is excluded and ages run from the week's end.
// Engagement uses today's values (engagement_scores keeps no history). Weeks already written live are left alone;
// re-running is safe (rows are upserted on student, subject, topic and week).
import { createClient } from '@supabase/supabase-js';
import { engagementAt, historyRow, istWeek, istWeekEndMs, loadStudentEvidence, scoreTopics } from '../src/lib/tml/engine';

const need = (k: string) => { const v = process.env[k]?.trim(); if (!v) throw new Error(`${k} is required`); return v; };
const [target, flag] = process.argv.slice(2);
if (!target) throw new Error('Usage: tml-backfill.ts <school id | all> [--dry]');
const dry = flag === '--dry';
const db = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

async function students(): Promise<{ id: string; school_id: string }[]> {
  const out: { id: string; school_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('users').select('id, school_id').eq('role', 'student').not('school_id', 'is', null).order('id').range(from, from + 999);
    if (target !== 'all') q = q.eq('school_id', target);
    const { data, error } = await q;
    if (error) throw new Error(`reading students: ${error.message}`);
    out.push(...(data as any[]));
    if (!data || data.length < 1000) return out;
  }
}

async function liveWeeks(studentId: string): Promise<Set<string>> {
  const { data, error } = await db.from('tml_history').select('subject, topic_key, week').eq('student_id', studentId).eq('source', 'live');
  if (error) throw new Error(`reading tml_history: ${error.message}`);
  return new Set((data || []).map((r: any) => `${r.subject}|${r.topic_key}|${r.week}`));
}

async function one(studentId: string): Promise<number> {
  const { schoolId, evidence, flagged, engagementBase } = await loadStudentEvidence(db, studentId);
  if (!evidence.length) return 0;
  const first = Math.min(...evidence.map(e => e.atMs));
  const thisWeek = istWeek(Date.now());
  const live = await liveWeeks(studentId);
  const computedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  for (let wk = istWeek(first); wk <= thisWeek; wk = istWeek(istWeekEndMs(wk) + 1)) {
    const asOf = Math.min(istWeekEndMs(wk), Date.now());
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
      const { error } = await db.from('tml_history').upsert(rows.slice(i, i + 500), { onConflict: 'student_id,subject,topic_key,week' });
      if (error) throw new Error(`${studentId}: writing tml_history: ${error.message}`);
    }
  }
  return rows.length;
}

const list = await students();
console.log(`${dry ? '[dry run] ' : ''}${list.length} students`);
let done = 0, rows = 0, failed = 0;
const queue = [...list];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let s = queue.shift(); s; s = queue.shift()) {
    try { rows += await one(s.id); } catch (e) { failed++; console.error(e instanceof Error ? e.message : e); }
    if (++done % 100 === 0) console.log(`${done}/${list.length} students, ${rows} rows`);
  }
}));
console.log(`${dry ? '[dry run] would write' : 'wrote'} ${rows} rows for ${done} students${failed ? `, ${failed} failed` : ''}`);
