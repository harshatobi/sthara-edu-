import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { accessOf } from '@/lib/admin/serverAuth';
import { staffPost, MessageError } from '@/lib/parent/messages';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';

export const dynamic = 'force-dynamic';

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/** Teachers see their own conversations; office staff need messages.office. */
async function gate(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth;
  if (auth.staff.role === 'admin' && !(await accessOf(auth.db, auth.staff.id, auth.staff.schoolId)).can('messages.office')) {
    return { res: NextResponse.json({ error: 'Your office role doesn’t include parent messages.' }, { status: 403 }) };
  }
  return auth;
}

/**
 * GET /api/staff/messages            parent conversations for this teacher (admins: the office's,
 *                                    plus every conversation in the school with ?all=1)
 * GET /api/staff/messages?thread=id  one conversation, marked read
 */
export async function GET(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const id = req.nextUrl.searchParams.get('thread');
  if (id) {
    if (!isUuid(id)) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
    const { data: t } = await db.from('school_threads').select('*').eq('id', id).eq('school_id', staff.schoolId).maybeSingle();
    if (!t || (staff.role === 'teacher' && t.staff_id !== staff.id)) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
    const { data: msgs } = await db.from('school_messages').select('id, sender_id, sender_role, body, channel, created_at').eq('thread_id', t.id).order('created_at');
    const ids = [...new Set([t.parent_id, t.student_id, ...(msgs || []).map(m => m.sender_id).filter(Boolean)])];
    const { data: people } = await db.from('users').select('id, name, student_class').in('id', ids);
    const who = new Map((people || []).map(p => [p.id, p]));
    if (t.staff_id === staff.id || (staff.role === 'admin' && !t.staff_id)) await db.from('school_threads').update({ staff_read_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({
      thread: { id: t.id, subject: t.subject, topic: t.topic, status: t.status, audience: t.audience, parentName: who.get(t.parent_id)?.name || 'Parent', student: { id: t.student_id, name: who.get(t.student_id)?.name || 'Student', cls: who.get(t.student_id)?.student_class || '' }, parentReadAt: t.parent_read_at },
      messages: (msgs || []).map(m => ({ id: m.id, from: m.sender_role, name: m.sender_id === staff.id ? 'You' : who.get(m.sender_id)?.name || m.sender_role, body: m.body, channel: m.channel, at: m.created_at })),
    });
  }
  let q = db.from('school_threads').select('*').eq('school_id', staff.schoolId).order('last_message_at', { ascending: false }).limit(200);
  if (staff.role === 'teacher') q = q.eq('staff_id', staff.id);
  else if (req.nextUrl.searchParams.get('all') !== '1') q = q.eq('audience', 'office');
  const { data: threads, error } = await q;
  if (error) return NextResponse.json({ error: 'Messages aren’t available yet.', detail: error.message }, { status: 500 });
  const tids = (threads || []).map(t => t.id);
  const { data: last } = tids.length ? await db.from('school_messages').select('thread_id, sender_role, body, created_at').in('thread_id', tids).order('created_at', { ascending: false }).limit(800) : { data: [] as any[] };
  const lastBy = new Map<string, any>();
  for (const m of last || []) if (!lastBy.has(m.thread_id)) lastBy.set(m.thread_id, m);
  const ids = [...new Set((threads || []).flatMap(t => [t.parent_id, t.student_id, t.staff_id].filter(Boolean)))];
  const { data: people } = ids.length ? await db.from('users').select('id, name, student_class').in('id', ids) : { data: [] as any[] };
  const who = new Map((people || []).map(p => [p.id, p]));
  return NextResponse.json({
    threads: (threads || []).map(t => {
      const m = lastBy.get(t.id);
      return {
        id: t.id, subject: t.subject, topic: t.topic, status: t.status, audience: t.audience, lastAt: t.last_message_at,
        parentName: who.get(t.parent_id)?.name || 'Parent', student: { id: t.student_id, name: who.get(t.student_id)?.name || 'Student', cls: who.get(t.student_id)?.student_class || '' },
        staffName: t.staff_id ? who.get(t.staff_id)?.name || 'Teacher' : null,
        unread: !!m && m.sender_role === 'parent' && (!t.staff_read_at || new Date(t.staff_read_at) < new Date(m.created_at)),
        preview: (m?.body || '').slice(0, 140), lastFrom: m?.sender_role ?? null,
      };
    }),
  });
}

/** POST { threadId, body } reply · PATCH { threadId, status: 'open' | 'closed' } */
export async function POST(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  if (!checkRateLimit(`school-msg:${auth.staff.id}`, ...limitOf('schoolMessages')).allowed) {
    return NextResponse.json({ error: 'Too many messages in a short time. Try again shortly.' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await staffPost(auth.db, auth.staff, b?.threadId, b?.body));
  } catch (e: any) {
    if (e instanceof MessageError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[staff/messages]', e?.message);
    return NextResponse.json({ error: 'Could not send the reply.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await gate(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  const b = await req.json().catch(() => ({}));
  if (!isUuid(b?.threadId) || !['open', 'closed'].includes(b?.status)) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  let q = db.from('school_threads').update({ status: b.status }).eq('id', b.threadId).eq('school_id', staff.schoolId);
  if (staff.role === 'teacher') q = q.eq('staff_id', staff.id);
  const { data, error } = await q.select('id');
  if (error || !data?.length) return NextResponse.json({ error: 'Unknown conversation.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
