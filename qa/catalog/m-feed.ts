import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P10', priority: 'Critical', text: 'The situational feed raises items for the right teachers: overdue work (one per assignment, with who is missing), a real TML drop below 50, three low scores in a row, low-energy check-ins (a streak of three is high), absence streaks (excused days neutral), exam-day absences, and proctoring alerts (auto-submit is high).', api: 'POST /api/feed', tables: 'situations', auto: [`${A.feed}overdue work: one item per assignment with the missing students`, `${A.feed}TML drop needs a real fall below 50`, `${A.feed}low scores: three graded pieces under 40% in a row, per teacher`, `${A.feed}absence streaks count marked days; excused days are neutral`, `${A.feed}exam-day absence goes to the assessment teacher`, `${A.feed}proctoring: worst alert per student and task; auto-submit is high`] },
  { n: '02', process: 'P10', priority: 'Critical', text: 'Escalation: an unacknowledged critical item goes to the principal after one hour; a high item at the end of that school day (next school day after hours; Sundays skipped); normal never.', auto: [`${A.feed}escalation: critical 1h, high end of school day, normal never`, `${A.feed}escalated is derived from escalate_at and acknowledgement`] },
  { n: '03', process: 'P10', priority: 'Critical', text: 'Incidents: health (parents told at once), discipline, property and other (class teacher confirms before parents are told), bullying and safety (the principal decides). Child protection is seen by the principal only (POCSO reporting still applies). "Urgent" lifts to critical; closing needs what was done, and a parent decision first.', perm: 'incidents.manage', api: 'POST/PATCH /api/staff/incidents', auto: [`${A.feed}incident routing follows the school policy`] },
  { n: '04', process: 'P10', priority: 'Critical', text: 'Teacher-safe by design: wellness items carry the energy level and whether a note was shared, never journal text; staff see items only for students they teach.', auto: [`${A.feed}wellness: single low check-in vs a streak; never reads notes`] },
  { n: '05', process: 'P10', priority: 'High', text: 'School command view (feed.read / incidents.manage): open items, escalated now, median response, awaiting your decision, registers taken today, open by class, response by staff.', perm: 'feed.read' },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Acknowledge a feed item', role: 'Teacher', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'An overdue homework in the teacher’s class.',
    steps: [
      ['Situational Feed.', 'One item for the assignment listing the students still missing.'],
      ['Acknowledge with "Spoke to the students".', 'It leaves What needs you now; the admin’s Response by staff counts it.'],
    ] },
  { n: '02', title: 'Log incidents by kind (routing)', role: 'Teacher, Principal', priority: 'Critical', type: 'Positive', req: ['03'], uat: true,
    pre: 'Teacher is class teacher of 10-A.', data: 'Health: "Fell on the stairs, grazed knee"; Discipline; Bullying (urgent)',
    steps: [
      ['Log incident, Health, the student, summary; save.', '"Incident logged"; parents are told at once.'],
      ['Log Discipline for a student in 10-A.', '"You are the class teacher. Tell the parents?" with Tell parents / Don’t tell.'],
      ['Close it without saying what was done.', '"Record what was done before closing." Before deciding parents: "Decide on telling parents before closing."'],
      ['Log Bullying, "Urgent: alert the principal within the hour".', 'Critical; the principal’s Incidents that need you lists it with Tell parents / Don’t tell parents.'],
      ['Principal: decide, then Close with outcome.', 'Closed; a teacher trying to close it gets "Only the principal can close this incident."'],
    ] },
  { n: '03', title: 'Child protection is principal-only', role: 'Teacher, Principal, Vice principal', priority: 'Critical', type: 'Security', req: ['03', '04'], uat: true,
    pre: 'Accounts for a teacher, the principal and a VP.',
    steps: [
      ['Teacher: log a Child protection incident.', 'The hint says only the principal sees it and POCSO reporting applies.'],
      ['Teacher and VP: open the feed.', 'Neither sees it.'],
      ['Principal: open the feed.', 'Listed as critical.'],
    ] },
  { n: '04', title: 'Escalation to the principal', role: 'Teacher, Principal', priority: 'High', type: 'Positive', req: ['02', '05'],
    pre: 'A critical item raised at 10:00, not acknowledged.',
    steps: [
      ['At 11:00+, principal: School command view.', 'ESCALATED NOW counts it; it is marked escalated.'],
      ['Teacher acknowledges.', 'No longer escalated; MEDIAN RESPONSE updates.'],
    ] },
];
