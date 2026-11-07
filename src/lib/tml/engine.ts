/**
 * True Mastery Level (TML) Engine
 *
 * Implements the authoritative spec in `True_Mastery_Level_TML_Specification.pdf`
 * (downloaded 2026-09-21), reconciled with the confidential TML weightage doc's
 * engagement dimensions per product decision the same day (see project memory
 * "sthara-tml-specification" / "sthara-business-context" for the full trail —
 * this file is the single source of truth going forward, superseding both).
 *
 * ── Academic composite (per student `s`, per micro-topic `t`) ───────────────
 *   TML_academic(s,t) = 0.40*H(s,t) + 0.40*Q(s,t) + 0.20*D(s,t)
 *   H = homework & classwork score, Q = quiz/assessment/retention score,
 *   D = AI Socratic Tutor depth score (independence of the student's tutor use).
 *   All three are time-decayed with a 14-day half-life before averaging
 *   (spec 2.2): weight = e^(-ln2/14 * ageDays). Weights renormalize over
 *   whichever components actually have evidence for that topic.
 *
 * ── Confidence (spec 2.3) ────────────────────────────────────────────────────
 *   C = min(1.0, N_data / 5) -> <0.4 insufficient, 0.4-<1.0 provisional (±8%),
 *   1.0 firm. A tab-switch/focus-loss integrity violation on a proctored
 *   assessment (see `proctor_alerts`) applies a 15% confidence penalty
 *   (C *= 0.85, spec section 4) — this can demote a topic from firm to
 *   provisional even with plenty of evidence.
 *
 * ── Final blend (2026-09-21 product decision — engagement stays IN TML) ─────
 *   The PDF spec is a 3-component formula with no attendance/engagement terms.
 *   The confidential weightage doc's split (50% tests / 20% hw+quiz / 10%
 *   teacher-engagement / 10% attendance / 5% app-engagement / 5% tutor
 *   exchanges) puts 70% weight on academic evidence and 30% on engagement
 *   signals. Reconciled as:
 *     TML_final(s,t) = 0.70*TML_academic(s,t) + 0.10*TeacherEngagement
 *                     + 0.10*Attendance + 0.05*AppEngagement + 0.05*TutorVolume
 *   TeacherEngagement/Attendance/AppEngagement come from `engagement_scores`
 *   (student-level, so they're the same across a student's topics — only the
 *   academic term varies per topic). TutorVolume is a NEW measure of *how much*
 *   a student uses the tutor (session count), deliberately distinct from D
 *   above (which measures *how independently* they used it when they did) —
 *   the two are complementary, not duplicative, so both confidential-doc
 *   tutor mentions ("tutor exchanges" 5%, folded into D's 20% share of the
 *   academic term) are honored without double-counting.
 */

import { all } from '../admin/loadRows';
import { bandColor } from './bands';

// ---------------------------------------------------------------------------
// Time-decay (spec 2.2): 14-day half-life, applied to every evidence source.
// ---------------------------------------------------------------------------
export const HALF_LIFE_DAYS = 14;
const LAMBDA = Math.log(2) / HALF_LIFE_DAYS;

export function getRecencyWeight(ageDays: number): number {
  return Math.pow(Math.E, -LAMBDA * Math.max(0, ageDays));
}

// ---------------------------------------------------------------------------
// Component classification
// ---------------------------------------------------------------------------
export type TmlComponentType = 'homework' | 'quiz' | 'tutor';

// Homework & classwork share a component (per the spec's own "Homework & Classwork
// Score" naming). Quiz absorbs assessments/tests/midterms/retention re-checks —
// the spec has no separate "test" bucket, and these are all timed/proctored
// evaluations in the same spirit as "Timed Proctored Quiz Accuracy".
export function normalizeComponentType(type?: string): TmlComponentType {
  const t = (type || '').toLowerCase();
  if (t.includes('tutor')) return 'tutor';
  if (t.includes('quiz') || t.includes('assessment') || t.includes('test') ||
      t.includes('midterm') || t.includes('exam') || t.includes('retention')) return 'quiz';
  return 'homework'; // homework, classwork, or unspecified
}

