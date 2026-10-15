import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P12', priority: 'High', text: 'Command Centre: enrolment, teaching staff, evidence coverage, students at risk, overdue fees and today’s collections; TML by grade; what needs a decision; recent activity; fees at a glance.', perm: 'dashboard.view', auto: [`${A.admin}admin desk assembles school-wide academics from real rows`] },
  { n: '02', process: 'P12', priority: 'Medium', text: 'Board pack: a printable summary (A4 PDF and spreadsheet) of learning, fees and the next intake, staff, wellbeing and data protection.', perm: 'boardpack.view' },
  { n: '03', process: 'P12', priority: 'High', text: 'Probe raises findings in every area the viewer’s roles cover, ranked by severity, each with evidence and actions (nudge a teacher, ask parents for consent). Acknowledged findings stay hidden until they get worse; snoozed ones until the date.', perm: 'probe.view', api: 'POST /api/admin/probe', auto: [`${A.probe}a school admin sees findings in every area, ranked by severity`, `~${A.probe}findings follow the viewer`, `${A.probe}acknowledged findings stay hidden until they get worse; snoozes until the date`] },
  { n: '04', process: 'P12', priority: 'Medium', text: 'A teacher is nudged at most once in 24 hours; consent requests go only to families missing that consent.', api: 'POST /api/admin/probe · nudge_teacher, request_consent', auto: [`${A.probe}consent requests target only families missing that consent`] },
  { n: '05', process: 'P12', priority: 'High', text: 'Ask the School OS (school leadership): questions about the whole school, answered only from the areas the asker’s roles allow; names leave the school as tokens and come back restored; actions need confirming.', perm: 'os.ask', api: 'POST /api/staff/ask', auto: [`${A.staff}staff ask protocol: tokens, targets, WhatsApp text`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Command Centre shows the school at a glance', role: 'Principal', perm: 'dashboard.view', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'Test school with students, graded work, invoices and a leave request.', auto: [`~${A.portals}Dashboard (/admin)`],
    steps: [
      ['Sign in as the principal.', 'Command Centre: school name, "Command Centre · AY 2026–27", plan and student count.'],
      ['Read the six tiles.', 'ENROLMENT, TEACHING STAFF, EVIDENCE COVERAGE, STUDENTS AT RISK, OVERDUE, COLLECTED TODAY match the underlying pages.'],
      ['Read What needs a decision.', 'The pending leave request, overdue fees, weak subjects and compliance gaps are listed; each opens its page.'],
      ['With no graded work yet (new school).', '"No graded evidence yet" with the explanation, not zeros that look like results.'],
    ] },
  { n: '02', title: 'Print the board pack', role: 'Principal', perm: 'boardpack.view', priority: 'Medium', type: 'Positive', req: ['02'],
    pre: 'Data as above.',
    steps: [
      ['Export board pack.', 'The board pack opens: At a glance, For the board’s attention, TML by grade, fees, staff, wellbeing, DPDP.'],
      ['Download PDF.', 'A4 pages; the cover fits one sheet; no blank pages.'],
      ['Spreadsheet.', 'Downloads with the same figures.'],
    ] },
  { n: '03', title: 'Work a Probe finding: acknowledge, snooze, nudge', role: 'Principal', perm: 'probe.view', priority: 'High', type: 'Positive', req: ['03', '04'], uat: true,
    pre: 'A falling class and a teacher with a grading backlog.', data: 'Snooze until next Friday',
    steps: [
      ['Open Probe; filter Minimum severity to High and above.', 'Findings ranked by severity, each with evidence, likely causes and actions.'],
      ['Acknowledge a finding with a note.', 'It leaves the list; it comes back only if it gets worse.'],
      ['Snooze another until next Friday.', 'Hidden until that date. A date today or earlier: "Pick a date after today."'],
      ['Nudge the teacher with a message; nudge again.', 'Sent; the second time: "<Name> was already nudged in the last 24 hours."'],
    ] },
  { n: '04', title: 'Probe shows each office role only its areas', role: 'Accountant, Admissions officer', priority: 'High', type: 'Security', req: ['03'],
    pre: 'Accountant and admissions-officer accounts.', auto: [`~${A.probe}findings follow the viewer`],
    steps: [
      ['As the accountant, open Probe.', 'Only fee findings.'],
      ['As the admissions officer, open Probe.', 'Only admissions findings.'],
    ] },
  { n: '05', title: 'Ask the School OS as leadership', role: 'Principal', perm: 'os.ask', priority: 'High', type: 'Positive', req: ['05'], uat: true,
    pre: 'AI on.', data: '"Which classes are behind on homework this week?"',
    steps: [
      ['Ask the School OS: type the question; send.', '"Reading the school’s records…", then an answer naming real classes and students.'],
      ['Ask it to message a class teacher.', 'A draft appears with Confirm / "Not now"; nothing is sent until confirmed.'],
      ['As a cashier (no os.ask), open /admin/ask.', 'Not in the menu; the route refuses: "Ask the School OS is for teachers and school leadership …".'],
    ] },
];
