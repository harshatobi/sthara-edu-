import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notFoundResponse, operatorFromRequest } from '@/lib/ops/auth';
import { AI_FEATURES, MODEL_PRICES, PRICES_CHECKED, USD_TO_INR } from '@/lib/ai/pricing';
import { AI_MODELS } from '@/lib/settings/limits';
import { usageWindow } from '@/lib/ai/window';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ops/usage?range=7d|30d|90d|mtd|lastmonth  (or ?from=YYYY-MM-DD&to=YYYY-MM-DD, IST days)
 * AI token usage and cost for the window, plus the price list it was costed with.
 * Operators only; 404 for everyone else.
 */
export async function GET(req: NextRequest) {
  if (!(await operatorFromRequest(req))) return notFoundResponse();
  const q = req.nextUrl.searchParams;
  const win = usageWindow({ range: q.get('range'), from: q.get('from'), to: q.get('to') });
  if ('error' in win) return NextResponse.json({ error: win.error }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db.rpc('ops_ai_usage', { p_from: win.from.toISOString(), p_to: win.to.toISOString() });
  if (error) {
    const missing = /ops_ai_usage|ai_usage/.test(error.message) && /not find|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: missing ? 'Usage metering isn’t set up in the database yet. Apply migration ai_usage.' : error.message, missing },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({
    window: { from: win.from.toISOString(), to: win.to.toISOString(), label: win.label, days: win.days, key: win.key },
    usage: data,
    prices: MODEL_PRICES,
    pricesChecked: PRICES_CHECKED,
    usdToInr: USD_TO_INR,
    models: AI_MODELS,
    features: AI_FEATURES,
    checkedAt: new Date().toISOString(),
  });
}
