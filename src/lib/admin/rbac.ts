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
  'admissions.manage': 'Add applicants and move them between stages',
  'wellness.read': 'See anonymised wellness and the CBSE report',
  'wellness.file': 'Fill in and file the CBSE wellness report',
  'compliance.read': 'See consent coverage and DPDP flags',
  'compliance.act': 'Ask parents for missing consent',
  'audit.read': 'Read the audit trail',
  'people.manage': 'Create and remove student, teacher and parent accounts',
  'access.manage': 'Give and take away office roles',
} as const;
export type Perm = keyof typeof PERMS;

export type RoleKey = 'school_admin' | 'principal' | 'vice_principal' | 'finance_head' | 'accountant' | 'cashier'
  | 'admissions_officer' | 'hr_manager' | 'academic_coordinator' | 'counsellor' | 'dpo';

const ALL = Object.keys(PERMS) as Perm[];

export const ROLES: Record<RoleKey, { label: string; summary: string; perms: Perm[] }> = {
  school_admin: { label: 'School admin', summary: 'Everything, including who can do what', perms: ALL },
  principal: { label: 'Principal', summary: 'Everything except managing access', perms: ALL.filter(p => p !== 'access.manage') },
  vice_principal: {
    label: 'Vice principal', summary: 'Academics, staff and leave, admissions view, wellness and compliance',
    perms: ['dashboard.view', 'boardpack.view', 'probe.view', 'academics.read', 'workforce.read', 'leave.approve', 'admissions.read', 'wellness.read', 'compliance.read'],
  },
  finance_head: {
    label: 'Finance head', summary: 'All of fees, including voids, concession approval and day close',
    perms: ['dashboard.view', 'boardpack.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request',
      'fees.concession.approve', 'fees.void', 'fees.dayclose', 'fees.remind', 'audit.read'],
  },
  accountant: {
    label: 'Accountant', summary: 'Billing, collection, reminders and day close; concessions need approval',
    perms: ['dashboard.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request', 'fees.dayclose', 'fees.remind'],
  },
  cashier: { label: 'Cashier', summary: 'Records payments and issues receipts', perms: ['dashboard.view', 'fees.read', 'fees.collect'] },
  admissions_officer: { label: 'Admissions officer', summary: 'The admissions pipeline', perms: ['dashboard.view', 'probe.view', 'admissions.read', 'admissions.manage'] },
  hr_manager: { label: 'HR manager', summary: 'Staff, leave approval and leave policy', perms: ['dashboard.view', 'probe.view', 'workforce.read', 'leave.approve', 'leave.policy'] },
  academic_coordinator: { label: 'Academic coordinator', summary: 'Academic health and teaching staff', perms: ['dashboard.view', 'probe.view', 'academics.read', 'workforce.read'] },
  counsellor: { label: 'Counsellor', summary: 'Anonymised wellness', perms: ['dashboard.view', 'wellness.read'] },
  dpo: {
    label: 'Data protection officer', summary: 'Consent, DPDP flags and the audit trail',
    perms: ['dashboard.view', 'probe.view', 'compliance.read', 'compliance.act', 'audit.read', 'wellness.read'],
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
