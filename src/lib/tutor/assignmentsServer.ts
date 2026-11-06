import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { byIds, pageAll } from '@/lib/ops/page';
import { raise } from '@/lib/feed/raise';
import { istDay, type Draft } from '@/lib/feed/rules';
import { displayClass, normClass } from '@/lib/teacher/scope';
import {
  COOLDOWN_DAYS, GAP_CAP, HOTS_MIN, completes, latestScores, planCriticalGaps,
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

const OPEN_COLS = 'id, student_id, subject, topic, source, mode, trigger_score';
const toOpen = (r: any): OpenAssignment => ({ id: r.id, studentId: r.student_id, subject: r.subject, topic: r.topic, source: r.source, mode: r.mode, score: r.trigger_score === null ? null : Number(r.trigger_score) });

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
export async function syncCriticalGaps(db: Db, schoolId: string, rows: TmlRow[], _students: StudentRow[]): Promise<Draft[]> {
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
  const touched = new Set<string>(); // student|subject whose class digest needs refreshing
  const openById = new Map(open.data.map(r => [r.id, r]));
  for (const c of plan.clear) {
    await db.from('tutor_assignments').update({ status: 'cleared', closed_at: now, close_reason: `Chapter back at ${Math.round(c.score)}%` })
      .eq('id', c.id).eq('status', 'open');
    const r = openById.get(c.id); if (r) touched.add(`${r.student_id}|${r.subject}`);
  }
  if (plan.queue.length) {
    // Over the cap (e.g. assigned before it existed): the higher-scoring ones wait and come back as slots free.
    await db.from('tutor_assignments').update({ status: 'cancelled', closed_at: now, close_reason: `Queued: at most ${GAP_CAP} Critical Gap sessions open at once` })
      .in('id', plan.queue).eq('status', 'open');
    for (const id of plan.queue) { const r = openById.get(id); if (r) touched.add(`${r.student_id}|${r.subject}`); }
  }
  // One insert per row: the one-open-per-chapter index is on lower(...), so a racing duplicate errors (23505)
  // rather than conflicting cleanly, and it must not take the other rows down with it.
  for (const c of plan.create) {
    const { error } = await db.from('tutor_assignments').insert({
      school_id: schoolId, student_id: c.studentId, subject: c.subject.trim(), topic: c.topic.trim(), mode: 'standard',
      source: 'critical_gap', trigger_score: Math.round(c.score * 100) / 100,
    });
    if (!error) touched.add(`${c.studentId}|${c.subject.trim()}`);
    else if (error.code !== '23505') throw new Error(`tutor_assignments: ${error.message}`);
  }
  if (!touched.size) return [];
  return digestDrafts(db, schoolId, touched);
}

/**
 * One feed item per class and subject per day for the subject teacher(s): who has a
 * Critical Gap tutor session open, and on which chapters (Moses, 2026-11-06: a digest,
 * not one item per gap). Rebuilt from every open one in the class, so a later sync the
 * same day updates the item instead of adding another.
 */
async function digestDrafts(db: Db, schoolId: string, touched: Set<string>): Promise<Draft[]> {
  const roster = await pageAll<StudentRow>((a, b) => db.from('users').select('id, name, student_class')
    .eq('school_id', schoolId).eq('role', 'student').order('id').range(a, b));
  if (roster.error) throw new Error(roster.error.message);
  const byId = new Map(roster.data.map(s => [s.id, s]));
  const groups = new Map<string, { cls: string; subject: string }>();
  for (const t of touched) {
    const [sid, subject] = t.split('|');
    const cls = byId.get(sid)?.student_class;
    if (cls) groups.set(`${normClass(cls)}|${subject.trim().toLowerCase()}`, { cls, subject: subject.trim() });
  }
  const drafts: Draft[] = [];
  const day = istDay(new Date());
  for (const [gk, g] of groups) {
    const inClass = roster.data.filter(s => normClass(s.student_class) === normClass(g.cls));
    const { data: rows } = await byIds<any>(inClass.map(s => s.id), (chunk, a, b) => db.from('tutor_assignments').select('student_id, topic, trigger_score')
      .eq('status', 'open').eq('source', 'critical_gap').ilike('subject', lit(g.subject)).in('student_id', chunk).order('id').range(a, b));
    if (!rows.length) continue;
    const per = new Map<string, string[]>();
    for (const r of [...rows].sort((a, b) => Number(a.trigger_score) - Number(b.trigger_score))) {
      per.set(r.student_id, [...(per.get(r.student_id) ?? []), `${r.topic} ${Math.round(Number(r.trigger_score))}%`]);
    }
    const list = [...per.entries()].map(([sid, ch]) => `${byId.get(sid)?.name || 'A student'} (${ch.join(', ')})`).join('; ');
    const n = per.size;
    const teachers = await subjectTeachers(db, [...per.keys()]);
    const tIds = [...new Set([...per.keys()].flatMap(sid => teachers.get(`${sid}|${g.subject.toLowerCase()}`) ?? []))];
    const base: Omit<Draft, 'dedupeKey' | 'teacherId'> = {
      kind: 'tutor_critical_gap', category: 'academic', severity: 'normal',
      title: `${n} student${n === 1 ? '' : 's'} in ${displayClass(g.cls)} ${g.subject} ${n === 1 ? 'has' : 'have'} Critical Gap tutor sessions`,
      message: `Assigned automatically (chapters at 35-49%, at most ${GAP_CAP} per student, lowest first): ${list}. Each closes when the student finishes the session or the chapter recovers.`,
      className: g.cls, subject: g.subject, sourceTable: 'tutor_assignments', metadata: { students: n, open: rows.length },
    };
    const key = `tutor_gap_digest:${gk}:${day}`;
    if (tIds.length) for (const t of tIds) drafts.push({ ...base, teacherId: t, dedupeKey: `${key}:${t}` });
    else drafts.push({ ...base, teacherId: null, dedupeKey: key });
  }
  return drafts;
}

/** How far back a chapter's latest snapshot still counts (snapshots are written only when TML is recomputed). */
const SNAPSHOT_DAYS = 120;

/**
 * Sync the gaps of some students (after a recompute, when a student opens the tutor, when a
 * teacher opens a class) and raise the teacher items. Never throws.
 */
export async function syncGapsFor(db: Db, schoolId: string, students: StudentRow[]): Promise<void> {
  try {
    if (!students.length) return;
    const since = new Date(Date.now() - SNAPSHOT_DAYS * 86_400_000).toISOString();
    const rows = await byIds<TmlRow>(students.map(s => s.id), (chunk, a, b) => db.from('tml_scores')
      .select('student_id, subject, topic_name, score, computed_at, confidence_band')
      .eq('school_id', schoolId).in('student_id', chunk).gte('computed_at', since).order('id').range(a, b));
    if (rows.error) throw new Error(rows.error.message);
    const drafts = await syncCriticalGaps(db, schoolId, rows.data, students);
    if (drafts.length) await raise(db, schoolId, drafts);
  } catch (e) {
    console.error('[tutor assignments] gap sync failed:', e instanceof Error ? e.message : e);
  }
}

/** After one student's TML recompute, or when they open the tutor. Never throws. */
export async function syncStudentGaps(db: Db, studentId: string): Promise<void> {
  const { data: me } = await db.from('users').select('id, name, student_class, school_id, role').eq('id', studentId).maybeSingle();
  if (!me?.school_id || me.role !== 'student') return;
  await syncGapsFor(db, me.school_id, [me]);
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
