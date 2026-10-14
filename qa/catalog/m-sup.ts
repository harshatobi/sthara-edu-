/** School Manager support tab (ops-school-manager @ e00f683): /ops/schools/:id?tab=support. */
import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P01', priority: 'Critical', text: 'Family links: students with no verified parent and pending links are listed; an operator can link (verified), verify, unverify or unlink; the guardian record and the parent’s linked roll numbers are kept in step.', api: 'POST /api/ops/schools/[id]/support · link, verify, unverify, unlink', tables: 'guardians, users.metadata' },
  { n: '02', process: 'P01', priority: 'High', text: 'Class moves: move picked students to a class (refused as a whole if any is not a student of this school); year-end promotion moves every student still in a class, and not marked as left, to the next.', api: 'POST /api/ops/schools/[id]/support · move, promote' },
  { n: '03', process: 'P01', priority: 'Critical', text: 'Left the school: sign-in is blocked while the record and history are kept; reversible; the school’s last active school admin can’t be marked left.', api: 'POST /api/ops/schools/[id]/support · left, returned' },
  { n: '04', process: 'P01', priority: 'High', text: 'Bulk corrections from CSV (email, then any of name, new_email, roll_no, class; blank = unchanged; at most 500): a preview first; all or nothing if any row has a problem; a row already matching is skipped; two rows can’t claim the same new email or roll number; parents follow a changed roll number; each row reports what happened.', api: 'POST /api/ops/schools/[id]/support · preview, apply', auto: [`${A.corrections}csv: needs email plus a column to correct; blank cells mean unchanged`, `${A.corrections}plan: refusals`, `${A.corrections}plan: two rows cannot claim the same new email or roll number`, `${A.corrections}plan: a row that already matches is skipped, not refused`] },
  { n: '05', process: 'P13', priority: 'Critical', text: 'Every support write needs a reason (4+ characters) and is written to the audit log as the operator.', tables: 'audit_log', auto: [`${A.guards}every /api/ops route is operator-only; every /api/admin route checks the office or the caller’s role`] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Link a parent to a student and verify it', role: 'Sthara operator, Parent', priority: 'Critical', type: 'Positive', req: ['01', '05'], uat: true,
    pre: 'A student with no verified parent; the parent has a login.', data: 'Reason "Parent confirmed by phone with the office"',
    steps: [
      ['Schools › the school › Support › Family links.', 'The student is listed under "no verified parent".'],
      ['Link the parent with no reason.', '"Give a reason (at least 4 characters). It goes in the audit log."'],
      ['Link with the reason.', 'Linked and verified; the student leaves the list.'],
      ['Parent signs in.', 'The child appears on Home; fee reminders can now reach them.'],
      ['Audit log: filter the school.', 'The link with the reason, as the operator.'],
      ['Unlink with a reason.', 'The parent no longer sees the child.'],
    ] },
  { n: '02', title: 'Year-end promotion and moving students', role: 'Sthara operator', priority: 'High', type: 'Positive', req: ['02', '05'], uat: true,
    pre: 'Class 9-A with students, one marked as left; class 10-A exists.',
    steps: [
      ['Class moves › Promote 9-A to 10-A with a reason.', 'Every student still in 9-A moves to 10-A except the one marked left.'],
      ['Promote with only one class picked.', '"Pick both classes."'],
      ['Move two picked students to 10-B.', 'Moved; their teachers and registers follow the new class.'],
      ['Move a mix of a student and a teacher.', 'Refused as a whole; nobody moves.'],
    ] },
  { n: '03', title: 'Mark someone as having left, and bring them back', role: 'Sthara operator, Teacher', priority: 'Critical', type: 'Security', req: ['03', '05'], uat: true,
    pre: 'A teacher and the school’s only school admin.',
    steps: [
      ['Left the school: mark the teacher as left with a reason.', 'Marked left; record and history kept.'],
      ['The teacher tries to sign in.', 'Sign-in is refused.'],
      ['Mark the school’s only school admin as left.', 'Refused: the last active school admin can’t be marked left.'],
      ['Returned: bring the teacher back with a reason.', 'The teacher can sign in again, with their history intact.'],
    ] },
  { n: '04', title: 'Bulk corrections: preview, refusals, apply', role: 'Sthara operator', priority: 'High', type: 'Positive', req: ['04', '05'], uat: true,
    pre: 'Students with roll numbers; a parent linked by roll number 1042.', data: 'CSV: email,name,roll_no,class — five rows including one unchanged and one duplicate roll number',
    auto: [`${A.corrections}plan: refusals`, `${A.corrections}plan: two rows cannot claim the same new email or roll number`],
    steps: [
      ['Paste only a header "email"; preview.', '"Add at least one column to correct: name, new_email, roll_no or class."'],
      ['Paste the five rows; preview.', 'Each row shows its changes; the unchanged row is skipped; the duplicate roll number is refused ("Same roll number as row …").'],
      ['Apply with a refused row still there.', '"Some rows have problems. Fix them and preview again." Nothing is applied.'],
      ['Fix it; preview; apply with a reason.', 'Every row reports what happened; the student whose roll number changed from 1042 is still linked to their parent.'],
      ['Paste 501 rows.', '"At most 500 corrections at a time."'],
    ] },
];

/** Fee reminders change in the same commit. */
export const feeExtra: ScriptDef[] = [
  { n: '08', title: 'Reminder rows: select by clicking, and blocked families say why', role: 'Accountant', perm: 'fees.remind', priority: 'Medium', type: 'Usability', req: ['07'],
    pre: 'Two overdue families, one with no verified parent.',
    steps: [
      ['Stage fee reminders: click a family’s row (not the checkbox).', 'The row is selected and its message previews.'],
      ['Find the family with no verified parent.', 'It says why it can’t be reminded (e.g. no verified parent) instead of a silently disabled checkbox.'],
    ] },
];