// ---------------------------------------------------------------------------
// Tutor depth (D component) — inverse of hints needed, per 2026-09-21 decision.
// Mirrors the "assistance" idea from the pre-spec engine, but as an absolute
// 0-100 depth score (not a multiplier) since D is now a scored component.
// ---------------------------------------------------------------------------
export function getTutorDepthScore(hintsUsed: number = 0, answerRevealed: boolean = false): number {
  if (answerRevealed) return 10;
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 60;
  return 30; // multiple hints
}

/**
 * A finished session's D: the Socratic rubric (30% independence, 30% reasoning,
 * 30% transfer, 10% teach-back) since 2026-11-06; older sessions keep their
 * hints-only score.
 */
export function sessionDepth(row: { depth_score?: number | string | null; hint_depth?: number | null; answer_revealed?: boolean | null }): number {
  const d = row.depth_score == null ? NaN : Number(row.depth_score);
  return Number.isFinite(d) ? Math.min(100, Math.max(0, d)) : getTutorDepthScore(row.hint_depth || 0, !!row.answer_revealed);
}

// ---------------------------------------------------------------------------
// Decay-weighted average over a bucket of same-component evidence.
// ---------------------------------------------------------------------------
interface DecayedAverage {
  score: number | null; // 0-100, or null if no evidence
  itemCount: number;
}

function decayWeightedAverage(items: { score: number; ageDays: number }[]): DecayedAverage {
  if (items.length === 0) return { score: null, itemCount: 0 };
  let num = 0;
  let den = 0;
  for (const item of items) {
    if (!Number.isFinite(item.score) || !Number.isFinite(item.ageDays)) continue;
    const w = getRecencyWeight(item.ageDays);
    num += item.score * w;
    den += w;
  }
  return { score: den > 0 ? num / den : null, itemCount: items.length };
}

// ---------------------------------------------------------------------------
// Per-topic evidence -> academic TML + confidence
// ---------------------------------------------------------------------------
export interface TmlEvidenceItem {
  score: number;
  maxScore?: number; // defaults to 100 (i.e. `score` already a percentage)
  componentType: string;
  ageDays: number;
}

export interface TopicTmlComponents {
  homework: DecayedAverage;
  quiz: DecayedAverage;
  tutor: DecayedAverage;
}

export interface TopicTmlResult {
  academicTml: number | null;
  confidence: number; // 0-1, after any integrity penalty
  confidenceBand: 'insufficient' | 'provisional' | 'firm';
  totalItemCount: number;
  integrityPenaltyApplied: boolean;
  components: TopicTmlComponents;
}

const ACADEMIC_WEIGHTS: Record<TmlComponentType, number> = { homework: 0.40, quiz: 0.40, tutor: 0.20 };

export function calculateTopicTml(
  items: TmlEvidenceItem[],
  opts: { hadIntegrityViolation?: boolean } = {}
): TopicTmlResult {
  const buckets: Record<TmlComponentType, { score: number; ageDays: number }[]> = {
    homework: [], quiz: [], tutor: [],
  };

  items.forEach(item => {
    const key = normalizeComponentType(item.componentType);
    const max = item.maxScore ?? 100;
    const pct = max > 0 ? Math.min(100, Math.max(0, (item.score / max) * 100)) : 0;
    buckets[key].push({ score: pct, ageDays: item.ageDays });
  });

  const homework = decayWeightedAverage(buckets.homework);
  const quiz = decayWeightedAverage(buckets.quiz);
  const tutor = decayWeightedAverage(buckets.tutor);
  const totalItemCount = homework.itemCount + quiz.itemCount + tutor.itemCount;

  // Renormalize the 0.40/0.40/0.20 academic weights over whichever components
  // actually have evidence, so a topic with no tutor sessions yet isn't
  // penalized for a component that simply hasn't happened.
  let weightSum = 0;
  let weightedSum = 0;
  (Object.keys(buckets) as TmlComponentType[]).forEach(key => {
    const avg = key === 'homework' ? homework : key === 'quiz' ? quiz : tutor;
    if (avg.score !== null) {
      weightSum += ACADEMIC_WEIGHTS[key];
      weightedSum += avg.score * ACADEMIC_WEIGHTS[key];
    }
  });
  const academicTml = weightSum > 0 ? weightedSum / weightSum : null;

  // Confidence (spec 2.3) + integrity penalty (spec section 4).
  let confidence = Math.min(1.0, totalItemCount / 5);
  const integrityPenaltyApplied = !!opts.hadIntegrityViolation && totalItemCount > 0;
  if (integrityPenaltyApplied) confidence *= 0.85;

  const confidenceBand: TopicTmlResult['confidenceBand'] =
    totalItemCount === 0 || confidence < 0.4 ? 'insufficient' : confidence < 1.0 ? 'provisional' : 'firm';

  return {
    academicTml: academicTml !== null ? Math.round(academicTml * 10) / 10 : null,
    confidence: Math.round(confidence * 1000) / 1000,
    confidenceBand,
    totalItemCount,
    integrityPenaltyApplied,
    components: { homework, quiz, tutor },
  };
}

