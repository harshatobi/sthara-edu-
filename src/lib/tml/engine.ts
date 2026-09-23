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
  teacherEngagement?: number; // 0-100, defaults to neutral 100 if unmeasured
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
// Mastery bands & pedagogical triggers (spec section 3) — exact palette match
// with the design system.
// ---------------------------------------------------------------------------
export type MasteryBand = 'Exemplary' | 'Proficient' | 'Developing' | 'Critical Gap' | 'Severe Need';

export function mapMasteryBand(tml: number | null): { band: MasteryBand; color: string; action: string } | null {
  if (tml === null) return null;
  if (tml >= 90) return { band: 'Exemplary', color: '#10B981', action: 'Auto-unlocks advanced Olympiad / HOTS Socratic extension modules.' };
  if (tml >= 75) return { band: 'Proficient', color: '#34D399', action: 'CBSE Distinction benchmark. Standard maintenance review schedule.' };
  if (tml >= 50) return { band: 'Developing', color: '#F5B60B', action: 'Flags specific micro-topic gaps; generates focused practice drills.' };
  if (tml >= 35) return { band: 'Critical Gap', color: '#F98A4B', action: 'Triggers mandatory 3-step AI Socratic Tutor session; alerts teacher.' };
  return { band: 'Severe Need', color: '#E11D48', action: 'Immediate Remediation Plan assigned; logged in Parent WhatsApp.' };
}

