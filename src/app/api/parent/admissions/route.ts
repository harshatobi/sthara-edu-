import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { onlineOf } from '@/lib/admin/familyAccess';
import { familyAction } from '@/lib/admin/familyServer';

export const dynamic = 'force-dynamic';

/**
 * A parent at the school applies for another child (a sibling) from the parent portal (admissions phase 2b). The
 * application starts with the family and address already on record; the rest is as on the apply page.
 *   GET                                     whether the school takes applications online, and this parent's applications
 *   POST { action: 'load' | 'create' | 'save' | 'submit' | 'upload-url' | 'upload-done' | 'remove-doc', ... }
 */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  const { data } = await db.from('schools').select('name, settings').eq('id', parent.schoolId).maybeSingle();
  const online = onlineOf(data?.settings);
  const r = await familyAction(db, { kind: 'parent', schoolId: parent.schoolId, parentId: parent.id, name: parent.name }, online, { action: 'list' });
  return NextResponse.json({ school: data?.name ?? null, open: online.open, note: online.note, ...(r.ok ? r : { applications: [] }) });
}

export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const { db, parent } = auth;
  if (!checkRateLimit(`parent-admissions:${parent.id}`, ...limitOf('applyWrite')).allowed) return NextResponse.json({ error: 'Too many at once. Wait a few minutes.' }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { data } = await db.from('schools').select('settings').eq('id', parent.schoolId).maybeSingle();
  try {
    const r = await familyAction(db, { kind: 'parent', schoolId: parent.schoolId, parentId: parent.id, name: parent.name }, onlineOf(data?.settings), b);
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error('[parent/admissions]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