// ---------------------------------------------------------------------------
// Final blend: academic composite + student-level engagement signals.
// ---------------------------------------------------------------------------
export interface EngagementInputs {
  teacherEngagement?: number; // 0-100; every field defaults to neutral 100 when unmeasured
  attendance?: number;
  appEngagement?: number;
  tutorVolume?: number;
}

const OUTER_WEIGHTS = { academic: 0.70, teacherEngagement: 0.10, attendance: 0.10, appEngagement: 0.05, tutorVolume: 0.05 };

export function blendFinalTml(academicTml: number | null, engagement: EngagementInputs = {}): number | null {
  if (academicTml === null) return null;
  const teacherEngagement = engagement.teacherEngagement ?? 100;
  const attendance = engagement.attendance ?? 100;
  const appEngagement = engagement.appEngagement ?? 100;
  const tutorVolume = engagement.tutorVolume ?? 100;

  const blended =
    OUTER_WEIGHTS.academic * academicTml +
    OUTER_WEIGHTS.teacherEngagement * teacherEngagement +
    OUTER_WEIGHTS.attendance * attendance +
    OUTER_WEIGHTS.appEngagement * appEngagement +
    OUTER_WEIGHTS.tutorVolume * tutorVolume;

  return Math.round(Math.min(100, Math.max(0, blended)) * 10) / 10;
}

// Normalizes a raw tutor-session count (lookback window) to 0-100.
// First-pass calibration: 10+ sessions in the window = full marks. Revisit
// once real usage data exists to tune the ceiling.
export function normalizeTutorVolume(sessionCount: number, ceiling: number = 10): number {
  return Math.min(100, Math.round((sessionCount / ceiling) * 100));
}

// ---------------------------------------------------------------------------
// Mastery bands & pedagogical triggers (spec section 3). Colours come from
// lib/tml/bands, the single source for band colours and labels.
// ---------------------------------------------------------------------------
export type MasteryBand = 'Exemplary' | 'Proficient' | 'Developing' | 'Critical Gap' | 'Severe Need';

export function mapMasteryBand(tml: number | null): { band: MasteryBand; color: string; action: string } | null {
  if (tml === null) return null;
  if (tml >= 90) return { band: 'Exemplary', color: bandColor(tml), action: 'Auto-unlocks advanced Olympiad / HOTS Socratic extension modules.' };
  if (tml >= 75) return { band: 'Proficient', color: bandColor(tml), action: 'CBSE Distinction benchmark. Standard maintenance review schedule.' };
  if (tml >= 50) return { band: 'Developing', color: bandColor(tml), action: 'Flags specific micro-topic gaps; generates focused practice drills.' };
  if (tml >= 35) return { band: 'Critical Gap', color: bandColor(tml), action: 'Triggers mandatory 3-step AI Socratic Tutor session; alerts teacher.' };
  return { band: 'Severe Need', color: bandColor(tml), action: 'Immediate Remediation Plan assigned; logged in Parent WhatsApp.' };
}

