import type { AiFeature } from '@/lib/ai/pricing';

/**
 * Every request rate limit and AI model the API routes use, in one place.
 *
 * Routes read their numbers from here (never inline), so the operator
 * console's Settings module shows exactly what is enforced. Changing a value
 * here changes the route and the console together.
 */

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** What the limit is keyed on. */
  per: 'user' | 'ip' | 'user+ip';
  /** Route(s) it guards. */
  route: string;
  label: string;
}

const MIN = 60_000;

export const RATE_LIMITS = {
  admin:           { limit: 120, windowMs: MIN,      per: 'user+ip', route: '/api/admin/*',                 label: 'School office APIs' },
  submitTyped:     { limit: 20,  windowMs: 5 * MIN,  per: 'user',    route: '/api/student/submit-typed',    label: 'Typed homework submission' },
  quizGrade:       { limit: 15,  windowMs: 5 * MIN,  per: 'user',    route: '/api/quiz/grade',              label: 'Quiz grading' },
  quizGenerate:    { limit: 10,  windowMs: 5 * MIN,  per: 'user',    route: '/api/quiz/generate',           label: 'Quiz generation (student)' },
  homeworkGrade:   { limit: 10,  windowMs: 5 * MIN,  per: 'user',    route: '/api/homework/grade',          label: 'Homework grading' },
  verifySchool:    { limit: 30,  windowMs: 10 * MIN, per: 'ip',      route: '/api/auth/verify-school',      label: 'School code lookup (sign-in)' },
  tutorSession:    { limit: 40,  windowMs: 5 * MIN,  per: 'user',    route: '/api/tutor/session',           label: 'AI tutor session' },
  examTrack:       { limit: 20,  windowMs: 10 * MIN, per: 'user',    route: '/api/student/exam-track',      label: 'Exam track choice' },
  quizGen:         { limit: 15,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/quiz-gen',        label: 'Quiz creator' },
  homeworkGen:     { limit: 15,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/homework-gen',    label: 'Homework creator' },
  paperGen:        { limit: 10,  windowMs: 10 * MIN, per: 'user',    route: '/api/paper-gen',               label: 'Question paper generator' },
  assignments:     { limit: 60,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/assignments',     label: 'Assignment writes' },
  course:          { limit: 120, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/course',          label: 'Course plan writes' },
  feed:            { limit: 120, windowMs: MIN,      per: 'user',    route: '/api/feed',                    label: 'Situational feed, attendance and incidents' },
  copilot:         { limit: 40,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/copilot',         label: 'Teaching copilot' },
  copilotImage:    { limit: 12,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/copilot/image',   label: 'Copilot illustrations' },
  boardPaper:      { limit: 6,   windowMs: 60 * MIN, per: 'user',    route: '/api/teacher/copilot',         label: 'Board exam papers (Copilot)' },
  lessons:         { limit: 120, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lessons',         label: 'Lesson plan writes' },
  lab:             { limit: 60,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lab',             label: 'Live Lab saved demos' },
  labRuns:         { limit: 300, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lab/runs',        label: 'Live Lab class predictions' },
  practicals:      { limit: 120, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/practicals',      label: 'Live Lab practicals tracker' },
  lessonDraft:     { limit: 12,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lessons/draft',   label: 'Lesson plan drafting' },
  leave:           { limit: 20,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/leave',           label: 'Leave requests' },
  checkin:         { limit: 20,  windowMs: 10 * MIN, per: 'user',    route: '/api/me/attendance',           label: 'Staff check-in from the app' },
  capturePage:     { limit: 300, windowMs: 10 * MIN, per: 'user',    route: '/api/grading/pages',           label: 'Photographed work: page uploads' },
  captureGrade:    { limit: 60,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/capture',         label: 'Capture & AI grading (teacher)' },
  parentDesk:      { limit: 60,  windowMs: 5 * MIN,  per: 'user',    route: '/api/parent/desk',             label: 'Parent portal data' },
  parentAsk:       { limit: 30,  windowMs: 10 * MIN, per: 'user',    route: '/api/parent/ask',              label: 'Ask the School OS (web)' },
  staffAsk:        { limit: 30,  windowMs: 10 * MIN, per: 'user',    route: '/api/staff/ask',               label: 'Ask the School OS (teachers and leadership)' },
  timelineAsk:     { limit: 30,  windowMs: 10 * MIN, per: 'user',    route: '/api/timeline',                label: 'Ask about a student\u2019s timeline' },
  staffWhatsapp:   { limit: 30,  windowMs: 10 * MIN, per: 'user',    route: '/api/staff/whatsapp',          label: 'Staff WhatsApp settings' },
  schoolMessages:  { limit: 40,  windowMs: 10 * MIN, per: 'user',    route: '/api/parent/messages, /api/staff/messages', label: 'Parent and staff messages' },
  whatsappLink:    { limit: 5,   windowMs: 15 * MIN, per: 'user',    route: '/api/parent/whatsapp',         label: 'WhatsApp number linking' },
  whatsappInbound: { limit: 20,  windowMs: 10 * MIN, per: 'user',    route: '/api/whatsapp/webhook',        label: 'Ask the School OS (WhatsApp), per number' },
  applySignIn:     { limit: 10,  windowMs: 15 * MIN, per: 'ip',      route: '/api/apply',                   label: 'Admissions apply page: phone and access codes' },
  applyEnquiry:    { limit: 5,   windowMs: 15 * MIN, per: 'ip',      route: '/api/apply',                   label: 'Admission enquiries (apply page and QR poster)' },
  applyWrite:      { limit: 120, windowMs: 10 * MIN, per: 'ip',      route: '/api/apply, /api/parent/admissions', label: 'Online admission applications' },
  clientErrors:    { limit: 30,  windowMs: MIN,      per: 'ip',      route: '/api/errors',                  label: 'Browser error reports (ops error log)' },
} as const satisfies Record<string, RateLimit>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/** Arguments for checkRateLimit(key, ...limitOf('tutorSession')). */
export const limitOf = (k: RateLimitKey): [number, number] => [RATE_LIMITS[k].limit, RATE_LIMITS[k].windowMs];

/**
 * AI models by job. Routes name the job with these (the Gemini model ids);
 * src/lib/ai/generate.ts decides which provider actually runs it:
 *   Aadhara schools        Gemini only (these models)
 *   every other school     Claude (CLAUDE_MODELS) first, Gemini as the backup
 */
export const AI_MODELS = {
  standard: 'gemini-2.5-flash',
  deep: 'gemini-2.5-pro',
  /** Reading photographed handwriting and suggesting marks (teacher capture and student photo submissions). */
  handwriting: 'gemini-2.5-flash',
  /** Cheap, fast checks that gate a bigger call: the tutor's grounding check on every message. */
  fast: 'gemini-2.5-flash-lite',
  /** Illustrations the Copilot proposes and the teacher chooses to generate. Gemini on every tier: Claude does not make images. */
  image: 'gemini-2.5-flash-image',
} as const;

export type AiJob = Exclude<keyof typeof AI_MODELS, 'image'>;

/**
 * The Claude model and effort for each job, on every tier except Aadhara.
 * Sonnet and Haiku only: Opus is never used (Moses, 2026-11-06).
 * Effort is how hard the model thinks before answering (and so how many
 * tokens it bills): low for quick gates, medium for everyday work, high for
 * the deep job.
 */
export const CLAUDE_MODELS: Record<AiJob, { model: 'claude-sonnet-5-5' | 'claude-haiku-5-5'; effort: 'low' | 'medium' | 'high' }> = {
  standard: { model: 'claude-sonnet-5-5', effort: 'medium' },
  deep: { model: 'claude-sonnet-5-5', effort: 'high' },
  handwriting: { model: 'claude-sonnet-5-5', effort: 'medium' },
  fast: { model: 'claude-haiku-5-5', effort: 'low' },
};

export type ClaudeChoice = (typeof CLAUDE_MODELS)[AiJob];

/**
 * Per-feature choice for the standard job, which most features use. It beats
 * CLAUDE_MODELS.standard; the handwriting, fast and deep jobs keep their own.
 * Cost plan of 2026-11-06: light, high-volume work on Haiku (about 20x
 * cheaper than Sonnet); Sonnet at low effort for teacher-facing generation;
 * board papers and marking stay on Sonnet at medium, because accuracy
 * matters there.
 */
export const CLAUDE_BY_FEATURE: Partial<Record<AiFeature, ClaudeChoice>> = {
  parentAsk: { model: 'claude-haiku-5-5', effort: 'low' },
  teacherAsk: { model: 'claude-haiku-5-5', effort: 'low' },
  leadershipAsk: { model: 'claude-haiku-5-5', effort: 'low' },
  timelineAsk: { model: 'claude-haiku-5-5', effort: 'low' },
  tutorSession: { model: 'claude-haiku-5-5', effort: 'medium' },
  // Socratic engine: Sonnet judges only the stages that set the score; seeding runs once per chapter per school.
  tutorJudge: { model: 'claude-sonnet-5-5', effort: 'low' },
  tutorSeed: { model: 'claude-sonnet-5-5', effort: 'low' },
  quizGenerate: { model: 'claude-haiku-5-5', effort: 'medium' },
  quizGrade: { model: 'claude-haiku-5-5', effort: 'medium' },
  copilot: { model: 'claude-sonnet-5-5', effort: 'low' },
  quizGen: { model: 'claude-sonnet-5-5', effort: 'low' },
  homeworkGen: { model: 'claude-sonnet-5-5', effort: 'low' },
  paperGen: { model: 'claude-sonnet-5-5', effort: 'low' },
  lessonDraft: { model: 'claude-sonnet-5-5', effort: 'low' },
};

/** The Claude model and effort for a call: the feature's own choice for standard work, else the job's. */
export const claudeChoice = (job: AiJob, feature: AiFeature): ClaudeChoice =>
  (job === 'standard' && CLAUDE_BY_FEATURE[feature]) || CLAUDE_MODELS[job];

/**
 * Conversations that resend the same long system prompt (data brief) on every
 * turn: their prompt is cached, so follow-up turns read it at a tenth of the
 * input price. One-shot features stay uncached, because a cache write costs
 * 1.25x and would never be read.
 */
export const CLAUDE_CACHED_FEATURES: readonly AiFeature[] = ['copilot', 'parentAsk', 'teacherAsk', 'leadershipAsk', 'timelineAsk', 'tutorSession', 'tutorJudge'];

/** Plans that run on Gemini alone (no Claude). */
export const GEMINI_ONLY_PLANS: readonly string[] = ['aadhara'];
