/**
 * TE.040 ADM-ACC-04 (automated): the office roles, pinned. Each role's permissions, and which
 * admin menu entries each role sees, must match the signed-off access matrix in the Solution
 * Matrix workbook (sheet "Role x Permission"). Changing a role is then a deliberate act: this
 * test fails until the matrix below (and the workbook) are updated to say so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, PERMS, Access, activeGrants, type RoleKey } from '@/lib/admin/rbac';
import { navOf } from '../../tools/inventory';

// Re-signed 2026-10-15 after payroll (2026-10-13), the employee master (hr.manage, hr.sensitive), People and
// Help & Support for every office account, and exams (2026-10-14: the academic coordinator runs the exam cell,
// the principal publishes, the vice principal reads; the fees office sees only report cards held for fees).
// Re-signed 2026-10-21 (Living Record 01): the student register. A new Registrar role keeps it; the principal and
// school admin manage it too and approve year-end outcomes; the session calendar is the school admin's alone; the
// vice principal, academic coordinator, admissions officer, finance head and accountant read it.
const EXPECTED: Record<RoleKey, string[]> = {
  school_admin: Object.keys(PERMS),
  principal: Object.keys(PERMS).filter(p => p !== 'access.manage' && p !== 'session.manage'),
  vice_principal: ['dashboard.view', 'boardpack.view', 'probe.view', 'academics.read', 'workforce.read', 'leave.approve', 'admissions.read', 'wellness.read', 'compliance.read', 'messages.office', 'feed.read', 'incidents.manage', 'attendance.read', 'os.ask', 'schedule.academic', 'exams.read', 'students.read'],
  finance_head: ['dashboard.view', 'boardpack.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request', 'fees.concession.approve', 'fees.void', 'fees.dayclose', 'fees.remind', 'audit.read', 'payroll.read', 'payroll.approve', 'students.read'],
  accountant: ['dashboard.view', 'probe.view', 'fees.read', 'fees.collect', 'fees.bill', 'fees.concession.request', 'fees.dayclose', 'fees.remind', 'payroll.read', 'payroll.prepare', 'students.read'],
  cashier: ['dashboard.view', 'fees.read', 'fees.collect'],
  admissions_officer: ['dashboard.view', 'probe.view', 'admissions.read', 'admissions.manage', 'students.read'],
  hr_manager: ['dashboard.view', 'probe.view', 'workforce.read', 'leave.approve', 'leave.policy', 'schedule.workforce', 'hr.manage', 'hr.sensitive', 'payroll.read', 'payroll.prepare'],
  academic_coordinator: ['dashboard.view', 'probe.view', 'academics.read', 'workforce.read', 'feed.read', 'attendance.read', 'schedule.academic', 'exams.read', 'exams.manage', 'students.read'],
  counsellor: ['dashboard.view', 'wellness.read', 'messages.office', 'safeguarding.read'],
  dpo: ['dashboard.view', 'probe.view', 'compliance.read', 'compliance.act', 'audit.read', 'wellness.read'],
  registrar: ['dashboard.view', 'students.read', 'students.manage', 'students.aadhaar'],
};

/** Admin menu labels each role sees (layout.tsx filters by `need`; Fees reads "Fees" without admissions). */
const MENU: Record<RoleKey, string[]> = {
  school_admin: ['Dashboard', 'Ask the School OS', 'Probe', 'Situational Feed', 'Admissions & Fees', 'Parent Messages', 'Students', 'People', 'Payroll', 'Staff & Leave', 'Schedule', 'Student Attendance', 'Exams & Report Cards', 'Academic Health', 'CBSE Wellness Report', 'DPDP & Compliance', 'Roles & Access', 'User Directory', 'Data Import', 'Help & Support'],
  principal: ['Dashboard', 'Ask the School OS', 'Probe', 'Situational Feed', 'Admissions & Fees', 'Parent Messages', 'Students', 'People', 'Payroll', 'Staff & Leave', 'Schedule', 'Student Attendance', 'Exams & Report Cards', 'Academic Health', 'CBSE Wellness Report', 'DPDP & Compliance', 'User Directory', 'Data Import', 'Help & Support'],
  vice_principal: ['Dashboard', 'Ask the School OS', 'Probe', 'Situational Feed', 'Admissions', 'Parent Messages', 'Students', 'People', 'Staff & Leave', 'Schedule', 'Student Attendance', 'Exams & Report Cards', 'Academic Health', 'CBSE Wellness Report', 'DPDP & Compliance', 'Help & Support'],
  finance_head: ['Dashboard', 'Probe', 'Fees', 'Students', 'People', 'Payroll', 'Schedule', 'Exams & Report Cards', 'DPDP & Compliance', 'Help & Support'],
  accountant: ['Dashboard', 'Probe', 'Fees', 'Students', 'People', 'Payroll', 'Schedule', 'Exams & Report Cards', 'Help & Support'],
  cashier: ['Dashboard', 'Fees', 'People', 'Schedule', 'Exams & Report Cards', 'Help & Support'],
  admissions_officer: ['Dashboard', 'Probe', 'Admissions', 'Students', 'People', 'Schedule', 'Help & Support'],
  hr_manager: ['Dashboard', 'Probe', 'People', 'Payroll', 'Staff & Leave', 'Schedule', 'Help & Support'],
  academic_coordinator: ['Dashboard', 'Probe', 'Situational Feed', 'Students', 'People', 'Staff & Leave', 'Schedule', 'Student Attendance', 'Exams & Report Cards', 'Academic Health', 'Help & Support'],
  counsellor: ['Dashboard', 'Situational Feed', 'Parent Messages', 'People', 'Schedule', 'CBSE Wellness Report', 'Help & Support'],
  dpo: ['Dashboard', 'Probe', 'People', 'Schedule', 'CBSE Wellness Report', 'DPDP & Compliance', 'Help & Support'],
  registrar: ['Dashboard', 'Students', 'People', 'Schedule', 'Help & Support'],
};

