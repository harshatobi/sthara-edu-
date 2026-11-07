import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { loadRows, recordPrint, registerIdOf, timelineAccess } from '@/lib/timeline/server';
import { monthSeries, shapeTimeline, yearEvents } from '@/lib/timeline/rules';
import { leadOf } from '@/lib/timeline/lead';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The unified timeline (Living Record brief 08), for everyone who may see a student: office roles, the class teacher,
 * subject teachers, the parent and the student. What each sees is decided here on the server (lib/timeline).
 *   GET ?studentId=<register id> | ?login=<the child's or my own login id>
 *       the year-by-year summary, every year's events (tiered) and the month series for the trend band
 *     &print=1              the same, for the student file (office and parents; recorded in the audit log)
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
  const student = { id: a.subject.id, name: a.subject.fullName, admissionNo: a.subject.admissionNo, userId: a.subject.userId };
  try {
    const rows = await loadRows(db, a);
    const timeline = shapeTimeline(rows, a.lens);
    if (p.get('print') === '1') {
      if (!a.lens.print) return NextResponse.json({ error: 'The student file is printed by the school office or a parent.' }, { status: 403 });
      await recordPrint(db, a);
    }
    const events = timeline.years.flatMap(y => yearEvents(rows, a.lens, y.session));
    const series = monthSeries(rows, a.lens);
    return NextResponse.json({ student, timeline, events, series, lead: leadOf(rows, a.lens, events, series) });
  } catch (e) {
    console.error('[timeline]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not load the timeline.' }, { status: 500 });
  }
}