// ---------------------------------------------------------------------------
// Which topic bucket an assignment's evidence lands in: its first real unit,
// else its title. Exported so views that group evidence by topic (the student
// Mastery Tracker) bucket exactly the way the engine scored it.
// ---------------------------------------------------------------------------
export function evidenceTopicName(assign: { units?: unknown; title?: string | null } | null | undefined): string {
  const rawUnits: string[] = Array.isArray(assign?.units)
    ? (assign!.units as unknown[]).filter((u): u is string => typeof u === 'string' && !!u && u.toLowerCase() !== 'general')
    : [];
  return rawUnits.length > 0 ? rawUnits[0] : (assign?.title?.trim() || 'Core Concepts');
}

// ---------------------------------------------------------------------------
// Evidence as plain data, scored "as of" any moment. computeStudentTml scores
// as of now; the history backfill scores as of the end of past weeks; the
// Mastery Tracker drill-down explains and simulates with the same functions.
// Browser-safe (no server imports).
// ---------------------------------------------------------------------------
export interface EvidenceRef {
  /** 'item' = a confirmed per-question mark, 'submission' = a whole-paper mark, 'tutor' = a finished session. */
  source: 'item' | 'submission' | 'tutor';
  id: string;
  /** Assignment title, or the tutor session's topic. */
  title: string;
  /** Assignment type as set by the teacher (homework, classwork, quiz, test...), or 'tutor'. */
  kind: string;
  questionIndex?: number | null;
}

export interface Evidence {
  subject: string;
  topicName: string;
  componentType: string;
  score: number;
  maxScore: number;
  atMs: number;
  assignmentId?: string;
  ref: EvidenceRef;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** The engine's topic grouping key: subject + topic, case- and spacing-insensitive. */
export function topicKey(topicName: string): string {
  return topicName.trim().replace(/\s+/g, ' ').toLowerCase();
}
export function groupKey(subject: string, topicName: string): string {
  return `${subject.trim().toLowerCase()}::${topicKey(topicName)}`;
}

const msOf = (iso: unknown): number | null => {
  if (!iso) return null;
  const t = new Date(iso as string).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Turns the engine's three evidence reads into plain Evidence. Rows without a usable date or maximum are skipped
 * (never aged wrongly); a whole-paper mark is skipped when its submission already has per-question marks.
 */
export function collectEvidence(itemsData: any[], subsData: any[], tutorData: any[]): Evidence[] {
  const out: Evidence[] = [];
  const covered = new Set<string>(itemsData.map(r => r.submission_id).filter(Boolean));
  for (const row of itemsData) {
    const atMs = msOf(row.created_at);
    const maxScore = Number(row.max_score);
    if (atMs === null || !(maxScore > 0)) continue;
    const assign = row.assignments || {};
    out.push({
      subject: assign.subject || 'General', topicName: evidenceTopicName(assign),
      componentType: row.component_type || assign.type, score: Number(row.score) || 0, maxScore, atMs, assignmentId: assign.id,
      ref: { source: 'item', id: row.id, title: assign.title || 'Assignment', kind: assign.type || 'homework', questionIndex: row.question_index ?? null },
    });
  }
  for (const row of subsData) {
    if (covered.has(row.id)) continue;
    const atMs = msOf(row.submitted_at);
    const maxScore = Number(row.max_score);
    if (atMs === null || !(maxScore > 0)) continue;
    const assign = row.assignments || {};
    out.push({
      subject: assign.subject || 'General', topicName: evidenceTopicName(assign),
      componentType: assign.type, score: Number(row.score) || 0, maxScore, atMs, assignmentId: assign.id,
      ref: { source: 'submission', id: row.id, title: assign.title || 'Assignment', kind: assign.type || 'homework' },
    });
  }
  for (const row of tutorData) {
    const atMs = msOf(row.created_at);
    if (atMs === null) continue;
    const topic = row.topic?.trim() || 'Core Concepts';
    out.push({
      subject: row.subject || 'General', topicName: topic, componentType: 'tutor', score: sessionDepth(row), maxScore: 100, atMs,
      ref: { source: 'tutor', id: row.id, title: topic, kind: 'tutor' },
    });
  }
  return out;
}

/** Student-level engagement inputs as of a moment: tutor volume counts finished sessions in the 30 days before it. */
export function engagementAt(base: Omit<EngagementInputs, 'tutorVolume'>, evidence: Evidence[], nowMs: number): EngagementInputs {
  const sessions = evidence.filter(e => e.ref.source === 'tutor' && e.atMs <= nowMs && (nowMs - e.atMs) / DAY_MS <= 30).length;
  // No sessions means unmeasured, neutral like the other engagement terms.
  return { ...base, tutorVolume: sessions > 0 ? normalizeTutorVolume(sessions) : undefined };
}

export interface ScoredTopic {
  key: string;
  subject: string;
  topicName: string;
  evidence: Evidence[];
  calc: TopicTmlResult;
  finalTml: number | null;
  band: ReturnType<typeof mapMasteryBand>;
  hadIntegrityViolation: boolean;
}

/**
 * Scores every topic from the evidence known at `nowMs` (later evidence is ignored, ages are measured from `nowMs`).
 * `flagged` holds assignment ids with an integrity violation.
 */
export function scoreTopics(evidence: Evidence[], opts: { nowMs: number; engagement: EngagementInputs; flagged?: Set<string>; subject?: string }): ScoredTopic[] {
  const groups = new Map<string, { subject: string; topicName: string; evidence: Evidence[] }>();
  for (const e of evidence) {
    if (e.atMs > opts.nowMs) continue;
    if (opts.subject && e.subject.toLowerCase() !== opts.subject.toLowerCase()) continue;
    const key = groupKey(e.subject, e.topicName);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { subject: e.subject, topicName: e.topicName.trim(), evidence: [] }));
    g.evidence.push(e);
  }
  const flagged = opts.flagged ?? new Set<string>();
  return [...groups.entries()].map(([key, g]) => {
    const hadIntegrityViolation = g.evidence.some(e => e.assignmentId && flagged.has(e.assignmentId));
    const calc = calculateTopicTml(g.evidence.map(e => toItem(e, opts.nowMs)), { hadIntegrityViolation });
    const finalTml = blendFinalTml(calc.academicTml, opts.engagement);
    return { key, subject: g.subject, topicName: g.topicName, evidence: g.evidence, calc, finalTml, band: mapMasteryBand(finalTml), hadIntegrityViolation };
  });
}

