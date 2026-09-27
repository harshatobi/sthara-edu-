import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { linkUsable, whatsappConfig } from '@/lib/whatsapp/config';
import { handleInbound } from '@/lib/whatsapp/inbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Test mode only (no WhatsApp Business line connected yet): lets a signed-in user
 * with a linked number "send" a WhatsApp message from the app. It goes through the
 * real inbound handler exactly as a webhook delivery would, and the replies logged
 * for them come back. Returns 404 once the channel is live.
 *
 * GET   the recent conversation (both directions) for the caller's number
 * POST  { text }   send one message as if from their phone
 */
async function gate(req: NextRequest) {
  if (whatsappConfig().mode !== 'simulated') return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createAdminClient();
  const { data: link } = await db.from('whatsapp_links').select('phone_e164, verified_at, verified_mode').eq('user_id', user.id).maybeSingle();
  if (!link || !linkUsable(link)) return { res: NextResponse.json({ error: 'Link your WhatsApp number first.' }, { status: 409 }) };
  return { db, userId: user.id, phone: link.phone_e164 as string };
}

const shape = (r: any) => ({ id: r.id, dir: r.direction, kind: r.kind, body: r.body, at: r.created_at });

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('res' in g) return g.res;
  const { data } = await g.db.from('whatsapp_log').select('id, direction, kind, body, created_at').eq('phone_e164', g.phone)
    .neq('kind', 'otp').order('created_at', { ascending: false }).limit(40);
  return NextResponse.json({ phone: g.phone, messages: (data || []).reverse().map(shape) });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('res' in g) return g.res;
  const b = await req.json().catch(() => ({}));
  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 2000) : '';
  if (!text) return NextResponse.json({ error: 'Type a message.' }, { status: 400 });
  const since = new Date(Date.now() - 1000).toISOString();
  await handleInbound(g.db, { from: g.phone.replace(/^\+/, ''), text, id: null });
  const { data } = await g.db.from('whatsapp_log').select('id, direction, kind, body, created_at').eq('phone_e164', g.phone)
    .neq('kind', 'otp').gte('created_at', since).order('created_at');
  return NextResponse.json({ messages: (data || []).map(shape) });
}
