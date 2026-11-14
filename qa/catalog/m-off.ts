import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P12', priority: 'High', text: 'Command Centre: enrolment, teaching staff, evidence coverage, students at risk, overdue fees and today’s collections; TML by grade; what needs a decision; recent activity; fees at a glance.', perm: 'dashboard.view', auto: [`${A.admin}admin desk assembles school-wide academics from real rows`] },
  { n: '02', process: 'P12', priority: 'Medium', text: 'Board pack: a printable summary (A4 PDF and spreadsheet) of learning, fees and the next intake, staff, wellbeing and data protection.', perm: 'boardpack.view' },
  { n: '03', process: 'P12', priority: 'High', text: 'Probe raises findings in every area the viewer’s roles cover, ranked by severity, each with evidence and actions (nudge a teacher, ask parents for consent). Acknowledged findings stay hidden until they get worse; snoozed ones until the date.', perm: 'probe.view', api: 'POST /api/admin/probe', auto: [`${A.probe}a school admin sees findings in every area, ranked by severity`, `~${A.probe}findings follow the viewer`, `${A.probe}acknowledged findings stay hidden until they get worse; snoozes until the date`] },
  { n: '04', process: 'P12', priority: 'Medium', text: 'A teacher is nudged at most once in 24 hours; consent requests go only to families missing that consent.', api: 'POST /api/admin/probe · nudge_teacher, request_consent', auto: [`${A.probe}consent requests target only families missing that consent`] },
  { n: '05', process: 'P12', priority: 'High', text: 'Ask the School OS for every office role: opens on today’s cards, what Probe noticed and trends for the asker’s areas; answers run live lookups (student, class, attendance, homework, fees, admissions, staff, exams, timetable, calendar) only where the asker’s roles allow, cite numbered sources, can show a table or chart; conversations are saved to the account (search, pin, delete) and an answer can be shared with a colleague, hidden where their role can’t see it; names leave the school as tokens; actions need confirming.', perm: 'dashboard.view', api: 'POST /api/ask · /api/ask/conversations · /api/ask/share · GET /api/ask/today', auto: [`${A.staff}staff ask protocol: tokens, targets, WhatsApp text`, 'app:src/lib/ask/protocol.test.ts::parseAnswer: cited sources only, renumbered, with what they need', 'app:src/lib/ask/protocol.test.ts::canSee: permissions, classes, either-of, self and school', 'app:src/lib/ask/protocol.test.ts::lookups follow the role'] },
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
  { n: '05', title: 'Ask the School OS as office staff', role: 'Principal', perm: 'dashboard.view', priority: 'High', type: 'Positive', req: ['05'], uat: true,
    pre: 'AI on.', data: '"Why is 9-B slipping in Science?"',
    steps: [
      ['Open Ask the School OS.', 'Page fills the screen: history on the left, "Today for you" cards, "Worth a look" findings and "At a glance" trends; no empty space below.'],
      ['Type the question; send.', '"Looked up" chips (class overview, 9-B Science…), an answer with numbered citations, a SOURCES list linking to the screens, a table or chart where it helps.'],
      ['Reload the page on another device.', 'The conversation is in Recent; Pin moves it to Pinned; search finds it by a word in the answer.'],
      ['Share the answer with a teacher who does not teach 9-B.', 'It appears under "Shared with you" for them, hidden where their role can’t see it.'],
      ['As a cashier, open /admin/ask and ask about mastery.', 'Ask is in the menu; fee questions answer with fee lookups; the mastery question says it is outside their role.'],
    ] },
];