const toItem = (e: Evidence, nowMs: number): TmlEvidenceItem =>
  ({ score: e.score, maxScore: e.maxScore, componentType: e.componentType, ageDays: Math.max(0, (nowMs - e.atMs) / DAY_MS) });

// ---------------------------------------------------------------------------
// Explanation (the drill-down's score waterfall). TML is linear in every
// input, so the final score splits exactly into points per evidence item plus
// points per engagement term:
//   item points = 0.70 × (component weight / weights present) × (decay weight / component's decay weights) × item %
//   engagement points = its outer weight × its value (unmeasured = neutral 100)
// The parts sum to the unrounded, unclamped final TML.
// ---------------------------------------------------------------------------
export interface ExplainedItem {
  ref: EvidenceRef;
  component: TmlComponentType;
  atMs: number;
  ageDays: number;
  pct: number;
  /** e^(-λ·age): 1 today, 0.5 after 14 days. */
  decay: number;
  /** Share of its component this item carries after decay (0-1). */
  shareOfComponent: number;
  /** Points this item adds to the final TML. */
  points: number;
}

export interface TopicExplanation {
  items: ExplainedItem[];
  /** Effective weight of each component inside the academic score after renormalising over the ones present (0-1). */
  componentWeights: Record<TmlComponentType, number>;
  componentScores: Record<TmlComponentType, number | null>;
  academic: number | null;
  engagement: { key: keyof EngagementInputs; label: string; weight: number; value: number; measured: boolean; points: number }[];
  /** Unrounded sum of all points; equals finalTml before rounding. */
  total: number | null;
  finalTml: number | null;
  confidence: number;
  confidenceBand: TopicTmlResult['confidenceBand'];
  integrityPenaltyApplied: boolean;
  /** ± margin shown while provisional (spec 2.3). */
  margin: number | null;
}

