/**
 * Tutor session assignments, pure part (decisions of 2026-11-06, TML spec section 3).
 *
 *   Critical Gap (35-49%)  a mandatory Socratic session is assigned automatically and the
 *                          subject teacher is told. It closes when the student finishes a
 *                          session on that chapter (not one ended early), or is cleared
 *                          when the chapter climbs back to 50% or more.
 *   Exemplary (>= 90%)     unlocks HOTS / Olympiad mode on that chapter.
 *   Teachers               may assign a session (normal or HOTS) to a student or a class.
 *
 * A chapter whose Critical Gap session was just completed isn't re-assigned for a cooldown,
 * so finishing a session that still leaves the chapter in the gap doesn't loop straight
 * back into another mandatory one.
 */

export const GAP_MIN = 35;
export const GAP_MAX = 50; // exclusive: 50 is Developing
export const HOTS_MIN = 90;
export const COOLDOWN_DAYS = 7;

export type AssignmentSource = 'critical_gap' | 'teacher';
export type AssignmentMode = 'standard' | 'hots';

export interface LatestScore { studentId: string; subject: string; topic: string; score: number; confidence?: string | null }
export interface OpenAssignment { id: string; studentId: string; subject: string; topic: string; source: AssignmentSource; mode: AssignmentMode }
export interface RecentGap { studentId: string; subject: string; topic: string; closedAt: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const assignmentKey = (studentId: string, subject: string, topic: string) => `${studentId}|${norm(subject)}|${norm(topic)}`;

export const inCriticalGap = (score: number, confidence?: string | null) =>
  score >= GAP_MIN && score < GAP_MAX && confidence !== 'insufficient';

/** The most recent snapshot per student, subject and topic. */
export function latestScores<T extends { student_id: string; subject: string; topic_name: string; score: number | string; computed_at: string; confidence_band?: string | null }>(rows: T[]): LatestScore[] {
  const by = new Map<string, T>();
  for (const r of rows) {
    const k = assignmentKey(r.student_id, r.subject, r.topic_name);
    const cur = by.get(k);
    if (!cur || r.computed_at > cur.computed_at) by.set(k, r);
  }
  return [...by.values()].map(r => ({ studentId: r.student_id, subject: r.subject, topic: r.topic_name, score: Number(r.score), confidence: r.confidence_band ?? null }));
}

/** Which Critical Gap sessions to assign, and which open ones the student has climbed out of. */
export function planCriticalGaps(latest: LatestScore[], open: OpenAssignment[], recent: RecentGap[], now = Date.now()): {
  create: LatestScore[];
  clear: { id: string; score: number }[];
} {
  const openStd = new Map(open.filter(o => o.mode === 'standard').map(o => [assignmentKey(o.studentId, o.subject, o.topic), o]));
  const cooling = new Set(recent
    .filter(r => now - new Date(r.closedAt).getTime() < COOLDOWN_DAYS * 86_400_000)
    .map(r => assignmentKey(r.studentId, r.subject, r.topic)));
  const create: LatestScore[] = [];
  const clear: { id: string; score: number }[] = [];
  for (const l of latest) {
    const k = assignmentKey(l.studentId, l.subject, l.topic);
    const o = openStd.get(k);
    if (o?.source === 'critical_gap' && l.score >= GAP_MAX) clear.push({ id: o.id, score: l.score });
    else if (!o && inCriticalGap(l.score, l.confidence) && !cooling.has(k)) create.push(l);
  }
  return { create, clear };
}

/** Whether a finished session closes an open assignment: same chapter, same mode, and not ended early. */
export function completes(a: Pick<OpenAssignment, 'subject' | 'topic' | 'mode'>, s: { subject: string; topic: string; mode: AssignmentMode; early: boolean }): boolean {
  return !s.early && a.mode === s.mode && norm(a.subject) === norm(s.subject) && norm(a.topic) === norm(s.topic);
}