// ---------------------------------------------------------------------------
// Re-computes TML for a student from Supabase evidence and persists an
// append-only snapshot per topic into tml_scores.
// ---------------------------------------------------------------------------
export async function computeStudentTml(
  supabase: any,
  studentId: string,
  subjectFilter?: string
) {
  const { data: studentUser } = await supabase
    .from('users')
    .select('id, school_id')
    .eq('id', studentId)
    .single();

  if (!studentUser) {
    throw new Error('Student not found');
  }

  const now = new Date();
  const ageInDays = (iso: string) => (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);

  // ---- 1. Homework/quiz evidence: submission_items, falling back to
  //         top-level submissions for rows without per-question items. ----
  const { data: itemsData, error: itemsErr } = await supabase
    .from('submission_items')
    .select(`
      id, score, max_score, component_type, created_at, submission_id,
      assignments ( id, subject, title, units, type, proctored )
    `)
    .eq('student_id', studentId);
  if (itemsErr) throw itemsErr;

  const coveredSubmissionIds = new Set<string>((itemsData || []).map((r: any) => r.submission_id).filter(Boolean));

  const { data: subsData, error: subsErr } = await supabase
    .from('submissions')
    .select(`
      id, score, max_score, teacher_approved, submitted_at, created_at,
      assignments ( id, subject, title, units, type, proctored )
    `)
    .eq('student_id', studentId)
    .neq('teacher_approved', false);
  if (subsErr) console.warn('[TML Engine] Warning fetching top-level submissions:', subsErr);

  // ---- 2. Tutor depth evidence: tutor_sessions ----
  const { data: tutorData, error: tutorErr } = await supabase
    .from('tutor_sessions')
    .select('id, subject, topic, hint_depth, answer_revealed, created_at')
    .eq('student_id', studentId);
  if (tutorErr) console.warn('[TML Engine] Warning fetching tutor_sessions:', tutorErr);

  // ---- 3. Integrity violations: proctor_alerts (assignment-level) ----
  const { data: alertsData } = await supabase
    .from('proctor_alerts')
    .select('assignment_id, switch_count')
    .eq('student_id', studentId)
    .gt('switch_count', 0);
  const flaggedAssignmentIds = new Set<string>((alertsData || []).map((a: any) => a.assignment_id).filter(Boolean));

  // ---- 4. Student-level engagement signals: latest engagement_scores row ----
  const { data: engagementRow } = await supabase
    .from('engagement_scores')
    .select('attendance_score, app_engagement_score, teacher_engagement_score')
    .eq('student_id', studentId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const tutorSessionsInWindow = (tutorData || []).filter((s: any) => ageInDays(s.created_at) <= 30).length;
  const engagement: EngagementInputs = {
    teacherEngagement: engagementRow?.teacher_engagement_score ?? undefined,
    attendance: engagementRow?.attendance_score ?? undefined,
    appEngagement: engagementRow?.app_engagement_score ?? undefined,
    tutorVolume: normalizeTutorVolume(tutorSessionsInWindow),
  };

  // ---- 5. Group everything into per-topic evidence buckets ----
  const topicGroups: Record<string, { items: TmlEvidenceItem[]; subject: string; assignmentIds: Set<string> }> = {};

  const topicNameFor = (assign: any) => {
    const rawUnits: string[] = Array.isArray(assign?.units)
      ? assign.units.filter((u: string) => u && u.toLowerCase() !== 'general')
      : [];
    return rawUnits.length > 0 ? rawUnits[0] : (assign?.title?.trim() || 'Core Concepts');
  };

  const addItem = (subject: string, topicName: string, item: TmlEvidenceItem, assignmentId?: string) => {
    if (subjectFilter && subject.toLowerCase() !== subjectFilter.toLowerCase()) return;
    if (!topicGroups[topicName]) topicGroups[topicName] = { items: [], subject, assignmentIds: new Set() };
    topicGroups[topicName].items.push(item);
    if (assignmentId) topicGroups[topicName].assignmentIds.add(assignmentId);
  };

  (itemsData || []).forEach((row: any) => {
    const assign = row.assignments || {};
    addItem(assign.subject || 'General', topicNameFor(assign), {
      score: Number(row.score) || 0,
      maxScore: Number(row.max_score) || 1,
      componentType: row.component_type || assign.type,
      ageDays: ageInDays(row.created_at),
    }, assign.id);
  });

  (subsData || []).forEach((row: any) => {
    if (coveredSubmissionIds.has(row.id)) return;
    const assign = row.assignments || {};
    addItem(assign.subject || 'General', topicNameFor(assign), {
      score: Number(row.score) || 0,
      maxScore: Number(row.max_score) || 10,
      componentType: assign.type,
      ageDays: ageInDays(row.submitted_at || row.created_at),
    }, assign.id);
  });

  (tutorData || []).forEach((row: any) => {
    const subject = row.subject || 'General';
    if (subjectFilter && subject.toLowerCase() !== subjectFilter.toLowerCase()) return;
    const topicName = row.topic?.trim() || 'Core Concepts';
    addItem(subject, topicName, {
      score: getTutorDepthScore(row.hint_depth || 0, !!row.answer_revealed),
      maxScore: 100,
      componentType: 'tutor',
      ageDays: ageInDays(row.created_at),
    });
  });

  // ---- 6. Compute + persist per topic ----
  const results: any[] = [];

  for (const [topicName, group] of Object.entries(topicGroups)) {
    const hadIntegrityViolation = [...group.assignmentIds].some(id => flaggedAssignmentIds.has(id));
    const calc = calculateTopicTml(group.items, { hadIntegrityViolation });
    const finalTml = blendFinalTml(calc.academicTml, engagement);
    const scoreToPersist = finalTml !== null ? finalTml : 0;
    const band = mapMasteryBand(finalTml);

    const { error: insertErr } = await supabase.from('tml_scores').insert({
      student_id: studentId,
      school_id: studentUser.school_id,
      subject: group.subject,
      topic_name: topicName,
      score: scoreToPersist,
      confidence_band: calc.confidenceBand,
      item_count: calc.totalItemCount,
      components: {
        academicTml: calc.academicTml,
        homework: calc.components.homework,
        quiz: calc.components.quiz,
        tutor: calc.components.tutor,
        engagement,
        integrityPenaltyApplied: calc.integrityPenaltyApplied,
        masteryBand: band?.band ?? null,
      },
      computed_at: new Date().toISOString(),
    });
    if (insertErr) console.error('[TML Engine] insert error:', insertErr);

    results.push({
      topicName,
      subject: group.subject,
      finalTml,
      masteryBand: band,
      ...calc,
    });
  }

  return {
    studentId,
    computedTopicsCount: results.length,
    topics: results,
  };
}
