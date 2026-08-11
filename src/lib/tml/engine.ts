/**
 * True Mastery Level (TML) Engine
 * Mathematical implementation matching TML Metric Model Specification.
 *
 * Additive Components (Renormalized over present evidence):
 *   - Assessments (Tests, Midterms): 45%
 *   - Quizzes (AI-analysed): 20%
 *   - Homework (OCR + Teacher-confirmed): 15%
 *   - Retention Re-check (3-6 week delayed re-test): 15%
 *   - Classwork Checks: 5%
 *
 * Multiplicative Confidence Modifiers:
 *   - Recency: 0.5 ^ (age_days / 60)
 *   - Assistance: unaided 1.00 · 1 hint 0.95 · multi hints 0.85 · answer revealed 0.70
 *   - Attempt: 1st 1.00 · 2nd 0.95 · 3rd+ 0.90
 *   - Teacher Confirmation: confirmed 1.00 · unconfirmed OCR flags topic as provisional
 *
 * Evidence Gate:
 *   - 0-3 items: 'insufficient' (Grey, no score)
 *   - 4-7 items: 'provisional' (Score shown with provisional badge)
 *   - 8+ items: 'firm' (Firm score)
 */

export interface TmlItemInput {
  score: number;             // numeric score (e.g. 0 to 1, or scaled)
  maxScore: number;          // maximum possible score for item (e.g. 1 or 10)
  componentType: 'assessment' | 'quiz' | 'homework' | 'retention' | 'classwork';
  ageDays: number;           // days since item was taken
  hintsUsed?: number;        // 0 = unaided, 1 = 1 hint, >1 = multi hints
  answerRevealed?: boolean;  // true if student revealed answer
  attemptNumber?: number;    // 1 = 1st attempt, 2 = 2nd attempt, etc.
  teacherConfirmed?: boolean;// true if OCR result was teacher confirmed
  outcomeCode?: string;
  topicName?: string;
}

export interface ComponentBreakdown {
  score: number | null;
  weight: number;
  itemCount: number;
  weightedSum: number;
  totalWeight: number;
}

export interface TmlCalculationResult {
  topicTml: number | null; // 0 - 100 percentage score (or null if insufficient evidence)
  confidenceBand: 'insufficient' | 'provisional' | 'firm';
  totalItemCount: number;
  renormalizedWeightsSum: number;
  components: {
    assessment: ComponentBreakdown;
    quiz: ComponentBreakdown;
    homework: ComponentBreakdown;
    retention: ComponentBreakdown;
    classwork: ComponentBreakdown;
  };
  isProvisionalByTeacherConfirmation: boolean;
}

const BASE_COMPONENT_WEIGHTS = {
  assessment: 45,
  quiz: 20,
  homework: 15,
  retention: 15,
  classwork: 5,
};

/**
 * Calculate assistance modifier value
 */
export function getAssistanceModifier(hintsUsed: number = 0, answerRevealed: boolean = false): number {
  if (answerRevealed) return 0.70;
  if (hintsUsed === 0) return 1.00;
  if (hintsUsed === 1) return 0.95;
  return 0.85; // multiple hints
}

/**
 * Calculate attempt number modifier value
 */
export function getAttemptModifier(attemptNumber: number = 1): number {
  if (attemptNumber <= 1) return 1.00;
  if (attemptNumber === 2) return 0.95;
  return 0.90; // 3rd attempt or later
}

/**
 * Calculate recency decay modifier value (60-day half-life)
 */
export function getRecencyModifier(ageDays: number): number {
  const safeAge = Math.max(0, ageDays);
  return Math.pow(0.5, safeAge / 60);
}

/**
 * Compute item weight from recency, assistance, and attempt modifiers
 */
export function computeItemWeight(item: TmlItemInput): number {
  const recency = getRecencyModifier(item.ageDays);
  const assistance = getAssistanceModifier(item.hintsUsed || 0, item.answerRevealed || false);
  const attempt = getAttemptModifier(item.attemptNumber || 1);
  return recency * assistance * attempt;
}

