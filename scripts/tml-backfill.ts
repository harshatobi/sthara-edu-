// Rebuilds tml_history week by week from graded evidence (Mastery Tracker trends, 2026-11-07).
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/tml-backfill.ts <school id | all> [--dry]
//
// Without the service key locally, use POST /api/ops/tml-backfill instead (Platform Manager operators, runs on the server).
//
// For each student, every India week from their first graded evidence to this week is scored as of the end of that
// week with the live engine (lib/tml/engine scoreTopics): later evidence is excluded and ages run from the week's end.
// Engagement uses today's values (engagement_scores keeps no history). Weeks already written live are left alone;
// re-running is safe (rows are upserted on student, subject, topic and week).
import { createClient } from '@supabase/supabase-js';
import { backfillStudentHistory } from '../src/lib/tml/backfill';

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

const one = (studentId: string) => backfillStudentHistory(db, studentId, dry);

async function main() {
  const list = await students();
  console.log(`${dry ? '[dry run] ' : ''}${list.length} students`);
  let done = 0, rows = 0, failed = 0;
  const queue = [...list];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try { const n = await one(s.id); rows += n; } catch (e) { failed++; console.error(e instanceof Error ? e.message : e); }
      if (++done % 100 === 0) console.log(`${done}/${list.length} students, ${rows} rows`);
    }
  }));
  console.log(`${dry ? '[dry run] would write' : 'wrote'} ${rows} rows for ${done} students${failed ? `, ${failed} failed` : ''}`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
