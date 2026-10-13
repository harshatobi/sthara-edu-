import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadPicklist } from '@/lib/ops/deskServer';
import { ROLE_INFO, can } from '@/lib/ops/roles';
import { loadLimits, loadStages } from '@/lib/ops/salesServer';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const LIMIT_ROLES = ['sales_rep', 'account_manager', 'regional_lead'] as const;

/** GET /api/ops/pipeline/settings — the stages, the loss reasons, and the discount each role may give alone. */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'sales.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const [stages, reasons, limits, { data: used }] = await Promise.all([
    loadStages(db), loadPicklist(db, 'loss_reason', false), loadLimits(db), db.from('ops_opportunities').select('stage'),
  ]);
  const inUse = new Map<string, number>();
  for (const o of used || []) inUse.set(o.stage, (inUse.get(o.stage) ?? 0) + 1);
  return NextResponse.json({
    stages: stages.map(s => ({ ...s, deals: inUse.get(s.key) ?? 0 })), reasons,
    limits: [...LIMIT_ROLES, 'director' as const].map(r => ({ role: r, label: ROLE_INFO[r].label, maxPct: limits[r] ?? 0, fixed: r === 'director' })),
    can: { admin: can(op.role, 'sales.admin') },
  });
}

/**
 * POST /api/ops/pipeline/settings (director)
 *   { action: 'stage', key?, label, probability, sort?, active?, reason }   add or change an open stage (Won and Lost keep their kind)
 *   { action: 'reason', key?, label, active?, reason }                      add or change a loss reason
 *   { action: 'limit', role, maxPct, reason }                               the largest discount a role gives alone
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'sales.admin');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const reason = parseReason(b.reason);
  if (!reason) return bad('Give a reason (at least 4 characters). It goes in the audit log.');
  const db = createAdminClient();
  const audit = (action: string, table: string, row: string, values: Record<string, unknown>) => db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action, table_name: table, row_id: row, school_id: null, new_values: { ...values, reason },
  });
  const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

  if (b.action === 'stage') {
    const label = typeof b.label === 'string' ? b.label.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    const probability = Math.round(Number(b.probability));
    if (label.length < 2) return bad('Name the stage.');
    if (!(probability >= 0 && probability <= 100)) return bad('The win probability is between 0 and 100.');
    const stages = await loadStages(db);
    const existing = typeof b.key === 'string' ? stages.find(s => s.key === b.key) : undefined;
    if (b.key && !existing) return bad('That stage does not exist.', 404);
    const key = existing?.key ?? slug(label);
    if (key.length < 2) return bad('Use letters or digits in the name.');
    if (!existing && stages.some(s => s.key === key)) return bad('A stage with that name already exists.', 409);
    const active = b.active !== false;
    if (existing && existing.kind !== 'open' && !active) return bad('Won and Lost stay: every deal ends in one of them.');
    if (existing && !active) {
      const { count } = await db.from('ops_opportunities').select('id', { count: 'exact', head: true }).eq('stage', key);
      if (count) return bad(`${count} deal${count === 1 ? ' is' : 's are'} in this stage. Move them first.`, 409);
      if (stages.filter(s => s.kind === 'open' && s.active && s.key !== key).length === 0) return bad('Keep at least one open stage.', 409);
    }
    const row = {
      key, label, active, sort: Number.isInteger(b.sort) ? Math.max(0, Math.min(89, b.sort)) : existing?.sort ?? Math.min(89, Math.max(0, ...stages.filter(s => s.kind === 'open').map(s => s.sort)) + 10),
      // Won is always 100 and Lost 0: they are outcomes, not chances.
      probability: existing?.kind === 'won' ? 100 : existing?.kind === 'lost' ? 0 : probability, kind: existing?.kind ?? 'open',
    };
    const { error } = await db.from('ops_opportunity_stages').upsert(row);
    if (error) return bad(error.message, 500);
    await audit('stage.changed', 'ops_opportunity_stages', key, row);
    return NextResponse.json({ ok: true, key });
  }
  if (b.action === 'reason') {
    const label = typeof b.label === 'string' ? b.label.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (label.length < 2) return bad('Name the reason.');
    const key = typeof b.key === 'string' && /^[a-z0-9_]{2,40}$/.test(b.key) ? b.key : slug(label);
    if (key.length < 2) return bad('Use letters or digits in the name.');
    if (key === 'other' && b.active === false) return bad('"Other" stays: it is the fallback.');
    const { error } = await db.from('ops_picklists').upsert({ kind: 'loss_reason', key, label, sort: Number.isInteger(b.sort) ? b.sort : 100, active: b.active !== false });
    if (error) return bad(error.message, 500);
    await audit('picklist.changed', 'ops_picklists', `loss_reason/${key}`, { label, active: b.active !== false });
    return NextResponse.json({ ok: true, key });
  }
  if (b.action === 'limit') {
    if (!(LIMIT_ROLES as readonly string[]).includes(b.role)) return bad('Pick a role. The director’s limit is not changed.');
    const maxPct = Math.round(Number(b.maxPct) * 10) / 10;
    if (!(maxPct >= 0 && maxPct <= 100)) return bad('The limit is between 0 and 100 percent.');
    const limits = await loadLimits(db);
    // A lead who could approve less than the people under them would be no check at all.
    const next = { ...limits, [b.role]: maxPct };
    if ((next.regional_lead ?? 0) < Math.max(next.sales_rep ?? 0, next.account_manager ?? 0)) return bad('A regional lead’s limit cannot be below a sales rep’s or an account manager’s.');
    const { error } = await db.from('ops_discount_limits').upsert({ role: b.role, max_pct: maxPct });
    if (error) return bad(error.message, 500);
    await audit('discount_limit.changed', 'ops_discount_limits', b.role, { maxPct, was: limits[b.role as keyof typeof limits] ?? null });
    return NextResponse.json({ ok: true });
  }
  return bad('Unknown action');
}
