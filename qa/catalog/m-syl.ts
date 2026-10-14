import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P08', priority: 'High', text: 'Syllabus coverage: the official curriculum for each class and subject in NCERT order, chapters marked taught, in progress or not started; "taught, not assessed" flagged; CBSE learning outcomes per chapter; class TML per chapter.', auto: [`${A.course}courseChapters puts Class 9 Science in NCERT order and numbers 1…n`, `${A.course}coverage, pace and summary from saved progress`, 'cmd:src/lib/curriculum/validate.ts'] },
  { n: '02', process: 'P08', priority: 'Medium', text: 'Pacing: term dates and periods per week (1–20; periods 20–120 minutes) auto-plan every chapter’s window, weighted by periods; the teacher can adjust windows.', api: 'PUT /api/teacher/course', auto: [`${A.course}autoPace fills the term contiguously, weighted by periods`, `${A.course}date helpers are timezone-proof calendar math`] },
  { n: '03', process: 'P08', priority: 'High', text: 'Lesson planner: objectives, success criteria, prior knowledge, staged sequence adding up to the lesson length (10–240 min), support, stretch, exit check, materials, homework link, reflection; an AI draft replaces content only when accepted and is labelled; print; copy to another section; "Save & mark taught" updates coverage.', api: 'POST/PATCH/DELETE /api/teacher/lessons, POST /lessons/draft', auto: [`${A.course}default lesson stages add up to the lesson length`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Coverage and pacing for a class', role: 'Teacher', priority: 'High', type: 'Positive', req: ['01', '02'], uat: true,
    pre: 'Teacher of Class 9 Science.',
    steps: [
      ['Syllabus › Coverage.', 'Chapters in NCERT order with learning outcomes; filters All / In progress / Not started / Completed / Taught, not assessed.'],
      ['Mark chapter taught.', 'Counted as taught; flagged "taught, not assessed" until work is posted on it.'],
      ['Pacing plan: set the term and 5 periods a week; Re-plan all chapters.', 'Windows fill the term contiguously; "This replaces every chapter’s window." / Keep mine.'],
      ['Set periods per week to 25.', '"Periods per week must be between 1 and 20."'],
    ] },
  { n: '02', title: 'Plan, draft with AI, teach and print a lesson', role: 'Teacher', priority: 'High', type: 'Positive', req: ['03'], uat: true,
    pre: 'AI on.', data: 'Chapter "The Fundamental Unit of Life", 40 minutes',
    steps: [
      ['Lesson planner › Add lesson; pick the chapter; add an objective from the CBSE outcomes.', 'Saved as DRAFT.'],
      ['Draft with AI (focus "lab demo").', '"Replaces the plan’s current content." Keep mine / accept; accepted content carries "Contains AI-drafted content. Review every part…".'],
      ['Set length 300 minutes.', '"Duration must be 10 to 240 minutes."'],
      ['Print plan; Copy to section 9-B.', 'A clean print; a copy for 9-B.'],
      ['Save & mark taught.', 'TAUGHT; the chapter’s topics count as taught in Coverage.'],
    ] },
];
