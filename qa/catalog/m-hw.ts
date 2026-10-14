import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P08', priority: 'Critical', text: 'Homework and classwork: title, due date, class, subject, chapter (the TML topic), instructions, answered typed in the app or as a photo of written work, optionally proctored; questions are short answer, multiple choice (click a letter for the key) or photo answer, with marks. Posting needs a title, a due date and a question; drafts can be saved.', api: 'POST/PATCH/DELETE /api/teacher/assignments', tables: 'assignments', auto: [`${A.j04}1. Teacher posts typed homework to the class`, `${A.teacher}sanitizeQuestions accepts a valid mixed paper and totals marks`, `${A.teacher}sanitizeQuestions reports what a teacher must fix`] },
  { n: '02', process: 'P08', priority: 'Critical', text: 'Quizzes are multiple choice only and are marked the moment a student submits (counted as confirmed; no AI).', auto: [`${A.j05}1. Teacher posts a one-question multiple-choice quiz`, `${A.j05}2–3. The student answers correctly and is graded on submit`, `${A.teacher}suggestedScores marks MCQs from the key and leaves written answers to the teacher`] },
  { n: '03', process: 'P08', priority: 'High', text: 'Once a student has submitted, the questions, class and type are locked (title, description and due date stay editable); a teacher changes only their own work; deleting work with hand-ins warns how many students it affects.', api: 'PATCH/DELETE /api/teacher/assignments' },
  { n: '04', process: 'P08', priority: 'High', text: 'AI generation of questions from a chapter (and topic): generated items are checked and broken ones dropped; nothing is posted until the teacher posts it.', api: 'POST /api/teacher/quiz-gen, /homework-gen', auto: [`${A.teacher}fromGenerated maps both AI generator formats and drops broken items`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Post typed homework (validation, then post)', role: 'Teacher', priority: 'Critical', type: 'Positive', req: ['01'], uat: true,
    pre: 'Teacher of 10-A Science.', data: 'Title "Photosynthesis — Level 1", due in 7 days, one short answer',
    auto: [`${A.j04}1. Teacher posts typed homework to the class`],
    steps: [
      ['Homework › Assign homework; Post to 10-A with nothing filled.', '"Give it a title."'],
      ['Add a title; post.', '"Set a due date before posting." / "Add at least one question before posting."'],
      ['Set the due date, CHAPTER, "Typed in the app"; add a Short answer with marks; Post to 10-A.', 'Posted; the card shows 0/N IN.'],
      ['Save another as a draft.', 'The dashboard says "Draft not posted: <title>"; students don’t see it.'],
    ] },
  { n: '02', title: 'Post a quiz marked instantly', role: 'Teacher, Student', priority: 'Critical', type: 'Positive', req: ['02'], uat: true,
    pre: 'Teacher and a student in the class.', auto: [`${A.j05}1. Teacher posts a one-question multiple-choice quiz`, `${A.j05}2–3. The student answers correctly and is graded on submit`, `${A.j05}4. The teacher’s quiz shows the hand-in`],
    steps: [
      ['Quiz Creator › New quiz.', 'Only Multiple choice can be added (TYPE: "QUIZ · multiple choice, marked instantly").'],
      ['Add "2 + 2 = ?" with A 3, B 4, C 5, D 22; click B as correct; post.', 'Posted.'],
      ['Student: open it, pick B, submit.', '"Graded" 1/1 straight away.'],
      ['Teacher: the quiz.', '1/N IN; the student is marked.'],
    ] },
  { n: '03', title: 'Locked after the first hand-in', role: 'Teacher', priority: 'High', type: 'Negative', req: ['03'],
    pre: 'Homework with one submission.',
    steps: [
      ['Edit: change a question or the class.', 'Locked: "Students have already submitted, so the questions, class and type are locked…"'],
      ['Change the due date; save.', 'Saved.'],
      ['Delete.', 'A warning names how many students submitted; Confirm delete / Keep it.'],
    ] },
  { n: '04', title: 'Generate questions from a chapter', role: 'Teacher', priority: 'Medium', type: 'Positive', req: ['04'],
    pre: 'AI on; a chapter chosen.', data: '5 questions from "Life Processes"',
    steps: [
      ['Pick CHAPTER and TOPIC; generate 5.', 'Questions appear for review; with no chapter: "Pick a chapter (and a topic if you like) to generate from."'],
      ['Edit one, remove one; post.', 'Only what the teacher kept is posted.'],
      ['Generate 16 times in 10 minutes.', '"Too many generations. Try again in a few minutes."'],
    ] },
];
