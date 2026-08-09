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

/**
 * Main TML Computation Engine function
 * Computes renormalized topic TML, evidence gate confidence band, and component breakdown.
 */
export function calculateTopicTml(items: TmlItemInput[]): TmlCalculationResult {
  const totalItemCount = items.length;

  // 1. Evidence Gate Display Rule
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
    const compKey = item.componentType || 'homework';
    if (!components[compKey]) return;

    if (item.teacherConfirmed === false) {
      hasUnconfirmedOcr = true;
    }

    const itemRatio = item.maxScore > 0 ? item.score / item.maxScore : 0;
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

  // 4. Renormalized Topic TML score
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
