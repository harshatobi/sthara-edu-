import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P09', priority: 'Critical', text: 'Students see work set for them, answer typed questions or add photo/PDF pages (up to 10 MB), and submit once; multiple choice is marked on submit; written answers wait for the teacher; results show only once confirmed.', api: 'POST /api/student/submit-typed, /api/homework/grade', auto: [`${A.j04}2. The student finds it, answers and submits; it waits for the teacher`, `${A.j05}2–3. The student answers correctly and is graded on submit`] },
  { n: '02', process: 'P09', priority: 'High', text: 'Proctored work: tab switches are reported; the third auto-submits; the teacher is alerted and confidence is cut.', api: 'POST /api/student/proctor-alert', auto: [`${A.feed}proctoring: worst alert per student and task; auto-submit is high`] },
  { n: '03', process: 'P09', priority: 'High', text: 'Mastery: TML by subject and topic from the same engine as teachers’ view, with what fed each score.' },
  { n: '04', process: 'P09', priority: 'Critical', text: 'AI tutor: staged Socratic sessions on a chapter micro-topic (diagnose, guided steps with a two-hint ladder, an unaided transfer problem, teach-back) scored for tutor depth as 30% independence, 30% reasoning, 30% transfer, 10% teach-back; the scoring state lives on the server; sessions can be resumed and read back; topics and answers pass a school-safe language filter; exam tracks only when the school switched them on for the class.', api: 'POST /api/tutor/session, GET /api/tutor/sessions, /api/student/exam-track', auto: [`${A.tutor}the hint ladder cannot be skipped: nudge, method, then the step is walked through and scored as a reveal`, `${A.tutor}tutor depth is 30% independence, 30% reasoning, 30% transfer, 10% teach-back; ending early scores what was done`, `${A.tutor}the filter matches whole words only: school words that contain a blocked word pass`] },
  { n: '05', process: 'P09', priority: 'High', text: 'The tutor never blocks official CBSE curriculum content.', fit: 'Gap', note: 'DEF-001: 8 official curriculum lines blocked ("Sex determination", "MR = MC"); answers with "BC" dates warned.', auto: [`${A.tutor}DEF-001: no official CBSE curriculum line is blocked by the tutor filter`] },
  { n: '06', process: 'P10', priority: 'High', text: 'Wellness: a one-tap daily energy check-in and a private journal; private entries are never shown to teachers or parents; sharing with the class teacher needs parent consent (DPDP).', auto: [`${A.feed}wellness: single low check-in vs a streak; never reads notes`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Submit homework and see the result', role: 'Student', priority: 'Critical', type: 'Positive', req: ['01'], uat: true,
    pre: 'A posted typed homework and a quiz.', auto: [`${A.j04}2. The student finds it, answers and submits; it waits for the teacher`],
    steps: [
      ['Homework › Open the homework; type answers; Review & submit › Submit assignment.', '"Submitted"; Teacher review pending.'],
      ['Reload; try to submit again.', 'No submit button; the API refuses "You have already submitted this assignment."'],
      ['After the teacher confirms: View report.', 'Score, "What went right", teacher feedback, "Confirmed by your teacher".'],
    ] },
  { n: '02', title: 'Proctored quiz: three tab switches', role: 'Student, Teacher', priority: 'High', type: 'Negative', req: ['02'], uat: true,
    pre: 'A proctored quiz.',
    steps: [
      ['Open it: "Camera & tab-focus monitoring active".', 'Monitoring notice shows.'],
      ['Switch tabs three times.', 'Auto-submitted after the third.'],
      ['Teacher: feed.', 'A high proctoring item for that student.'],
    ] },
  { n: '03', title: 'AI tutor session and exam track', role: 'Student', priority: 'Critical', type: 'Positive', req: ['04'], uat: true,
    pre: 'AI on; the school switched on JEE Main for Class 11.',
    steps: [
      ['AI Tutor: choose a chapter; Start session.', 'A problem and a diagnostic question; the stage bar shows Diagnose.'],
      ['Answer the diagnostic wrongly.', 'Guided steps begin ("1 of N").'],
      ['Answer a guided step wrongly three times.', 'Hint 1 of 2, hint 2 of 2, then the tutor walks through the step.'],
      ['Leave, then reopen the session from Your sessions.', 'The session resumes at the same step with the transcript.'],
      ['Finish the transfer problem and the teach-back.', 'What this session showed: depth, four rubric bars, notes; the session appears in Your sessions.'],
      ['Start with topic "gibberish swear word".', '"Please keep the topic academic."'],
      ['Exam track: choose an exam not switched on.', '"Your school has not switched on that exam track for your class."'],
    ] },
  { n: '04', title: 'Tutor and official curriculum (DEF-001)', role: 'Student (Class 10)', priority: 'High', type: 'Regression', req: ['05'],
    pre: 'AI on.', auto: [`${A.tutor}DEF-001: no official CBSE curriculum line is blocked by the tutor filter`],
    steps: [
      ['Start a tutor session on Heredity › "Sex determination".', 'Expected: the session starts. Today: "Please keep the topic academic." (Fail, DEF-001).'],
      ['In a History session, answer "Around 2500 BC".', 'Expected: judged on content. Today: "Let’s keep it respectful…" (Fail, DEF-001).'],
    ] },
  { n: '05', title: 'Wellness check-in and privacy', role: 'Student, Teacher, Parent', priority: 'High', type: 'Security', req: ['06'], uat: true,
    pre: 'Parent consent on file.',
    steps: [
      ['Wellness Center: tap an energy level.', '"Energy logged as <level>"; the fortnight curve updates.'],
      ['Write a journal entry; Save privately.', 'Listed under Your journal.'],
      ['Teacher and parent views.', 'Neither shows the journal text; only energy feeds the trend.'],
      ['Without parent consent: open Wellness.', '"Your school needs a parent or guardian…"; sharing is off.'],
    ] },
];
