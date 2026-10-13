import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GRANTABLE_ROLES, isOperatorRole, managerProblem, reachOf, type OperatorRole } from './roles';
import { canonicalState, cleanDistrict, subtree, territoryProblem, type Territory, type TerritoryLevel } from './territories';
import { loadTerritories, place } from './scope';

/**
 * The operator organisation: who the operators are, the territories they work, and where
 * each school and enquiry sits. Every change is written to audit_log as the operator, with the reason.
 */

type Db = SupabaseClient;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });
interface Actor { id: string; email: string; role: OperatorRole }

async function audit(db: Db, actor: Actor, action: string, table: string, rowId: string, values: Record<string, unknown>, schoolId: string | null = null) {
  const { error } = await db.from('audit_log').insert({
    actor_id: actor.id, actor_role: 'operator', action, table_name: table, row_id: rowId, school_id: schoolId, new_values: values,
  });
  if (error) console.warn('[ops org audit]', error.message);
}

// ── Operators ────────────────────────────────────────────────────────────────

export interface OperatorRow { id: string; role: OperatorRole; managerId: string | null; title: string | null; active: boolean; createdAt: string | null }

export async function loadOperators(db: Db): Promise<OperatorRow[]> {
  const { data } = await db.from('ops_operators').select('user_id, role, manager_id, title, active, created_at');
  return (data || []).filter(o => isOperatorRole(o.role)).map(o => ({
    id: o.user_id, role: o.role as OperatorRole, managerId: o.manager_id, title: o.title, active: o.active, createdAt: o.created_at,
  }));
}

export interface OperatorInput { role?: unknown; managerId?: unknown; title?: unknown; territoryIds?: unknown }

function parseOperator(ops: OperatorRow[], territories: Territory[], id: string, b: OperatorInput, current?: OperatorRow) {
  const role = b.role === undefined ? current?.role : b.role;
  if (!isOperatorRole(role)) return fail('Pick a role.');
  if (role === 'director' && current?.role !== 'director') return fail('Director access is granted in the database, not here.');
  if (current?.role === 'director' && role !== 'director') return fail('A director is changed in the database, not here.');
  const managerId = b.managerId === undefined ? current?.managerId ?? null : typeof b.managerId === 'string' && b.managerId ? b.managerId : null;
  const active = ops.filter(o => o.active).map(o => ({ id: o.id, managerId: o.managerId }));
  const bad = managerProblem(active.some(o => o.id === id) ? active : [...active, { id, managerId: null }], id, managerId);
  if (bad) return fail(bad);
  const title = b.title === undefined ? current?.title ?? null : typeof b.title === 'string' ? b.title.trim().slice(0, 80) || null : null;
  let territoryIds: string[] | undefined;
  if (b.territoryIds !== undefined) {
    if (!Array.isArray(b.territoryIds) || !b.territoryIds.every(t => typeof t === 'string' && territories.some(x => x.id === t))) return fail('One of the territories no longer exists.');
    territoryIds = [...new Set(b.territoryIds as string[])];
  }
  if (reachOf(role) === 'all' && territoryIds?.length) return fail(`${role === 'director' ? 'A director' : 'This role'} sees every school: it takes no territories.`);
  return { ok: true as const, role, managerId, title, territoryIds };
}

async function setMembers(db: Db, operatorId: string, territoryIds: string[]) {
  await db.from('ops_territory_members').delete().eq('operator_id', operatorId);
  if (territoryIds.length) await db.from('ops_territory_members').insert(territoryIds.map(t => ({ territory_id: t, operator_id: operatorId })));
}

/**
 * Makes an existing Sthara account an operator. The account must already exist, belong to no school
 * and not be a school login: operators are never school users.
 */
export async function addOperator(db: Db, actor: Actor, email: string, b: OperatorInput, reason: string): Promise<Result<{ id: string }>> {
  const { data: user } = await db.from('users').select('id, role, school_id, email').eq('email', email).maybeSingle();
  if (!user) return fail('No account with that email. Create the login first, then add it here.', 404);
  if (user.school_id) return fail('That account belongs to a school. Operators use a separate Sthara account.', 409);
  if (user.role !== 'operator' && user.role !== 'superadmin') return fail('That account is a school login. Operators use a separate Sthara account.', 409);
  const [ops, territories] = await Promise.all([loadOperators(db), loadTerritories(db)]);
  if (ops.some(o => o.id === user.id)) return fail('That account is already an operator.', 409);
  const p = parseOperator(ops, territories, user.id, b);
  if (!p.ok) return p;
  if (!(GRANTABLE_ROLES as readonly string[]).includes(p.role)) return fail('Director access is granted in the database, not here.');
  const { error } = await db.from('ops_operators').insert({ user_id: user.id, role: p.role, manager_id: p.managerId, title: p.title, created_by: actor.id });
  if (error) return fail(error.message, 500);
  if (p.territoryIds) await setMembers(db, user.id, p.territoryIds);
  await audit(db, actor, 'operator.added', 'ops_operators', user.id, { email, role: p.role, managerId: p.managerId, territoryIds: p.territoryIds ?? [], reason });
  return { ok: true, id: user.id };
}

