import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { loadOperators } from '@/lib/ops/org';
import { pageAll } from '@/lib/ops/page';
import { RULES, commissionMoves, commissionTotals, isPartnerKind, type CommissionStatus } from '@/lib/ops/revenue';
import { loadRules } from '@/lib/ops/revenueServer';
import { can } from '@/lib/ops/roles';
import { oppRef } from '@/lib/ops/sales';
import { loadStages } from '@/lib/ops/salesServer';
import { loadSight, visibleSchoolIds } from '@/lib/ops/scope';
import { canonicalState, cleanDistrict } from '@/lib/ops/territories';
import { parseReason } from '@/lib/settings/registry';
import { oppInSight } from '../pipeline/shared';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const mask = (v: string | null) => (v ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : null);

interface Deal { id: string; number: number; name: string; stage: string; amount: number; partner_id: string | null; territory_id: string | null; owner_id: string | null; school_id: string | null }

/**
 * GET /api/ops/partners — the partners with what each has brought and is owed; the commission ledger for the deals in
 * sight (everything, for those who approve and pay); and Sthara's own commission rules.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'partners.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const sight = await loadSight(db, op);
  const [partners, commissions, deals, stages, rules, visible, ops, schools] = await Promise.all([
    db.from('ops_partners').select('id, name, kind, contact_name, phone, email, state, district, pan, gstin, commission_pct, commission_basis, notes, active, created_at').order('name'),
    pageAll((f, t) => db.from('ops_commissions').select('id, opportunity_id, school_id, payee_kind, partner_id, operator_id, payee_name, reason, basis_amount, rate_pct, amount, status, auto, accrued_at, approved_at, paid_on, payment_ref, note').order('accrued_at', { ascending: false }).order('id').range(f, t)),
    pageAll<Deal>((f, t) => db.from('ops_opportunities').select('id, number, name, stage, amount, partner_id, territory_id, owner_id, school_id').order('id').range(f, t)),
    loadStages(db), loadRules(db), visibleSchoolIds(db, sight), loadOperators(db), db.from('schools').select('id, name'),
  ]);
  if (partners.error) {
    const missing = partners.error.code === '42P01' || partners.error.code === 'PGRST205';
    return bad(missing ? 'The partner tables are missing: apply the ops_partners_marketing migration.' : partners.error.message, missing ? 409 : 500);
  }
  const manage = can(op.role, 'partners.manage'), pay = can(op.role, 'commissions.manage');
  const kindOf = new Map(stages.map(s => [s.key, s.kind]));
  const dealOf = new Map(deals.data.map(d => [d.id, d]));
  const inSight = (d: Deal | undefined) => !!d && oppInSight(sight, d, visible);
  // Those who pay see every line; everyone else the lines on deals they can see, and their own.
  const lines = commissions.data.filter(c => pay || sight.all || c.operator_id === op.id || inSight(dealOf.get(c.opportunity_id as string)));
  const names = ops.length ? (await db.from('users').select('id, name, email').in('id', ops.map(o => o.id))).data || [] : [];
  const nameOf = new Map(names.map(u => [u.id as string, (u.name || u.email) as string]));
  const schoolOf = new Map((schools.data || []).map(s => [s.id as string, s.name as string]));

  return NextResponse.json({
    partners: (partners.data || []).map(p => {
      const mine = deals.data.filter(d => d.partner_id === p.id && inSight(d));
      const owed = commissions.data.filter(c => c.partner_id === p.id);
      return {
        id: p.id, name: p.name, kind: p.kind, contactName: p.contact_name, phone: p.phone, email: p.email, state: p.state, district: p.district,
        // Tax numbers in full only for those who manage partners or pay them.
        pan: manage || pay ? p.pan : mask(p.pan), gstin: manage || pay ? p.gstin : mask(p.gstin),
        commissionPct: Number(p.commission_pct), commissionBasis: p.commission_basis, notes: p.notes, active: p.active,
        deals: mine.length, open: mine.filter(d => kindOf.get(d.stage) === 'open').length, won: mine.filter(d => kindOf.get(d.stage) === 'won').length,
        wonValue: mine.filter(d => kindOf.get(d.stage) === 'won').reduce((n, d) => n + Number(d.amount), 0),
        ...commissionTotals(owed.map(c => ({ status: c.status as CommissionStatus, amount: Number(c.amount) }))),
      };
    }),
    commissions: lines.map(c => {
      const d = dealOf.get(c.opportunity_id as string);
      return {
        id: c.id, payeeKind: c.payee_kind, payeeName: c.payee_name, partnerId: c.partner_id, reason: c.reason, basis: c.basis_amount === null ? null : Number(c.basis_amount),
        ratePct: c.rate_pct === null ? null : Number(c.rate_pct), amount: Number(c.amount), status: c.status, auto: c.auto, accruedAt: c.accrued_at, approvedAt: c.approved_at,
        paidOn: c.paid_on, paymentRef: c.payment_ref, note: c.note,
        oppId: d && inSight(d) ? d.id : null, opp: d ? `${oppRef(d.number)} ${d.name}` : null, school: c.school_id ? schoolOf.get(c.school_id) ?? null : null,
        moves: pay ? commissionMoves(c.status as CommissionStatus) : [],
      };
    }),
    totals: commissionTotals(lines.map(c => ({ status: c.status as CommissionStatus, amount: Number(c.amount) }))),
    rules: (Object.keys(RULES) as (keyof typeof RULES)[]).map(k => ({ key: k, label: RULES[k], ratePct: rules[k]?.ratePct ?? 0, active: rules[k]?.active ?? false })),
    operators: ops.filter(o => o.active).map(o => ({ id: o.id, name: nameOf.get(o.id) ?? 'Operator' })),
    deals: deals.data.filter(inSight).map(d => ({ id: d.id, label: `${oppRef(d.number)} ${d.name}` })).slice(0, 500),
    can: { manage, pay, rules: can(op.role, 'sales.admin') }, today: todayIST(),
  });
}

/**
 * POST /api/ops/partners
 *   { action: 'partner', id?, name, kind, contactName?, phone?, email?, state?, district?, pan?, gstin?, commissionPct, commissionBasis?, notes?, active? }
 *   { action: 'commission', opportunityId?, payeeKind, partnerId?, operatorId?, payeeName?, reason, amount, note? }   a line added by hand
 *   { action: 'commission-move', id, move: 'approve' | 'pay' | 'cancel' | 'reopen', paidOn?, paymentRef?, note? }
 *   { action: 'rule', key, ratePct, active, reason }
 */
