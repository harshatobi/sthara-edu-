import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P03', priority: 'Critical', text: 'Log an enquiry: applicant’s name, grade applied for (1–12), parent or guardian, a 10-digit mobile, how they heard of the school (walk-in, website, referral, sibling, school event, advertisement, other).', perm: 'admissions.manage', api: 'POST /api/admin/admissions', tables: 'admission_applicants', auto: [`${A.j03}1–4. Office logs, moves and closes an applicant`] },
  { n: '02', process: 'P03', priority: 'Critical', text: 'Applicants move forward one stage at a time (Enquiry → Application → Assessment → Offer → Enrolled); rejecting or withdrawing needs a reason kept on the record; only a rejected or withdrawn applicant can be reopened; two people moving the same applicant are warned.', perm: 'admissions.manage', api: 'PATCH /api/admin/admissions', tables: 'admission_events', auto: [`${A.admin}admissions: funnel counts furthest stage reached, moves are validated`] },
  { n: '03', process: 'P03', priority: 'Critical', text: 'Enrolment goes through Sthara: from Offer the school requests enrolment (section, admission number, optional student email, parent email, optionally bill the instalments already raised); an operator approves it and the logins are created; an existing parent account is linked, not duplicated. A pending request can be withdrawn.', perm: 'admissions.manage', api: 'POST/DELETE /api/admin/admissions/enrol, PATCH /api/ops/requests' },
  { n: '04', process: 'P03', priority: 'High', text: 'Funnel and conversion count everyone who reached a stage; conversion between stages shows once three applicants reach a stage; applicants idle over two weeks are flagged; export.', perm: 'admissions.read', auto: [`${A.admin}admissions: funnel counts furthest stage reached, moves are validated`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Enquiry through to rejection', role: 'Admissions officer', perm: 'admissions.manage', priority: 'Critical', type: 'Positive', req: ['01', '02'], uat: true,
    pre: 'Admissions page.', data: 'Aarav Sharma, Grade 6, parent Neha Sharma, 9800000000, Website',
    auto: [`${A.j03}1–4. Office logs, moves and closes an applicant`],
    steps: [
      ['New enquiry; Add enquiry with nothing filled.', 'Refused with a message.'],
      ['Enter a 9-digit mobile.', '"Enter a 10-digit mobile number (with country code if outside India)."'],
      ['Fill it all correctly; Add enquiry.', 'The record opens at Enquiry; APPLICANTS rises.'],
      ['Move to application, then Move to assessment; set ASSESSMENT DATE; Save details.', 'Stage updates; History lists each move with who and when.'],
      ['Reject; Confirm is disabled until REASON FOR REJECTION is filled; confirm.', 'Rejected; the reason stays on the record; Reopen is offered.'],
      ['Reopen.', 'Back in the furthest open stage it reached.'],
    ] },
  { n: '02', title: 'Offer to enrolled, with Sthara', role: 'Admissions officer, Sthara operator, Parent', priority: 'Critical', type: 'Positive', req: ['03'], uat: true,
    pre: 'An applicant at Offer; Grade 6 has Instalment 1 raised.', data: 'Section 6-A, admission no. 6021, parent email; bill instalments ticked',
    steps: [
      ['Request enrolment: SECTION 6-A, ADMISSION NO. 6021, PARENT EMAIL; tick "Raise the fee instalments already billed…"; send.', '"Enrolment is with Sthara" card with the details.'],
      ['Operator: Login requests › approve.', 'Student and parent logins are created (passwords shown once to the operator); the parent is linked if they already had an account.'],
      ['Office: the applicant.', 'Enrolled; ENROLLED rises.'],
      ['Accountant: the family’s account.', 'Instalment 1 is invoiced to the new student.'],
      ['Parent signs in.', 'Their child and the invoice show.'],
    ] },
  { n: '03', title: 'Stage rules', role: 'Admissions officer', priority: 'High', type: 'Negative', req: ['02', '03'],
    pre: 'An applicant at Enquiry; another at Offer with a pending enrolment request.',
    steps: [
      ['Try to set Enrolled directly (e.g. via a second tab after a move).', '"Enrolment goes through Sthara: open the applicant and use Request enrolment."'],
      ['Two officers move the same applicant at once.', 'The second: "Someone else just moved this applicant. Refresh and try again."'],
      ['Withdraw the pending enrolment request; withdraw again.', 'Withdrawn; then "There is no pending request to withdraw."'],
    ] },
  { n: '04', title: 'Funnel, conversion and export', role: 'Vice principal', perm: 'admissions.read', priority: 'Medium', type: 'Positive', req: ['04'],
    pre: 'At least 10 applicants across stages.',
    steps: [
      ['Read Funnel, By grade and source, IDLE OVER 2 WEEKS.', 'A rejection at assessment still counts as an application; conversion shows only where 3+ reached a stage.'],
      ['Vice principal: look for New enquiry.', 'Not offered (read only).'],
      ['Export.', 'CSV of applicants with stage and source.'],
    ] },
];
