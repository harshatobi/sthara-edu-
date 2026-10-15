import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P08', priority: 'Critical', text: 'Written answers are never marked automatically: they wait for the teacher, who marks every question (0 to its marks, in halves), adds feedback and confirms; only then does the grade count toward TML and reach the student and parent.', api: 'POST /api/teacher/review-submission', auto: [`${A.j04}3. The teacher marks it and confirms the grade`, `${A.j04}4. The student sees the confirmed grade and the teacher’s feedback`, `${A.demoT}AI grades remain pending until teacher approval`] },
  { n: '02', process: 'P08', priority: 'Critical', text: 'Capture notebooks: the teacher photographs each student’s pages (up to the page limit, under 3 MB each); the AI reads the handwriting and suggests a mark per question with reasons and flags (a missing page, another student’s name); the teacher confirms every mark; pages live in a private store bound to school, assignment and student.', api: 'POST/PATCH /api/teacher/capture, POST /api/grading/pages', auto: [`${A.hw}parseGrade clamps marks, fills missing answers, keeps pages in range`, `${A.hw}page paths are bound to school, assignment and student`, `${A.hw}name on the page is compared loosely with the student`] },
  { n: '03', process: 'P08', priority: 'High', text: 'Reversals: a confirmed grade can be reopened for review, and work can be removed, each with a reason; history is kept.', api: 'PATCH/DELETE /api/teacher/submissions', auto: [`${A.demoT}amendments require a reason and retain original approval history`] },
  { n: '04', process: 'P08', priority: 'High', text: 'Teachers grade only work for classes they teach.', auto: [`${A.teacher}teaching scope: subject rows, class-teacher class, and enforcement`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Mark and confirm typed work', role: 'Teacher', priority: 'Critical', type: 'Positive', req: ['01'], uat: true,
    pre: 'A student has submitted typed homework with two questions.',
    auto: [`${A.j04}3. The teacher marks it and confirms the grade`, `${A.j04}4. The student sees the confirmed grade and the teacher’s feedback`, `${A.j04}5. The parent sees it under Recently graded`],
    steps: [
      ['Open the assignment › the student’s submission.', 'Their answers per question; "Teacher review pending" on the student’s side.'],
      ['Confirm grade with question 2 unmarked.', '"Give a mark for question 2…"'],
      ['Enter a mark above the maximum.', 'Refused: "Question 1: mark must be between 0 and <max>."'],
      ['Mark both, add feedback, Confirm grade.', 'Confirmed; the button becomes "Update grade"; "Confirming makes this mark count toward <name>’s True Mastery Level and notifies them."'],
      ['Student: View report.', 'Score, feedback, "Confirmed by your teacher…"; parent sees it under Recently graded.'],
    ] },
  { n: '02', title: 'Capture and AI-read handwritten work', role: 'Teacher', priority: 'Critical', type: 'Positive', req: ['02'], uat: true,
    pre: 'AI on; "Photo of written work" homework; notebooks for 3 students.',
    steps: [
      ['Assignment › Capture notebooks; pick a student; photograph their pages; Read with AI and next.', 'The student moves to AI reading, then To review.'],
      ['Add more pages than allowed.', '"Up to N pages per student."'],
      ['Open a reviewed student.', 'Pages with zoom; suggested marks per question with reasons; "The AI flagged: …" when a page is missing or another name is on it.'],
      ['Change one mark; Confirm.', 'Confirmed; AI MARKS KEPT reflects the agreement rate.'],
      ['Try to capture again for a graded student.', '"This work is already graded. Change the marks in review instead."'],
    ] },
  { n: '03', title: 'Reopen a confirmed grade; remove work', role: 'Teacher', priority: 'High', type: 'Positive', req: ['03'],
    pre: 'A confirmed grade.',
    steps: [
      ['History › Reopen for review with no reason.', '"Say why the grade is being reopened."'],
      ['Reopen with a reason.', 'Back in review; the withdrawn marks are kept in history; the student no longer sees it as confirmed.'],
      ['Remove a piece of confirmed work.', '"This work is graded. Reopen it for review first."'],
    ] },
  { n: '04', title: 'No grading outside your classes', role: 'Teacher', priority: 'High', type: 'Security', req: ['04'],
    pre: 'A submission in a class the teacher does not teach.',
    steps: [
      ['Open its address directly.', 'Refused: "You can only review work for classes you teach."'],
    ] },
];
