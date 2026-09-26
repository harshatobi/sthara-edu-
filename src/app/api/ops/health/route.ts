import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { collectInventory } from '@/lib/settings/collect';
import { invalidateSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

/** GET /api/ops/health — every load-bearing check (keys, runtime, database, schools, limits) and its status. */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  invalidateSettings(); // always show what's stored right now
  try {
    const inv = await collectInventory(createAdminClient());
    return NextResponse.json({ items: inv.items, checkedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not run the checks.' }, { status: 500 });
  }
}