export function normalizeComponentType(type?: string): 'assessment' | 'quiz' | 'homework' | 'retention' | 'classwork' {
  const t = (type || '').toLowerCase();
  if (t.includes('assessment') || t.includes('test') || t.includes('midterm') || t.includes('exam')) return 'assessment';
  if (t.includes('quiz')) return 'quiz';
  if (t.includes('retention')) return 'retention';
  if (t.includes('classwork')) return 'classwork';
  return 'homework';
}

/**
 * Main TML Computation Engine function
 * Computes renormalized topic TML, evidence gate confidence band, and component breakdown.
 */
export function calculateTopicTml(items: TmlItemInput[]): TmlCalculationResult {
  const totalItemCount = items.length;

  // 1. Evidence Gate Display Rule: strictly based on evidence item counts
  let confidenceBand: 'insufficient' | 'provisional' | 'firm' = 'insufficient';
  if (totalItemCount >= 8) {
    confidenceBand = 'firm';
  } else if (totalItemCount >= 4) {
    confidenceBand = 'provisional';
  } else {
    confidenceBand = 'insufficient';
  }

  let hasUnconfirmedOcr = false;

  // Initialize components structure
  const components: Record<string, ComponentBreakdown> = {
    assessment: { score: null, weight: BASE_COMPONENT_WEIGHTS.assessment, itemCount: 0, weightedSum: 0, totalWeight: 0 },
    quiz:       { score: null, weight: BASE_COMPONENT_WEIGHTS.quiz,       itemCount: 0, weightedSum: 0, totalWeight: 0 },
    homework:   { score: null, weight: BASE_COMPONENT_WEIGHTS.homework,   itemCount: 0, weightedSum: 0, totalWeight: 0 },
    retention:  { score: null, weight: BASE_COMPONENT_WEIGHTS.retention,  itemCount: 0, weightedSum: 0, totalWeight: 0 },
    classwork:  { score: null, weight: BASE_COMPONENT_WEIGHTS.classwork,  itemCount: 0, weightedSum: 0, totalWeight: 0 },
  };

  // 2. Accumulate items into their respective components
  items.forEach(item => {
    const compKey = normalizeComponentType(item.componentType);
    if (!components[compKey]) return;

    if (item.teacherConfirmed === false) {
      hasUnconfirmedOcr = true;
    }

    const itemRatio = item.maxScore > 0 ? Math.min(1, Math.max(0, item.score / item.maxScore)) : 0;
    const itemWeight = computeItemWeight(item);

    components[compKey].itemCount += 1;
    components[compKey].weightedSum += itemRatio * itemWeight;
    components[compKey].totalWeight += itemWeight;
  });

  // 3. Compute raw score per component
  let renormalizedWeightSum = 0;
  let weightedComponentTotalSum = 0;

  Object.keys(components).forEach(key => {
    const comp = components[key];
    if (comp.totalWeight > 0) {
      comp.score = Math.min(1, Math.max(0, comp.weightedSum / comp.totalWeight));
      renormalizedWeightSum += comp.weight;
      weightedComponentTotalSum += comp.score * comp.weight;
    }
  });

  // 4. Renormalized Topic TML score (strictly null if confidence is insufficient)
  let topicTml: number | null = null;
  if (renormalizedWeightSum > 0 && confidenceBand !== 'insufficient') {
    const rawPct = (weightedComponentTotalSum / renormalizedWeightSum) * 100;
    topicTml = Math.round(Math.min(100, Math.max(0, rawPct)) * 10) / 10;
  }

  return {
    topicTml,
    confidenceBand,
    totalItemCount,
    renormalizedWeightsSum: renormalizedWeightSum,
    components: components as any,
    isProvisionalByTeacherConfirmation: hasUnconfirmedOcr,
  };
}

