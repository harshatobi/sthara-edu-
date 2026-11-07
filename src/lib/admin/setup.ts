/**
 * The school's setup checklist (Moses, 2026-11-06): one place that says what is set up, what needs attention and
 * what hasn't been started, each with a way straight into the page that does it. A few steps are required to go
 * live; the school can use everything meanwhile. Steps Sthara does (logins) show their status but no button.
 * Pure: the counts come from lib/admin/setupServer.ts.
 */
export type StepStatus = 'done' | 'attention' | 'todo';
export interface SetupCounts {
  officeHolders: number; safeguardingLead: boolean;
  teachers: number; teachersAssigned: number; studentLogins: number; parentLogins: number; loginRequestsPending: number;
  sessionSet: boolean; students: number; classSubjects: number; studentSubjects: number;
  calendarEvents: number; bellSchedules: number; rooms: number; timetablePublished: boolean; examSchemes: number;
  feeStructures: number; admissionStages: number; admissionSeats: number; salaryTemplates: number; payItems: number; leavePolicies: number;
  certificateSettings: boolean; houses: number;
}
export interface Step {
  key: string; group: string; title: string; note: string; status: StepStatus; required: boolean;
  href: string; cta: string;
  /** Sthara does this step: status only, no button. */
  sthara?: boolean;
}
export interface Setup { steps: Step[]; required: { done: number; total: number }; all: { done: number; total: number }; ready: boolean }

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString('en-IN')} ${x === 1 ? one : many}`;

export function setupSteps(c: SetupCounts): Setup {
  const s: Step[] = [];
  const add = (x: Step) => s.push(x);
  // People and access
  add({ key: 'roles', group: 'People and access', required: true, href: '/admin/access', cta: 'Give roles', title: 'Give office roles',
    status: c.officeHolders >= 2 ? 'done' : c.officeHolders === 1 ? 'attention' : 'todo',
    note: c.officeHolders >= 2 ? `${n(c.officeHolders, 'person', 'people')} hold office roles.` : 'Only you hold an office role. Give the principal, accounts, registrar and others theirs.' });
  add({ key: 'logins', group: 'People and access', required: true, sthara: true, href: '/admin/directory', cta: 'User directory', title: 'Logins for staff, students and parents',
    status: c.teachers > 0 && c.studentLogins > 0 ? (c.loginRequestsPending ? 'attention' : 'done') : c.loginRequestsPending ? 'attention' : 'todo',
    note: c.teachers > 0 && c.studentLogins > 0
      ? `${n(c.teachers, 'teacher')}, ${n(c.studentLogins, 'student')} and ${n(c.parentLogins, 'parent')} can sign in.${c.loginRequestsPending ? ` ${n(c.loginRequestsPending, 'request')} with Sthara.` : ''}`
      : c.loginRequestsPending ? `${n(c.loginRequestsPending, 'request')} with Sthara. Logins appear here as Sthara creates them.` : 'Ask Sthara for logins from the user directory.' });
  add({ key: 'teaching', group: 'People and access', required: true, href: '/admin/directory', cta: 'Set teaching', title: 'Set what each teacher teaches',
    status: !c.teachers ? 'todo' : c.teachersAssigned >= Math.ceil(c.teachers * 0.8) ? 'done' : c.teachersAssigned ? 'attention' : 'todo',
    note: !c.teachers ? 'Comes after teacher logins.' : `${c.teachersAssigned} of ${n(c.teachers, 'teacher')} have their classes and subjects.` });
  add({ key: 'dsl', group: 'People and access', required: false, href: '/admin/access', cta: 'Assign', title: 'Name a Safeguarding lead',
    status: c.safeguardingLead ? 'done' : 'attention',
    note: c.safeguardingLead ? 'Child-protection cases go to them.' : 'Until someone holds this role, child-protection cases go to the principal.' });
  // Students
  add({ key: 'session', group: 'Students', required: false, href: '/admin/students?tab=settings', cta: 'Set', title: 'Confirm when your school year starts',
    status: c.sessionSet ? 'done' : 'attention', note: c.sessionSet ? 'Set.' : 'Using April, the usual start. Change it if yours differs.' });
  add({ key: 'students', group: 'Students', required: true, href: '/admin/import', cta: 'Import', title: 'Bring in your students',
    status: c.students > 0 ? 'done' : 'todo', note: c.students > 0 ? `${n(c.students, 'student')} on the register.` : 'Import the register from a spreadsheet, or admit students one by one.' });
  add({ key: 'subjects', group: 'Students', required: true, href: '/admin/import', cta: 'Link subjects', title: 'Link students to their subjects',
    status: c.studentSubjects > 0 ? 'done' : c.classSubjects > 0 ? 'attention' : 'todo',
    note: c.studentSubjects > 0 ? 'Students have their subjects; the tutor and chats keep to them.' : c.classSubjects > 0 ? 'Classes have subjects, but no student is linked yet.' : 'Each student’s subjects decide what the tutor and chats cover.' });
  // Academics
  add({ key: 'calendar', group: 'Academics', required: false, href: '/admin/schedule?tab=calendar', cta: 'Calendar', title: 'Holidays and the academic calendar',
    status: c.calendarEvents > 0 ? 'done' : 'todo', note: c.calendarEvents > 0 ? `${n(c.calendarEvents, 'date')} on this year’s calendar.` : 'Holidays keep attendance and timetables honest.' });
  add({ key: 'bells', group: 'Academics', required: false, href: '/admin/schedule?tab=setup', cta: 'Bells and rooms', title: 'Bells and rooms',
    status: c.bellSchedules > 0 && c.rooms > 0 ? 'done' : c.bellSchedules > 0 || c.rooms > 0 ? 'attention' : 'todo',
    note: `${n(c.bellSchedules, 'bell schedule')}, ${n(c.rooms, 'room')}.` });
  add({ key: 'timetable', group: 'Academics', required: false, href: '/admin/schedule?tab=timetable', cta: 'Timetable', title: 'Publish the timetable',
    status: c.timetablePublished ? 'done' : 'todo', note: c.timetablePublished ? 'Published for this year.' : 'Build it, or let Sthara solve it, then publish.' });
  add({ key: 'exams', group: 'Academics', required: false, href: '/admin/exams?tab=setup', cta: 'Schemes', title: 'Assessment schemes',
    status: c.examSchemes > 0 ? 'done' : 'todo', note: c.examSchemes > 0 ? `${n(c.examSchemes, 'scheme')} for this year.` : 'Terms, weightages and grading for report cards.' });
  // Money
  add({ key: 'fees', group: 'Fees and admissions', required: true, href: '/admin/fees?tab=ledger', cta: 'Fee structures', title: 'Fee structures for this year',
    status: c.feeStructures > 0 ? 'done' : 'todo', note: c.feeStructures > 0 ? `${n(c.feeStructures, 'grade')} priced.` : 'Set each grade’s annual fee and instalments to start billing.' });
  add({ key: 'admissions', group: 'Fees and admissions', required: false, href: '/admin/admissions', cta: 'Admissions', title: 'Admissions stages and seats',
    status: c.admissionSeats > 0 ? 'done' : c.admissionStages > 0 ? 'attention' : 'todo',
    note: c.admissionSeats > 0 ? `Seats set for ${n(c.admissionSeats, 'grade')}.` : 'Set seats per grade for next year (the standard stages apply until you change them).' });
  // Staff
  add({ key: 'payroll', group: 'Staff', required: false, href: '/admin/payroll?tab=setup', cta: 'Payroll set-up', title: 'Salaries and pay items',
    status: c.salaryTemplates > 0 && c.payItems > 0 ? 'done' : c.payItems > 0 ? 'attention' : 'todo',
    note: `${n(c.payItems, 'pay item')}, ${n(c.salaryTemplates, 'salary template')}.` });
  add({ key: 'leave', group: 'Staff', required: false, href: '/admin/staff#policy', cta: 'Leave policy', title: 'Leave entitlements for this year',
    status: c.leavePolicies > 0 ? 'done' : 'todo', note: c.leavePolicies > 0 ? `${n(c.leavePolicies, 'leave type')} set.` : 'Days per year for each kind of leave.' });
  // Records
  add({ key: 'certificates', group: 'Records', required: false, href: '/admin/certificates?tab=setup', cta: 'Set up', title: 'Certificate signature and numbering',
    status: c.certificateSettings ? 'done' : 'todo', note: c.certificateSettings ? 'The principal’s name and signature are on file.' : 'The principal’s name, signature and stamp for TCs and other certificates.' });
  add({ key: 'houses', group: 'Records', required: false, href: '/admin/cocurricular?tab=houses', cta: 'Houses', title: 'Houses, clubs and teams',
    status: c.houses > 0 ? 'done' : 'todo', note: c.houses > 0 ? `${n(c.houses, 'house')}.` : 'For house points and Kirti.' });

  const req = s.filter(x => x.required);
  const reqDone = req.filter(x => x.status === 'done').length;
  return { steps: s, required: { done: reqDone, total: req.length }, all: { done: s.filter(x => x.status === 'done').length, total: s.length }, ready: reqDone === req.length };
}
