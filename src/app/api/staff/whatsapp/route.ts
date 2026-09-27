import { NextResponse, type NextRequest } from 'next/server';
import { mayUseStaffWhatsApp, requireFeedCaller } from '@/lib/feed/access';
import { LinkError, linkAction, linkStatus, PREFS, unlink } from '@/lib/whatsapp/link';

export const dynamic = 'force-dynamic';

async function gate(req: NextRequest) {
  const auth = await requireFeedCaller(req, 'staffWhatsapp');
  if ('res' in auth) return auth;
  if (!mayUseStaffWhatsApp(auth.me)) {
    return { res: NextResponse.json({ error: 'WhatsApp is available to teachers and school leadership (school admin, principal, vice principal).' }, { status: 403 }) };
  }
  return auth;
}

/** GET: link status and the switches this account has. */
export async function GET(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  return NextResponse.json({ ...(await linkStatus(auth.db, auth.me.id)), available: PREFS[auth.me.role] });
}

/** POST { action: 'start' | 'verify' | 'prefs' | 'optin' | 'optout', ... } (see lib/whatsapp/link.ts) */
export async function POST(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await linkAction(auth.db, { id: auth.me.id, schoolId: auth.me.schoolId, role: auth.me.role }, b));
  } catch (e: any) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[staff/whatsapp]', e?.message);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  await unlink(auth.db, auth.me.id);
  return NextResponse.json({ unlinked: true });
}