export async function POST(req: NextRequest) {
  const b = await req.clone().json().catch(() => ({}));
  const cap = b.action === 'partner' ? 'partners.manage' : b.action === 'rule' ? 'sales.admin' : 'commissions.manage';
  const op = await operatorFor(req, cap);
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const audit = (action: string, table: string, row: string, values: Record<string, unknown>) => db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action, table_name: table, row_id: row, school_id: null, new_values: values,
  });

  if (b.action === 'partner') {
    const name = text(b.name, 160);
    if (name.length < 2) return bad('Name the partner.');
    const pct = Math.round(Number(b.commissionPct) * 100) / 100;
    if (!(pct >= 0 && pct <= 100)) return bad('The commission is between 0 and 100 percent.');
    const email = text(b.email, 200).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('That email address does not look right.');
    const state = b.state ? canonicalState(b.state) : null;
    if (b.state && !state) return bad('Pick a state from the list.');
    const row = {
      name, kind: isPartnerKind(b.kind) ? b.kind : 'dealer', contact_name: text(b.contactName, 120) || null, phone: text(b.phone, 30) || null, email: email || null,
      state, district: state ? cleanDistrict(b.district) : null, pan: text(b.pan, 20).toUpperCase() || null, gstin: text(b.gstin, 20).toUpperCase() || null,
      commission_pct: pct, commission_basis: b.commissionBasis === 'every_year' ? 'every_year' : 'first_year', notes: text(b.notes, 2000) || null,
      active: b.active !== false, updated_at: new Date().toISOString(),
    };
    const existing = typeof b.id === 'string' && UUID.test(b.id);
    const { data, error } = existing
      ? await db.from('ops_partners').update(row).eq('id', b.id).select('id').single()
      : await db.from('ops_partners').insert({ ...row, created_by: op.id }).select('id').single();
    if (error) return bad(error.code === '23505' ? 'A partner with that name already exists.' : error.code === 'PGRST116' ? 'That partner no longer exists.' : error.message, error.code === '23505' ? 409 : 500);
    await audit(existing ? 'partner.changed' : 'partner.added', 'ops_partners', data.id, { name, commissionPct: pct, active: row.active });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === 'rule') {
    if (!Object.hasOwn(RULES, b.key)) return bad('Pick a rule.');
    const reason = parseReason(b.reason);
    if (!reason) return bad('Give a reason (at least 4 characters). It goes in the audit log.');
    const rate = Math.round(Number(b.ratePct) * 100) / 100;
    if (!(rate >= 0 && rate <= 100)) return bad('The rate is between 0 and 100 percent.');
    const { error } = await db.from('ops_commission_rules').upsert({ key: b.key, rate_pct: rate, active: b.active === true && rate > 0 });
    if (error) return bad(error.message, 500);
    await audit('commission_rule.changed', 'ops_commission_rules', b.key, { ratePct: rate, active: b.active === true && rate > 0, reason });
    return NextResponse.json({ ok: true });
  }

  if (b.action === 'commission') {
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!(amount > 0)) return bad('Enter the amount.');
    const reason = text(b.reason, 200);
    if (reason.length < 2) return bad('Say what it is for.');
    const row: Record<string, unknown> = { amount, reason, note: text(b.note, 500) || null, auto: false, created_by: op.id, payee_kind: 'other' };
    if (b.payeeKind === 'partner') {
      const { data: p } = UUID.test(String(b.partnerId)) ? await db.from('ops_partners').select('id, name').eq('id', b.partnerId).maybeSingle() : { data: null };
      if (!p) return bad('Pick the partner.');
      Object.assign(row, { payee_kind: 'partner', partner_id: p.id, payee_name: p.name });
    } else if (b.payeeKind === 'operator') {
      const { data: u } = UUID.test(String(b.operatorId)) ? await db.from('users').select('id, name, email').eq('id', b.operatorId).maybeSingle() : { data: null };
      if (!u || !(await db.from('ops_operators').select('user_id').eq('user_id', u.id).maybeSingle()).data) return bad('Pick the operator.');
      Object.assign(row, { payee_kind: 'operator', operator_id: u.id, payee_name: u.name || u.email });
    } else {
      const payee = text(b.payeeName, 160);
      if (payee.length < 2) return bad('Name who is to be paid.');
      row.payee_name = payee;
    }
    if (b.opportunityId) {
      const { data: d } = UUID.test(String(b.opportunityId)) ? await db.from('ops_opportunities').select('id, school_id, amount').eq('id', b.opportunityId).maybeSingle() : { data: null };
      if (!d) return bad('That deal does not exist.', 404);
      Object.assign(row, { opportunity_id: d.id, school_id: d.school_id, basis_amount: d.amount });
    }
    const { data, error } = await db.from('ops_commissions').insert(row).select('id').single();
    if (error) return bad(error.message, 500);
    await audit('commission.added', 'ops_commissions', data.id, { payee: row.payee_name, amount, reason });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === 'commission-move') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Pick a commission.');
    const { data: c } = await db.from('ops_commissions').select('id, status, amount, payee_name').eq('id', b.id).maybeSingle();
    if (!c) return bad('That commission no longer exists.', 404);
    if (!(commissionMoves(c.status as CommissionStatus) as string[]).includes(b.move)) return bad(c.status === 'paid' ? 'A paid commission is final.' : 'That cannot be done to this commission now.', 409);
    const patch: Record<string, unknown> = {};
    if (b.move === 'approve') Object.assign(patch, { status: 'approved', approved_by: op.id, approved_at: new Date().toISOString() });
    else if (b.move === 'reopen') Object.assign(patch, { status: 'accrued', approved_by: null, approved_at: null });
    else if (b.move === 'cancel') {
      const why = text(b.note, 500);
      if (why.length < 4) return bad('Say why it is cancelled.');
      Object.assign(patch, { status: 'cancelled', note: why });
    } else {
      const paidOn = typeof b.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.paidOn) ? b.paidOn : '';
      if (!paidOn || paidOn > todayIST()) return bad('Enter the date it was paid, today or earlier.');
      const ref = text(b.paymentRef, 120);
      if (!ref) return bad('Enter the payment reference (UTR, cheque number).');
      Object.assign(patch, { status: 'paid', paid_on: paidOn, payment_ref: ref });
    }
    const { data: done, error } = await db.from('ops_commissions').update(patch).eq('id', c.id).eq('status', c.status).select('id');
    if (error) return bad(error.message, 500);
    if (!done?.length) return bad('Someone else just changed this commission.', 409);
    await audit(`commission.${b.move}`, 'ops_commissions', c.id, { payee: c.payee_name, amount: Number(c.amount), ...(b.move === 'pay' ? { paidOn: patch.paid_on, ref: patch.payment_ref } : {}) });
    return NextResponse.json({ ok: true, status: patch.status });
  }
  return bad('Unknown action');
}
