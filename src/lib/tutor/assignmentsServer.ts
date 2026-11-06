import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { raise } from '@/lib/feed/raise';
import type { Draft } from '@/lib/feed/rules';
import {
  COOLDOWN_DAYS, HOTS_MIN, completes, latestScores, planCriticalGaps,
  type AssignmentMode, type OpenAssignment,
} from './assignments';

/**
 * Tutor session assignments, server part: the Critical Gap sync (run after every
 * TML recompute and by the feed scan), closing an assignment when a session
 * finishes, and the HOTS gate.
 */

type Db = SupabaseClient;
/** A literal for ilike: % and _ match themselves. */
const lit = (v: string) => v.trim().replace(/[\\%_]/g, m => `\\${m}`);
export interface TmlRow { student_id: string; subject: string; topic_name: string; score: number | string; computed_at: string; confidence_band?: string | null }
export interface StudentRow { id: string; name: string | null; student_class: string | null }

const OPEN_COLS = 'id, student_id, subject, topic, source, mode';
const toOpen = (r: any): OpenAssignment => ({ id: r.id, studentId: r.student_id, subject: r.subject, topic: r.topic, source: r.source, mode: r.mode });

/** Subject teachers of each student for each subject, from the subject links (student -> class subject -> teacher). */
async function subjectTeachers(db: Db, studentIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!studentIds.length) return out;
  const { data } = await byIds<any>(studentIds, (chunk, a, b) => db.from('student_subjects')
    .select('student_id, class_subjects(subject_name, teacher_subjects(teacher_id))').in('student_id', chunk).order('id').range(a, b));
  for (const r of data) {
    const cs = r.class_subjects;
    if (!cs?.subject_name) continue;
    const k = `${r.student_id}|${String(cs.subject_name).trim().toLowerCase()}`;
    out.set(k, (cs.teacher_subjects ?? []).map((t: any) => t.teacher_id).filter(Boolean));
  }
  return out;
}

/**
 * Assigns Critical Gap sessions and clears recovered ones for these TML snapshots, and
 * returns the feed items for the subject teachers (the caller raises them).
 */
export async function syncCriticalGaps(db: Db, schoolId: string, rows: TmlRow[], students: StudentRow[]): Promise<Draft[]> {
  const latest = latestScores(rows);
  const ids = [...new Set(latest.map(l => l.studentId))];
  if (!ids.length) return [];
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();
  const [open, recent] = await Promise.all([
    byIds<any>(ids, (chunk, a, b) => db.from('tutor_assignments').select(OPEN_COLS).eq('school_id', schoolId).eq('status', 'open').in('student_id', chunk).order('id').range(a, b)),
    byIds<any>(ids, (chunk, a, b) => db.from('tutor_assignments').select('student_id, subject, topic, closed_at').eq('school_id', schoolId)
      .eq('source', 'critical_gap').eq('status', 'done').gte('closed_at', since).in('student_id', chunk).order('id').range(a, b)),
  ]);
  if (open.error || recent.error) throw new Error(`tutor_assignments: ${(open.error ?? recent.error)!.message}`);
  const plan = planCriticalGaps(latest, open.data.map(toOpen),
    recent.data.map(r => ({ studentId: r.student_id, subject: r.subject, topic: r.topic, closedAt: r.closed_at })));

  const now = new Date().toISOString();
  for (const c of plan.clear) {
    await db.from('tutor_assignments').update({ status: 'cleared', closed_at: now, close_reason: `Chapter back at ${Math.round(c.score)}%` })
      .eq('id', c.id).eq('status', 'open');
  }
  if (!plan.create.length) return [];
  // One insert per row: the one-open-per-chapter index is on lower(...), so a racing duplicate errors (23505)
  // rather than conflicting cleanly, and it must not take the other rows down with it.
  const made: any[] = [];
  for (const c of plan.create) {
    const { data, error } = await db.from('tutor_assignments').insert({
      school_id: schoolId, student_id: c.studentId, subject: c.subject.trim(), topic: c.topic.trim(), mode: 'standard',
      source: 'critical_gap', trigger_score: Math.round(c.score * 100) / 100,
    }).select('id, student_id, subject, topic, trigger_score').single();
    if (data) made.push(data);
    else if (error && error.code !== '23505') throw new Error(`tutor_assignments: ${error.message}`);
  }
  return draftsFor(db, made, students);
}

