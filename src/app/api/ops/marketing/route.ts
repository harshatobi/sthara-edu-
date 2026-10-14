import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { pageAll } from '@/lib/ops/page';
import { SOURCES, campaignCode, campaignStats, isChannel, isSpendCategory } from '@/lib/ops/revenue';
import { can } from '@/lib/ops/roles';
import { oppRef } from '@/lib/ops/sales';
import { loadStages } from '@/lib/ops/salesServer';
import { parseReason } from '@/lib/settings/registry';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * GET /api/ops/marketing — every campaign with what was spent, the leads and deals it brought, what a lead and a won
 * school cost, and the value won per rupee; the spend log; and leads and wins by source. Company-wide figures:
 * they are not cut by territory.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, 'marketing.read');
  if (op instanceof Response) return op;
  const db = createAdminClient();
  const [campaigns, spend, enquiries, deals, stages, schools] = await Promise.all([
    db.from('ops_campaigns').select('id, name, code, channel, starts_on, ends_on, budget, notes, active, created_at').order('created_at', { ascending: false }),
    pageAll((f, t) => db.from('ops_marketing_spend').select('id, campaign_id, opportunity_id, enquiry_id, school_id, spent_on, amount, category, note, created_at').order('spent_on', { ascending: false }).order('id').range(f, t)),
    pageAll((f, t) => db.from('enquiries').select('id, campaign_id, source, status').neq('status', 'spam').order('id').range(f, t)),
    pageAll((f, t) => db.from('ops_opportunities').select('id, number, name, campaign_id, enquiry_id, source, amount, stage, school_id').order('id').range(f, t)),
    loadStages(db), db.from('schools').select('id, name'),
  ]);
  if (campaigns.error) {
    const missing = campaigns.error.code === '42P01' || campaigns.error.code === 'PGRST205';
    return bad(missing ? 'The marketing tables are missing: apply the ops_partners_marketing migration.' : campaigns.error.message, missing ? 409 : 500);
  }
  const kindOf = new Map(stages.map(s => [s.key, s.kind]));
  const spendRows = spend.data.map(s => ({ campaignId: s.campaign_id as string | null, amount: Number(s.amount) }));
  const enqRows = enquiries.data.map(e => ({ id: e.id as string, campaignId: e.campaign_id as string | null }));
  const dealRows = deals.data.map(d => ({ campaignId: d.campaign_id as string | null, enquiryId: d.enquiry_id as string | null, amount: Number(d.amount), outcome: (kindOf.get(d.stage) ?? 'open') as 'open' | 'won' | 'lost' }));
  const campaignName = new Map((campaigns.data || []).map(c => [c.id as string, c.name as string]));
  const dealName = new Map(deals.data.map(d => [d.id as string, `${oppRef(d.number)} ${d.name}`]));
  const schoolName = new Map((schools.data || []).map(s => [s.id as string, s.name as string]));

  // Leads and wins by where they came from. A deal made from an enquiry is that enquiry's lead, not a second one.
  const enqSource = new Map(enquiries.data.map(e => [e.id as string, (e.source as string | null) || 'website']));
  const bySource = new Map<string, { leads: number; deals: number; won: number; wonValue: number }>();
  const bump = (k: string) => { if (!bySource.has(k)) bySource.set(k, { leads: 0, deals: 0, won: 0, wonValue: 0 }); return bySource.get(k)!; };
  for (const e of enquiries.data) bump((e.source as string | null) || 'website').leads += 1;
  for (const d of deals.data) {
    const k = (d.source as string | null) || (d.enquiry_id ? enqSource.get(d.enquiry_id as string) ?? 'website' : 'other');
    const s = bump(k);
    if (!d.enquiry_id) s.leads += 1;
    s.deals += 1;
    if (kindOf.get(d.stage) === 'won') { s.won += 1; s.wonValue += Number(d.amount); }
  }
  const direct = spend.data.filter(s => !s.campaign_id);
  return NextResponse.json({
    campaigns: (campaigns.data || []).map(c => ({
      id: c.id, name: c.name, code: c.code, channel: c.channel, startsOn: c.starts_on, endsOn: c.ends_on, budget: c.budget === null ? null : Number(c.budget),
      notes: c.notes, active: c.active, ...campaignStats({ id: c.id, budget: c.budget === null ? null : Number(c.budget) }, spendRows, enqRows, dealRows),
    })),
    totals: {
      spend: Math.round(spend.data.reduce((n, s) => n + Number(s.amount), 0)), direct: Math.round(direct.reduce((n, s) => n + Number(s.amount), 0)),
      leads: enquiries.data.length + deals.data.filter(d => !d.enquiry_id).length,
      won: dealRows.filter(d => d.outcome === 'won').length, wonValue: Math.round(dealRows.filter(d => d.outcome === 'won').reduce((n, d) => n + d.amount, 0)),
    },
    spend: spend.data.slice(0, 300).map(s => ({
      id: s.id, spentOn: s.spent_on, amount: Number(s.amount), category: s.category, note: s.note,
      on: s.campaign_id ? `Campaign: ${campaignName.get(s.campaign_id) ?? 'removed'}` : s.opportunity_id ? `Deal: ${dealName.get(s.opportunity_id) ?? 'removed'}`
        : s.school_id ? `School: ${schoolName.get(s.school_id) ?? 'removed'}` : 'An enquiry',
    })),
    bySource: [...bySource].map(([key, v]) => ({ key, label: (SOURCES as Record<string, string>)[key] ?? key, ...v, wonValue: Math.round(v.wonValue) })).sort((a, b) => b.leads - a.leads),
    deals: deals.data.map(d => ({ id: d.id, label: dealName.get(d.id as string)! })).slice(0, 500),
    schools: (schools.data || []).map(s => ({ id: s.id, name: s.name })),
    can: { manage: can(op.role, 'marketing.manage') }, today: todayIST(),
  });
}

