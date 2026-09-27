import { NextResponse, after, type NextRequest } from 'next/server';
import { canReadSchoolFeed, requireFeedCaller } from '@/lib/feed/access';
import { acknowledgeSituation } from '@/lib/feed/ack';
import { maybeSendDigest } from '@/lib/staff/digest';
import { scanSchool } from '@/lib/feed/scan';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * POST /api/feed
 *   { action: 'scan' }             run the school's detectors and due escalations (throttled; idempotent)
 *   { action: 'ack', id, note? }   acknowledge an item you can see, with an optional note
 * Reads go through row-level security on public.situations from the client.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedCaller(req);
  if ('res' in auth) return auth.res;
  const { me, db } = auth;
  const body = await req.json().catch(() => ({}));

  if (body?.action === 'scan') {
    if (me.role === 'admin' && !canReadSchoolFeed(me)) return bad("Your role doesn't include the situational feed.", 403);
    try {
      const r = await scanSchool(db, me.schoolId);
      // Opening the feed is also when today's WhatsApp digest goes out (no scheduler yet).
      after(() => maybeSendDigest(db, me));
      return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
      console.error('[feed scan]', e?.message);
      return bad('Could not refresh the feed. Try again shortly.', 500);
    }
  }

  if (body?.action === 'ack') {
    const r = await acknowledgeSituation(db, me, typeof body.id === 'string' ? body.id : '', body.note);
    if (!r.ok) return bad(r.error, r.status);
    return NextResponse.json({ ok: true, already: r.already, acknowledgedAt: r.acknowledgedAt, by: me.name });
  }

  return bad('Unknown action.');
}
