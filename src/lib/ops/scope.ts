import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reachOf, reportsOf, type OperatorRole } from './roles';
import { defaultOwner, matchTerritory, sees, subtree, type Sight, type Territory } from './territories';

/**
 * What one operator can see, read from the database: the server half of roles.ts and
 * territories.ts. Every list an operator with the 'territory' reach gets is cut down here.
 */

type Db = SupabaseClient;
interface Who { id: string; role: OperatorRole }

export interface AccountRow { schoolId: string; state: string | null; district: string | null; territoryId: string | null; ownerId: string | null }

export async function loadTerritories(db: Db): Promise<Territory[]> {
  const { data } = await db.from('ops_territories').select('id, name, level, parent_id, state, district, default_owner_id');
  return (data || []).map(t => ({
    id: t.id, name: t.name, level: t.level, parentId: t.parent_id, state: t.state, district: t.district, defaultOwnerId: t.default_owner_id,
  }));
}

export async function loadAccounts(db: Db): Promise<Map<string, AccountRow>> {
  const { data } = await db.from('ops_accounts').select('school_id, state, district, territory_id, owner_id');
  return new Map((data || []).map(a => [a.school_id as string, {
    schoolId: a.school_id, state: a.state, district: a.district, territoryId: a.territory_id, ownerId: a.owner_id,
  }]));
}

/** The operator's sight: everything, or their territories with all beneath, plus themself and their reports as owners. */
export async function loadSight(db: Db, op: Who): Promise<Sight> {
  if (reachOf(op.role) === 'all') return { all: true };
  const [territories, { data: mine }, { data: team }] = await Promise.all([
    loadTerritories(db),
    db.from('ops_territory_members').select('territory_id').eq('operator_id', op.id),
    db.from('ops_operators').select('user_id, manager_id').eq('active', true),
  ]);
  const reports = reportsOf((team || []).map(o => ({ id: o.user_id as string, managerId: o.manager_id as string | null })), op.id);
  return { all: false, territories: subtree(territories, (mine || []).map(m => m.territory_id as string)), owners: new Set([op.id, ...reports]) };
}

/** Ids of the schools in sight, or null when the operator sees every school. */
export async function visibleSchoolIds(db: Db, sight: Sight): Promise<Set<string> | null> {
  if (sight.all) return null;
  const accounts = await loadAccounts(db);
  return new Set([...accounts.values()].filter(a => sees(sight, a)).map(a => a.schoolId));
}

export async function canSeeSchool(db: Db, op: Who, schoolId: string): Promise<boolean> {
  const sight = await loadSight(db, op);
  if (sight.all) return true;
  const { data } = await db.from('ops_accounts').select('territory_id, owner_id').eq('school_id', schoolId).maybeSingle();
  return !!data && sees(sight, { territoryId: data.territory_id, ownerId: data.owner_id });
}

/** Where an address lands: its territory and that territory's default owner. */
export function place(territories: Territory[], state: string | null, district: string | null) {
  const t = matchTerritory(territories, state, district);
  return { territoryId: t?.id ?? null, ownerId: defaultOwner(territories, t?.id ?? null) };
}