const ENGAGEMENT_TERMS: { key: keyof EngagementInputs; label: string }[] = [
  { key: 'teacherEngagement', label: 'Class engagement' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'appEngagement', label: 'App use' },
  { key: 'tutorVolume', label: 'AI Tutor practice' },
];

export function explainTopic(evidence: Evidence[], opts: { nowMs: number; engagement: EngagementInputs; hadIntegrityViolation?: boolean }): TopicExplanation {
  const known = evidence.filter(e => e.atMs <= opts.nowMs);
  const calc = calculateTopicTml(known.map(e => toItem(e, opts.nowMs)), { hadIntegrityViolation: opts.hadIntegrityViolation });
  const comps: TmlComponentType[] = ['homework', 'quiz', 'tutor'];
  const present = comps.filter(c => calc.components[c].score !== null);
  const wSum = present.reduce((a, c) => a + ACADEMIC_WEIGHTS[c], 0);
  const componentWeights = Object.fromEntries(comps.map(c => [c, present.includes(c) && wSum > 0 ? ACADEMIC_WEIGHTS[c] / wSum : 0])) as Record<TmlComponentType, number>;
  const raw = known.map(e => {
    const component = normalizeComponentType(e.componentType);
    const ageDays = Math.max(0, (opts.nowMs - e.atMs) / DAY_MS);
    const pct = e.maxScore > 0 ? Math.min(100, Math.max(0, (e.score / e.maxScore) * 100)) : 0;
    return { e, component, ageDays, pct, decay: getRecencyWeight(ageDays) };
  });
  const decaySum = Object.fromEntries(comps.map(c => [c, raw.filter(r => r.component === c).reduce((a, r) => a + r.decay, 0)])) as Record<TmlComponentType, number>;
  const items: ExplainedItem[] = raw.map(r => {
    const share = decaySum[r.component] > 0 ? r.decay / decaySum[r.component] : 0;
    return {
      ref: r.e.ref, component: r.component, atMs: r.e.atMs, ageDays: r.ageDays, pct: r.pct, decay: r.decay,
      shareOfComponent: share, points: OUTER_WEIGHTS.academic * componentWeights[r.component] * share * r.pct,
    };
  }).sort((a, b) => b.atMs - a.atMs);
  const engagement = ENGAGEMENT_TERMS.map(t => {
    const v = opts.engagement[t.key];
    const value = v ?? 100;
    const weight = OUTER_WEIGHTS[t.key];
    return { key: t.key, label: t.label, weight, value, measured: v !== undefined, points: weight * value };
  });
  const academicUnrounded = items.reduce((a, i) => a + i.points, 0) / OUTER_WEIGHTS.academic;
  const total = calc.academicTml === null ? null : items.reduce((a, i) => a + i.points, 0) + engagement.reduce((a, t) => a + t.points, 0);
  const finalTml = blendFinalTml(calc.academicTml, opts.engagement);
  return {
    items, componentWeights,
    componentScores: { homework: calc.components.homework.score, quiz: calc.components.quiz.score, tutor: calc.components.tutor.score },
    academic: calc.academicTml === null ? null : Math.round(academicUnrounded * 10) / 10,
    engagement, total, finalTml, confidence: calc.confidence, confidenceBand: calc.confidenceBand,
    integrityPenaltyApplied: calc.integrityPenaltyApplied, margin: calc.confidenceBand === 'provisional' ? 8 : null,
  };
}

/**
 * What-if: the topic's TML if one more result came in now. `component` is homework, quiz or tutor; `pct` 0-100.
 */
export function simulateTopic(evidence: Evidence[], extra: { component: TmlComponentType; pct: number }, opts: { nowMs: number; engagement: EngagementInputs; hadIntegrityViolation?: boolean }) {
  const known = evidence.filter(e => e.atMs <= opts.nowMs).map(e => toItem(e, opts.nowMs));
  const pct = Math.min(100, Math.max(0, extra.pct));
  const calc = calculateTopicTml([...known, { score: pct, maxScore: 100, componentType: extra.component, ageDays: 0 }], { hadIntegrityViolation: opts.hadIntegrityViolation });
  return { finalTml: blendFinalTml(calc.academicTml, opts.engagement), confidenceBand: calc.confidenceBand, totalItemCount: calc.totalItemCount };
}

