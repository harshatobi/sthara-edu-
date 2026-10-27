/**
 * Admissions pipeline: pure shaping from admission_stages, admission_seats, admission_offers,
 * admission_applicants and admission_events.
 *
 * Each school keeps its own stages (admission_stages). Offer and Enrolled are system stages: renamed but never
 * removed or moved, always last. An applicant reaches Offer only through an offer the principal approved (and a
 * free seat), and Enrolled only through Sthara's enrolment. The rules themselves live in the database functions
 * (admission_move, admission_offer_*); this file shapes what the screens show.
 *
 * The funnel counts everyone who *reached* a stage (furthest_stage), so a rejection at assessment still counts
 * as an application — conversion stays honest.
 */
import { daysBetween, isoDay } from './format';
import { ageRulesOf, type AgeRules } from './application';
import { assessmentOf, type AssessmentRules } from './merit';
import { feesOf, rteModeOf, type FeeRules, type RteMode } from './rteFees';

/** The template every school starts from; also the stage values the bulk-import format accepts. */
export const STAGES = ['enquiry', 'application', 'assessment', 'offer', 'enrolled'] as const;
export const CLOSED = ['rejected', 'withdrawn'] as const;
export type ApplicantStage = string;

export interface StageDef {
  key: string;
  label: string;
  position: number;
  system: 'offer' | 'enrolled' | null;
  active: boolean;
  /** Offer only: days a family has to accept. */
  respondDays: number | null;
  /** Checks an applicant must pass before leaving this stage ('documents', 'age'). */
  requires: string[];
  /** The WhatsApp message a family gets on reaching this stage, or null. */
  message: string | null;
  color: string;
}

const OWN_COLORS = ['#2F6BFF', '#4C8DFF', '#7C5CFC', '#0EA5E9', '#6366F1', '#8B5CF6', '#14B8A6', '#3B82F6'];
const OFFER_COLOR = '#F59E0B';
const ENROLLED_COLOR = '#10B981';

const DEFAULT_ROWS = [
  { key: 'enquiry', label: 'Enquiry', position: 1, system: null },
  { key: 'application', label: 'Application', position: 2, system: null },
  { key: 'assessment', label: 'Assessment', position: 3, system: null },
  { key: 'offer', label: 'Offer', position: 100, system: 'offer', respond_days: 14 },
  { key: 'enrolled', label: 'Enrolled', position: 101, system: 'enrolled' },
];

const sysRank = (s: StageDef['system']) => (s === 'offer' ? 1 : s === 'enrolled' ? 2 : 0);

/** A school's stages in pipeline order (its own by position, then Offer, then Enrolled); the template when it has none. */
export function shapeStages(rows: any[] | undefined): StageDef[] {
  const src = rows?.length ? rows : DEFAULT_ROWS;
  const list: StageDef[] = src.map(r => ({
    key: r.key, label: r.label, position: Number(r.position ?? 0), system: r.system ?? null, active: r.active !== false,
    respondDays: r.respond_days ?? null, requires: Array.isArray(r.requires) ? r.requires : [], message: r.message ?? null, color: '',
  })).sort((a, b) => sysRank(a.system) - sysRank(b.system) || a.position - b.position);
  // The template's system rows if a school's own list lacks them (never expected; keeps the pipeline whole).
  for (const sys of ['offer', 'enrolled'] as const) {
    if (!list.some(s => s.system === sys)) {
      const d = DEFAULT_ROWS.find(r => r.system === sys)!;
      list.push({ key: d.key, label: d.label, position: d.position, system: sys, active: true, respondDays: d.respond_days ?? null, requires: [], message: null, color: '' });
    }
  }
  let i = 0;
  for (const s of list) s.color = s.system === 'offer' ? OFFER_COLOR : s.system === 'enrolled' ? ENROLLED_COLOR : OWN_COLORS[i++ % OWN_COLORS.length];
  return list;
}

