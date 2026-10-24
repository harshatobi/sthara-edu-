import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { aiGate } from '@/lib/settings/server';
import { isSession } from '@/lib/admin/format';
import { loadRows, recordPrint, registerIdOf, timelineAccess } from '@/lib/timeline/server';
import { shapeTimeline, yearEvents } from '@/lib/timeline/rules';
import { askTimeline } from '@/lib/timeline/ask';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The unified timeline (Living Record brief 08), for everyone who may see a student: office roles, the class teacher,
 * subject teachers, the parent and the student. What each sees is decided here on the server (lib/timeline).
 *   GET ?studentId=<register id> | ?login=<the child's or my own login id>
 *       the year-by-year summary
 *     &session=2026-27      that year's events
 *     &print=1              the student file: every year's events (office and parents; recorded in the audit log)
 *   POST { studentId | login, messages: [{ role: 'me' | 'os', text }] }   ask about the timeline (AI)
 */
async function resolve(req: NextRequest, ids: { studentId?: unknown; login?: unknown }) {
  const { user, error, blocked } = await verifyApiToken(req.headers.get('authorization'));
  if (blocked) return { res: NextResponse.json({ error, code: blocked }, { status: 403 }) };
  if (!user || error) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createAdminClient();
  let studentId = typeof ids.studentId === 'string' && UUID.test(ids.studentId) ? ids.studentId : null;
  if (!studentId && typeof ids.login === 'string' && UUID.test(ids.login)) studentId = await registerIdOf(db, ids.login);
  if (!studentId) return { res: NextResponse.json({ error: 'Student not found' }, { status: 404 }) };
  const a = await timelineAccess(db, user.id, studentId);
  if (!a.ok) return { res: NextResponse.json({ error: a.error }, { status: a.status }) };
  return { db, a };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const r = await resolve(req, { studentId: p.get('studentId'), login: p.get('login') });
  if ('res' in r) return r.res;
  const { db, a } = r;
  const student = { id: a.subject.id, name: a.subject.fullName, admissionNo: a.subject.admissionNo };
  try {
    const session = p.get('session');
    if (session) {
      if (!isSession(session)) return NextResponse.json({ error: 'Pick a school year.' }, { status: 400 });
      return NextResponse.json({ session, events: yearEvents(await loadRows(db, a, session), a.lens, session) });
    }
    const rows = await loadRows(db, a);
    const timeline = shapeTimeline(rows, a.lens);
    if (p.get('print') === '1') {
      if (!a.lens.print) return NextResponse.json({ error: 'The student file is printed by the school office or a parent.' }, { status: 403 });
      await recordPrint(db, a);
      return NextResponse.json({ student, timeline, events: Object.fromEntries(timeline.years.map(y => [y.session, yearEvents(rows, a.lens, y.session)])) });
    }
    return NextResponse.json({ student, timeline });
  } catch (e) {
    console.error('[timeline]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the timeline.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) || {};
  const r = await resolve(req, b);
  if ('res' in r) return r.res;
  const { db, a } = r;
  if (!checkRateLimit(`timelineAsk:${a.viewer.id}`, ...limitOf('timelineAsk')).allowed) return NextResponse.json({ error: 'Too many questions in a short time. Wait a few minutes.' }, { status: 429 });
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-10)
    .map((m: any) => ({ role: m?.role === 'os' ? 'os' as const : 'me' as const, text: typeof m?.text === 'string' ? m.text.trim().slice(0, 1500) : '' }))
    .filter((m: { text: string }) => m.text);
  if (!messages.length || messages[messages.length - 1].role !== 'me') return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  const blocked = await aiGate(a.viewer.id, 'ask');
  if (blocked) return blocked;
  try {
    const timeline = shapeTimeline(await loadRows(db, a), a.lens);
    return NextResponse.json({ answer: await askTimeline(timeline, a.subject.fullName, messages, { userId: a.viewer.id, schoolId: a.subject.schoolId }) });
  } catch (e) {
    console.error('[timeline ask]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No usable answer came back. Try again, or put it another way.' }, { status: 502 });
  }
}
