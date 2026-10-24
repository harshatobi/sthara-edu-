import { OUTCOMES, type Outcome } from './register';

/**
 * The year-end chain on one enrolment row: the class teacher proposes an outcome, the principal approves it (or
 * returns it with a note), the registrar finalises it, the class is promoted into next session, and once the new
 * classes are set the result is published to the student and parent portals. Pure: the server loads the rows,
 * asks these functions what may happen, and writes.
 */

export interface ChainRow {
  proposed_outcome: Outcome | null; proposed_at: string | null; approved_at: string | null; returned_note: string | null;
  outcome: Outcome | null; finalised_at: string | null; published_at: string | null; ends_on: string | null;
}
export type Stage = 'open' | 'proposed' | 'returned' | 'approved' | 'final' | 'promoted' | 'published';
export const STAGE_LABEL: Record<Stage, string> = {
  open: 'Waiting for the class teacher', proposed: 'Waiting for the principal', returned: 'Returned to the class teacher',
  approved: 'Waiting for the registrar', final: 'Final, not yet promoted', promoted: 'Promoted, not yet published', published: 'Published',
};

export function stageOf(r: ChainRow): Stage {
  if (r.published_at) return 'published';
  if (r.finalised_at && r.ends_on) return 'promoted';
  if (r.finalised_at) return 'final';
  if (r.approved_at) return 'approved';
  if (r.returned_note && r.proposed_at) return 'returned';
  if (r.proposed_at) return 'proposed';
  return 'open';
}

export type Step = 'propose' | 'approve' | 'return' | 'finalise' | 'reopen';
/** Why a step can't be taken on this row, or null when it can. */
export function blocked(step: Step, r: ChainRow): string | null {
  const s = stageOf(r);
  switch (step) {
    case 'propose': return ['open', 'proposed', 'returned'].includes(s) ? null : 'The principal has already approved this outcome.';
    case 'approve': return s === 'proposed' ? null : s === 'open' || s === 'returned' ? 'The class teacher hasn’t proposed an outcome.' : 'Already approved.';
    case 'return': return s === 'proposed' || s === 'approved' ? null : 'There is nothing to return.';
    case 'finalise': return s === 'approved' || s === 'final' ? null : s === 'promoted' || s === 'published' ? 'This student has already been promoted.' : 'The principal hasn’t approved this outcome yet.';
    case 'reopen': return s === 'final' || s === 'approved' ? null : 'Only an approved or final outcome that hasn’t been promoted can be reopened.';
  }
}

export const isOutcome = (v: unknown): v is Outcome => typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);

/** The class a promoted class moves into: "Class 9-B" -> "Class 10-B"; null past Class 12. */
export function nextClassName(cls: string): string | null {
  const m = cls.match(/^(.*?)(\d{1,2})(.*)$/);
  if (!m) return null;
  const g = Number(m[2]);
  return g >= 12 ? null : `${m[1]}${g + 1}${m[3]}`;
}

/** Counts by stage for a class, and whether the class can move to its next step as a whole. */
export function classProgress(rows: ChainRow[]) {
  const by: Record<Stage, number> = { open: 0, proposed: 0, returned: 0, approved: 0, final: 0, promoted: 0, published: 0 };
  for (const r of rows) by[stageOf(r)]++;
  const n = rows.length;
  return {
    by, total: n,
    allProposed: n > 0 && by.open === 0 && by.returned === 0,
    allApproved: n > 0 && by.open + by.proposed + by.returned === 0,
    allFinal: n > 0 && by.final + by.promoted + by.published === n,
    allPromoted: n > 0 && by.promoted + by.published === n,
  };
}
