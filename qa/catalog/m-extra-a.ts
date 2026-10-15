/** Scripts closing the traceability gaps the checker found (AUTH, OPS, MSG, TT, COV). */
import type { ScriptDef } from './types';
import { A } from './auto';

export const extra: Record<string, ScriptDef[]> = {
  AUTH: [
    { n: '10', title: 'Privacy policy and terms from sign-in', role: 'Anonymous', priority: 'Low', type: 'Regression', req: ['11'],
      pre: 'Signed out.', auto: [`${A.login}DEF-003 (fixed): the privacy policy and terms are linked from sign-in`],
      steps: [
        ['On the code step, click "Privacy Policy" and "Terms of Service".', 'They open /privacy and /terms (DEF-003, fixed on login-cleanup).'],
        ['Open /privacy and /terms directly.', 'Both pages load.'],
      ] },
  ],
  OPS: [
    { n: '12', title: 'The console is invisible to everyone else', role: 'School admin, Teacher', priority: 'Critical', type: 'Security', req: ['01'],
      pre: 'A school admin and a teacher login.', auto: [`${A.routing}the operator console is a plain 404 for anyone who is not an operator`, `${A.gates}operator routes answer a stranger exactly like a route that does not exist`],
      steps: [
        ['Signed out, open /ops, /ops/schools, /ops/settings.', '"Page not found." each time; no mention of the Platform Manager.'],
        ['As the school admin, open /ops.', 'The same "Page not found.".'],
        ['As the teacher, call /api/ops/overview with their token.', '404 "Not Found", identical to a route that does not exist.'],
      ] },
    { n: '13', title: 'New temporary password; who the operators are', role: 'Sthara operator', priority: 'High', type: 'Positive', req: ['06', '17'],
      pre: 'A teacher who forgot their password.',
      steps: [
        ['People: search the teacher by name or email; New password.', 'A 12-character temporary password shows once: "shown once and not stored. Hand them over securely."'],
        ['The teacher signs in with it.', 'Signed in.'],
        ['Operators.', 'Each operator with Since, Granted by, Last sign-in and Two-factor; how to grant access is explained.'],
      ] },
  ],
  MSG: [
    { n: '04', title: 'WhatsApp-origin messages and child scoping', role: 'Parent (two children), Teacher', priority: 'Medium', type: 'Positive', req: ['03'],
      pre: 'A parent linked to WhatsApp with two children in different classes.',
      steps: [
        ['Parent: on WhatsApp, ask the School OS to tell the maths teacher something; SEND.', 'The conversation shows "Sent from WhatsApp".'],
        ['Parent: New message, pick the second child.', 'Only the second child’s teachers (and the office) can be chosen.'],
      ] },
  ],
  TT: [
    { n: '05', title: 'Teaching load on the timetable', role: 'Academic coordinator', priority: 'Medium', type: 'Positive', req: ['05'],
      pre: 'A timetable with one teacher at 38 periods a week.',
      steps: [
        ['Timetable › Teaching load.', 'Periods a week per teacher; 31–36 amber, above 36 red.'],
        ['Move a lesson from the overloaded teacher to another; save.', 'Their count drops and the colour updates.'],
      ] },
  ],
  COV: [
    { n: '06', title: 'Visiting specialists: taken or missed', role: 'Academic coordinator', priority: 'Medium', type: 'Positive', req: ['07'],
      pre: 'A visiting music teacher timetabled today.',
      steps: [
        ['Cover › Visiting teachers today.', 'The session is listed.'],
        ['Mark it Taken; mark yesterday’s Missed with a note.', 'Saved; a session more than 60 days ago: "That is more than 60 days ago."'],
        ['Mark one for tomorrow.', '"A session is confirmed on or after the day."'],
      ] },
  ],
};
