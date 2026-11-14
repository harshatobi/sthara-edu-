import { NextResponse, type NextRequest } from 'next/server';
import { aiGate } from '@/lib/settings/server';
import { AskError, askOS, requireAsker } from '@/lib/ask/engine';
import { historyOf, ownsConversation, parentQuestionsLeft, saveTurns, startConversation } from '@/lib/ask/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/ask { conversationId?, text }
 * Ask the School OS (teachers, office staff within their roles, parents about their own children).
 * Plans live lookups, answers with numbered sources, and saves both turns to the person's history.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAsker(req, 'ask');
  if ('res' in auth) return auth.res;
  const { asker, db } = auth;
  const b = await req.json().catch(() => null);
  const text = typeof b?.text === 'string' ? b.text.trim().slice(0, 3000) : '';
  if (!text) return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  const cid = typeof b?.conversationId === 'string' && /^[0-9a-f-]{36}$/i.test(b.conversationId) ? b.conversationId : null;
  if (cid && !(await ownsConversation(db, asker.viewer.id, cid))) return NextResponse.json({ error: 'That conversation isn’t yours.' }, { status: 404 });
  if (asker.kind === 'parent') {
    const q = await parentQuestionsLeft(db, asker.viewer.id);
    if (!q.left) return NextResponse.json({ error: `You’ve asked ${q.limit} questions today, the daily limit. Ask again tomorrow, or message the school directly.`, quota: { left: 0, limit: q.limit } }, { status: 429 });
  }
  const blocked = await aiGate(asker.viewer.id, 'ask');
  if (blocked) return blocked;
  try {
    const history = cid ? await historyOf(db, cid) : [];
    const outcome = await askOS(db, asker, [...history, { role: 'me', text }]);
    const conversationId = cid ?? await startConversation(db, asker, text);
    const ids = await saveTurns(db, asker, conversationId, text, outcome);
    const quota = asker.kind === 'parent' ? await parentQuestionsLeft(db, asker.viewer.id) : null;
    return NextResponse.json({ conversationId, questionId: ids.questionId, answerId: ids.answerId, reply: outcome.reply, quota: quota && { left: quota.left, limit: quota.limit } });
  } catch (e: any) {
    if (e instanceof AskError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[ask]', e?.message);
    return NextResponse.json({ error: 'The School OS didn’t come back with a usable answer. Try again, or put it another way.' }, { status: 502 });
  }
}
