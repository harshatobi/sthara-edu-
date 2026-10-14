import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { Operator } from '@/lib/ops/auth';
import { loadSight } from '@/lib/ops/scope';
import { sees, type Sight } from '@/lib/ops/territories';
import type { Actor, OppRow } from '@/lib/ops/salesServer';

type Db = ReturnType<typeof createAdminClient>;

/** The operator as the pipeline records them (with their name). */
export async function actorOf(db: Db, op: Operator): Promise<Actor> {
  const { data } = await db.from('users').select('name').eq('id', op.id).maybeSingle();
  return { id: op.id, email: op.email, role: op.role, name: data?.name || op.email };
}

/** A deal is in sight when its own territory or owner is, or when the school it belongs to is. */
export function oppInSight(sight: Sight, o: Pick<OppRow, 'territory_id' | 'owner_id' | 'school_id'>, visibleSchools: Set<string> | null): boolean {
  return sight.all || sees(sight, { territoryId: o.territory_id, ownerId: o.owner_id }) || (!!o.school_id && !!visibleSchools?.has(o.school_id));
}

export { loadSight };
