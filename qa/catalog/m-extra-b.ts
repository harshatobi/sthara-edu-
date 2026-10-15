/** Scripts closing the traceability gaps the checker found (COP, STU, WA, NFR). */
import type { ScriptDef } from './types';
import { A } from './auto';

export const extra: Record<string, ScriptDef[]> = {
  COP: [
    { n: '04', title: 'A teacher asks the School OS about their classes', role: 'Teacher', priority: 'High', type: 'Positive', req: ['02'], uat: true,
      pre: 'AI on; the teacher has feed items and a parent waiting.', data: '"What needs me today?"',
      steps: [
        ['Ask the School OS: ask the question.', 'Their own classes only: feed items, parents waiting, work to review, today’s register.'],
        ['Ask about a class they don’t teach.', 'No information about that class.'],
      ] },
  ],
  STU: [
    { n: '06', title: 'Mastery breakdown for a student', role: 'Student', priority: 'High', type: 'Positive', req: ['03'], uat: true,
      pre: 'A student with graded homework and quizzes in one subject.',
      steps: [
        ['Mastery Tracker; pick the subject.', 'Subject TML, topics marked, "Still building" where evidence is thin.'],
        ['Open a topic: What fed this score.', 'Each assignment, quiz or tutor score behind it; ungraded work shows as Not graded yet.'],
        ['Compare with the teacher’s Mastery Tracker.', 'The same numbers ("Computed by the same TML engine your teachers use").'],
      ] },
  ],
  WA: [
    { n: '04', title: 'Webhook security (automated)', role: 'QA engineer', priority: 'Critical', type: 'Security', req: ['02'],
      pre: 'sthara-qa installed.', auto: [`${A.wa}webhook deliveries need the exact Meta signature over the raw body`, `${A.pub}the WhatsApp webhook refuses deliveries without a valid Meta signature`, `${A.pub}the WhatsApp webhook refuses a wrong verify token`],
      steps: [
        ['Run npm run unit and the api project.', 'Unsigned, wrongly signed and wrong-token requests are refused (401 / 403); a correct signature over the exact body is accepted.'],
      ] },
  ],
  NFR: [
    { n: '05', title: 'Tenant isolation', role: 'School admin (school A), QA engineer', priority: 'Critical', type: 'Security', req: ['02'],
      pre: 'Two schools; E2E_OTHER_SCHOOL_ID set to school B.', auto: [`${A.access}a school admin cannot read another school’s directory`],
      steps: [
        ['School A admin: call /api/admin/users?schoolId=<school B>.', 'Refused (403).'],
        ['School A admin: open a school B student’s id in any admin page address.', 'Nothing from school B is shown.'],
        ['Run npm run unit (api-guards).', '"signed-in routes under /api/admin check the caller’s school and role themselves" passes.'],
      ] },
    { n: '06', title: 'Security headers on the public site', role: 'QA engineer', priority: 'High', type: 'Security', req: ['03'], auto: [`${A.routing}the marketing site is served with its security headers`],
      pre: 'None.',
      steps: [
        ['Open www.sthara.in; inspect the response headers.', 'Content-Security-Policy with frame-ancestors none; X-Frame-Options DENY; nosniff; strict-origin-when-cross-origin; camera, microphone and geolocation off.'],
      ] },
    { n: '07', title: 'Rate limits answer 429 with a message', role: 'QA engineer', priority: 'High', type: 'Boundary', req: ['04'], auto: [`${A.limits}rate limits are the signed-off values (requests per window)`, `${A.pub}school code lookup is rate limited per address (30 in 10 minutes)`],
      pre: 'E2E_RATE_LIMITS=1 (it sends 31 lookups).',
      steps: [
        ['Run the rate-limit test against production.', 'The 31st school code lookup in 10 minutes from one address answers 429 "Too many attempts…".'],
        ['Note OBS-008.', 'Limits are per server instance, so they may allow more under load.'],
      ] },
    { n: '08', title: 'Session cookie and outside data flows (review)', role: 'Security reviewer', priority: 'Medium', type: 'Security', req: ['07', '08'],
      pre: 'Signed in to any portal in Chrome.',
      steps: [
        ['DevTools › Application › Cookies: __session.', 'Expected: HttpOnly. Today it is readable by scripts (OBS-004).'],
        ['DevTools › Network: load a portal page.', 'Only sthara.in, the Supabase project and (today) fonts.googleapis.com / fonts.gstatic.com (OBS-009).'],
        ['Check the Supabase region.', 'ap-south-1 (Mumbai).'],
      ] },
  ],
};
