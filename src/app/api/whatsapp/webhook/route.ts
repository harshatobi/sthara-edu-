import { NextResponse, after, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { whatsappConfig } from '@/lib/whatsapp/config';
import { verifySignature } from '@/lib/whatsapp/send';
import { handleInbound } from '@/lib/whatsapp/inbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Meta's one-time webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const want = whatsappConfig().verifyToken;
  if (p.get('hub.mode') === 'subscribe' && want && p.get('hub.verify_token') === want) {
    return new NextResponse(p.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Inbound WhatsApp events. Signed by Meta with the app secret; answered with 200
 * straight away (Meta retries slow webhooks), then each parent message is handled
 * after the response.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const messages: { from: string; text: string; id: string | null }[] = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      for (const m of Array.isArray(ch?.value?.messages) ? ch.value.messages : []) {
        if (!m?.from) continue;
        const text = m.type === 'text' ? m.text?.body
          : m.type === 'button' ? m.button?.text
          : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title)
          : '';
        messages.push({ from: String(m.from), text: typeof text === 'string' ? text : '', id: typeof m.id === 'string' ? m.id : null });
      }
    }
  }
  if (messages.length) {
    after(async () => {
      const db = createAdminClient();
      for (const m of messages.slice(0, 10)) {
        try { await handleInbound(db, m); } catch (e: any) { console.error('[whatsapp webhook]', e?.message); }
      }
    });
  }
  return NextResponse.json({ received: messages.length });
}