/** Creates the Sthara login for a new operator (role 'operator', no school) with a temporary password, returned once. */
export async function createOperatorLogin(db: Db, email: string, name: string, password: string): Promise<Result<{ id: string }>> {
  const { data: taken } = await db.from('users').select('id').eq('email', email).maybeSingle();
  if (taken) return fail('An account with that email already exists.', 409);
  const { data: auth, error: authErr } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (authErr || !auth?.user) return fail(authErr?.message || 'Could not create the login.', 500);
  const { error } = await db.from('users').insert({ id: auth.user.id, email, name, role: 'operator', school_id: null, metadata: { mustChangePassword: true } });
  if (error) {
    await db.auth.admin.deleteUser(auth.user.id);
    return fail(/users_role_valid/.test(error.message) ? 'The database is not ready for operator accounts yet (apply the ops_foundation migration).' : error.message, 500);
  }
  return { ok: true, id: auth.user.id };
}

export async function updateOperator(db: Db, actor: Actor, id: string, b: OperatorInput & { active?: unknown }, reason: string): Promise<Result> {
  const [ops, territories] = await Promise.all([loadOperators(db), loadTerritories(db)]);
  const current = ops.find(o => o.id === id);
  if (!current) return fail('That operator no longer exists.', 404);
  if (id === actor.id && (b.role !== undefined || b.active !== undefined)) return fail('You cannot change your own role or access.', 409);
  const p = parseOperator(ops, territories, id, b, current);
  if (!p.ok) return p;
  const active = b.active === undefined ? current.active : b.active === true;
  if (current.role === 'director' && !active) return fail('A director is removed in the database, not here.');
  const { error } = await db.from('ops_operators').update({ role: p.role, manager_id: p.managerId, title: p.title, active, updated_at: new Date().toISOString() }).eq('user_id', id);
  if (error) return fail(error.message, 500);
  // A role that sees everything keeps no territories; a deactivated operator stops being anyone's default owner.
  if (reachOf(p.role) === 'all') await setMembers(db, id, []);
  else if (p.territoryIds) await setMembers(db, id, p.territoryIds);
  if (!active) await db.from('ops_territories').update({ default_owner_id: null }).eq('default_owner_id', id);
  await audit(db, actor, active ? 'operator.changed' : 'operator.deactivated', 'ops_operators', id,
    { role: p.role, was: current.role, managerId: p.managerId, active, territoryIds: p.territoryIds, reason });
  return { ok: true };
}

// ── Territories ──────────────────────────────────────────────────────────────

export interface TerritoryInput { name?: unknown; level?: unknown; parentId?: unknown; state?: unknown; district?: unknown; defaultOwnerId?: unknown }

async function parseTerritory(db: Db, territories: Territory[], b: TerritoryInput, current?: Territory) {
  const level = (current?.level ?? b.level) as TerritoryLevel;
  if (!['region', 'state', 'district'].includes(level)) return fail('Pick a level.');
  const state = level === 'region' ? null : current ? current.state : canonicalState(b.state);
  const district = level !== 'district' ? null : current ? current.district : cleanDistrict(b.district);
  const parentId = b.parentId === undefined ? current?.parentId ?? null : typeof b.parentId === 'string' && b.parentId ? b.parentId : null;
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.replace(/\s+/g, ' ').trim().slice(0, 80)
    : current?.name ?? (level === 'district' ? district : state) ?? '';
  const bad = territoryProblem(territories, { id: current?.id, name, level, parentId, state, district });
  if (bad) return fail(bad);
  let defaultOwnerId = current?.defaultOwnerId ?? null;
  if (b.defaultOwnerId !== undefined) {
    defaultOwnerId = typeof b.defaultOwnerId === 'string' && b.defaultOwnerId ? b.defaultOwnerId : null;
    if (defaultOwnerId) {
      const { data: owner } = await db.from('ops_operators').select('user_id').eq('user_id', defaultOwnerId).eq('active', true).maybeSingle();
      if (!owner) return fail('The default owner must be an active operator.');
    }
  }
  return { ok: true as const, row: { name, level, parent_id: parentId, state, district, default_owner_id: defaultOwnerId } };
}

