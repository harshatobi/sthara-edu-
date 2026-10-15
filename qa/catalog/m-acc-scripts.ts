import type { ScriptDef } from './types';
import { A } from './auto';

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Give a temporary role and let it lapse', role: 'School admin', perm: 'access.manage', priority: 'High', type: 'Positive', req: ['03'], uat: true,
    pre: 'An office account with no role.', data: 'Principal until next Friday, note "Acting principal during leave"',
    steps: [
      ['Roles & Access: find the person.', 'Listed with "No role yet"; WITHOUT A ROLE counts them.'],
      ['Give Principal with an end date of yesterday.', '"The end date must be today or later."'],
      ['Give it until next Friday with the note.', 'TEMPORARY ROLES goes up; Access history shows who and when.'],
      ['The person signs in.', 'The principal’s menu (all but Roles & Access).'],
      ['After the end date, they sign in again.', 'The role has lapsed; history shows it.'],
    ] },
  { n: '02', title: 'Each office role sees only its menu', role: 'Every office role', priority: 'Critical', type: 'Security', req: ['01'], uat: true,
    pre: 'One account per office role.', data: 'Solution Matrix › Menu by role',
    auto: [`${A.rbac}each role sees exactly its menu`, `${A.portals}Dashboard, Fees and Schedule, nothing else`],
    steps: [
      ['Sign in as each role in turn.', 'The menu matches "Menu by role" exactly (Cashier: Dashboard, Fees, Schedule).'],
      ['As the Finance head, read the fees entry.', 'It reads "Fees" (no admissions permission).'],
    ] },
  { n: '03', title: 'Segregation of duties in fees', role: 'Cashier, Accountant, Finance head', priority: 'Critical', type: 'Security', req: ['02'], uat: true,
    pre: 'A family with an invoice and a receipt.', auto: [`~${A.access}cashier:`],
    steps: [
      ['Cashier: record a payment.', 'Receipt issued.'],
      ['Cashier: look for Void on the receipt.', 'Not offered; the API refuses "Your role doesn’t allow this …".'],
      ['Accountant: request a concession.', 'Saved as a request; no Approve.'],
      ['Finance head: approve it.', 'Approved; the balance drops.'],
    ] },
  { n: '04', title: 'Request logins from Sthara; withdraw one', role: 'School admin', perm: 'people.manage', priority: 'Critical', type: 'Positive', req: ['04'], uat: true,
    pre: 'User Directory.', data: 'Two teachers; the same email twice',
    steps: [
      ['Request logins: two teachers, a note for Sthara; send.', 'Waiting under New logins.'],
      ['Another request with the same email twice.', '"The same email is listed twice."'],
      ['Withdraw the waiting request, then again.', 'Withdrawn; then "There is no pending request to withdraw."'],
    ] },
  { n: '05', title: 'Set what a teacher teaches', role: 'School admin', perm: 'people.manage', priority: 'High', type: 'Positive', req: ['05'], uat: true,
    pre: 'A teacher with no classes.', data: '10-A, 10-B Mathematics; class teacher of 10-A',
    steps: [
      ['User Directory › teacher › Teaching assignment: add rows, class teacher; Add these.', 'Saved.'],
      ['Add a row for 12-Z (not in the school).', 'Refused: unknown class.'],
      ['The teacher signs in.', 'Dashboard lists 10-A, 10-B (before: "No classes assigned yet").'],
    ] },
  { n: '06', title: 'Typed addresses outside a role (legacy pages)', role: 'Cashier', priority: 'Medium', type: 'Security', req: ['07'],
    pre: 'A cashier-only account; graded work exists.', auto: [`${A.portals}evidence for TE.040 ADM-ACC-06: pages outside the role, opened by typed address`],
    steps: [
      ['Open /admin/results, /admin/heatmap, /admin/vault, /admin/academic, /admin/staff, /admin/compliance.', 'Pass: no marks, staff or consent records. Fail: any school data (log against OBS-006).'],
    ] },
  { n: '07', title: 'Removing accounts', role: 'Principal, School admin', priority: 'High', type: 'Negative', req: ['06'], pre: 'User Directory.',
    steps: [
      ['Delete your own account.', '"You cannot delete your own account."'],
      ['Principal: delete an office account.', '"Only a school admin can remove office accounts."'],
      ['School admin: delete a teacher; confirm.', 'Removed.'],
    ] },
];
