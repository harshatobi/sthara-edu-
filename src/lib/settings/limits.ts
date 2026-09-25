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
  adminAi:         { limit: 30,  windowMs: 10 * MIN, per: 'user',    route: '/api/admin/ai-assistant',      label: 'Admin AI assistant' },
  gradeImage:      { limit: 10,  windowMs: MIN,      per: 'ip',      route: '/api/grade-image',             label: 'Photo grading' },
  submitTyped:     { limit: 20,  windowMs: 5 * MIN,  per: 'user',    route: '/api/student/submit-typed',    label: 'Typed homework submission' },
  analyzeCourse:   { limit: 5,   windowMs: MIN,      per: 'ip',      route: '/api/superadmin/analyze-course', label: 'Course analysis (operator)' },
  quizGrade:       { limit: 15,  windowMs: 5 * MIN,  per: 'user',    route: '/api/quiz/grade',              label: 'Quiz grading' },
  quizGenerate:    { limit: 10,  windowMs: 5 * MIN,  per: 'user',    route: '/api/quiz/generate',           label: 'Quiz generation (student)' },
  homeworkGrade:   { limit: 10,  windowMs: 5 * MIN,  per: 'user',    route: '/api/homework/grade',          label: 'Homework grading' },
  homeworkGenerate:{ limit: 5,   windowMs: 10 * MIN, per: 'user',    route: '/api/homework/generate',       label: 'Homework generation (student)' },
  verifySchool:    { limit: 30,  windowMs: 10 * MIN, per: 'ip',      route: '/api/auth/verify-school',      label: 'School code lookup (sign-in)' },
  onboard:         { limit: 5,   windowMs: 60 * MIN, per: 'ip',      route: '/api/onboard',                 label: 'Self-serve school sign-up' },
  tutor:           { limit: 30,  windowMs: 5 * MIN,  per: 'user',    route: '/api/tutor',                   label: 'AI tutor (legacy chat)' },
  tutorSession:    { limit: 40,  windowMs: 5 * MIN,  per: 'user',    route: '/api/tutor/session',           label: 'AI tutor session' },
  quizGen:         { limit: 15,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/quiz-gen',        label: 'Quiz creator' },
  homeworkGen:     { limit: 15,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/homework-gen',    label: 'Homework creator' },
  assignments:     { limit: 60,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/assignments',     label: 'Assignment writes' },
  course:          { limit: 120, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/course',          label: 'Course plan writes' },
  copilot:         { limit: 40,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/copilot',         label: 'Teaching copilot' },
  lessons:         { limit: 120, windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lessons',         label: 'Lesson plan writes' },
  lessonDraft:     { limit: 12,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/lessons/draft',   label: 'Lesson plan drafting' },
  leave:           { limit: 20,  windowMs: 10 * MIN, per: 'user',    route: '/api/teacher/leave',           label: 'Leave requests' },
} as const satisfies Record<string, RateLimit>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

/** Arguments for checkRateLimit(key, ...limitOf('tutor')). */
export const limitOf = (k: RateLimitKey): [number, number] => [RATE_LIMITS[k].limit, RATE_LIMITS[k].windowMs];

/** AI models by job. Routes pass these to the Gemini SDK. */
export const AI_MODELS = {
  standard: 'gemini-2.5-flash',
  deep: 'gemini-2.5-pro',
} as const;