/** The stages shown in the funnel and filters: those in use. */
export const activeStages = (stages: StageDef[]) => stages.filter(s => s.active);
export const ownStages = (stages: StageDef[]) => stages.filter(s => !s.system && s.active);

/** Order of a stage in the pipeline (inactive ones keep their place); -1 for closed or unknown. */
export function rankOf(stages: StageDef[], key: string): number {
  return stages.findIndex(s => s.key === key);
}

const CLOSED_LABEL: Record<string, string> = { rejected: 'Rejected', withdrawn: 'Withdrawn' };

/** A stage's name for one applicant ("Assessment", "Rejected"). */
export function stageName(stages: StageDef[], key: string): string {
  return stages.find(s => s.key === key)?.label ?? CLOSED_LABEL[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export const isClosed = (key: string) => (CLOSED as readonly string[]).includes(key);
export const isSystem = (stages: StageDef[], key: string, sys: 'offer' | 'enrolled') => stages.find(s => s.key === key)?.system === sys;

/**
 * Where an applicant goes next: the next own stage in use, or 'offer' when they are at the last own stage (the
 * offer is proposed, then approved), or 'enrolled' from Offer (through Sthara). Null once closed or enrolled.
 */
export function nextStage(stages: StageDef[], key: string): string | null {
  if (isClosed(key)) return null;
  const at = stages.find(s => s.key === key);
  if (at?.system === 'enrolled') return null;
  if (at?.system === 'offer') return stages.find(s => s.system === 'enrolled')!.key;
  const pos = at ? at.position : -Infinity;
  const own = ownStages(stages).find(s => s.position > pos);
  return own ? own.key : stages.find(s => s.system === 'offer')!.key;
}

export const SOURCES: Record<string, string> = {
  walk_in: 'Walk-in', website: 'Website', qr: 'QR poster', referral: 'Referral', sibling: 'Sibling', event: 'School event',
  advertisement: 'Advertisement', other: 'Other',
};

// ── Offers ──────────────────────────────────────────────────────────────────
export type OfferStatus = 'proposed' | 'returned' | 'waitlisted' | 'issued' | 'accepted' | 'declined' | 'lapsed' | 'withdrawn' | 'enrolled';
export const LIVE_OFFER: OfferStatus[] = ['proposed', 'waitlisted', 'issued', 'accepted'];
export const OFFER_LABEL: Record<OfferStatus, string> = {
  proposed: 'Waiting for approval', returned: 'Sent back', waitlisted: 'On the waitlist', issued: 'Offer out',
  accepted: 'Accepted', declined: 'Declined', lapsed: 'Lapsed', withdrawn: 'Cancelled', enrolled: 'Enrolled',
};

export interface Offer {
  id: string;
  applicantId: string;
  grade: number;
  status: OfferStatus;
  live: boolean;
  proposedBy: string | null;
  proposedAt: string;
  proposalNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  waitlistedAt: string | null;
  issuedAt: string | null;
  respondBy: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  /** Days left to accept (issued offers with a date); negative once past. */
  daysLeft: number | null;
  /** 1 = next to get a seat (waitlisted offers). */
  waitPosition: number | null;
}

function shapeOffer(r: any, today: string): Offer {
  const status = r.status as OfferStatus;
  return {
    id: r.id, applicantId: r.applicant_id, grade: Number(r.grade), status, live: LIVE_OFFER.includes(status),
    proposedBy: r.proposed_by ?? null, proposedAt: r.proposed_at, proposalNote: r.proposal_note ?? null,
    decidedBy: r.decided_by ?? null, decidedAt: r.decided_at ?? null, decisionNote: r.decision_note ?? null,
    waitlistedAt: r.waitlisted_at ?? null, issuedAt: r.issued_at ?? null, respondBy: r.respond_by ?? null,
    respondedAt: r.responded_at ?? null, responseNote: r.response_note ?? null,
    daysLeft: status === 'issued' && r.respond_by ? daysBetween(today, r.respond_by) : null,
    waitPosition: null,
  };
}

// ── Applicants ──────────────────────────────────────────────────────────────
export interface AdmissionEvent { id: string; from: string | null; to: string; note: string | null; actorId: string | null; at: string; offer: OfferStatus | null }

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
  furthest: string;
  assessmentOn: string | null;
  notes: string | null;
  stageChangedAt: string;
  /** The student account made at enrolment, when there is one. */
  studentId: string | null;
  /** The counsellor who owns them, and when they are next to be followed up. */
  ownerId: string | null;
  followUpOn: string | null;
  /** The family asked for no WhatsApp messages about this application. */
  optOut: boolean;
  /** office | online | portal | import */
  channel: string;
  /** Applying for an RTE seat; their place in the school's RTE lottery; the assessment score. */
  rte: boolean;
  rteRank: number | null;
  rteAllotmentNo: string | null;
  rteAllottedOn: string | null;
  score: number | null;
  createdAt: string;
  /** Days in the current stage (open applicants only). */
  daysInStage: number;
  open: boolean;
  /** The offer in progress, else the latest one. */
  offer: Offer | null;
  offers: Offer[];
  events: AdmissionEvent[];
}

export interface FunnelStep { stage: string; label: string; color: string; reached: number; share: number | null; fromPrev: number | null; openNow: number }

export interface SeatLine {
  grade: number;
  /** Null: the school set no limit for this grade. */
  capacity: number | null;
  /** Of the seats, how many are reserved for RTE (null: none), and how many RTE applicants hold one. */
  rteSeats: number | null;
  rteHeld: number;
  /** Holding a seat: at Offer (out or accepted) or enrolled. */
  held: number;
  out: number;
  accepted: number;
  enrolled: number;
  waitlisted: number;
  proposed: number;
  left: number | null;
}

export interface Pipeline {
  session: string;
  stages: StageDef[];
  applicants: Applicant[];
  funnel: FunnelStep[];
  total: number;
  enrolled: number;
  closed: { rejected: number; withdrawn: number };
  /** enquiry → enrolled, among applicants whose outcome is known or enrolled. */
  conversion: number | null;
  /** The stage-to-stage step that loses the most (lowest fromPrev), once there's data. */
  leak: { from: string; to: string; fromLabel: string; toLabel: string; rate: number } | null;
  /** Open applicants idle longer than STALE_DAYS in their stage. */
  stale: Applicant[];
  byGrade: { grade: number; total: number; enrolled: number; open: number }[];
  bySource: { source: string; total: number; enrolled: number }[];
  seats: SeatLine[];
  /** Offers waiting for the principal (oldest first). */
  approvals: Applicant[];
  /** Offers out that lapse within EXPIRING_DAYS. */
  expiring: Applicant[];
  waitlisted: number;
  /** The age for each class on the cut-off date (the school's, else NEP's). */
  ageRules: AgeRules;
  /** The assessment's highest score, family booking and merit points. */
  assessment: AssessmentRules;
  fees: FeeRules;
  rteMode: RteMode;
}

export const STALE_DAYS = 14;
export const EXPIRING_DAYS = 3;

export function shapeApplicant(r: any, events: any[], offers: Offer[], stages: StageDef[], today = isoDay()): Applicant {
  const stage = r.stage as string;
  const open = !isClosed(stage) && !isSystem(stages, stage, 'enrolled');
  const sorted = [...offers].sort((a, b) => (a.proposedAt < b.proposedAt ? 1 : -1));
  return {
    id: r.id, name: r.name, grade: Number(r.grade), dob: r.date_of_birth ?? null,
    guardianName: r.guardian_name ?? null, guardianPhone: r.guardian_phone ?? null, guardianEmail: r.guardian_email ?? null,
    previousSchool: r.previous_school ?? null, source: r.source || 'other', stage,
    furthest: rankOf(stages, r.furthest_stage) >= 0 ? r.furthest_stage : stages[0].key,
    assessmentOn: r.assessment_on ?? null, notes: r.notes ?? null,
    stageChangedAt: r.stage_changed_at, createdAt: r.created_at, studentId: r.student_id ?? null,
    ownerId: r.owner_id ?? null, followUpOn: r.follow_up_on ?? null, optOut: r.whatsapp_opt_out === true, channel: r.channel ?? 'office',
    rte: r.rte === true, rteRank: r.rte_rank ?? null, rteAllotmentNo: r.rte_allotment_no ?? null, rteAllottedOn: r.rte_allotted_on ?? null, score: r.assessment_score == null ? null : Number(r.assessment_score),
    daysInStage: open ? Math.max(0, daysBetween(String(r.stage_changed_at).slice(0, 10), today)) : 0,
    open,
    offer: sorted.find(o => o.live) ?? sorted[0] ?? null,
    offers: sorted,
    events: events
      .map(e => ({ id: e.id, from: e.from_stage ?? null, to: e.to_stage, note: e.note ?? null, actorId: e.actor_id ?? null, at: e.at, offer: e.offer_status ?? null }))
      .sort((a, b) => (a.at < b.at ? -1 : 1)),
  };
}

export interface PipelineRows { stages?: any[]; seats?: any[]; offers?: any[]; settings?: unknown }

export function assemblePipeline(session: string, rows: any[], eventRows: any[], today = isoDay(), extra: PipelineRows = {}): Pipeline {
  const stages = shapeStages(extra.stages);
  const offerRows = (extra.offers || []).filter(o => o.session === session || o.session === undefined).map(o => shapeOffer(o, today));
  // Waitlist order per grade: longest waiting first (the order seats are given out in).
  const byGradeWait = new Map<number, Offer[]>();
  for (const o of offerRows.filter(x => x.status === 'waitlisted').sort((a, b) => String(a.waitlistedAt).localeCompare(String(b.waitlistedAt)))) {
    byGradeWait.set(o.grade, [...(byGradeWait.get(o.grade) || []), o]);
  }
  for (const list of byGradeWait.values()) list.forEach((o, i) => { o.waitPosition = i + 1; });

  const evBy = new Map<string, any[]>();
  for (const e of eventRows) evBy.set(e.applicant_id, [...(evBy.get(e.applicant_id) || []), e]);
  const offBy = new Map<string, Offer[]>();
  for (const o of offerRows) offBy.set(o.applicantId, [...(offBy.get(o.applicantId) || []), o]);
  const rank = (k: string) => rankOf(stages, k);
  const closedLast = (k: string) => (isClosed(k) ? -1 : rank(k));
  const applicants = rows.map(r => shapeApplicant(r, evBy.get(r.id) || [], offBy.get(r.id) || [], stages, today))
    .sort((a, b) => closedLast(b.stage) - closedLast(a.stage) || (a.stageChangedAt < b.stageChangedAt ? 1 : -1));

  const total = applicants.length;
  const shown = activeStages(stages);
  const funnel: FunnelStep[] = shown.map((s, i) => {
    const reached = applicants.filter(a => rank(a.furthest) >= rank(s.key)).length;
    const prev = i ? applicants.filter(a => rank(a.furthest) >= rank(shown[i - 1].key)).length : null;
    return {
      stage: s.key, label: s.label, color: s.color, reached, share: total ? Math.round((reached / total) * 100) : null,
      fromPrev: prev ? Math.round((reached / prev) * 100) : null,
      openNow: applicants.filter(a => a.stage === s.key).length,
    };
  });

  // A leak only means something once the later stage has had a chance to fill:
  // compare steps where the earlier stage has at least 3 applicants.
  let leak: Pipeline['leak'] = null;
  for (let i = 1; i < funnel.length; i++) {
    const before = funnel[i - 1].reached;
    if (before < 3 || funnel[i].fromPrev === null) continue;
    if (!leak || funnel[i].fromPrev! < leak.rate) {
      leak = { from: funnel[i - 1].stage, to: funnel[i].stage, fromLabel: funnel[i - 1].label, toLabel: funnel[i].label, rate: funnel[i].fromPrev! };
    }
  }

  const enrolledKey = stages.find(s => s.system === 'enrolled')!.key;
  const offerKey = stages.find(s => s.system === 'offer')!.key;
  const enrolled = applicants.filter(a => a.stage === enrolledKey).length;
  const decided = applicants.filter(a => !a.open).length;
  const grades = [...new Set(applicants.map(a => a.grade))].sort((a, b) => a - b);
  const sources = [...new Set(applicants.map(a => a.source))];

  const cap = new Map<number, number>();
  const rteCap = new Map<number, number>();
  for (const s of extra.seats || []) {
    if (s.session !== session && s.session !== undefined) continue;
    cap.set(Number(s.grade), Number(s.capacity));
    if (s.rte_seats != null) rteCap.set(Number(s.grade), Number(s.rte_seats));
  }
  const seatGrades = [...new Set([...cap.keys(), ...grades])].sort((a, b) => a - b);
  const seats: SeatLine[] = seatGrades.map(g => {
    const inGrade = applicants.filter(a => a.grade === g);
    const live = offerRows.filter(o => o.grade === g && o.live);
    const held = inGrade.filter(a => a.stage === offerKey || a.stage === enrolledKey).length;
    const capacity = cap.has(g) ? cap.get(g)! : null;
    return {
      grade: g, capacity, held,
      rteSeats: rteCap.has(g) ? rteCap.get(g)! : null,
      rteHeld: inGrade.filter(a => a.rte && (a.stage === offerKey || a.stage === enrolledKey)).length,
      out: live.filter(o => o.status === 'issued').length, accepted: live.filter(o => o.status === 'accepted').length,
      enrolled: inGrade.filter(a => a.stage === enrolledKey).length,
      waitlisted: live.filter(o => o.status === 'waitlisted').length, proposed: live.filter(o => o.status === 'proposed').length,
      left: capacity === null ? null : capacity - held,
    };
  });

  return {
    session, stages, applicants, funnel, total, enrolled,
    closed: { rejected: applicants.filter(a => a.stage === 'rejected').length, withdrawn: applicants.filter(a => a.stage === 'withdrawn').length },
    conversion: decided ? Math.round((enrolled / decided) * 100) : null,
    leak,
    stale: applicants.filter(a => a.open && a.daysInStage > STALE_DAYS && !(a.offer?.live && a.offer.status !== 'issued'))
      .sort((a, b) => b.daysInStage - a.daysInStage),
    byGrade: grades.map(g => {
      const list = applicants.filter(a => a.grade === g);
      return { grade: g, total: list.length, enrolled: list.filter(a => a.stage === enrolledKey).length, open: list.filter(a => a.open).length };
    }),
    bySource: sources.map(s => {
      const list = applicants.filter(a => a.source === s);
      return { source: s, total: list.length, enrolled: list.filter(a => a.stage === enrolledKey).length };
    }).sort((a, b) => b.total - a.total),
    seats,
    approvals: applicants.filter(a => a.offer?.status === 'proposed').sort((a, b) => (a.offer!.proposedAt < b.offer!.proposedAt ? -1 : 1)),
    expiring: applicants.filter(a => a.offer?.status === 'issued' && a.offer.daysLeft !== null && a.offer.daysLeft <= EXPIRING_DAYS)
      .sort((a, b) => a.offer!.daysLeft! - b.offer!.daysLeft!),
    waitlisted: offerRows.filter(o => o.status === 'waitlisted').length,
    ageRules: ageRulesOf(extra.settings),
    assessment: assessmentOf(extra.settings),
    fees: feesOf(extra.settings),
    rteMode: rteModeOf(extra.settings),
  };
}
