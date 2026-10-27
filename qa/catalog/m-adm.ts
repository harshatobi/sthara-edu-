import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P03', priority: 'Critical', text: 'Log an enquiry: applicant’s name, grade applied for (1–12), parent or guardian, a 10-digit mobile, how they heard of the school (walk-in, website, referral, sibling, school event, advertisement, other).', perm: 'admissions.manage', api: 'POST /api/admin/admissions', tables: 'admission_applicants', auto: [`${A.j03}1–4. Office logs, moves and closes an applicant`] },
  { n: '02', process: 'P03', priority: 'Critical', text: 'Applicants move forward one stage at a time through the school’s own stages (by default Enquiry → Application → Assessment), then Offer and Enrolled; rejecting or withdrawing needs a reason kept on the record; only a rejected or withdrawn applicant can be reopened; two people moving the same applicant are warned.', perm: 'admissions.manage', api: 'PATCH /api/admin/admissions', tables: 'admission_events', auto: [`${A.admin}admissions: funnel counts furthest stage reached, next steps follow the stages a school sets`] },
  { n: '03', process: 'P03', priority: 'Critical', text: 'Enrolment goes through Sthara: once the family has accepted the offer the school requests enrolment (section, admission number, optional student email, parent email, optionally bill the instalments already raised); an operator approves it and the logins are created; an existing parent account is linked, not duplicated. A pending request can be withdrawn.', perm: 'admissions.manage', api: 'POST/DELETE /api/admin/admissions/enrol, PATCH /api/ops/requests' },
  { n: '04', process: 'P03', priority: 'High', text: 'Funnel and conversion count everyone who reached a stage; conversion between stages shows once three applicants reach a stage; applicants idle over two weeks are flagged; export.', perm: 'admissions.read', auto: [`${A.admin}admissions: funnel counts furthest stage reached, next steps follow the stages a school sets`] },
  { n: '05', process: 'P03', priority: 'Critical', text: 'Each school sets its own stages before the offer: rename, reorder, add (up to 12) or retire them; a stage with applicants in it can’t be retired, two stages can’t share a name, and a retired stage keeps its name in past records. Offer and Enrolled are always last: they can be renamed, not moved or removed. The school sets how many days a family has to accept an offer (1–90).', perm: 'admissions.setup', api: 'POST /api/admin/admissions/setup', tables: 'admission_stages', auto: [`${A.admin}admissions: funnel counts furthest stage reached, next steps follow the stages a school sets`] },
  { n: '06', process: 'P03', priority: 'Critical', text: 'Offers are maker-checker: the admissions office proposes an offer (optionally with a reply-by date and a note) for an applicant at the last of the school’s own stages; the principal or school admin approves or sends it back with a reason; the person who proposed an offer can never approve it. An offer can be cancelled until it goes out.', perm: 'admissions.approve', api: 'POST /api/admin/admissions/offers', tables: 'admission_offers, admission_events' },
  { n: '07', process: 'P03', priority: 'Critical', text: 'Seats per grade for the intake (blank: no limit). An applicant at Offer or enrolled holds a seat. Approving an offer when the grade is full puts the applicant on the waitlist; when a seat frees (an offer declined, lapsed or withdrawn, the applicant rejected or withdrawn, or seats added) the longest-waiting approved applicant gets the offer without a second approval and the proposer is told. Offers not accepted by their date lapse overnight and the applicant is marked withdrawn.', perm: 'admissions.setup', api: 'POST /api/admin/admissions/setup', tables: 'admission_seats, admission_offers' },
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
  { n: '05', title: 'Offer approval and the waitlist', role: 'Admissions officer, Principal', priority: 'Critical', type: 'Positive', req: ['06', '07'], uat: true,
    pre: 'Set up › Seats: Grade 6 has 1 seat. Two Grade 6 applicants (A and B) at the last stage before Offer.', data: 'Note "Assessment 78%"',
    steps: [
      ['Officer: open A; Propose offer; add the note; Send for approval.', '"Offer waiting for approval"; OFFERS TO APPROVE rises; the Approval filter lists A.'],
      ['Officer: look for Approve on A.', 'Not offered: "You proposed this: someone else approves it."'],
      ['Principal: Offers waiting for approval › Send back with nothing typed.', 'Send back stays disabled until a reason is given.'],
      ['Principal: approve A.', '"Offer for A approved and out"; A is at Offer with a reply-by date; Grade 6 shows 0 seats left.'],
      ['Officer: propose B; Principal approves.', '"approved and put on the grade 6 waitlist"; B shows On the waitlist, number 1.'],
      ['Officer: on A, Family declined with a reason.', 'A is Withdrawn; B moves to Offer by itself; the officer gets a notification that B has an offer from the waitlist.'],
    ] },
  { n: '06', title: 'Accept, then enrol', role: 'Admissions officer', priority: 'Critical', type: 'Positive', req: ['03', '06'],
    pre: 'An applicant at Offer with the offer out.',
    steps: [
      ['Look for Request enrolment.', 'Not offered until the family accepts.'],
      ['Family accepted.', '"Offer accepted"; Request enrolment appears.'],
      ['Request enrolment and have Sthara approve it (script 02).', 'Enrolled; the offer shows Enrolled in History.'],
    ] },
  { n: '07', title: 'The school’s own stages', role: 'School admin', perm: 'admissions.setup', priority: 'High', type: 'Positive', req: ['05'],
    pre: 'Set up › Stages.',
    steps: [
      ['Add a stage "Parent interview"; move it up to second; rename Assessment to "Entrance test"; DAYS TO ACCEPT 7; Save stages.', 'Saved; the funnel and filters show the new names and order; an applicant at Enquiry now moves to Parent interview.'],
      ['Retire a stage that has applicants in it.', 'Retire is disabled ("Move its applicants on first").'],
      ['Name two stages the same; save.', '"Two stages have the same name."'],
      ['Admissions officer: look for Set up.', 'Not offered.'],
    ] },
  { n: '08', title: 'Offer lapses overnight', role: 'Admissions officer', priority: 'High', type: 'Negative', req: ['07'],
    pre: 'An offer out with a reply-by date in the past (or wait out the days).',
    steps: [
      ['The next morning, open the applicant.', 'Withdrawn; History: "Offer lapsed: not accepted by <date>"; the seat went to the next family on the waitlist, if any.'],
    ] },

];
