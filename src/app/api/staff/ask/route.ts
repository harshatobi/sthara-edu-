import { NextResponse, type NextRequest } from 'next/server';
import { requireFeedCaller } from '@/lib/feed/access';
import { AskError, askStaffOS, staffRoleOf } from '@/lib/staff/askServer';
import { aiGate } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * POST /api/staff/ask { messages: [{ role: 'me' | 'os', text }] }
 * Ask the School OS for teachers (their classes) and school leadership (the school,
 * within their office roles). See lib/staff/askServer.ts.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedCaller(req, 'staffAsk');
  if ('res' in auth) return auth.res;
  if (!staffRoleOf(auth.me)) {
    return NextResponse.json({ error: 'Ask the School OS is for teachers and school leadership (school admin, principal, vice principal).' }, { status: 403 });
  }
  const b = await req.json().catch(() => null);
  const messages = (Array.isArray(b?.messages) ? b.messages : []).slice(-12)
    .map((m: any) => ({ role: m?.role === 'os' ? 'os' as const : 'me' as const, text: str(m?.text, 3000) })).filter((m: any) => m.text);
  if (!messages.length || messages[messages.length - 1].role !== 'me') return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  const blocked = await aiGate(auth.me.id);
  if (blocked) return blocked;
  try {
    return NextResponse.json({ reply: await askStaffOS(auth.db, auth.me, messages, 'web') });
  } catch (e: any) {
    if (e instanceof AskError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[staff/ask]', e?.message);
    return NextResponse.json({ error: 'The School OS didn’t come back with a usable answer. Try again, or put it another way.' }, { status: 502 });
  }
}
