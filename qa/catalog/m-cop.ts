import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P08', priority: 'High', text: 'Teacher Copilot: answers from the teacher’s own classes’ data; students’ names leave as tokens and come back restored; proposed actions preview and run only when the teacher says so; Studio makes worksheets, lesson plans, notes home and more, each a valid artifact; conversations stay on the device.', api: 'POST /api/teacher/copilot', auto: [`${A.copilot}parseReply keeps valid parts and drops broken ones`, `${A.copilot}restoreNames maps student tokens back, deeply, and leaves unknown tokens`, `${A.copilot}every Studio type has a sample, and every sample is a valid artifact`] },
  { n: '02', process: 'P12', priority: 'High', text: 'Ask the School OS for teachers: questions about their own classes (feed, parents waiting, work to review, today’s register), with WhatsApp too.', api: 'POST /api/staff/ask', auto: [`${A.staff}staff ask protocol: tokens, targets, WhatsApp text`] },
  { n: '03', process: 'P08', priority: 'High', text: 'Class heat map (topic-level TML: students ≥75% vs <40%, student × evidence) and mastery tracker (per student, per chapter, with the evidence behind each score).', auto: [`${A.admin}TML as of a date uses only snapshots that existed then`] },
  { n: '04', process: 'P10', priority: 'High', text: 'Student wellness for teachers: low-mood alerts for their own classes (energy only; private journal text never shown), resolvable.', auto: [`${A.demoT}wellness review cannot repeat or cross class boundaries`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Copilot with names protected and actions on confirm', role: 'Teacher', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'AI on; a class with graded work.', data: '"Who is struggling with fractions in 7-B?"',
    steps: [
      ['AI Assistant: ask the question.', 'An answer naming real students of the teacher’s classes; "Worth a look" suggestions.'],
      ['Accept a suggested action (e.g. remedial worksheet).', 'A preview opens; nothing is created until the teacher confirms.'],
      ['Studio: a worksheet for one chapter with no chapter picked.', '"Pick a chapter."'],
      ['Ask 41 times in 10 minutes.', '"The Copilot needs a short break. Try again in a few minutes."'],
    ] },
  { n: '02', title: 'Heat map and mastery tracker agree', role: 'Teacher', priority: 'High', type: 'Positive', req: ['03'], uat: true,
    pre: 'A class with confirmed homework and quiz grades.',
    steps: [
      ['Class Heat Map for 10-A.', 'Topic-level TML; students ≥75% vs <40%; Homework / Quiz / Tutor depth.'],
      ['Open in Mastery Tracker for one student.', 'Chapter by chapter with the evidence; numbers match the heat map.'],
      ['A class with no curriculum loaded and no grades.', '"The official curriculum for this class and subject isn’t loaded yet…"'],
    ] },
  { n: '03', title: 'Wellness alerts without journal text', role: 'Teacher', priority: 'High', type: 'Security', req: ['04'],
    pre: 'A student with low check-ins and a private journal entry.',
    steps: [
      ['Student Wellness.', 'Low Mood Alerts show the energy level; the journal text is not shown anywhere.'],
      ['Resolve an alert.', 'Moves to Resolved Alerts.'],
      ['A student in a class the teacher does not teach.', 'Not listed.'],
    ] },
];
