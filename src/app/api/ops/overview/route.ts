import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { operatorFor } from '@/lib/ops/auth';
import { collectInventory } from '@/lib/settings/collect';
import { summarise } from '@/lib/settings/inventory';
import { SPIKE_PER_HOUR, buildAttention } from '@/lib/ops/attention';
import { loadRegistry } from '@/lib/ops/registry';
import { can } from '@/lib/ops/roles';
import { loadSight, visibleSchoolIds } from '@/lib/ops/scope';
import { sees } from '@/lib/ops/territories';
import { pageAll } from '@/lib/ops/page';
import { inQueue, slaState } from '@/lib/ops/desk';
import { CASE_COLS, clocked, type CaseRow } from '@/lib/ops/deskServer';
import { canDecide } from '@/lib/ops/sales';
import { loadLimits, loadStages, todayIST } from '@/lib/ops/salesServer';
import { usageWindow } from '@/lib/ai/window';
import { USD_TO_INR } from '@/lib/ai/pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/overview — the Platform Manager's front page in one call. Schools, enquiries and login requests
 * are cut to what the operator can see; AI cost, errors, system health and the change journal only reach the roles
 * that may open those sections.
 */
export async function GET(req: NextRequest) {
  const op = await operatorFor(req, null);
  if (op instanceof Response) return op;
  const db = createAdminClient();
  try {
    const mtd = usageWindow({ range: 'mtd' });
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString(), hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const sight = await loadSight(db, op);
    const visible = await visibleSchoolIds(db, sight);
    const inSight = (schoolId: string) => !visible || visible.has(schoolId);
    const [allSchools, inv, enquiries, journal, usage, operators, requests, errorGroups, schoolMetrics, subjectMetrics] = await Promise.all([
      loadRegistry(db),
      collectInventory(db),
      pageAll((f, t) => db.from('enquiries').select('status, territory_id, owner_id').order('id').range(f, t)),
      db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
        .order('at', { ascending: false }).limit(8),
      'error' in mtd ? Promise.resolve({ data: null, error: null }) : db.rpc('ops_ai_usage', { p_from: mtd.from.toISOString(), p_to: mtd.to.toISOString() }),
      db.from('ops_operators').select('user_id', { count: 'exact', head: true }).eq('active', true),
      pageAll((f, t) => db.from('account_requests').select('school_id, created_at').eq('status', 'pending').order('id').range(f, t)),
      db.from('app_error_groups').select('fingerprint, message, first_seen').eq('status', 'open').gte('last_seen', dayAgo).limit(1000),
      db.rpc('ops_school_metrics', { p_school: null }),
      db.rpc('ops_subject_metrics', { p_school: null }),
    ]);
    const registry = allSchools.filter(s => inSight(s.id));
    // The service desk's pulse, for roles that work it (no table on a database older than ops_crm: then nothing).
    let desk: { late: number; soon: number; unassigned: number } | undefined;
    if (can(op.role, 'desk.read')) {
      const { data: open, error: deskErr } = await pageAll<CaseRow>((f, t) => db.from('ops_cases').select(CASE_COLS).not('status', 'in', '(resolved,closed)').order('id').range(f, t));
      if (!deskErr) {
        const live = open.filter(c => inSight(c.school_id)).map(clocked);
        const t = Date.now();
        desk = {
          late: live.filter(c => slaState(c, t).level === 'breached').length,
          soon: live.filter(c => slaState(c, t).level === 'soon').length,
          unassigned: live.filter(c => inQueue(c, 'unassigned', op.id, t)).length,
        };
      }
    }
    const subjectsBySchool = new Map(subjectMetrics.error ? [] : ((subjectMetrics.data || []) as { school_id: string; metrics: Record<string, number> }[]).map(r => [r.school_id, r.metrics]));
    // The error log's pulse (tables may not exist yet on an older database: then no error items).
    const openGroups = errorGroups.error || !can(op.role, 'errors.read') ? [] : errorGroups.data || [];
    // Occurrences in the last hour per open group, counted in the database.
    const perHour = new Map<string, number>();
    if (openGroups.length) {
      const { data: st } = await db.rpc('ops_error_stats', { p_fingerprints: openGroups.map(g => g.fingerprint), p_since: hourAgo });
      for (const [fp, v] of Object.entries((st as { groups?: Record<string, { inRange: number }> } | null)?.groups ?? {})) perHour.set(fp, Number(v.inRange));
    }
    const errors = {
      open24h: openGroups.length,
      new24h: openGroups.filter(g => g.first_seen >= dayAgo).length,
      spikes: openGroups.map(g => ({ fingerprint: g.fingerprint, message: g.message, lastHour: perHour.get(g.fingerprint) || 0 }))
        .filter(g => g.lastHour >= SPIKE_PER_HOUR).sort((a, b) => b.lastHour - a.lastHour),
    };
    // Login requests schools are waiting on, per school (the table may not exist yet on an older database).
    const bySchool = new Map<string, { count: number; oldest: string }>();
    for (const r of requests.error || !can(op.role, 'requests.manage') ? [] : requests.data) {
      if (!inSight(r.school_id)) continue;
      const cur = bySchool.get(r.school_id);
      bySchool.set(r.school_id, { count: (cur?.count ?? 0) + 1, oldest: !cur || r.created_at < cur.oldest ? r.created_at : cur.oldest });
    }
    const now = Date.now();
    const pendingRequests = [...bySchool].map(([schoolId, v]) => ({ schoolId, count: v.count, oldestDays: Math.floor((now - Date.parse(v.oldest)) / 86_400_000) }));
    // The pipeline's pulse, for roles that see it (no tables on a database older than ops_sales: then nothing).
    let sales: { approvals: number; overdue: number } | undefined;
    if (can(op.role, 'sales.read')) {
      const [dealRows, quoteRows, stages, limits] = await Promise.all([
        pageAll((f, t) => db.from('ops_opportunities').select('id, stage, expected_close, territory_id, owner_id, school_id').order('id').range(f, t)),
        db.from('ops_quotes').select('opportunity_id, needs_role, discount_pct, plan, created_by, status').eq('status', 'pending_approval').limit(500),
        loadStages(db), loadLimits(db),
      ]);
      if (!dealRows.error) {
        const mine = dealRows.data.filter(o => sees(sight, { territoryId: o.territory_id, ownerId: o.owner_id }) || (!!o.school_id && inSight(o.school_id) && !!visible));
        const ids = new Set(mine.map(o => o.id as string)), openKeys = new Set(stages.filter(s => s.kind === 'open').map(s => s.key)), today = todayIST();
        sales = {
          approvals: (quoteRows.data || []).filter(q => ids.has(q.opportunity_id) && canDecide(limits, op, { needsRole: q.needs_role, discountPct: Number(q.discount_pct), plan: q.plan, createdBy: q.created_by, status: q.status })).length,
          overdue: mine.filter(o => openKeys.has(o.stage) && o.expected_close && o.expected_close < today).length,
        };
      }
    }
    const enq = can(op.role, 'enquiries.read')
      ? enquiries.data.filter(e => sees(sight, { territoryId: e.territory_id, ownerId: e.owner_id })) : [];
    const newEnquiries = enq.filter(e => e.status === 'new').length;
    const healthItems = can(op.role, 'health.read') ? inv.items : [];
    const totals = !can(op.role, 'usage.read') ? null : (usage.data as { totals?: { cost?: number; calls?: number; failed?: number } } | null)?.totals ?? null;
    return NextResponse.json({
      schools: registry,
      attention: buildAttention({ schools: registry, health: healthItems, newEnquiries, pendingRequests, errors, desk, sales }),
      errors: { open24h: errors.open24h, new24h: errors.new24h },
      requests: { pending: pendingRequests.reduce((n, p) => n + p.count, 0) },
      health: summarise(healthItems),
      enquiries: {
        new: newEnquiries,
        open: enq.filter(e => ['new', 'contacted', 'qualified'].includes(e.status)).length,
        total: enq.length,
      },
      ai: totals ? { costUsd: Number(totals.cost ?? 0), calls: totals.calls ?? 0, failed: totals.failed ?? 0, days: 'error' in mtd ? 0 : mtd.days } : null,
      usdToInr: USD_TO_INR,
      // School health counts per school (null until the ops_school_metrics migration is applied).
      metrics: schoolMetrics.error ? null
        : Object.fromEntries(((schoolMetrics.data || []) as { school_id: string; metrics: { data?: Record<string, unknown> } }[]).filter(r => inSight(r.school_id)).map(r => [r.school_id,
          subjectsBySchool.has(r.school_id) ? { ...r.metrics, data: { ...(r.metrics.data || {}), ...subjectsBySchool.get(r.school_id) } } : r.metrics])),
      journal: journal.error || !can(op.role, 'audit.read') ? [] : journal.data,
      operators: can(op.role, 'operators.read') ? operators.count ?? null : null,
      me: { role: op.role },
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the overview.' }, { status: 500 });
  }
}
