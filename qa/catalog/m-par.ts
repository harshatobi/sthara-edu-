import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P11', priority: 'Critical', text: 'A parent sees only their verified children: home (Probe “worth a look”, subjects, coming up in 7 days, recently graded, from school), with a child switcher when there is more than one; no linked child shows "Ask the office to link you".', api: 'GET /api/parent/desk', tables: 'guardians', auto: [`${A.parent}family shaping: work states, targeting, drafts hidden`, `${A.parent}probe: severe gap, overdue work, low energy, fees, unread reply`] },
  { n: '02', process: 'P11', priority: 'High', text: 'Mastery & reports: per chapter mastery with homework, quiz, tutor depth and confidence bands (Firm: 5+ pieces; Provisional: 2–4, ±8%; Too early), trend vs three weeks ago, ideas for home.', auto: [`${A.parent}family shaping: mastery uses the latest snapshot per chapter, trend vs three weeks ago`] },
  { n: '03', process: 'P11', priority: 'High', text: 'Schoolwork (to do, overdue, graded, handed in awaiting marks; drafts never shown), attendance calendar with the register and the school calendar, weekly timetable.', auto: [`${A.j06}2. The parent’s calendar shows this month’s register`] },
  { n: '04', process: 'P11', priority: 'High', text: 'Ask the School OS for parents: answers about their own child only; can draft a message to a teacher or the office, sent only after the parent confirms (SEND on WhatsApp).', api: 'POST /api/parent/ask', auto: [`${A.parent}names are tokens on the way out and restored on the way back`, `${A.parent}parseAskReply resolves message targets and drops unknown ones`] },
  { n: '05', process: 'P13', priority: 'Critical', text: 'Wellness trends only with the parent’s consent; the parent manages consents and which notifications they get (grades, learning alerts, teacher replies, fee reminders).', auto: [`${A.parent}family shaping: wellness only with consent, fees net of payments`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Parent home and child switcher', role: 'Parent (two children)', priority: 'Critical', type: 'Positive', req: ['01', '03'], uat: true,
    pre: 'A parent verified for two children in different classes.', auto: [`~${A.portals}Home (/parent)`],
    steps: [
      ['Sign in; Home.', 'The first child’s subjects, coming up, recently graded, from school.'],
      ['Switch child.', 'Everything changes to the second child; nothing from the first remains.'],
      ['Schoolwork; Attendance & Calendar; Fees & Payments.', 'For the selected child only; drafts never appear.'],
    ] },
  { n: '02', title: 'Another family’s child is never visible', role: 'Parent', priority: 'Critical', type: 'Security', req: ['01'],
    pre: 'Two unrelated families.',
    steps: [
      ['Parent A asks the School OS about Parent B’s child by name.', 'No information about that child.'],
      ['Parent A opens /api/parent/desk with B’s child’s id in the URL.', 'Only A’s own children are returned.'],
    ] },
  { n: '03', title: 'Reports with confidence bands', role: 'Parent', priority: 'High', type: 'Positive', req: ['02'], uat: true,
    pre: 'A child with 1, 3 and 6 graded pieces in three chapters.',
    steps: [
      ['Mastery & Reports.', 'Too early / Provisional / Firm for the three chapters; What the bands mean explains each.'],
      ['Explain this report.', 'Opens Ask the School OS with the report in context.'],
    ] },
  { n: '04', title: 'Ask the School OS and send a drafted message', role: 'Parent', priority: 'High', type: 'Positive', req: ['04'], uat: true,
    pre: 'AI on.', data: '"Why did her science mark drop? Tell the teacher she was unwell last week."',
    steps: [
      ['Ask the question.', 'An answer from the child’s records; a drafted message to the Science teacher.'],
      ['Not now.', 'Nothing is sent.'],
      ['Ask again; Open the draft; send.', 'The message appears in School Messages; the teacher receives it.'],
    ] },
  { n: '05', title: 'Consent and notification choices', role: 'Parent', priority: 'Critical', type: 'Positive', req: ['05'], uat: true,
    pre: 'Wellness consent not given.',
    steps: [
      ['Home.', 'Energy tile: "Not shared · Give consent to see energy trends".'],
      ['WhatsApp & Privacy › Consent & privacy: give wellness consent.', 'Saved; the energy trend appears; DPDP coverage rises for the school.'],
      ['Turn off Fee reminders.', 'The next fee reminder does not notify this parent.'],
    ] },
];