/** Mirrors the filter in src/app/admin/layout.tsx (read from the file, not re-implemented by hand). */
function menuFor(a: Access): string[] {
  return navOf('src/app/admin/layout.tsx', 'admin')
    .filter(n => !n.need.length || n.need.some(p => a.can(p as never)))
    .filter(n => n.href !== '/admin/admissions' || !a.can('fees.read'))
    .map(n => (n.href === '/admin/fees' && !a.can('admissions.read') ? 'Fees' : n.label));
}

test('every office role holds exactly its signed-off permissions', () => {
  assert.deepEqual(Object.keys(ROLES).sort(), Object.keys(EXPECTED).sort());
  for (const [role, perms] of Object.entries(EXPECTED)) {
    assert.deepEqual([...ROLES[role as RoleKey].perms].sort(), [...perms].sort(), role);
  }
});

test('segregation of duties: collection, approval and voiding sit with different roles', () => {
  assert.ok(!ROLES.cashier.perms.includes('fees.void'), 'a cashier cannot void their own receipts');
  assert.ok(!ROLES.accountant.perms.includes('fees.concession.approve'), 'an accountant requests concessions, cannot approve them');
  assert.ok(!ROLES.principal.perms.includes('access.manage'), 'only the school admin manages access');
  assert.ok(!ROLES.counsellor.perms.includes('academics.read'));
  assert.ok(ROLES.dpo.perms.includes('audit.read') && !ROLES.dpo.perms.includes('fees.read'));
});

test('each role sees exactly its menu', () => {
  for (const [role, labels] of Object.entries(MENU)) {
    assert.deepEqual(menuFor(new Access([role as RoleKey])), labels, role);
  }
});

test('an office account with no role sees only Help & Support (every office account can reach Sthara)', () => {
  assert.deepEqual(menuFor(new Access([])), ['Help & Support']);
  assert.equal(new Access([]).label, 'No role yet');
});

test('roles combine: a cashier who is also admissions officer sees fees and admissions under one entry', () => {
  const a = new Access(['cashier', 'admissions_officer']);
  assert.ok(a.can('fees.collect') && a.can('admissions.manage'));
  assert.ok(menuFor(a).includes('Admissions & Fees'));
  assert.ok(!menuFor(a).includes('Admissions'));
});

test('temporary roles lapse after their end date; revoked roles never count', () => {
  const rows = [
    { id: '1', user_id: 'u', role_key: 'principal', expires_on: '2026-09-30', revoked_at: null, granted_at: '2026-09-01' },
    { id: '2', user_id: 'u', role_key: 'cashier', expires_on: null, revoked_at: '2026-09-10', granted_at: '2026-09-01' },
    { id: '3', user_id: 'u', role_key: 'not_a_role', expires_on: null, revoked_at: null, granted_at: '2026-09-01' },
  ];
  assert.deepEqual(activeGrants(rows, '2026-09-30').map(g => g.role), ['principal']);
  assert.deepEqual(activeGrants(rows, '2026-10-01').map(g => g.role), []);
});
