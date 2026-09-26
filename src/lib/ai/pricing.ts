/**
 * What each AI call costs, and which product feature made it.
 *
 * Prices are Google's paid-tier list prices for the Gemini API (USD per 1M
 * tokens), checked against ai.google.dev/gemini-api/docs/pricing on
 * 2026-09-25. Thinking tokens bill as output. The cost stored with each call
 * is computed at the time of the call, so a later price change here does not
 * rewrite history.
 */

export interface ModelPrice {
  /** USD per 1M input tokens (text / image / video). */
  input: number;
  /** USD per 1M output tokens, thinking included. */
  output: number;
  /** USD per 1M cached input tokens. */
  cached: number;
  /** Prompts longer than this bill at the `long` rates. */
  longAbove?: number;
  long?: { input: number; output: number; cached: number };
}

export const PRICES_CHECKED = '2026-09-25';

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50, cached: 0.03 },
  'gemini-2.5-pro': {
    input: 1.25, output: 10.00, cached: 0.125,
    longAbove: 200_000, long: { input: 2.50, output: 15.00, cached: 0.25 },
  },
};

/** Rupees per US dollar for display (Sthara's planning rate); stored costs are in USD. */
export const USD_TO_INR = 95.5;

/** Every place in the product that calls a model, keyed by what it's for. */
export const AI_FEATURES = {
  tutor:            { label: 'AI tutor (legacy chat)', who: 'Student' },
  tutorSession:     { label: 'AI tutor session', who: 'Student' },
  quizGenerate:     { label: 'Quiz generation (student)', who: 'Student' },
  quizGrade:        { label: 'Quiz grading', who: 'Student' },
  homeworkGenerate: { label: 'Homework generation (student)', who: 'Student' },
  gradeImage:       { label: 'Photo grading', who: 'Student' },
  practice:         { label: 'Practice questions', who: 'Teacher' },
  quizGen:          { label: 'Quiz creator', who: 'Teacher' },
  homeworkGen:      { label: 'Homework creator', who: 'Teacher' },
  paperGen:         { label: 'Question paper generator', who: 'Teacher' },
  copilot:          { label: 'Teaching copilot', who: 'Teacher' },
  lessonDraft:      { label: 'Lesson plan drafting', who: 'Teacher' },
  analyzeSyllabus:  { label: 'Syllabus analysis', who: 'Teacher' },
  captureGrade:     { label: 'Capture & AI grading', who: 'Teacher' },
  homeworkGrade:    { label: 'Homework photo grading', who: 'Student' },
  adminAi:          { label: 'Admin AI assistant', who: 'Admin' },
  parentAsk:        { label: 'Ask the School OS', who: 'Parent' },
  analyzeCourse:    { label: 'Course analysis', who: 'Operator' },
} as const;

export type AiFeature = keyof typeof AI_FEATURES;

export const featureLabel = (k: string) => (AI_FEATURES as Record<string, { label: string }>)[k]?.label ?? k;

export interface TokenCounts {
  input: number;
  output: number;
  thinking: number;
  cached: number;
}

/**
 * USD cost of one call. `input` includes any cached tokens (that's how Gemini
 * reports promptTokenCount); they're billed at the cached rate instead.
 * Unknown models cost null: shown as unpriced, never guessed.
 */
export function costUsd(model: string, t: TokenCounts): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const rate = p.longAbove && p.long && t.input > p.longAbove ? p.long : p;
  const cached = Math.min(t.cached, t.input);
  const usd = ((t.input - cached) * rate.input + cached * rate.cached + (t.output + t.thinking) * rate.output) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}

/** Gemini usageMetadata (SDK or REST) -> our counts. Missing fields count as zero. */
export function countsFrom(u: unknown): TokenCounts {
  const m = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof m[k] === 'number' && Number.isFinite(m[k]) ? Math.max(0, Math.round(m[k] as number)) : 0);
  return {
    input: n('promptTokenCount'),
    output: n('candidatesTokenCount'),
    thinking: n('thoughtsTokenCount'),
    cached: n('cachedContentTokenCount'),
  };
}
