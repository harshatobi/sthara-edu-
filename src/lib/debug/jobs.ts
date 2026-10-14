import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runNoShowCheck } from '@/lib/attendance/server';

/**
 * Jobs the app itself performs (as opposed to the database scheduler's), and their run history in ops_job_runs.
 * Only jobs that are safe to repeat are listed: "Run now" in the Platform Manager calls exactly these.
 */
export const APP_JOBS = {
  'attendance-noshow': {
    label: 'Staff no-show check',
    note: 'Alerts the office about staff who have not punched in, for every school with the alert on. Also runs whenever someone opens the cover or attendance board. Repeating it does not alert twice.',
    schedule: 'Every 15 minutes on school mornings, once a scheduler calls /api/cron/attendance (not set up yet)',
  },
} as const;
export type AppJob = keyof typeof APP_JOBS;
export const isAppJob = (v: unknown): v is AppJob => typeof v === 'string' && Object.hasOwn(APP_JOBS, v);

async function perform(db: SupabaseClient, job: AppJob): Promise<Record<string, unknown>> {
  switch (job) {
    case 'attendance-noshow': {
      const { data: schools } = await db.from('attendance_settings').select('school_id').eq('noshow_alerts', true);
      let alerted = 0, failed = 0;
      for (const s of schools || []) {
        try { alerted += (await runNoShowCheck(db, s.school_id)).alerted; } catch (e) { failed += 1; console.warn('[job attendance-noshow]', s.school_id, e instanceof Error ? e.message : e); }
      }
      return { schools: (schools || []).length, alerted, failed };
    }
  }
}

/** Runs a job and records the run, whoever started it. Never throws: the outcome is in the returned row. */
export async function runJob(db: SupabaseClient, job: AppJob, triggeredBy: string) {
  const started = new Date().toISOString();
  let ok = true, detail: Record<string, unknown>;
  try {
    detail = await perform(db, job);
    if (Number(detail.failed) > 0) ok = false;
  } catch (e) {
    ok = false;
    detail = { error: e instanceof Error ? e.message.slice(0, 300) : 'failed' };
  }
  const row = { job, started_at: started, finished_at: new Date().toISOString(), ok, detail, triggered_by: triggeredBy.slice(0, 200) };
  const { error } = await db.from('ops_job_runs').insert(row);
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') console.warn('[job runs]', error.message);
  return row;
}
