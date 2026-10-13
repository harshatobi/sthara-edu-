import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadPicklist } from '@/lib/ops/deskServer';
import { loadOperators } from '@/lib/ops/org';
import { pageAll } from '@/lib/ops/page';
import { can, reportsOf } from '@/lib/ops/roles';
import { canDecide, daysInStage, effectiveStatus, forecast, oppRef, quoteRef } from '@/lib/ops/sales';
import { OPP_COLS, QUOTE_COLS, createOpp, loadLimits, loadStages, todayIST, type OppRow, type QuoteRow } from '@/lib/ops/salesServer';
import { loadSight, loadTerritories, visibleSchoolIds } from '@/lib/ops/scope';
import { territoryPath } from '@/lib/ops/territories';
import { actorOf, oppInSight } from './shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/pipeline?whose=mine|team|all — the deals in sight with their stage, value, owner and latest quote; the
 * forecast over them; the quotes waiting on this operator's approval; and what the forms need.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'sales.read');
  if (op instanceof Response) return op;
  const whose = ['mine', 'team', 'all'].includes(req.nextUrl.searchParams.get('whose') || '') ? req.nextUrl.searchParams.get('whose')! : 'all';
  const db = createAdminClient();
  const sight = await loadSight(db, op);
  const [opps, stages, limits, reasons, ops, territories, visible, schools] = await Promise.all([
    pageAll<OppRow>((f, t) => db.from('ops_opportunities').select(OPP_COLS).order('created_at', { ascending: false }).order('id').range(f, t)),
    loadStages(db), loadLimits(db), loadPicklist(db, 'loss_reason', false), loadOperators(db), loadTerritories(db), visibleSchoolIds(db, sight),
    db.from('schools').select('id, name, settings'),
  ]);
  if (opps.error) {
    const missing = opps.error.code === '42P01' || opps.error.code === 'PGRST205';
    return NextResponse.json({ error: missing ? 'The pipeline tables are missing: apply the ops_sales migration.' : opps.error.message }, { status: missing ? 409 : 500 });
  }
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const schoolOf = new Map((schools.data || []).map(s => [s.id as string, s.name as string]));
  const team = reportsOf(ops.filter(o => o.active).map(o => ({ id: o.id, managerId: o.managerId })), op.id);
  const inSight = opps.data.filter(o => oppInSight(sight, o, visible));
  const mine = inSight.filter(o => whose === 'all' || (whose === 'team' ? !!o.owner_id && (team.has(o.owner_id) || o.owner_id === op.id) : o.owner_id === op.id));

  const quotes = await pageAll<QuoteRow>((f, t) => db.from('ops_quotes').select(QUOTE_COLS).order('created_at', { ascending: false }).order('id').range(f, t));
  const today = todayIST(), now = Date.now();
  const latest = new Map<string, QuoteRow>();
  for (const q of quotes.data) if (!latest.has(q.opportunity_id) || latest.get(q.opportunity_id)!.version < q.version) latest.set(q.opportunity_id, q);
  const oppOf = new Map(inSight.map(o => [o.id, o]));
  const stageOf = new Map(stages.map(s => [s.key, s]));

  return NextResponse.json({
    whose, today, me: op.id, hasTeam: team.size > 0,
    stages,
    opps: mine.map(o => {
      const q = latest.get(o.id);
      return {
        id: o.id, ref: oppRef(o.number), name: o.name, kind: o.kind, stage: o.stage, stageKind: stageOf.get(o.stage)?.kind ?? 'open',
        amount: Number(o.amount), plan: o.plan, students: o.students, expectedClose: o.expected_close, nextStep: o.next_step,
        ownerId: o.owner_id, owner: o.owner_id ? nameOf.get(o.owner_id) ?? 'Former operator' : null,
        schoolId: o.school_id, school: o.school_id ? schoolOf.get(o.school_id) ?? null : null,
        territory: o.territory_id ? territoryPath(territories, o.territory_id) : null, state: o.state,
        closedAt: o.closed_at, lossReason: o.loss_reason, createdAt: o.created_at, daysInStage: daysInStage(o.stage_changed_at, now),
        overdue: stageOf.get(o.stage)?.kind === 'open' && !!o.expected_close && o.expected_close < today,
        quote: q ? { ref: quoteRef(q.number, q.version), status: effectiveStatus({ status: q.status, validUntil: q.valid_until }, today), discountPct: Number(q.discount_pct) } : null,
      };
    }),
    forecast: forecast(mine.map(o => ({
      id: o.id, stage: o.stage, amount: Number(o.amount), expectedClose: o.expected_close, ownerId: o.owner_id, closedAt: o.closed_at,
      stageChangedAt: o.stage_changed_at, kind: o.kind, lossReason: o.loss_reason,
    })), stages, today),
    // Quotes this operator can decide, across every deal in sight.
    approvals: quotes.data.filter(q => oppOf.has(q.opportunity_id) && canDecide(limits, op, { needsRole: q.needs_role, discountPct: Number(q.discount_pct), plan: q.plan, createdBy: q.created_by, status: q.status }))
      .map(q => ({ id: q.id, ref: quoteRef(q.number, q.version), oppId: q.opportunity_id, opp: oppOf.get(q.opportunity_id)!.name, discountPct: Number(q.discount_pct), students: q.students, pricePerStudent: Number(q.price_per_student), listPrice: q.list_price === null ? null : Number(q.list_price), plan: q.plan, by: q.created_by_name, at: q.updated_at })),
    lossReasons: reasons,
    limits,
    owners: ops.filter(o => o.active && can(o.role, 'sales.work')).map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator', role: o.role })),
    schools: [...schoolOf].filter(([id]) => !visible || visible.has(id)).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    can: { work: can(op.role, 'sales.work'), admin: can(op.role, 'sales.admin'), assign: can(op.role, 'assign') },
  });
}

/**
 * POST /api/ops/pipeline — { name, kind?, enquiryId?, schoolId?, plan?, students?, pricePerStudent?, expectedClose?, nextStep?,
 *   contactName?, contactPhone?, contactEmail?, state?, district? }
 * Opens a deal at the first stage. From an enquiry, the enquiry is marked qualified and its contact and place carried over.
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'sales.work');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const sight = await loadSight(db, op);
  // A school or enquiry outside the operator's sight cannot be made into a deal by them.
  if (!sight.all && typeof b.schoolId === 'string' && b.schoolId) {
    const visible = await visibleSchoolIds(db, sight);
    if (!visible?.has(b.schoolId)) return NextResponse.json({ error: 'That school does not exist.' }, { status: 404 });
  }
  if (!sight.all && typeof b.enquiryId === 'string' && b.enquiryId) {
    const { data: e } = await db.from('enquiries').select('territory_id, owner_id').eq('id', b.enquiryId).maybeSingle();
    if (!e || !oppInSight(sight, { territory_id: e.territory_id, owner_id: e.owner_id, school_id: null }, null)) return NextResponse.json({ error: 'That enquiry does not exist.' }, { status: 404 });
  }
  // Handing a new deal to someone else needs the right to assign.
  if (b.ownerId !== undefined && b.ownerId !== op.id && !can(op.role, 'assign')) delete b.ownerId;
  const out = await createOpp(db, await actorOf(db, op), b);
  return out.ok ? NextResponse.json({ ok: true, id: out.id, ref: oppRef(out.number) }) : NextResponse.json({ error: out.error }, { status: out.status });
}