/**
 * Re-computes TML scores for a student from Supabase submissions & submission_items
 * and persists snapshot rows into tml_scores table.
 */
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

  // Fetch question-level submission items
  const { data: itemsData, error: itemsErr } = await supabase
    .from('submission_items')
    .select(`
      id,
      score,
      max_score,
      component_type,
      difficulty,
      hints_used,
      attempts_count,
      teacher_confirmed,
      outcome_code,
      created_at,
      submission_id,
      assignments (
        id,
        subject,
        title,
        units,
        type
      )
    `)
    .eq('student_id', studentId);

  if (itemsErr) throw itemsErr;

  const coveredSubmissionIds = new Set<string>();
  (itemsData || []).forEach((row: any) => {
    if (row.submission_id) {
      coveredSubmissionIds.add(row.submission_id);
    }
  });

  // Fetch top-level submissions for submissions without per-question items
  const { data: subsData, error: subsErr } = await supabase
    .from('submissions')
    .select(`
      id,
      score,
      max_score,
      teacher_approved,
      submitted_at,
      created_at,
      assignments (
        id,
        subject,
        title,
        units,
        type
      )
    `)
    .eq('student_id', studentId)
    .neq('teacher_approved', false);

  if (subsErr) console.warn('[TML Engine] Warning fetching top-level submissions:', subsErr);

  const topicGroups: Record<string, { items: TmlItemInput[]; subject: string }> = {};
  const now = new Date();

  // Process submission items
  (itemsData || []).forEach((row: any) => {
    const assign = row.assignments || {};
    const sub = assign.subject || 'General';
    if (subjectFilter && sub.toLowerCase() !== subjectFilter.toLowerCase()) return;

    const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
      ? assign.units.filter((u: string) => u !== 'general' && u !== 'General')
      : [];

    const topicName = rawUnits.length > 0
      ? rawUnits[0]
      : (assign.title ? assign.title.trim() : 'Core Concepts');

    const ageDays = (now.getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);

    if (!topicGroups[topicName]) {
      topicGroups[topicName] = { items: [], subject: sub };
    }

    topicGroups[topicName].items.push({
      score: Number(row.score) || 0,
      maxScore: Number(row.max_score) || 1,
      componentType: normalizeComponentType(row.component_type || assign.type),
      ageDays,
      hintsUsed: row.hints_used || 0,
      attemptNumber: row.attempts_count || 1,
      teacherConfirmed: row.teacher_confirmed !== false,
      outcomeCode: row.outcome_code,
      topicName,
    });
  });

  // Process top-level submissions without items
  (subsData || []).forEach((row: any) => {
    if (coveredSubmissionIds.has(row.id)) return;

    const assign = row.assignments || {};
    const sub = assign.subject || 'General';
    if (subjectFilter && sub.toLowerCase() !== subjectFilter.toLowerCase()) return;

    const rawUnits: string[] = Array.isArray(assign.units) && assign.units.length > 0
      ? assign.units.filter((u: string) => u !== 'general' && u !== 'General')
      : [];

    const topicName = rawUnits.length > 0
      ? rawUnits[0]
      : (assign.title ? assign.title.trim() : 'Core Concepts');

    const createdDate = row.submitted_at || row.created_at || new Date().toISOString();
    const ageDays = (now.getTime() - new Date(createdDate).getTime()) / (1000 * 60 * 60 * 24);

    if (!topicGroups[topicName]) {
      topicGroups[topicName] = { items: [], subject: sub };
    }

    topicGroups[topicName].items.push({
      score: Number(row.score) || 0,
      maxScore: Number(row.max_score) || 10,
      componentType: normalizeComponentType(assign.type),
      ageDays,
      hintsUsed: 0,
      attemptNumber: 1,
      teacherConfirmed: row.teacher_approved === true,
      topicName,
    });
  });

  const results: any[] = [];

  for (const [topicName, group] of Object.entries(topicGroups)) {
    const calculation = calculateTopicTml(group.items);
    const scoreToPersist = calculation.topicTml !== null ? calculation.topicTml : 0;

    const { error: insertErr } = await supabase.from('tml_scores').insert({
      student_id: studentId,
      school_id: studentUser.school_id,
      subject: group.subject,
      topic_name: topicName,
      score: scoreToPersist,
      confidence_band: calculation.confidenceBand,
      item_count: calculation.totalItemCount,
      components: calculation.components,
      computed_at: new Date().toISOString(),
    });

    if (insertErr) console.error('[TML Engine] insert error:', insertErr);

    results.push({
      topicName,
      subject: group.subject,
      ...calculation,
    });
  }

  return {
    studentId,
    computedTopicsCount: results.length,
    topics: results,
  };
}

