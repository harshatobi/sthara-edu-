import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin/serverAuth';
import { setupCounts } from '@/lib/admin/setupServer';
import { setupSteps } from '@/lib/admin/setup';

export const dynamic = 'force-dynamic';

/** GET: the school's setup checklist (lib/admin/setup.ts), for office accounts that set the school up. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ['access.manage', 'people.manage', 'session.manage', 'fees.bill', 'data.import']);
  if ('res' in auth) return auth.res;
  try {
    return NextResponse.json(setupSteps(await setupCounts(auth.db, auth.admin.schoolId)));
  } catch (e) {
    console.error('[admin setup]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not work out the setup checklist.' }, { status: 500 });
  }
}
