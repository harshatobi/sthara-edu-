/**
 * Office roles and permissions. The database carries the same catalogue
 * (public.role_permissions, seeded by 20260924140000_admin_rbac.sql) and RLS
 * checks it through app.has_perm(); a test keeps the two in step. This file is
 * what the API routes check and what the UI uses to show or hide things.
 */

export const PERMS = {
  'dashboard.view': 'See the command centre',
  'boardpack.view': 'Print the board pack',
  'probe.view': 'See Probe findings in their areas',
  'academics.read': 'See school-wide TML and academic health',
  'workforce.read': 'See staff effectiveness and leave',
  'leave.approve': 'Approve or reject leave',
  'leave.policy': 'Set leave entitlements',
  'fees.read': 'See the fee ledger',
  'fees.collect': 'Record payments and issue receipts',
  'fees.bill': 'Set fee structures and raise invoices',
  'fees.concession.request': 'Request a concession',
  'fees.concession.approve': 'Approve or reject concessions',
  'fees.void': 'Void receipts and invoices, reopen a closed day',
  'fees.dayclose': 'Close the day book',
  'fees.remind': 'Send fee reminders to parents',
  'admissions.read': 'See the admissions pipeline',
  'admissions.manage': 'Add applicants, move them between stages and propose offers',
  'admissions.approve': 'Approve or send back offers before they go to families',
  'admissions.setup': 'Set the admissions stages, seats per grade and how long families have to accept',
  'wellness.read': 'See anonymised wellness and the CBSE report',
  'wellness.file': 'Fill in and file the CBSE wellness report',
  'compliance.read': 'See consent coverage and DPDP flags',
  'compliance.act': 'Ask parents for missing consent',
  'audit.read': 'Read the audit trail',
  'people.manage': 'Request new logins from Sthara, remove accounts, and set what teachers teach',
  'access.manage': 'Give and take away office roles',
  'messages.office': 'Read and answer parents\' messages to the school office',
  'feed.read': 'See the school-wide situational feed and escalations',
  'incidents.manage': 'Decide on bullying, safety and child-protection incidents',
  'safeguarding.read': 'See students\u2019 safety alerts from the tutor (self-harm, abuse, bullying cues)',
  'attendance.read': 'See attendance across the school',
  'os.ask': 'Ask the School OS about the whole school (web and WhatsApp)',
  'schedule.academic': 'Build the timetable and set bells, rooms and the academic calendar',
  'schedule.workforce': 'Keep the staff register, shifts and staff attendance',
  'hr.manage': 'Keep employee records: hire, change jobs, confirm, renew and exit staff',
  'hr.sensitive': 'See and edit staff personal, statutory and bank details',
  'payroll.read': 'See salaries and pay runs',
  'payroll.prepare': 'Keep salaries, prepare pay runs and submit them for approval',
  'payroll.approve': 'Approve pay runs and settlements, or send them back',
  'exams.read': 'See exam results and report cards across the school',
  'exams.manage': 'Run the exam cell: set up assessment schemes, open marks entry and follow progress',
  'exams.publish': 'Lock and publish report cards, and reopen them with a reason',
  'data.import': 'Bulk-import the school\u2019s data from Sthara\u2019s published file formats, and undo an import',
  'students.read': 'See the student register and each student\u2019s enrolment history (Aadhaar masked)',
  'students.manage': 'Keep the register: admit, correct and cancel entries, set classes and roll numbers, finalise year-end outcomes',
  'students.aadhaar': 'See a student\u2019s full Aadhaar number (every look is recorded)',
  'outcomes.approve': 'Approve or return the class teachers\u2019 year-end outcomes',
  'session.manage': 'Set when the school\u2019s academic session starts and open the next session',
  'health.read': 'See students\u2019 full health records (every look is recorded)',
  'health.manage': 'Keep the health records: cards, check-ups, vaccinations, parents\u2019 requested changes and retention',
  'certificates.prepare': 'Prepare certificates (TC, bonafide, character, fee paid) and send them for approval',
  'certificates.approve': 'Approve and issue certificates, cancel them and issue duplicates',
  'cocurricular.manage': 'Set up houses, clubs and teams, place students in houses',
  'cocurricular.approve': 'Approve Kirti (achievements and participation) and house points teachers record',
  'certificates.setup': 'Set up certificates: numbering, wording, the school\u2019s own certificates, signature and stamp',
  'discipline.approve': 'Approve or return the warnings, parent meetings and detentions teachers propose',
  'discipline.suspend': 'Approve suspensions',
  'discipline.archive': 'See past sessions\u2019 warnings and detentions after they leave the record',
  'counselling.overview': 'See which students have counselling and its status, never the notes',
  'counselling.notes': 'Keep counselling cases and read and write session notes (every look is recorded)',
  'safeguarding.cases': 'Hold child-protection cases and their POCSO steps (every look is recorded)',
} as const;
export type Perm = keyof typeof PERMS;

export type RoleKey = 'school_admin' | 'principal' | 'vice_principal' | 'finance_head' | 'accountant' | 'cashier'
  | 'admissions_officer' | 'hr_manager' | 'academic_coordinator' | 'counsellor' | 'dpo' | 'registrar' | 'health_officer' | 'safeguarding_lead';

const ALL = Object.keys(PERMS) as Perm[];
/** Held only by the counsellor and the Safeguarding lead, never by the school admin or principal (brief 07). */
export const PRIVATE_PERMS: Perm[] = ['counselling.notes', 'safeguarding.cases'];
const OFFICE = ALL.filter(p => !PRIVATE_PERMS.includes(p));