async function draftsFor(db: Db, made: any[], students: StudentRow[]): Promise<Draft[]> {
  if (!made.length) return [];
  const who = new Map(students.map(s => [s.id, s]));
  const teachers = await subjectTeachers(db, [...new Set(made.map(m => m.student_id))]);
  const drafts: Draft[] = [];
  for (const m of made) {
    const s = who.get(m.student_id);
    const score = Math.round(Number(m.trigger_score));
    const base: Omit<Draft, 'dedupeKey' | 'teacherId'> = {
      kind: 'tutor_critical_gap', category: 'academic', severity: 'normal',
      title: `${s?.name || 'A student'} is in a Critical Gap on ${m.topic}`,
      message: `${m.subject}: ${score}% (Critical Gap, 35-49%). A Socratic tutor session was assigned automatically; you'll see it close when they finish it.`,
      studentId: m.student_id, studentName: s?.name ?? null, className: s?.student_class ?? null, subject: m.subject,
      sourceTable: 'tutor_assignments', sourceId: m.id, metadata: { score, topic: m.topic },
    };
    const ts = teachers.get(`${m.student_id}|${String(m.subject).trim().toLowerCase()}`) ?? [];
    // Addressed to the subject teacher(s); with no subject link, every teacher of the class sees it.
    if (ts.length) for (const t of ts) drafts.push({ ...base, teacherId: t, dedupeKey: `tutor_gap:${m.id}:${t}` });
    else drafts.push({ ...base, teacherId: null, dedupeKey: `tutor_gap:${m.id}` });
  }
  return drafts;
}

/** After one student's TML recompute: sync their gaps and raise the teacher items. Never throws. */
export async function syncStudentGaps(db: Db, studentId: string): Promise<void> {
  try {
    const { data: me } = await db.from('users').select('id, name, student_class, school_id, role').eq('id', studentId).maybeSingle();
    if (!me?.school_id || me.role !== 'student') return;
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const rows = await pageAll<TmlRow>((a, b) => db.from('tml_scores').select('student_id, subject, topic_name, score, computed_at, confidence_band')
      .eq('student_id', studentId).gte('computed_at', since).order('id').range(a, b));
    if (rows.error) throw new Error(rows.error.message);
    const drafts = await syncCriticalGaps(db, me.school_id, rows.data, [me]);
    if (drafts.length) await raise(db, me.school_id, drafts);
  } catch (e) {
    console.error('[tutor assignments] gap sync failed:', e instanceof Error ? e.message : e);
  }
}

/** A finished session closes the student's open assignment on that chapter and mode. Returns its id. */
export async function completeAssignment(db: Db, studentId: string, s: { id: string; subject: string; topic: string; mode: AssignmentMode; early: boolean }): Promise<string | null> {
  if (s.early) return null;
  const { data } = await db.from('tutor_assignments').select(OPEN_COLS).eq('student_id', studentId).eq('status', 'open').eq('mode', s.mode);
  const hit = (data ?? []).map(toOpen).find(a => completes(a, s));
  if (!hit) return null;
  const { error } = await db.from('tutor_assignments').update({ status: 'done', session_id: s.id, closed_at: new Date().toISOString(), close_reason: 'Session finished' })
    .eq('id', hit.id).eq('status', 'open');
  if (error) { console.error('[tutor assignments] close failed:', error.message); return null; }
  return hit.id;
}

/** HOTS mode: the chapter's latest TML is Exemplary (90%+), or a teacher assigned a HOTS session on it. */
export async function hotsAllowed(db: Db, studentId: string, subject: string, topic: string): Promise<{ ok: boolean; score: number | null }> {
  const [{ data: snaps }, { data: open }] = await Promise.all([
    db.from('tml_scores').select('subject, topic_name, score, computed_at').eq('student_id', studentId).ilike('subject', lit(subject)).ilike('topic_name', lit(topic))
      .order('computed_at', { ascending: false }).limit(1),
    db.from('tutor_assignments').select('id').eq('student_id', studentId).eq('status', 'open').eq('mode', 'hots').ilike('subject', lit(subject)).ilike('topic', lit(topic)).limit(1),
  ]);
  const score = snaps?.[0] ? Number(snaps[0].score) : null;
  return { ok: (score !== null && score >= HOTS_MIN) || !!open?.length, score };
}

/** The student's open assignments, oldest due first. */
export async function openAssignments(db: Db, studentId: string) {
  const { data } = await db.from('tutor_assignments')
    .select('id, subject, topic, mode, source, due_on, note, trigger_score, created_at, assigned_by, by:users!tutor_assignments_assigned_by_fkey(name)')
    .eq('student_id', studentId).eq('status', 'open').order('due_on', { ascending: true, nullsFirst: false }).order('created_at').limit(50);
  return (data ?? []).map((r: any) => ({
    id: r.id, subject: r.subject, topic: r.topic, mode: r.mode as AssignmentMode, source: r.source as 'critical_gap' | 'teacher',
    dueOn: r.due_on, note: r.note, score: r.trigger_score === null ? null : Number(r.trigger_score), assignedAt: r.created_at, by: r.by?.name ?? null,
  }));
}