export async function saveTerritory(db: Db, actor: Actor, id: string | null, b: TerritoryInput, reason: string): Promise<Result<{ id: string; placed: number }>> {
  const territories = await loadTerritories(db);
  const current = id ? territories.find(t => t.id === id) : undefined;
  if (id && !current) return fail('That territory no longer exists.', 404);
  const p = await parseTerritory(db, territories, b, current);
  if (!p.ok) return p;
  const q = id ? db.from('ops_territories').update(p.row).eq('id', id) : db.from('ops_territories').insert(p.row);
  const { data, error } = await q.select('id').single();
  if (error) return fail(error.code === '23505' ? 'A territory already covers that.' : error.message, error.code === '23505' ? 409 : 500);
  await audit(db, actor, id ? 'territory.changed' : 'territory.added', 'ops_territories', data.id, { ...p.row, reason });
  // A new district takes over the schools and enquiries at that address from its state.
  const placed = !id && p.row.level === 'district' ? await replaceAll(db, actor) : 0;
  return { ok: true, id: data.id, placed };
}

export async function removeTerritory(db: Db, actor: Actor, id: string, reason: string): Promise<Result<{ placed: number }>> {
  const territories = await loadTerritories(db);
  const t = territories.find(x => x.id === id);
  if (!t) return fail('That territory no longer exists.', 404);
  if (t.level === 'state') return fail('States stay: every address needs one to land in.', 409);
  if (subtree(territories, [id]).size > 1) return fail('Move or remove the territories beneath it first.', 409);
  // A district's schools and enquiries go back to its state.
  const { error } = await db.from('ops_territories').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  await audit(db, actor, 'territory.removed', 'ops_territories', id, { name: t.name, level: t.level, reason });
  return { ok: true, placed: await replaceAll(db, actor) };
}

/**
 * Puts every school and enquiry in the territory its address now matches. Owners are left alone
 * unless the record has none, so a hand-picked owner survives a territory change.
 */
async function replaceAll(db: Db, actor: Actor): Promise<number> {
  const territories = await loadTerritories(db);
  const [{ data: accounts }, { data: enquiries }] = await Promise.all([
    db.from('ops_accounts').select('school_id, state, district, territory_id, owner_id'),
    db.from('enquiries').select('id, state, district, territory_id, owner_id').not('state', 'is', null),
  ]);
  let moved = 0;
  for (const a of accounts || []) {
    const to = place(territories, a.state, a.district);
    if (to.territoryId === a.territory_id) continue;
    await db.from('ops_accounts').update({ territory_id: to.territoryId, owner_id: a.owner_id ?? to.ownerId, updated_at: new Date().toISOString(), updated_by: actor.id }).eq('school_id', a.school_id);
    moved += 1;
  }
  for (const e of enquiries || []) {
    const to = place(territories, e.state, e.district);
    if (to.territoryId === e.territory_id) continue;
    await db.from('enquiries').update({ territory_id: to.territoryId, owner_id: e.owner_id ?? to.ownerId }).eq('id', e.id);
    moved += 1;
  }
  return moved;
}

// ── Placement of a school or enquiry ─────────────────────────────────────────

export interface PlacementInput { state?: unknown; district?: unknown; ownerId?: unknown }

/** The stored placement for an address and an optional hand-picked owner. `ownerId: null` means "the territory's default". */
export async function resolvePlacement(db: Db, b: PlacementInput, current?: { state: string | null; district: string | null; ownerId: string | null }) {
  const state = b.state === undefined ? current?.state ?? null : b.state === null || b.state === '' ? null : canonicalState(b.state);
  if (b.state && !state) return fail('Pick a state from the list.');
  const district = !state ? null : b.district === undefined ? current?.district ?? null : cleanDistrict(b.district);
  const to = place(await loadTerritories(db), state, district);
  let ownerId = b.ownerId === undefined ? current?.ownerId ?? to.ownerId : typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : to.ownerId;
  if (ownerId) {
    const { data: owner } = await db.from('ops_operators').select('user_id').eq('user_id', ownerId).eq('active', true).maybeSingle();
    if (!owner) {
      if (b.ownerId) return fail('The owner must be an active operator.');
      ownerId = to.ownerId;
    }
  }
  return { ok: true as const, state, district, territoryId: to.territoryId, ownerId };
}

export async function placeSchool(db: Db, actor: Actor, schoolId: string, b: PlacementInput, reason: string): Promise<Result> {
  const { data: cur } = await db.from('ops_accounts').select('state, district, owner_id').eq('school_id', schoolId).maybeSingle();
  const p = await resolvePlacement(db, b, cur ? { state: cur.state, district: cur.district, ownerId: cur.owner_id } : undefined);
  if (!p.ok) return p;
  const { error } = await db.from('ops_accounts').upsert({
    school_id: schoolId, state: p.state, district: p.district, territory_id: p.territoryId, owner_id: p.ownerId,
    updated_at: new Date().toISOString(), updated_by: actor.id,
  });
  if (error) return fail(error.message, 500);
  await audit(db, actor, 'account.placed', 'ops_accounts', schoolId, { state: p.state, district: p.district, territoryId: p.territoryId, ownerId: p.ownerId, reason }, schoolId);
  return { ok: true };
}
