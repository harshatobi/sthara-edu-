import type { ScriptDef } from './types';

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Add support staff to the register', role: 'HR manager', perm: 'schedule.workforce', priority: 'High', type: 'Positive', req: ['01'], uat: true,
    pre: 'Staff register.', data: 'Ramesh, Driver, Support staff, 98xxxxxxxx, contract Apr–Mar, WhatsApp consent',
    steps: [
      ['Add staff member: name, category, designation, phone, joining date.', 'Listed; ON THE REGISTER rises.'],
      ['Make them Contract with no end date.', '"A contract member of staff needs an end date for their contract."'],
      ['Tick the WhatsApp consent with no phone.', '"Add their mobile number to send them their roster on WhatsApp."'],
      ['Save properly; later Mark as left; Show people who have left.', 'Hidden from the active list; history kept; "Back on the register" restores.'],
    ] },
  { n: '02', title: 'Staff attendance for a day', role: 'HR manager', priority: 'Critical', type: 'Positive', req: ['02', '03', '04'], uat: true,
    pre: 'Teachers checked in from the app; a driver on a 06:00 shift; grace 10 minutes.',
    steps: [
      ['Attendance › Today.', 'Each person: Expected, In, Out, Status; PRESENT, ON LEAVE, OFF counts.'],
      ['Find someone who came in 20 minutes late.', 'Late.'],
      ['Mark someone Present who forgot to check in, with no reason.', '"Give a reason (it is kept with the change)."'],
      ['Mark with a reason.', 'The register mark wins over the app punch; the punch is still listed.'],
      ['Teacher: check in from outside the campus radius.', 'Refused with the distance; no coordinates are saved.'],
    ] },
  { n: '03', title: 'Biometric device and import', role: 'HR manager', priority: 'High', type: 'Positive', req: ['05'],
    pre: 'A device export CSV (employee code, date-time).', data: 'Device "Main gate biometric", eSSL',
    steps: [
      ['Biometric devices › Connect a device.', 'Token shown once: "Copy the token now: it isn’t shown again."'],
      ['Import biometric punches with the CSV.', 'Punches are matched by employee code; unreadable rows are reported; empty file: "There are no punches to import."'],
      ['Switch the device off; post with its token.', '"Device switched off"; the device API refuses the token (401).'],
    ] },
  { n: '04', title: 'Month review to payroll', role: 'HR manager', priority: 'Critical', type: 'Positive', req: ['06'], uat: true,
    pre: 'Last month has an unexplained absence, 3 lates (rule: every 3 lates a half day) and a person who joined mid-month.',
    steps: [
      ['Month review › last month.', 'Proposals: 1 day loss of pay for the absence; half a day for the lates; nothing for days before the new joiner started.'],
      ['Confirm the month.', '"Confirmed: N days" loss of pay; the month is locked.'],
      ['Correct a day in that month.', '"That month is confirmed. Reopen its review to change a day."'],
      ['Export for payroll.', 'CSV: days, late, leave, loss of pay per person.'],
      ['Reopen, correct, confirm again.', '"Reopened"; totals update.'],
    ] },
  { n: '05', title: 'Shifts: rotating plan, overnight, override and swap', role: 'HR manager', priority: 'High', type: 'Positive', req: ['07'],
    pre: 'Security staff on the register.', data: 'Morning 06:00–14:00, Evening 14:00–22:00, Night 22:00–06:00',
    steps: [
      ['Add the three shifts.', '"Shift saved"; Night shows "Runs overnight, ending the next morning."'],
      ['Give a guard rotating shifts over one week.', '"A rotation needs at least two weeks of shifts."'],
      ['Two weeks; rotating weekly off; works on school holidays.', '"Plan saved"; the week view shows the rotation.'],
      ['Change one day with no reason; then swap two guards.', '"Give a reason."; with a reason: saved. Swapping someone with themself: "Pick two different people."'],
    ] },
  { n: '06', title: 'Leave for staff with no login', role: 'HR manager', priority: 'Medium', type: 'Positive', req: ['08'],
    pre: 'A driver with no login.',
    steps: [
      ['Leave for staff with no login: the driver, casual, two days, reason.', '"Leave request saved. Approve it in Staff & Leave."'],
      ['Try it for a teacher who has a login.', '"<Name> has a login and applies for leave themselves."'],
    ] },
];