/** Monday (YYYY-MM-DD) of the India week containing `ms`. */
export function istWeek(ms: number): string {
  const ist = new Date(ms + 5.5 * 60 * 60 * 1000);
  const dow = (ist.getUTCDay() + 6) % 7; // 0 = Monday
  ist.setUTCDate(ist.getUTCDate() - dow);
  return ist.toISOString().slice(0, 10);
}

/** End of an India week (Sunday 23:59:59.999 IST) as epoch ms, for scoring a past week. */
export function istWeekEndMs(monday: string): number {
  return new Date(`${monday}T00:00:00+05:30`).getTime() + 7 * DAY_MS - 1;
}

/** The tml_history row for a scored topic in a week. */
export function historyRow(t: ScoredTopic, studentId: string, schoolId: string, week: string, source: 'live' | 'backfill', computedAt: string) {
  const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    student_id: studentId, school_id: schoolId, subject: t.subject, topic_key: topicKey(t.topicName), topic_name: t.topicName, week,
    score: t.finalTml ?? 0, academic: t.calc.academicTml, homework: r1(t.calc.components.homework.score), quiz: r1(t.calc.components.quiz.score),
    tutor: r1(t.calc.components.tutor.score), item_count: t.calc.totalItemCount, confidence_band: t.calc.confidenceBand, source, computed_at: computedAt,
  };
}

/**
 * Every row of a read, paged past the 1,000-row cap, answered as { data, error } like a single read. A table that
 * is missing counts as an error: TML must not be saved from partial evidence.
 */
async function everyRow(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  try {
    const r = await all(build);
    return r.missing ? { data: null, error: { message: 'table is missing' } } : { data: r.data, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e?.message || String(e) } };
  }
}

// ---------------------------------------------------------------------------
// Re-computes TML for a student from Supabase evidence and persists an
// append-only snapshot per topic into tml_scores.
// ---------------------------------------------------------------------------
/**
 * Every piece of a student's TML evidence, read the way the engine scores it (confirmed marks only, finished tutor
 * sessions, integrity alerts, latest engagement). Any failed read throws: nothing may be scored from partial evidence.
 */
