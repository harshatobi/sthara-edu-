import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P07', priority: 'High', text: 'Staff load: timetable against target, lessons taught, covers, duties, invigilation, leave and lates per teacher and by department, with flags for over target and under-used; ranges end today, so lessons not yet taught are not counted (99e7dfe); export for payroll.', auto: [`${A.analytics}load: timetable against target, lessons taught, covers, duties, leave, flags`] },
  { n: '02', process: 'P06', priority: 'High', text: 'My Schedule (teachers and office): today, week and month views of lessons, covers, duties, events and leave, at each wing’s bell times; look up any class’s or room’s timetable; print.', auto: [`${A.sched}agenda: a teacher across wings, holiday, leave, events`] },
  { n: '03', process: 'P06', priority: 'Medium', text: 'Notifications: leave decisions, covers, duties and new timetables appear in the bell; Mark all read.' },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Load for payroll', role: 'HR manager', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'A month with covers, duties and leave; the current month half done.',
    steps: [
      ['Schedule › Load; this month.', 'Per teacher: Timetable / target, Taught, Covers, Duties, Invig., Leave, Late; AVERAGE TIMETABLE, OVER TARGET, UNDER-USED, COVERS.'],
      ['Compare Taught with the timetable.', 'Only lessons up to today are counted as taught.'],
      ['Show: Flagged; Department: Science.', 'Filters apply; Departments table averages.'],
      ['Export for payroll.', 'CSV matching the table.'],
    ] },
  { n: '02', title: 'A teacher’s own schedule', role: 'Teacher', priority: 'High', type: 'Positive', req: ['02', '03'], uat: true,
    pre: 'Published timetable; a cover, a duty and a holiday this week.',
    steps: [
      ['My Schedule › Today.', 'Periods at the right bell times; "YOU’RE EXPECTED" shows reporting time.'],
      ['Week view.', 'Lessons, the cover (for whom), the duty and the holiday.'],
      ['Look up a timetable: a class, then a room.', 'That class’s / room’s week.'],
      ['Print.', 'A clean printable week.'],
      ['Open the bell.', 'The cover and duty notices; Mark all read clears them.'],
    ] },
];
