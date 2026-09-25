import { NextResponse } from 'next/server';
import { getPlatformSettings } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/platform/public — the platform settings anyone may see: the sign-in
 * notice, whether self-serve sign-up is open, and the trial length it gives.
 * Nothing else from platform_config is exposed here.
 */
export async function GET() {
  const p = await getPlatformSettings();
  return NextResponse.json({
    notice: p['notice.message'] ? { message: p['notice.message'], tone: p['notice.tone'] } : null,
    selfServe: p['onboarding.self_serve'],
    trialDays: p['trial.default_days'],
  }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
}
