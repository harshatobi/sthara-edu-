/**
 * Operator roles for the Platform Manager: what each role may do, and how far it sees.
 *
 * One table (ROLE_INFO) is the whole policy. /api/ops routes ask `can(role, capability)`;
 * the sidebar hides sections the role cannot open. Roles with the 'territory' reach only
 * see schools and enquiries in their territories (and those owned by them or their
 * reports); see territories.ts. Pure, so it is unit-tested.
 */

export const OPERATOR_ROLES = ['director', 'regional_lead', 'sales_rep', 'account_manager', 'support_agent', 'engineer', 'finance'] as const;
export type OperatorRole = typeof OPERATOR_ROLES[number];
export const isOperatorRole = (v: unknown): v is OperatorRole => typeof v === 'string' && (OPERATOR_ROLES as readonly string[]).includes(v);

export const CAPABILITIES = [
  'schools.read',      // registry, a school's workspace, health
  'schools.manage',    // classes, subjects, accounts, support fixes
  'schools.policy',    // plan, price, pilot dates, suspension, AI switch
  'schools.create',
  'schools.delete',
  'accounts.delete',
  'people.search',     // the cross-school account directory
  'requests.manage',   // login requests from schools
  'enquiries.read',
  'enquiries.manage',
  'assign',            // set the territory and owner of a school or enquiry
  'usage.read',        // AI usage and cost
  'settings.read',
  'settings.manage',
  'errors.read',
  'errors.manage',
  'health.read',
  'audit.read',
  'operators.read',
  'operators.manage',  // add, change and deactivate operators; territories
  'breakglass',        // open a timed, reasoned window onto a school's records
] as const;
export type Capability = typeof CAPABILITIES[number];

/** 'all' sees every school; 'territory' sees its territories, plus what it or its reports own. */
export type Reach = 'all' | 'territory';

interface RoleInfo { label: string; note: string; reach: Reach; can: readonly Capability[] }

export const ROLE_INFO: Record<OperatorRole, RoleInfo> = {
  director: {
    label: 'Director', reach: 'all', can: CAPABILITIES,
    note: 'Everything, in every school. One account only: the superadmin, named by the database owner and never from this console.',
  },
  regional_lead: {
    label: 'Regional lead', reach: 'territory',
    note: 'Runs a region: its schools, enquiries and the people who own them.',
    can: ['schools.read', 'schools.manage', 'schools.policy', 'schools.create', 'accounts.delete', 'people.search', 'requests.manage',
      'enquiries.read', 'enquiries.manage', 'assign', 'operators.read', 'breakglass'],
  },
  sales_rep: {
    label: 'Sales representative', reach: 'territory',
    note: 'Works enquiries in a territory and opens pilot schools from them.',
    can: ['schools.read', 'schools.create', 'enquiries.read', 'enquiries.manage'],
  },
  account_manager: {
    label: 'Account manager', reach: 'territory',
    note: 'Looks after live schools in a territory: setup, logins and fixes.',
    can: ['schools.read', 'schools.manage', 'requests.manage', 'enquiries.read', 'breakglass'],
  },
  support_agent: {
    label: 'Support', reach: 'all',
    note: 'Helps any school: accounts, family links, roster fixes, login requests.',
    can: ['schools.read', 'schools.manage', 'accounts.delete', 'people.search', 'requests.manage', 'errors.read', 'health.read', 'audit.read', 'breakglass'],
  },
  engineer: {
    label: 'Engineer', reach: 'all',
    note: 'Diagnoses the platform: errors, health, AI usage. Does not change schools.',
    can: ['schools.read', 'people.search', 'errors.read', 'errors.manage', 'health.read', 'usage.read', 'settings.read', 'audit.read', 'breakglass'],
  },
  finance: {
    label: 'Finance', reach: 'all',
    note: 'Plans, prices and suspension for every school; AI cost. No school data.',
    can: ['schools.read', 'schools.policy', 'usage.read', 'audit.read'],
  },
};

export const can = (role: OperatorRole, cap: Capability) => ROLE_INFO[role].can.includes(cap);
export const reachOf = (role: OperatorRole): Reach => ROLE_INFO[role].reach;
export const roleLabel = (role: unknown) => (isOperatorRole(role) ? ROLE_INFO[role].label : 'Operator');
/** Roles that can be given from the console. Director stays a database change, so one stolen session cannot mint another. */
export const GRANTABLE_ROLES = OPERATOR_ROLES.filter(r => r !== 'director');

export interface OperatorNode { id: string; managerId: string | null }

/** Everyone below `managerId` in the reporting line (not the manager themself). Loops in bad data cannot hang it. */
export function reportsOf(operators: OperatorNode[], managerId: string): Set<string> {
  const byManager = new Map<string, string[]>();
  for (const o of operators) if (o.managerId) byManager.set(o.managerId, [...(byManager.get(o.managerId) ?? []), o.id]);
  const out = new Set<string>();
  const queue = [...(byManager.get(managerId) ?? [])];
  while (queue.length) {
    const id = queue.pop()!;
    if (id === managerId || out.has(id)) continue;
    out.add(id);
    queue.push(...(byManager.get(id) ?? []));
  }
  return out;
}

/** Why `managerId` cannot manage `id`, or null when it can: nobody reports to themself, directly or through a loop. */
export function managerProblem(operators: OperatorNode[], id: string, managerId: string | null): string | null {
  if (!managerId) return null;
  if (managerId === id) return 'An operator cannot report to themself.';
  if (!operators.some(o => o.id === managerId)) return 'That manager is not an operator.';
  return reportsOf(operators, id).has(managerId) ? 'That would make a loop: the chosen manager already reports to this operator.' : null;
}
