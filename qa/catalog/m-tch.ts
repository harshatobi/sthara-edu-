import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P08', priority: 'High', text: 'Teacher dashboard: assigned classes with class TML, what needs the teacher today (submissions to review, flags), and work due soon; drafts not yet posted are called out.', auto: [`${A.teacher}assembleDesk: rosters, pending review, and class TML from the latest snapshots`] },
  { n: '02', process: 'P08', priority: 'Critical', text: 'Class register: present, absent, late or excused per student for today or one of the last five school days; "Mark all present"; saving tells the feed; three absences in a row reach the class’s teachers. A teacher reporting themselves absent is not a class register.', api: 'POST /api/teacher/attendance', tables: 'attendance', auto: [`${A.j06}1. The class teacher marks everyone present and saves`, `${A.staff}a teacher reporting themselves absent is not a class register`] },
  { n: '03', process: 'P08', priority: 'Critical', text: 'Teachers see and act only on the classes and subjects assigned to them.', auto: [`${A.teacher}teaching scope: subject rows, class-teacher class, and enforcement`, `${A.demoT}rejects student access outside selected class and unassigned classes`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Dashboard for a new and a busy teacher', role: 'Teacher', priority: 'High', type: 'Positive', req: ['01', '03'], uat: true,
    pre: 'One teacher with no classes; one with classes and submissions.',
    steps: [
      ['Teacher with no classes signs in.', '"No classes assigned yet" (the school admin links them).'],
      ['Busy teacher signs in.', 'Your assigned classes with class TML (or "No graded evidence yet"); Needs you today lists submissions to review; Due soon lists posted work.'],
      ['Open class; Heat map.', 'Each opens for that class only.'],
    ] },
  { n: '02', title: 'Take the class register', role: 'Class teacher', priority: 'Critical', type: 'Positive', req: ['02'], uat: true,
    pre: 'Class 10-A with students.', auto: [`${A.j06}1. The class teacher marks everyone present and saves`, `${A.j06}2. The parent’s calendar shows this month’s register`],
    steps: [
      ['Attendance › Class 10-A › Today; Mark all present.', 'Every student Present.'],
      ['Set one student Absent and one Late; Save register.', '"Register saved · 1 absent"; the button reads Saved.'],
      ['Switch to yesterday; mark and save.', 'Saved for yesterday; the last-five-days dots update.'],
      ['Parent of the absent student: Attendance & Calendar.', 'Today shows Absent.'],
    ] },
  { n: '03', title: 'Absence streak reaches the feed', role: 'Class teacher', priority: 'High', type: 'Positive', req: ['02'],
    pre: 'A student marked absent on two school days in a row.', auto: [`${A.feed}absence streaks count marked days; excused days are neutral`],
    steps: [
      ['Mark them absent on the third school day; save.', 'The class’s teachers get a feed item for three absences in a row.'],
      ['Mark a fourth day Excused instead.', 'The streak neither grows nor breaks.'],
    ] },
];
