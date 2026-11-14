import { NextResponse, type NextRequest } from 'next/server';
import { aiGate } from '@/lib/settings/server';
import { AskError, askOS, requireAsker } from '@/lib/ask/engine';
import { deleteConversation, historyOf, ownsConversation, parentQuestionsLeft, saveTurns, startConversation } from '@/lib/ask/store';

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
  // Parents: today's count is read before answering (the meter is written in the background, so a read just after
  // the answer can miss it); the answer returns that count less one.
  const q = asker.kind === 'parent' ? await parentQuestionsLeft(db, asker.viewer.id) : null;
  if (q) {
    if (!q.left) return NextResponse.json({ error: `You’ve asked ${q.limit} questions today, the daily limit. Ask again tomorrow, or message the school directly.`, quota: { left: 0, limit: q.limit } }, { status: 429 });
  }
  const blocked = await aiGate(asker.viewer.id, 'ask');
  if (blocked) return blocked;
  try {
    const history = cid ? await historyOf(db, cid) : [];
    const outcome = await askOS(db, asker, [...history, { role: 'me', text }]);
    const conversationId = cid ?? await startConversation(db, asker, text);
    const ids = await saveTurns(db, asker, conversationId, text, outcome).catch(async e => {
      // A new conversation whose first turns couldn't be saved is removed, so history never shows an empty one.
      if (!cid) await deleteConversation(db, asker.viewer.id, conversationId).catch(() => {});
      throw e;
    });
    return NextResponse.json({ conversationId, questionId: ids.questionId, answerId: ids.answerId, reply: outcome.reply, quota: q && { left: Math.max(0, q.left - 1), limit: q.limit } });
  } catch (e: any) {
    if (e instanceof AskError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[ask]', e?.message);
    // The AI provider is busy or out of quota: say so plainly (it is not the school's allowance, and not the question).
    if (e?.status === 429 || /\b429\b|quota|RESOURCE_EXHAUSTED|overloaded|rate.?limit/i.test(String(e?.message))) {
      return NextResponse.json({ error: 'The AI service is busy right now. Wait a minute and try again; your question was not used up.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'The School OS didn’t come back with a usable answer. Try again, or put it another way.' }, { status: 502 });
  }
}
