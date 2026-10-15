import type { ScriptDef } from './types';

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Mark a teacher absent and cover their lessons', role: 'Vice principal', perm: 'schedule.academic', priority: 'Critical', type: 'Positive', req: ['01', '02', '03'], uat: true,
    pre: 'A published timetable; teacher T has 5 lessons today; teachers U and V are free in some.', data: 'T absent, full day, "Fever"',
    steps: [
      ['Schedule › Cover › Today › Mark absent: T, Full day, reason.', 'NEED COVER shows T’s lessons; AWAY lists T.'],
      ['Open a lesson.', 'Free teachers ranked: same subject first, then same class, fewest covers, lightest day.'],
      ['Assign U; Confirm.', '"U covers <subject>, P<n>"; COVERED rises; U is notified.'],
      ['U: My Schedule.', 'The cover shows as a lesson "for T".'],
      ['T (on return): My Schedule for that day.', 'Each lesson shows who covered it.'],
      ['Print cover sheet.', 'A printable sheet for the day.'],
    ] },
  { n: '02', title: 'Cover cap, release by period, and not needed', role: 'Vice principal', priority: 'High', type: 'Boundary', req: ['01', '02'],
    pre: 'U already has the daily maximum of covers.',
    steps: [
      ['Assign U to another lesson.', '"U already has N covers that day. Confirm to give them another."; "Assign anyway" is offered.'],
      ['Release for periods: a teacher for P3–P4, reason "Training".', 'Only P3–P4 need cover. With no reason: "Say why they are released (training, event duty)."'],
      ['Mark a lesson Not needed; Undo.', 'Leaves the list; Undo restores it.'],
      ['Mark absent for a date 3 weeks ahead.', '"Pick a date within the last … or next … days."'],
    ] },
  { n: '03', title: 'Substitute flags a problem', role: 'Teacher', priority: 'Medium', type: 'Positive', req: ['03'],
    pre: 'A cover assigned to the teacher.',
    steps: [
      ['My Schedule › the cover › Flag a problem with no text.', '"Say what the problem is."'],
      ['Flag "Clashes with my lab duty".', 'Sent; the office sees the flag on the cover board.'],
    ] },
  { n: '04', title: 'Duty roster with clash checks', role: 'HR manager', perm: 'schedule.workforce', priority: 'High', type: 'Positive', req: ['04', '05'], uat: true,
    pre: 'A published timetable.', data: 'Post "Main gate, morning", Gate, Mon–Fri 07:30–08:00, 2 people',
    steps: [
      ['Duties › Add post; save.', '"Post saved"; it appears in the Weekly duty roster.'],
      ['Put a teacher on it at a time they teach.', '"<Name> teaches <subject> in <class> at <time> on Mondays."; "Assign anyway" is offered.'],
      ['Put them on two posts at the same time.', '"<Name> is already on <post> at that time on Mondays."'],
      ['Add a dated invigilation duty; save.', '"Duty saved; they have been told".'],
      ['Read Fairness this session.', 'Covers, roster, duties and comp-off per person; "Carrying more than most" compares teachers with teachers.'],
    ] },
  { n: '05', title: 'Grant and withdraw comp-off', role: 'HR manager', priority: 'High', type: 'Positive', req: ['06'], uat: true,
    pre: 'A teacher did Annual Day duty on a Sunday.', data: 'One day; note "Annual Day on Sunday, 8 am to 2 pm"',
    steps: [
      ['Grant comp-off with no note.', '"Add a note: what the duty was and why it earns a day."'],
      ['Grant one day with the note.', '"Comp-off granted".'],
      ['Grant again for the same duty.', '"A comp-off was already granted for that duty."'],
      ['Teacher: Apply Leave.', 'A Compensatory leave balance of 1 shows.'],
      ['HR: Withdraw the grant.', 'The teacher’s compensatory balance returns to 0.'],
    ] },
];
