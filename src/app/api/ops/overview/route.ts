import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { collectInventory } from '@/lib/settings/collect';
import { summarise } from '@/lib/settings/inventory';
import { SPIKE_PER_HOUR, buildAttention } from '@/lib/ops/attention';
import { loadRegistry } from '@/lib/ops/registry';
import { usageWindow } from '@/lib/ai/window';
import { USD_TO_INR } from '@/lib/ai/pricing';

export const dynamic = 'force-dynamic';

/** GET /api/ops/overview — the Platform Manager's front page in one call. */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const db = createAdminClient();
  try {
    const mtd = usageWindow({ range: 'mtd' });
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString(), hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [registry, inv, enquiries, journal, usage, operators, requests, errorGroups, lastHour] = await Promise.all([
      loadRegistry(db),
      collectInventory(db),
      db.from('enquiries').select('status'),
      db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
        .order('at', { ascending: false }).limit(8),
      'error' in mtd ? Promise.resolve({ data: null, error: null }) : db.rpc('ops_ai_usage', { p_from: mtd.from.toISOString(), p_to: mtd.to.toISOString() }),
      db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'superadmin'),
      db.from('account_requests').select('school_id, created_at').eq('status', 'pending'),
      db.from('app_error_groups').select('fingerprint, message, first_seen').eq('status', 'open').gte('last_seen', dayAgo).limit(1000),
      db.from('app_errors').select('fingerprint, repeats').gte('at', hourAgo).limit(20000),
    ]);
    // The error log's pulse (tables may not exist yet on an older database: then no error items).
    const openGroups = errorGroups.error ? [] : errorGroups.data || [];
    const perHour = new Map<string, number>();
    for (const e of lastHour.error ? [] : lastHour.data || []) perHour.set(e.fingerprint, (perHour.get(e.fingerprint) || 0) + e.repeats);
    const errors = {
      open24h: openGroups.length,
      new24h: openGroups.filter(g => g.first_seen >= dayAgo).length,
      spikes: openGroups.map(g => ({ fingerprint: g.fingerprint, message: g.message, lastHour: perHour.get(g.fingerprint) || 0 }))
        .filter(g => g.lastHour >= SPIKE_PER_HOUR).sort((a, b) => b.lastHour - a.lastHour),
    };
    // Login requests schools are waiting on, per school (the table may not exist yet on an older database).
    const bySchool = new Map<string, { count: number; oldest: string }>();
    for (const r of requests.error ? [] : requests.data || []) {
      const cur = bySchool.get(r.school_id);
      bySchool.set(r.school_id, { count: (cur?.count ?? 0) + 1, oldest: !cur || r.created_at < cur.oldest ? r.created_at : cur.oldest });
    }
    const now = Date.now();
    const pendingRequests = [...bySchool].map(([schoolId, v]) => ({ schoolId, count: v.count, oldestDays: Math.floor((now - Date.parse(v.oldest)) / 86_400_000) }));
    const enq = enquiries.data || [];
    const newEnquiries = enq.filter(e => e.status === 'new').length;
    const totals = (usage.data as { totals?: { cost?: number; calls?: number; failed?: number } } | null)?.totals ?? null;
    return NextResponse.json({
      schools: registry,
      attention: buildAttention({ schools: registry, health: inv.items, newEnquiries, pendingRequests, errors }),
      errors: { open24h: errors.open24h, new24h: errors.new24h },
      requests: { pending: pendingRequests.reduce((n, p) => n + p.count, 0) },
      health: summarise(inv.items),
      enquiries: {
        new: newEnquiries,
        open: enq.filter(e => ['new', 'contacted', 'qualified'].includes(e.status)).length,
        total: enq.length,
      },
      ai: totals ? { costUsd: Number(totals.cost ?? 0), calls: totals.calls ?? 0, failed: totals.failed ?? 0, days: 'error' in mtd ? 0 : mtd.days } : null,
      usdToInr: USD_TO_INR,
      journal: journal.error ? [] : journal.data,
      operators: operators.count ?? null,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load the overview.' }, { status: 500 });
  }
}
