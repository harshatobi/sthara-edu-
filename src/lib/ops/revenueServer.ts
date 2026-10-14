import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { commissionLines, type RuleKey } from './revenue';

/** Commissions accrued from deals, and the spend attributed to them. Used by the pipeline and by /api/ops/partners and /marketing. */

type Db = SupabaseClient;

export async function loadRules(db: Db): Promise<Partial<Record<RuleKey, { ratePct: number; active: boolean }>>> {
  const { data } = await db.from('ops_commission_rules').select('key, rate_pct, active');
  return Object.fromEntries((data || []).map(r => [r.key, { ratePct: Number(r.rate_pct), active: !!r.active }]));
}

/**
 * Accrues what a deal owes when it is won: one line per payee. Lines already accrued automatically for the deal are
 * left alone (a deal reopened and won again does not pay twice); cancelled automatic lines are brought back.
 */
export async function accrueCommissions(db: Db, by: { id: string }, o: { id: string; amount: number; school_id: string | null; partner_id: string | null; owner_id: string | null }): Promise<number> {
  const [rules, partner, owner, existing] = await Promise.all([
    loadRules(db),
    o.partner_id ? db.from('ops_partners').select('id, name, commission_pct, active').eq('id', o.partner_id).maybeSingle() : Promise.resolve({ data: null }),
    o.owner_id ? db.from('ops_operators').select('user_id, manager_id').eq('user_id', o.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('ops_commissions').select('id, payee_kind, partner_id, operator_id, reason, status').eq('opportunity_id', o.id).eq('auto', true),
  ]);
  const ids = [o.owner_id, owner.data?.manager_id].filter(Boolean) as string[];
  const { data: people } = ids.length ? await db.from('users').select('id, name, email').in('id', ids) : { data: [] };
  const nameOf = new Map((people || []).map(u => [u.id as string, (u.name || u.email) as string]));
  const lines = commissionLines({
    amount: Number(o.amount),
    partner: partner.data ? { id: partner.data.id, name: partner.data.name, pct: Number(partner.data.commission_pct) } : null,
    owner: o.owner_id ? { id: o.owner_id, name: nameOf.get(o.owner_id) ?? 'Operator' } : null,
    manager: owner.data?.manager_id ? { id: owner.data.manager_id, name: nameOf.get(owner.data.manager_id) ?? 'Operator' } : null,
  }, rules);
  let made = 0;
  for (const l of lines) {
    const had = (existing.data || []).find(e => e.reason === l.reason && (e.partner_id ?? null) === l.partnerId && (e.operator_id ?? null) === l.operatorId);
    if (had) {
      if (had.status === 'cancelled') { await db.from('ops_commissions').update({ status: 'accrued', amount: l.amount, basis_amount: l.basis, rate_pct: l.ratePct, accrued_at: new Date().toISOString() }).eq('id', had.id); made += 1; }
      continue;
    }
    const { error } = await db.from('ops_commissions').insert({
      opportunity_id: o.id, school_id: o.school_id, payee_kind: l.payeeKind, partner_id: l.partnerId, operator_id: l.operatorId, payee_name: l.payeeName,
      reason: l.reason, basis_amount: l.basis, rate_pct: l.ratePct, amount: l.amount, auto: true, created_by: by.id,
    });
    if (error) console.warn('[commissions] accrue:', error.message); else made += 1;
  }
  return made;
}

/** A won deal that is reopened no longer owes what it accrued and had not yet been approved or paid. */
export async function cancelAccrued(db: Db, oppId: string): Promise<void> {
  const { error } = await db.from('ops_commissions').update({ status: 'cancelled', note: 'The deal was reopened.' }).eq('opportunity_id', oppId).eq('auto', true).eq('status', 'accrued');
  if (error) console.warn('[commissions] cancel:', error.message);
}
