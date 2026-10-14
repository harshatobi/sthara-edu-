import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P05', priority: 'Critical', text: 'Teachers apply for leave (type, dates or a half day, reason); overlaps, ranges over 180 days and dates more than 30 days back are refused; pending or not-yet-started leave can be withdrawn.', api: 'POST/PATCH /api/teacher/leave', tables: 'leave_requests', auto: [`${A.j01}1. Teacher applies for one day of casual leave`] },
  { n: '02', process: 'P05', priority: 'Critical', text: 'The office approves or rejects; a rejection needs a reason the teacher sees; a decided request cannot be decided again; approving beyond entitlement needs "Approve anyway" with a reason.', perm: 'leave.approve', api: 'PATCH /api/admin/leave', auto: [`${A.j01}2. The office sees the request with the reason and rejects it with a note`, `${A.j01}3. The teacher sees it as not approved, with the office’s reason`, `${A.probe}leave balances and entitlement checks`] },
  { n: '03', process: 'P05', priority: 'High', text: 'Entitlements per leave type per session (0–366 days, in half days); balance = entitled − taken − pending; compensatory leave is capped at comp-off granted.', perm: 'leave.policy', api: 'PUT /api/admin/leave-policy', tables: 'leave_policies', auto: [`${A.cover}compensatory leave is capped at granted comp-off days`] },
  { n: '04', process: 'P05', priority: 'Medium', text: 'Workforce view: each teacher’s classes, class TML on taught subjects, activity, grading backlog and leave over 30 days; exportable.', perm: 'workforce.read', auto: [`${A.admin}workforce: class TML on taught subjects, backlog, activity, leave`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Leave from request to decision (end to end)', role: 'Teacher, HR manager', priority: 'Critical', type: 'Positive', req: ['01', '02'], uat: true,
    pre: 'Entitlements set; a teacher and an HR manager.', data: 'Casual leave, one day next month; reason "Family function"',
    auto: [`${A.j01}1. Teacher applies for one day of casual leave`, `${A.j01}2. The office sees the request with the reason and rejects it with a note`, `${A.j01}3. The teacher sees it as not approved, with the office’s reason`],
    steps: [
      ['Teacher: Apply Leave › New request: Casual leave, the date, the reason; Send for approval.', '"Leave request sent"; My requests shows it as AWAITING APPROVAL; the balance tile shows "1 awaiting approval".'],
      ['HR: Staff & Leave › Leave requests.', 'Listed with the reason, days, classes to cover, and the balance left after it.'],
      ['HR: Approve.', 'Teacher sees APPROVED and is notified.'],
      ['Teacher: apply again for a different day; HR: Reject with no reason.', '"Confirm reject" stays disabled until a reason is typed.'],
      ['HR: reject with a reason.', 'Teacher sees NOT APPROVED and Office: "<reason>".'],
    ] },
  { n: '02', title: 'Leave rules refuse bad requests', role: 'Teacher', priority: 'High', type: 'Negative', req: ['01'],
    pre: 'An approved leave on 10 Nov.', data: 'Overlap 9–11 Nov; 200-day range; 40 days ago; half day across two dates',
    steps: [
      ['Apply 9–11 Nov.', '"You already have leave from … that overlaps these dates."'],
      ['Apply for 200 days.', '"That range is over 180 days. Talk to the office about long leave."'],
      ['Apply for a day 40 days ago.', '"Leave more than 30 days in the past has to be recorded by the office."'],
      ['Send with no reason.', '"Give a reason."'],
      ['Withdraw the approved 10 Nov leave (not started).', 'WITHDRAWN.'],
    ] },
  { n: '03', title: 'Beyond entitlement and the leave policy', role: 'HR manager', perm: 'leave.policy', priority: 'High', type: 'Boundary', req: ['02', '03'],
    pre: 'Casual leave 12 days a year; a teacher with 11.5 taken.', data: 'A 2-day casual request',
    steps: [
      ['Leave policy: set Casual to 12.25.', '"Days must be between 0 and 366, in half days."'],
      ['Open the 2-day request.', '"1.5 days beyond entitlement" in red.'],
      ['Approve.', 'Asked "Why approve anyway"; "Approve anyway" needs a reason; saved on the request.'],
    ] },
  { n: '04', title: 'Workforce view and export', role: 'Principal', perm: 'workforce.read', priority: 'Medium', type: 'Positive', req: ['04'],
    pre: 'Teachers with posted and graded work.',
    steps: [
      ['Staff & Leave: read Teacher effectiveness.', 'Each teacher: classes, students, class TML, activity (last 30 days), grading backlog, on leave today.'],
      ['Export.', 'A CSV with the same rows and the leave history.'],
    ] },
];
