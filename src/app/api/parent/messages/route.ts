import { NextResponse, type NextRequest } from 'next/server';
import { requireParent } from '@/lib/parent/serverAuth';
import { parentPost, MessageError } from '@/lib/parent/messages';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** GET /api/parent/messages?thread=<id> — one conversation, and marks it read. */
export async function GET(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  const id = req.nextUrl.searchParams.get('thread');
  if (!isUuid(id)) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
  const { db, parent } = auth;
  const { data: t } = await db.from('school_threads').select('*').eq('id', id).eq('parent_id', parent.id).maybeSingle();
  if (!t) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
  const { data: g } = await db.from('guardians').select('id').eq('parent_id', parent.id).eq('student_id', t.student_id).eq('verified', true).maybeSingle();
  if (!g) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
  const { data: msgs } = await db.from('school_messages').select('id, sender_id, sender_role, body, channel, created_at').eq('thread_id', t.id).order('created_at');
  const senders = [...new Set((msgs || []).map(m => m.sender_id).filter(Boolean))];
  const { data: people } = senders.length ? await db.from('users').select('id, name').in('id', senders) : { data: [] as any[] };
  const names = new Map((people || []).map(p => [p.id, p.name]));
  await db.from('school_threads').update({ parent_read_at: new Date().toISOString() }).eq('id', t.id);
  return NextResponse.json({
    thread: { id: t.id, subject: t.subject, topic: t.topic, status: t.status, audience: t.audience, studentId: t.student_id, staffReadAt: t.staff_read_at },
    messages: (msgs || []).map(m => ({ id: m.id, from: m.sender_role, name: m.sender_role === 'parent' ? 'You' : names.get(m.sender_id) || (m.sender_role === 'admin' ? 'School office' : 'Teacher'), body: m.body, channel: m.channel, at: m.created_at })),
  });
}

/** POST /api/parent/messages — new conversation or reply (see parentPost). */
export async function POST(req: NextRequest) {
  const auth = await requireParent(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`school-msg:${auth.parent.id}`, ...limitOf('schoolMessages')).allowed) {
    return NextResponse.json({ error: 'You’ve sent a lot of messages in a short time. Try again shortly.' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  try {
    const r = await parentPost(auth.db, auth.parent, { ...b, channel: 'web' });
    return NextResponse.json(r);
  } catch (e: any) {
    if (e instanceof MessageError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[parent/messages]', e?.message);
    return NextResponse.json({ error: 'Could not send the message.' }, { status: 500 });
  }
}
