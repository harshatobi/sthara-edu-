import { NextResponse, type NextRequest } from 'next/server';
import { requireAsker } from '@/lib/ask/engine';
import { deleteAll, deleteConversation, getConversation, listConversations, updateConversation } from '@/lib/ask/store';

export const dynamic = 'force-dynamic';

const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** GET /api/ask/conversations?q=  (list, searchable)  ·  ?id=  (one, with its turns). Only the person's own. */
export async function GET(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    if (!isId(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const one = await getConversation(auth.db, auth.asker.viewer.id, id);
    return one ? NextResponse.json(one) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  return NextResponse.json({ conversations: await listConversations(auth.db, auth.asker.viewer.id, req.nextUrl.searchParams.get('q') || undefined) });
}

/** PATCH { id, pinned?, title? } */
export async function PATCH(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  const b = await req.json().catch(() => null);
  if (!isId(b?.id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const ok = await updateConversation(auth.db, auth.asker.viewer.id, b.id, { pinned: b.pinned, title: b.title });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

/** DELETE ?id=  (one conversation)  ·  ?all=1  (every conversation of this person). Permanent. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAsker(req, 'askHistory');
  if ('res' in auth) return auth.res;
  const p = req.nextUrl.searchParams;
  if (p.get('all') === '1') return NextResponse.json({ ok: await deleteAll(auth.db, auth.asker.viewer.id) });
  const id = p.get('id');
  if (!isId(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return (await deleteConversation(auth.db, auth.asker.viewer.id, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Not found.' }, { status: 404 });
}
