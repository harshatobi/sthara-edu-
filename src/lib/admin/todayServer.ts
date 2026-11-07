import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isoDay } from './format';
import type { SchoolAdmin } from './serverAuth';

/**
 * What is waiting today, counted on the server for the queues the admin desk doesn't carry (2026-11-06): the
 * "waiting for you" list on every office home, and the principal's pulse. Only the queues the caller's roles
 * cover are counted; each is { count, oldest } where oldest is when the longest-waiting item arrived.
 */
export interface Queue { count: number; oldest: string | null }
export interface Today {
  day: string;
  queues: Partial<Record<QueueKey, Queue>>;
  /** Today's registers across the school (attendance.read). */
  attendance: { marked: number; present: number; late: number; absent: number; excused: number; students: number } | null;
}
export type QueueKey = 'payroll' | 'certificates' | 'discipline' | 'kirti' | 'messages' | 'incidents' | 'register' | 'logins' | 'health' | 'counselling';

/** One head count with the oldest row, without fetching rows. */
async function queue(q: any, dateCol: string): Promise<Queue> {
  const [{ count, error }, first] = await Promise.all([
    q().select('id', { count: 'exact', head: true }),
    q().select(dateCol).order(dateCol, { ascending: true }).limit(1),
  ]);
  if (error) return { count: 0, oldest: null };
  return { count: count ?? 0, oldest: first.data?.[0]?.[dateCol] ?? null };
}

export async function todayFor(db: SupabaseClient, admin: SchoolAdmin, now = new Date()): Promise<Today> {
  const a = admin.access, school = admin.schoolId;
  const day = isoDay(new Date(now.getTime() + 5.5 * 3600_000));
  const jobs: [QueueKey, Promise<Queue>][] = [];
  const add = (k: QueueKey, ok: boolean, build: () => any, col: string) => { if (ok) jobs.push([k, queue(build, col)]); };

  // bounded: queue() reads only a head count and the single oldest row
  add('payroll', a.can('payroll.approve'), () => db.from('pay_runs').select().eq('school_id', school).eq('status', 'submitted'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  // The approver waits on certificates sent for approval; the one who prepares them, on their drafts.
  add('certificates', a.can('certificates.approve') || a.can('certificates.prepare'),
    () => db.from('certificates').select().eq('school_id', school).eq('status', a.can('certificates.approve') ? 'pending' : 'draft'), 'created_at');
  // A suspension needs discipline.suspend; the rest discipline.approve.
  if (a.can('discipline.approve') || a.can('discipline.suspend')) {
  // bounded: queue() reads only a head count and the single oldest row
    jobs.push(['discipline', queue(() => {
      let q = db.from('discipline_actions').select().eq('school_id', school).eq('status', 'proposed');
      if (!a.can('discipline.suspend')) q = q.neq('kind', 'suspension');
      if (!a.can('discipline.approve')) q = q.eq('kind', 'suspension');
      return q;
    }, 'created_at')]);
  }
  // bounded: queue() reads only a head count and the single oldest row
  add('kirti', a.can('cocurricular.approve'), () => db.from('kirti_entries').select().eq('school_id', school).eq('status', 'pending'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  add('messages', a.can('messages.office'), () => db.from('school_threads').select().eq('school_id', school).eq('audience', 'office').eq('status', 'open'), 'last_message_at');
  // Child-protection incidents are counted only for those who hold those cases; this is the office's open incidents.
  // bounded: queue() reads only a head count and the single oldest row
  add('incidents', a.can('incidents.manage'), () => db.from('incidents').select().eq('school_id', school).eq('status', 'open').neq('category', 'child_protection'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  add('register', a.can('students.manage'), () => db.from('student_change_requests').select().eq('school_id', school).eq('status', 'pending').neq('kind', 'health'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  add('health', a.can('health.manage'), () => db.from('student_change_requests').select().eq('school_id', school).eq('status', 'pending').eq('kind', 'health'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  add('counselling', a.can('counselling.notes'), () => db.from('counselling_referrals').select().eq('school_id', school).eq('status', 'new'), 'created_at');
  // bounded: queue() reads only a head count and the single oldest row
  add('logins', a.can('people.manage'), () => db.from('account_requests').select().eq('school_id', school).eq('status', 'pending'), 'created_at');

  const attendanceP = a.can('attendance.read') ? (async () => {
    const [{ data, error }, students] = await Promise.all([
      // bounded: one school's registers for one day (one row per student)
      db.from('attendance').select('status').eq('school_id', school).eq('day', day).limit(20000),
      db.from('users').select('id', { count: 'exact', head: true }).eq('school_id', school).eq('role', 'student'),
    ]);
    if (error) return null;
    const by = (s: string) => (data ?? []).filter(r => r.status === s).length;
    return { marked: data?.length ?? 0, present: by('present'), late: by('late'), absent: by('absent'), excused: by('excused'), students: students.count ?? 0 };
  })() : Promise.resolve(null);

  const [done, attendance] = await Promise.all([Promise.all(jobs.map(([, p]) => p)), attendanceP]);
  return { day, queues: Object.fromEntries(jobs.map(([k], i) => [k, done[i]])), attendance };
}
