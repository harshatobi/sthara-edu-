import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { askSchoolOS } from '@/lib/parent/askServer';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/**
 * POST /api/parent/ask { messages: [{ role: 'parent' | 'os', text }] }
 * Ask the School OS: answers from this family's own records (see askServer.ts).
 */
export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`parent-ask:${auth.parent.id}`, ...limitOf('parentAsk')).allowed) {
    return NextResponse.json({ error: 'That’s a lot of questions in a short time. Try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => null);
  const messages = (Array.isArray(b?.messages) ? b.messages : []).slice(-12)
    .map((m: any) => ({ role: m?.role === 'os' ? 'os' as const : 'parent' as const, text: str(m?.text, 3000) })).filter((m: any) => m.text);
  if (!messages.length || messages[messages.length - 1].role !== 'parent') return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  const blocked = await aiGate(auth.parent.id);
  if (blocked) return blocked;
  try {
    const { reply } = await askSchoolOS(auth.db, auth.parent, messages, 'web');
    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error('[parent/ask]', e?.message);
    const msg = /configured/.test(e?.message || '') ? e.message : 'The School OS didn’t come back with a usable answer. Try again, or put it another way.';
    return NextResponse.json({ error: msg }, { status: /configured/.test(e?.message || '') ? 503 : 502 });
  }
}