/**
 * POST /api/ops/marketing
 *   { action: 'campaign', id?, name, code?, channel, startsOn?, endsOn?, budget?, notes?, active? }
 *   { action: 'spend', campaignId? | opportunityId? | schoolId? | enquiryId?, spentOn, amount, category, note? }
 *   { action: 'spend-remove', id, reason }
 */
export async function POST(req: NextRequest) {
  const op = await operatorFor(req, 'marketing.manage');
  if (op instanceof Response) return op;
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const audit = (action: string, table: string, row: string, values: Record<string, unknown>) => db.from('audit_log').insert({
    actor_id: op.id, actor_role: 'operator', action, table_name: table, row_id: row, school_id: null, new_values: values,
  });

  if (b.action === 'campaign') {
    const name = text(b.name, 160);
    if (name.length < 2) return bad('Name the campaign.');
    const code = campaignCode(b.code || name);
    if (code.length < 2) return bad('Give the campaign a code of letters and digits: it is the utm_campaign that marks its enquiries.');
    const startsOn = b.startsOn ? (DAY.test(b.startsOn) ? b.startsOn : '') : null, endsOn = b.endsOn ? (DAY.test(b.endsOn) ? b.endsOn : '') : null;
    if (startsOn === '' || endsOn === '') return bad('Check the dates.');
    if (startsOn && endsOn && endsOn < startsOn) return bad('It cannot end before it starts.');
    const budget = b.budget === undefined || b.budget === null || b.budget === '' ? null : Math.round(Number(b.budget) * 100) / 100;
    if (budget !== null && !(budget >= 0)) return bad('Enter the budget in rupees.');
    const row = { name, code, channel: isChannel(b.channel) ? b.channel : 'other', starts_on: startsOn, ends_on: endsOn, budget, notes: text(b.notes, 2000) || null, active: b.active !== false };
    const existing = typeof b.id === 'string' && UUID.test(b.id);
    const { data, error } = existing
      ? await db.from('ops_campaigns').update(row).eq('id', b.id).select('id').single()
      : await db.from('ops_campaigns').insert({ ...row, created_by: op.id }).select('id').single();
    if (error) return bad(error.code === '23505' ? `The code "${code}" is already used by another campaign.` : error.message, error.code === '23505' ? 409 : 500);
    await audit(existing ? 'campaign.changed' : 'campaign.added', 'ops_campaigns', data.id, { name, code, budget });
    return NextResponse.json({ ok: true, id: data.id, code });
  }

  if (b.action === 'spend') {
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!(amount > 0)) return bad('Enter the amount spent.');
    if (typeof b.spentOn !== 'string' || !DAY.test(b.spentOn) || b.spentOn > todayIST()) return bad('Enter the date it was spent, today or earlier.');
    const row: Record<string, unknown> = { spent_on: b.spentOn, amount, category: isSpendCategory(b.category) ? b.category : 'other', note: text(b.note, 500) || null, entered_by: op.id };
    const targets: [string, string, string][] = [['campaignId', 'campaign_id', 'ops_campaigns'], ['opportunityId', 'opportunity_id', 'ops_opportunities'], ['schoolId', 'school_id', 'schools'], ['enquiryId', 'enquiry_id', 'enquiries']];
    for (const [key, col, table] of targets) {
      const v = b[key];
      if (!v) continue;
      if (typeof v !== 'string' || !UUID.test(v) || !(await db.from(table).select('id').eq('id', v).maybeSingle()).data) return bad('What this was spent on no longer exists.', 404);
      row[col] = v;
    }
    if (!targets.some(([, col]) => row[col])) return bad('Say what it was spent on: a campaign, a deal or a school.');
    const { data, error } = await db.from('ops_marketing_spend').insert(row).select('id').single();
    if (error) return bad(error.message, 500);
    await audit('spend.added', 'ops_marketing_spend', data.id, { amount, spentOn: b.spentOn, category: row.category });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === 'spend-remove') {
    const reason = parseReason(b.reason);
    if (!reason) return bad('Give a reason (at least 4 characters). It goes in the audit log.');
    if (typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Pick an entry.');
    const { data: s } = await db.from('ops_marketing_spend').select('id, amount, spent_on').eq('id', b.id).maybeSingle();
    if (!s) return bad('That entry no longer exists.', 404);
    const { error } = await db.from('ops_marketing_spend').delete().eq('id', s.id);
    if (error) return bad(error.message, 500);
    await audit('spend.removed', 'ops_marketing_spend', s.id, { amount: Number(s.amount), spentOn: s.spent_on, reason });
    return NextResponse.json({ ok: true });
  }
  return bad('Unknown action');
}
