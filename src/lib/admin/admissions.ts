/**
 * Admissions pipeline: pure shaping from admission_applicants + admission_events.
 * The funnel counts everyone who *reached* a stage (furthest_stage), so a
 * rejection at assessment still counts as an application — conversion stays honest.
 */
import { daysBetween, isoDay } from './format';

export const STAGES = ['enquiry', 'application', 'assessment', 'offer', 'enrolled'] as const;
export type Stage = typeof STAGES[number];
export type ApplicantStage = Stage | 'rejected' | 'withdrawn';

export const STAGE_LABEL: Record<ApplicantStage, string> = {
  enquiry: 'Enquiries', application: 'Applications', assessment: 'Assessments booked', offer: 'Offers made',
  enrolled: 'Enrolled', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
export const STAGE_ONE: Record<ApplicantStage, string> = {
  enquiry: 'Enquiry', application: 'Application', assessment: 'Assessment', offer: 'Offer',
  enrolled: 'Enrolled', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
export const STAGE_COLOR: Record<Stage, string> = {
  enquiry: '#2F6BFF', application: '#4C8DFF', assessment: '#7C5CFC', offer: '#F59E0B', enrolled: '#10B981',
};
export const SOURCES: Record<string, string> = {
  walk_in: 'Walk-in', website: 'Website', referral: 'Referral', sibling: 'Sibling', event: 'School event',
  advertisement: 'Advertisement', other: 'Other',
};

export interface AdmissionEvent { id: string; from: string | null; to: string; note: string | null; actorId: string | null; at: string }

export interface Applicant {
  id: string;
  name: string;
  grade: number;
  dob: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  previousSchool: string | null;
  source: string;
  stage: ApplicantStage;
  furthest: Stage;
  assessmentOn: string | null;
  notes: string | null;
  stageChangedAt: string;
  createdAt: string;
  /** Days in the current stage (open applicants only). */
  daysInStage: number;
  open: boolean;
  events: AdmissionEvent[];
}

export interface FunnelStep { stage: Stage; reached: number; share: number | null; fromPrev: number | null; openNow: number }

export interface Pipeline {
  session: string;
  applicants: Applicant[];
  funnel: FunnelStep[];
  total: number;
  enrolled: number;
  closed: { rejected: number; withdrawn: number };
  /** enquiry → enrolled, among applicants whose outcome is known or enrolled. */
  conversion: number | null;
  /** The stage-to-stage step that loses the most (lowest fromPrev), once there's data. */
  leak: { from: Stage; to: Stage; rate: number } | null;
  /** Open applicants idle longer than STALE_DAYS in their stage. */
  stale: Applicant[];
  byGrade: { grade: number; total: number; enrolled: number; open: number }[];
  bySource: { source: string; total: number; enrolled: number }[];
}

export const STALE_DAYS = 14;
const rank = (s: string) => STAGES.indexOf(s as Stage);

/** The next forward stage, or null at the end / once closed. */
export function nextStage(s: ApplicantStage): Stage | null {
  const i = rank(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

/** Whether moving an applicant from → to is a valid pipeline step. */
export function canMove(from: ApplicantStage, to: ApplicantStage): boolean {
  if (from === to) return false;
  if (from === 'enrolled') return to === 'withdrawn';
  // Reopening a closed applicant puts them back into an open stage (the API uses the furthest one reached).
  if (from === 'rejected' || from === 'withdrawn') return rank(to) >= 0 && to !== 'enrolled';
  if (to === 'rejected' || to === 'withdrawn') return true;
  return rank(to) === rank(from) + 1;
}

export function shapeApplicant(r: any, events: any[], today = isoDay()): Applicant {
  const stage = r.stage as ApplicantStage;
  const open = rank(stage) >= 0 && stage !== 'enrolled';
  return {
    id: r.id, name: r.name, grade: Number(r.grade), dob: r.date_of_birth ?? null,
    guardianName: r.guardian_name ?? null, guardianPhone: r.guardian_phone ?? null, guardianEmail: r.guardian_email ?? null,
    previousSchool: r.previous_school ?? null, source: r.source || 'other', stage,
    furthest: (rank(r.furthest_stage) >= 0 ? r.furthest_stage : 'enquiry') as Stage,
    assessmentOn: r.assessment_on ?? null, notes: r.notes ?? null,
    stageChangedAt: r.stage_changed_at, createdAt: r.created_at,
    daysInStage: open ? Math.max(0, daysBetween(String(r.stage_changed_at).slice(0, 10), today)) : 0,
    open,
    events: events
      .map(e => ({ id: e.id, from: e.from_stage ?? null, to: e.to_stage, note: e.note ?? null, actorId: e.actor_id ?? null, at: e.at }))
      .sort((a, b) => (a.at < b.at ? -1 : 1)),
  };
}

export function assemblePipeline(session: string, rows: any[], eventRows: any[], today = isoDay()): Pipeline {
  const evBy = new Map<string, any[]>();
  for (const e of eventRows) evBy.set(e.applicant_id, [...(evBy.get(e.applicant_id) || []), e]);
  const applicants = rows.map(r => shapeApplicant(r, evBy.get(r.id) || [], today))
    .sort((a, b) => rank(b.stage) - rank(a.stage) || (a.stageChangedAt < b.stageChangedAt ? 1 : -1));

  const total = applicants.length;
  const funnel: FunnelStep[] = STAGES.map((stage, i) => {
    const reached = applicants.filter(a => rank(a.furthest) >= i).length;
    const prev = i ? applicants.filter(a => rank(a.furthest) >= i - 1).length : null;
    return {
      stage, reached, share: total ? Math.round((reached / total) * 100) : null,
      fromPrev: prev ? Math.round((reached / prev) * 100) : null,
      openNow: applicants.filter(a => a.stage === stage).length,
    };
  });

  // A leak only means something once the later stage has had a chance to fill:
  // compare steps where the earlier stage has at least 3 applicants.
  let leak: Pipeline['leak'] = null;
  for (let i = 1; i < STAGES.length; i++) {
    const before = funnel[i - 1].reached;
    if (before < 3 || funnel[i].fromPrev === null) continue;
    if (!leak || funnel[i].fromPrev! < leak.rate) leak = { from: STAGES[i - 1], to: STAGES[i], rate: funnel[i].fromPrev! };
  }

  const enrolled = applicants.filter(a => a.stage === 'enrolled').length;
  const decided = applicants.filter(a => !a.open).length;
  const grades = [...new Set(applicants.map(a => a.grade))].sort((a, b) => a - b);
  const sources = [...new Set(applicants.map(a => a.source))];

  return {
    session, applicants, funnel, total, enrolled,
    closed: { rejected: applicants.filter(a => a.stage === 'rejected').length, withdrawn: applicants.filter(a => a.stage === 'withdrawn').length },
    conversion: decided ? Math.round((enrolled / decided) * 100) : null,
    leak,
    stale: applicants.filter(a => a.open && a.daysInStage > STALE_DAYS).sort((a, b) => b.daysInStage - a.daysInStage),
    byGrade: grades.map(g => {
      const list = applicants.filter(a => a.grade === g);
      return { grade: g, total: list.length, enrolled: list.filter(a => a.stage === 'enrolled').length, open: list.filter(a => a.open).length };
    }),
    bySource: sources.map(s => {
      const list = applicants.filter(a => a.source === s);
      return { source: s, total: list.length, enrolled: list.filter(a => a.stage === 'enrolled').length };
    }).sort((a, b) => b.total - a.total),
  };
}