export const ROLES: Record<RoleKey, { label: string; summary: string; perms: Perm[] }> = {
  school_admin: { label: 'School admin', summary: 'Everything, including who can do what (counselling notes and child protection only with that role)', perms: OFFICE },
  principal: { label: 'Principal', summary: 'Everything except managing access and the session calendar (counselling notes and child protection only with that role)', perms: OFFICE.filter(p => p !== 'access.manage' && p !== 'session.manage') },
  vice_principal: {
    label: 'Vice principal', summary: 'Academics, staff and leave, admissions view, wellness and compliance',
    perms: ['dashboard.view', 'boardpack.view', 'probe.view', 'academics.read', 'workforce.read', 'leave.approve', 'admissions.read', 'wellness.read', 'compliance.read', 'messages.office',
      'feed.read', 'incidents.manage', 'attendance.read', 'os.ask', 'schedule.academic', 'exams.read', 'students.read', 'discipline.approve'],
  },
  finance_head: {
    label: 'Finance head', summary: 'All of fees, including voids, concession approval and day close; approves payroll',
    perms: ['dashboard.view', 'boardpack.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request',
      'fees.concession.approve', 'fees.void', 'fees.dayclose', 'fees.remind', 'audit.read', 'payroll.read', 'payroll.approve', 'students.read'],
  },
  accountant: {
    label: 'Accountant', summary: 'Billing, collection, reminders and day close; prepares payroll; concessions need approval',
    perms: ['dashboard.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request', 'fees.dayclose', 'fees.remind', 'payroll.read', 'payroll.prepare', 'students.read'],
  },
  cashier: { label: 'Cashier', summary: 'Records payments and issues receipts', perms: ['dashboard.view', 'fees.read', 'fees.collect'] },
  admissions_officer: { label: 'Admissions officer', summary: 'The admissions pipeline', perms: ['dashboard.view', 'probe.view', 'admissions.read', 'admissions.manage', 'students.read'] },
  hr_manager: { label: 'HR manager', summary: 'Employee records, leave, the staff register and shifts; prepares payroll', perms: ['dashboard.view', 'probe.view', 'workforce.read', 'leave.approve', 'leave.policy', 'schedule.workforce', 'hr.manage', 'hr.sensitive', 'payroll.read', 'payroll.prepare'] },
  academic_coordinator: { label: 'Academic coordinator', summary: 'Academic health, teaching staff, the timetable, the exam cell and co-curricular', perms: ['dashboard.view', 'probe.view', 'academics.read', 'workforce.read', 'feed.read', 'attendance.read', 'schedule.academic', 'exams.read', 'exams.manage', 'students.read', 'cocurricular.manage', 'cocurricular.approve'] },
  counsellor: { label: 'Counsellor', summary: 'Counselling cases and notes, anonymised wellness, safety alerts and parents\' messages to the office', perms: ['dashboard.view', 'wellness.read', 'messages.office', 'safeguarding.read', 'counselling.notes'] },
  dpo: {
    label: 'Data protection officer', summary: 'Consent, DPDP flags and the audit trail',
    perms: ['dashboard.view', 'probe.view', 'compliance.read', 'compliance.act', 'audit.read', 'wellness.read'],
  },
  registrar: {
    label: 'Registrar', summary: 'The student register: admissions into it, corrections, classes, roll numbers and year-end outcomes',
    perms: ['dashboard.view', 'students.read', 'students.manage', 'students.aadhaar', 'certificates.prepare', 'discipline.archive'],
  },
  health_officer: {
    label: 'Health officer', summary: 'The school nurse or doctor: health records, check-ups, vaccinations and alerts',
    perms: ['dashboard.view', 'health.read', 'health.manage'],
  },
  safeguarding_lead: {
    label: 'Safeguarding lead', summary: 'The designated person for child protection: child-protection cases, POCSO reporting and students\u2019 safety alerts',
    perms: ['dashboard.view', 'safeguarding.read', 'safeguarding.cases'],
  },
};
export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

export interface Grant { id: string; userId: string; role: RoleKey; expiresOn: string | null; grantedAt: string; grantedBy: string | null; note: string | null }

/** Active grants: not revoked, not past their end date. */
export function activeGrants(rows: any[], today: string): Grant[] {
  return rows
    .filter(r => !r.revoked_at && (!r.expires_on || String(r.expires_on) >= today) && r.role_key in ROLES)
    .map(r => ({ id: r.id, userId: r.user_id, role: r.role_key, expiresOn: r.expires_on ?? null, grantedAt: r.granted_at, grantedBy: r.granted_by ?? null, note: r.note ?? null }));
}

export function permsOf(roles: RoleKey[]): Set<Perm> {
  return new Set(roles.flatMap(r => ROLES[r]?.perms ?? []));
}

/** What someone can do: superadmins everything, otherwise the union of their roles. */
export class Access {
  readonly perms: Set<Perm>;
  constructor(readonly roles: RoleKey[], readonly superadmin = false) {
    this.perms = superadmin ? new Set(ALL) : permsOf(roles);
  }
  can(p: Perm) { return this.perms.has(p); }
  any(...ps: Perm[]) { return ps.some(p => this.perms.has(p)); }
  get label() {
    if (this.superadmin) return 'Operator';
    return this.roles.map(r => ROLES[r].label).join(', ') || 'No role yet';
  }
}
