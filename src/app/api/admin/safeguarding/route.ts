import { NextResponse, type NextRequest } from 'next/server';
import { isUuid, requireAdmin } from '@/lib/admin/serverAuth';
import { addStep, cpCase, cpCases, hasLead, isCpReader } from '@/lib/conduct/safeguarding';

export const dynamic = 'force-dynamic';

/**
 * Child protection (brief 07): the Safeguarding lead's cases, or the principal's while the school has no lead.
 *   GET            the school's child-protection cases
 *   GET ?id=       one case and its steps (every look recorded)
 *   POST { action: 'step', id, kind, onDate, ref?, details? }
 */
async function gate(req: NextRequest) {
  const auth = await requireAdmin(req, ['safeguarding.cases', 'incidents.manage', 'dashboard.view']);
  if ('res' in auth) return auth;
  if (!(await isCpReader(auth.db, auth.admin.schoolId, auth.admin.access))) {
    const lead = await hasLead(auth.db, auth.admin.schoolId);
    return { res: NextResponse.json({ error: lead ? 'Child-protection cases are held by the school’s Safeguarding lead.' : 'Child-protection cases are held by the principal until the school assigns a Safeguarding lead.' }, { status: 403 }) };
  }
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      const c = isUuid(id) ? await cpCase(db, { id: admin.id, schoolId: admin.schoolId }, id) : null;
      return c ? NextResponse.json(c) : NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    return NextResponse.json({ cases: await cpCases(db, admin.schoolId), lead: await hasLead(db, admin.schoolId) });
  } catch (e) {
    console.error('[admin/safeguarding]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the cases.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = (await req.json().catch(() => null)) || {};
  if (b.action !== 'step' || !isUuid(b.id)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const out = await addStep(db, { id: admin.id, schoolId: admin.schoolId, name: admin.name }, b.id, b);
  return out.ok ? NextResponse.json(out) : NextResponse.json({ error: out.error }, { status: out.status });
}
