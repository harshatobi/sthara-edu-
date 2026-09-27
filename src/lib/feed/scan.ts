import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectAbsenceStreaks, detectExamAbsences, detectLowScores, detectOverdue, detectProctoring, detectTmlDrops, detectWellness,
  istDay, DAY_MS, type Draft,
} from './rules';
import { escalate, raise } from './raise';

const THROTTLE_MS = 2 * 60_000;
const lastRun = new Map<string, number>();

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/**
 * Runs every detector for one school and sends due escalations. Idempotent
 * (dedupe keys), so running it twice is harmless; it is throttled per school
 * per server instance because it runs whenever a feed is opened.
 */
export async function scanSchool(db: SupabaseClient, schoolId: string, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  if (!opts.force && Date.now() - (lastRun.get(schoolId) ?? 0) < THROTTLE_MS) return { skipped: true as const };
  lastRun.set(schoolId, Date.now());

  const today = istDay(now);
  const iso = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  const dayAgo = (days: number) => istDay(new Date(now.getTime() - days * DAY_MS));

  const { data: school } = await db.from('schools').select('settings').eq('id', schoolId).maybeSingle();
  const dayEnd = (school?.settings as any)?.schoolDayEnd || undefined;

  const students = await all<any>((a, b) => db.from('users').select('id, name, student_class').eq('school_id', schoolId).eq('role', 'student').order('id').range(a, b));
  const assignments = await all<any>((a, b) => db.from('assignments')
    .select('id, teacher_id, title, type, subject, class, due_date, status, assigned_student_ids, proctored')
    .eq('school_id', schoolId).gte('due_date', dayAgo(45)).order('id').range(a, b));
  const aIds = assignments.map(a => a.id);
  const submissions: any[] = [];
  for (let i = 0; i < aIds.length; i += 150) {
    submissions.push(...await all<any>((a, b) => db.from('submissions')
      .select('id, assignment_id, student_id, score, max_score, teacher_approved, submitted_at').in('assignment_id', aIds.slice(i, i + 150)).order('id').range(a, b)));
  }
  const [tml, wellness, attendance, proctor] = await Promise.all([
    all<any>((a, b) => db.from('tml_scores').select('student_id, subject, topic_name, score, computed_at').eq('school_id', schoolId).gte('computed_at', iso(21)).order('id').range(a, b)),
    // Only what a teacher may see: energy and whether a note was shared, never the note.
    all<any>((a, b) => db.from('wellness_logs').select('id, student_id, energy, shared, created_at').eq('school_id', schoolId).gte('created_at', iso(10)).order('id').range(a, b)),
    all<any>((a, b) => db.from('attendance').select('student_id, class_name, day, status').eq('school_id', schoolId).gte('day', dayAgo(30)).order('id').range(a, b)),
    all<any>((a, b) => db.from('proctor_alerts').select('id, student_id, student_name, assignment_id, assignment_title, switch_count, flagged_at').eq('school_id', schoolId).gte('flagged_at', iso(7)).order('id').range(a, b)),
  ]);

  const drafts: Draft[] = [
    ...detectOverdue(assignments, submissions, students, today),
    ...detectLowScores(submissions, assignments, students),
    ...detectTmlDrops(tml, students),
    ...detectWellness(wellness, students, iso(2)),
    ...detectAbsenceStreaks(attendance, students),
    ...detectExamAbsences(attendance.filter(r => r.day >= dayAgo(7)), assignments, students),
    ...detectProctoring(proctor, assignments, students),
  ];
  const res = await raise(db, schoolId, drafts, { now, dayEnd });
  const escalated = await escalate(db, schoolId, now);
  return { skipped: false as const, ...res, escalated };
}
