import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P06', priority: 'Critical', text: 'Bell schedules: named, for set weekdays, with numbered teaching periods (1–16) and breaks, lunch and assembly, each with start and end times; one regular schedule per wing per day; variants (exam day, half day) can be swapped in for a date; a typical CBSE day can be created in one step.', perm: 'schedule.academic', api: 'PUT/POST/DELETE /api/admin/schedule/setup', tables: 'bell_schedules', auto: [`${A.sched}bells: holiday, variant, wing-specific regular, all-wing fallback`, `${A.sched}bell problems`] },
  { n: '02', process: 'P06', priority: 'High', text: 'Wings group grades (0–12, no overlaps between wings) and can have their own bells; a wing with its own bells can’t be removed until they move.', perm: 'schedule.academic', auto: [`${A.sched}dates and wings`] },
  { n: '03', process: 'P06', priority: 'High', text: 'Rooms: name, type (classroom, lab, hall, library, ground, other), seats, home room of a section.', perm: 'schedule.academic', tables: 'rooms' },
  { n: '04', process: 'P06', priority: 'High', text: 'Academic calendar: holidays, exams, PTMs, staff meetings, events, for the whole school or a wing, up to a year long; a day off suspends classes, or a variant bell schedule is swapped in (not both); everyone’s schedule picks them up.', perm: 'schedule.academic', api: 'PUT/DELETE /api/admin/schedule/calendar', tables: 'calendar_events', auto: [`${A.sched}agenda: a teacher across wings, holiday, leave, events`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Bells from a typical CBSE day, then edit', role: 'Academic coordinator', perm: 'schedule.academic', priority: 'Critical', type: 'Positive', req: ['01'], uat: true,
    pre: 'Schedule › Bells & rooms, empty.',
    steps: [
      ['Start from a typical CBSE day › Build from scratch.', '"Bell schedules created": a regular day with periods, break, lunch and assembly.'],
      ['Edit Period 3 to end before it starts; save.', 'Refused: "<Period 3>: give a start and end time like 08:40."'],
      ['Add a second regular schedule for the same days and wing.', 'Refused: "<name> already covers some of those days for this wing…"'],
      ['Add a variant "Exam day".', 'Saved as a variant (for swapping in on dates).'],
    ] },
  { n: '02', title: 'Wings and rooms', role: 'Academic coordinator', priority: 'High', type: 'Positive', req: ['02', '03'],
    pre: 'Bells exist.', data: 'Wing Primary 1–5; Wing Senior 4–12; Room 204 (classroom, 40, home room of 10-A); Chemistry Lab',
    steps: [
      ['Add wing Primary, grades 1–5.', '"Wing saved".'],
      ['Add wing Senior, grades 4–12.', '"Those grades overlap Primary (1–5). A grade belongs to one wing."'],
      ['Add Room 204 as the home room of 10-A, and a lab.', '"Room saved"; the timetable uses them.'],
      ['Give Primary its own bells, then remove the wing.', '"This wing has its own bell schedules. Remove or move them first."'],
    ] },
  { n: '03', title: 'Calendar: holiday and exam day', role: 'Vice principal', perm: 'schedule.academic', priority: 'High', type: 'Positive', req: ['04'], uat: true,
    pre: 'A published timetable.', data: 'Diwali holiday (3 days); Unit test day with the Exam day bells',
    steps: [
      ['Calendar › add Holiday, 3 days, Whole school, "No classes on these days".', '"Calendar saved"; Upcoming lists it.'],
      ['Teacher: My Schedule on those days.', 'No lessons; the holiday shows.'],
      ['Add the unit test day with Bells: Exam day.', 'Saved; that day follows the exam timings for everyone.'],
      ['Try a day off that also swaps bells.', '"A day off has no bells. Either suspend classes or swap in a bell schedule, not both."'],
      ['Try an entry ending before it starts, and one longer than a year.', '"The end date must be on or after the start date." / "A calendar entry can span at most a year."'],
    ] },
];
