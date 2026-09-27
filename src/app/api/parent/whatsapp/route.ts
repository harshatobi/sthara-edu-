import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { LinkError, linkAction, unlink } from '@/lib/whatsapp/link';

export const dynamic = 'force-dynamic';

/**
 * POST /api/parent/whatsapp
 *   { action: 'start', phone, consent: true }   send a 6-digit code to the number
 *   { action: 'verify', code }                 confirm it: the number is linked and opted in
 *   { action: 'prefs', prefs: {...} }          which updates to push
 *   { action: 'optin' | 'optout' }             pause / resume everything
 * DELETE /api/parent/whatsapp                  unlink the number
 */
export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await linkAction(auth.db, { id: auth.parent.id, schoolId: auth.parent.schoolId, role: 'parent' }, b));
  } catch (e: any) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[parent/whatsapp]', e?.message);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  await unlink(auth.db, auth.parent.id);
  return NextResponse.json({ unlinked: true });
}
