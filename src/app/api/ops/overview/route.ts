import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { collectInventory } from '@/lib/settings/collect';
import { summarise } from '@/lib/settings/inventory';
import { buildAttention } from '@/lib/ops/attention';
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
    const [registry, inv, enquiries, journal, usage, operators] = await Promise.all([
      loadRegistry(db),
      collectInventory(db),
      db.from('enquiries').select('status'),
      db.from('settings_changes').select('id, at, actor_email, scope, school_id, key, old_value, new_value, reason')
        .order('at', { ascending: false }).limit(8),
      'error' in mtd ? Promise.resolve({ data: null, error: null }) : db.rpc('ops_ai_usage', { p_from: mtd.from.toISOString(), p_to: mtd.to.toISOString() }),
      db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'superadmin'),
    ]);
    const enq = enquiries.data || [];
    const newEnquiries = enq.filter(e => e.status === 'new').length;
    const totals = (usage.data as { totals?: { cost?: number; calls?: number; failed?: number } } | null)?.totals ?? null;
    return NextResponse.json({
      schools: registry,
      attention: buildAttention({ schools: registry, health: inv.items, newEnquiries }),
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