export async function loadStudentEvidence(supabase: any, studentId: string) {
  // The reads are independent of each other, so they run together. Any failed read
  // aborts the run: a snapshot built from partial evidence would be saved as valid.
  const [userRes, itemsRes, subsRes, tutorRes, alertsRes, engagementRes] = await Promise.all([
    supabase.from('users').select('id, school_id').eq('id', studentId).single(),
    // Only marks a teacher has confirmed (or instant MCQ marking) move TML;
    // AI-suggested marks wait for review.
    // Paged: a student's evidence grows every term and must never stop at the 1,000-row cap.
    everyRow((a: number, b: number) => supabase
      .from('submission_items')
      .select(`
        id, score, max_score, component_type, created_at, submission_id, question_index,
        assignments ( id, subject, title, units, type, proctored )
      `)
      .eq('student_id', studentId)
      .eq('teacher_confirmed', true)
      .order('id').range(a, b)),
    // Top-level fallback for rows without per-question items; same rule: confirmed only.
    everyRow((a: number, b: number) => supabase
      .from('submissions')
      .select(`
        id, score, max_score, teacher_approved, submitted_at,
        assignments ( id, subject, title, units, type, proctored )
      `)
      .eq('student_id', studentId)
      .eq('teacher_approved', true)
      .order('id').range(a, b)),
    everyRow((a: number, b: number) => supabase
      .from('tutor_sessions')
      .select('id, subject, topic, hint_depth, answer_revealed, depth_score, created_at')
      .eq('student_id', studentId)
      .eq('status', 'done') // open sessions are not evidence yet
      .order('id').range(a, b)),
    // Integrity violations (assignment-level).
    supabase
      .from('proctor_alerts')
      .select('assignment_id, switch_count')
      .eq('student_id', studentId)
      .gt('switch_count', 0),
    // Student-level engagement signals: latest engagement_scores row.
    supabase
      .from('engagement_scores')
      .select('attendance_score, app_engagement_score, teacher_engagement_score')
      .eq('student_id', studentId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const [label, res] of [
    ['users', userRes], ['submission_items', itemsRes], ['submissions', subsRes],
    ['tutor_sessions', tutorRes], ['proctor_alerts', alertsRes], ['engagement_scores', engagementRes],
  ] as const) {
    if (res.error) throw new Error(`[TML Engine] reading ${label} failed: ${res.error.message ?? res.error}`);
  }

  const studentUser = userRes.data;
  if (!studentUser) throw new Error('Student not found');

  const itemsData: any[] = itemsRes.data || [];
  const subsData: any[] = subsRes.data || [];
  const tutorData: any[] = tutorRes.data || [];
  const engagementRow = engagementRes.data;

  return {
    schoolId: studentUser.school_id as string,
    evidence: collectEvidence(itemsData, subsData, tutorData),
    flagged: new Set<string>((alertsRes.data || []).map((a: any) => a.assignment_id).filter(Boolean)),
    engagementBase: {
      teacherEngagement: engagementRow?.teacher_engagement_score ?? undefined,
      attendance: engagementRow?.attendance_score ?? undefined,
      appEngagement: engagementRow?.app_engagement_score ?? undefined,
    } as Omit<EngagementInputs, 'tutorVolume'>,
  };
}

export async function computeStudentTml(
  supabase: any,
  studentId: string,
  subjectFilter?: string
) {
  const { schoolId, evidence, flagged, engagementBase } = await loadStudentEvidence(supabase, studentId);
  const studentUser = { school_id: schoolId };
  const nowMs = Date.now();
  const engagement = engagementAt(engagementBase, evidence, nowMs);
  const scored = scoreTopics(evidence, { nowMs, engagement, flagged, subject: subjectFilter });

  // ---- Persist all snapshots in one insert, then this week's history roll-up ----
  const computedAt = new Date(nowMs).toISOString();
  const snapshots = scored.map(t => ({
    student_id: studentId,
    school_id: studentUser.school_id,
    subject: t.subject,
    topic_name: t.topicName,
    score: t.finalTml !== null ? t.finalTml : 0,
    confidence_band: t.calc.confidenceBand,
    item_count: t.calc.totalItemCount,
    components: {
      academicTml: t.calc.academicTml,
      homework: t.calc.components.homework,
      quiz: t.calc.components.quiz,
      tutor: t.calc.components.tutor,
      engagement,
      integrityPenaltyApplied: t.calc.integrityPenaltyApplied,
      masteryBand: t.band?.band ?? null,
    },
    computed_at: computedAt,
  }));
  const results: any[] = scored.map(t => ({ topicName: t.topicName, subject: t.subject, finalTml: t.finalTml, masteryBand: t.band, ...t.calc }));

  if (snapshots.length > 0) {
    const { error: insertErr } = await supabase.from('tml_scores').insert(snapshots);
    if (insertErr) throw new Error(`[TML Engine] saving tml_scores failed: ${insertErr.message ?? insertErr}`);
    // History is a roll-up of tml_scores: a failed write is logged, never fails the recompute.
    try {
      const week = istWeek(nowMs);
      const rows = scored.filter(t => t.finalTml !== null).map(t => historyRow(t, studentId, studentUser.school_id, week, 'live', computedAt));
      if (rows.length) {
        const { error: histErr } = await supabase.from('tml_history').upsert(rows, { onConflict: 'student_id,subject,topic_key,week' });
        if (histErr) console.warn('[TML Engine] tml_history not saved:', histErr.message ?? histErr);
      }
    } catch (e) {
      console.warn('[TML Engine] tml_history not saved:', e instanceof Error ? e.message : e);
    }
  }

  return {
    studentId,
    computedTopicsCount: results.length,
    topics: results,
  };
}
