/**
 * The admin heatmap: each class's average score per subject, pooled over every approved submission.
 * Pure: /api/admin/heatmap-data loads the rows (paged past the 1,000-row cap) and sends only this summary,
 * so a school with tens of thousands of submissions doesn't ship them all to the browser.
 */

export interface HeatStudent { id: string; student_class: string | null; branch: string | null }
export interface HeatAssignment { id: string; subject: string | null }
export interface HeatSubmission {
  student_id: string; assignment_id: string;
  score: number | null; max_score: number | null; final_grade: string | null;
  /** ai_result->totalScore and ai_result->maxTotalScore, selected on their own. */
  ai_score: number | null; ai_max: number | null;
}
export interface ClassSummary { className: string; studentCount: number; subjectScores: Record<string, number | null>; overallAvg: number | null }
export interface Heatmap { subjects: string[]; classes: ClassSummary[] }

/** A submission's score and maximum, or null when it has none. "7/10" in final_grade wins over the numbers. */
export function scoreOf(s: HeatSubmission): { score: number; max: number } | null {
  let sc: number | null = s.score ?? s.ai_score;
  let mx: number = s.max_score ?? s.ai_max ?? 10;
  if (typeof s.final_grade === 'string' && s.final_grade.includes('/')) {
    const [a, b] = s.final_grade.split('/');
    sc = parseFloat(a);
    mx = parseFloat(b);
  }
  return sc !== null && sc !== undefined && !Number.isNaN(sc) && mx > 0 ? { score: sc, max: mx } : null;
}

export function buildHeatmap(students: HeatStudent[], assignments: HeatAssignment[], submissions: HeatSubmission[]): Heatmap {
  const subjectOf = new Map(assignments.map(a => [a.id, a.subject || 'General']));
  const subjects = new Set(assignments.map(a => a.subject).filter((s): s is string => !!s));
  const classOf = new Map(students.map(s => [s.id, s.student_class || s.branch || 'Unassigned']));

  const counts = new Map<string, number>();
  for (const cls of classOf.values()) counts.set(cls, (counts.get(cls) || 0) + 1);

  // class -> subject -> pooled score and maximum
  const pooled = new Map<string, Map<string, { score: number; max: number }>>();
  for (const sub of submissions) {
    const cls = classOf.get(sub.student_id);
    const sc = scoreOf(sub);
    if (!cls || !sc) continue;
    const subj = subjectOf.get(sub.assignment_id) || 'General';
    subjects.add(subj);
    const bySubj = pooled.get(cls) || new Map();
    const p = bySubj.get(subj) || { score: 0, max: 0 };
    p.score += sc.score;
    p.max += sc.max;
    bySubj.set(subj, p);
    pooled.set(cls, bySubj);
  }

  const list = [...subjects].sort();
  const classes = [...counts].map(([className, studentCount]) => {
    const subjectScores: Record<string, number | null> = {};
    const avgs: number[] = [];
    for (const subj of list) {
      const p = pooled.get(className)?.get(subj);
      const avg = p && p.max > 0 ? Math.round((p.score / p.max) * 100) : null;
      subjectScores[subj] = avg;
      if (avg !== null) avgs.push(avg);
    }
    const overallAvg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
    return { className, studentCount, subjectScores, overallAvg };
  });
  return { subjects: list, classes };
}
