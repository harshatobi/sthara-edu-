import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { loadFamily } from '@/lib/parent/load';
import { probeFamily } from '@/lib/parent/probe';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';

export const dynamic = 'force-dynamic';

/** GET /api/parent/desk — the family view (verified children only) and what Probe noticed. */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`parent-desk:${auth.parent.id}`, ...limitOf('parentDesk')).allowed) {
    return NextResponse.json({ error: 'Too many refreshes. Wait a minute and try again.' }, { status: 429 });
  }
  try {
    const view = await loadFamily(auth.db, auth.parent);
    return NextResponse.json({ view, findings: probeFamily(view) });
  } catch (e: any) {
    console.error('[parent/desk]', e?.message);
    return NextResponse.json({ error: 'Could not load your family’s records. Try again.' }, { status: 500 });
  }
}
