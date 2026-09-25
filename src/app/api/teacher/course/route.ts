import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { inScope } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { CURRENT_SESSION } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const date = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? v : null);
const STATUSES = ['not_started', 'in_progress', 'taught', 'revisit'];

/**
 * Syllabus coverage and pacing for one class + subject.
 *   PUT  { class, subject, plan?: { termStart, termEnd, periodsPerWeek, periodMinutes },
 *          items?: [{ chapterKey, topic ('' = the chapter row), status?, taughtOn?, plannedStart?, plannedEnd?, note? }] }
 * Only fields present on an item are changed. Coverage is shared by every
 * teacher of the class + subject; each write records who made it.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`course:${staff.id}`, ...limitOf('course')).allowed) {
    return NextResponse.json({ error: 'Too many changes at once. Try again in a minute.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const cls = str(body?.class, 40);
  const subject = str(body?.subject, 60);
  if (!cls || !subject) return NextResponse.json({ error: 'class and subject are required' }, { status: 400 });
  if (staff.role === 'teacher' && !inScope(staff.scope, cls, subject)) {
    return NextResponse.json({ error: `You don't teach ${subject} to ${cls}.` }, { status: 403 });
  }
  const base = { school_id: staff.schoolId, class: cls, subject, session: CURRENT_SESSION };

  if (body?.plan) {
    const p = body.plan;
    const termStart = date(p.termStart), termEnd = date(p.termEnd);
    const ppw = Number(p.periodsPerWeek), mins = Number(p.periodMinutes);
    if (!termStart || !termEnd || termEnd <= termStart) return NextResponse.json({ error: 'The term must end after it starts.' }, { status: 400 });
    if (!Number.isInteger(ppw) || ppw < 1 || ppw > 20) return NextResponse.json({ error: 'Periods per week must be between 1 and 20.' }, { status: 400 });
    if (!Number.isInteger(mins) || mins < 20 || mins > 120) return NextResponse.json({ error: 'A period must be 20 to 120 minutes.' }, { status: 400 });
    const { error } = await db.from('course_plans').upsert(
      { ...base, term_start: termStart, term_end: termEnd, periods_per_week: ppw, period_minutes: mins, updated_by: staff.id },
      { onConflict: 'school_id,class,subject,session' },
    );
    if (error) { console.error('[course PUT plan]', error.message); return NextResponse.json({ error: 'Could not save the term plan.' }, { status: 500 }); }
  }

  const items = Array.isArray(body?.items) ? body.items.slice(0, 300) : [];
  if (items.length) {
    const keys = items.map((it: any) => ({ chapter_key: str(it?.chapterKey), topic: str(it?.topic, 500) }));
    if (keys.some((k: any) => !k.chapter_key)) return NextResponse.json({ error: 'Every item needs a chapterKey.' }, { status: 400 });
    // Merge onto what's stored, so a partial update never blanks other fields.
    const { data: existing } = await db.from('syllabus_progress').select('*')
      .eq('school_id', staff.schoolId).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION)
      .in('chapter_key', [...new Set(keys.map((k: any) => k.chapter_key))]);
    const prev = new Map((existing || []).map(r => [`${r.chapter_key}::${r.topic}`, r]));
    const rows = [];
    for (const [i, it] of items.entries()) {
      const k = keys[i];
      const old = prev.get(`${k.chapter_key}::${k.topic}`) || {};
      const status = it.status === undefined ? old.status ?? 'not_started' : it.status;
      if (!STATUSES.includes(status)) return NextResponse.json({ error: `Unknown status "${status}".` }, { status: 400 });
      const plannedStart = it.plannedStart === undefined ? old.planned_start ?? null : date(it.plannedStart);
      const plannedEnd = it.plannedEnd === undefined ? old.planned_end ?? null : date(it.plannedEnd);
      if (plannedStart && plannedEnd && plannedEnd < plannedStart) return NextResponse.json({ error: 'A chapter window must end after it starts.' }, { status: 400 });
      rows.push({
        ...base, ...k, status,
        // Taught keeps (or gets) a date; any other status clears it.
        taught_on: status === 'taught' ? (it.taughtOn !== undefined ? date(it.taughtOn) : old.taught_on) ?? new Date().toISOString().slice(0, 10) : null,
        planned_start: plannedStart, planned_end: plannedEnd,
        note: it.note === undefined ? old.note ?? null : (str(it.note, 2000) || null),
        updated_by: staff.id,
      });
    }
    const { error } = await db.from('syllabus_progress').upsert(rows, { onConflict: 'school_id,class,subject,session,chapter_key,topic' });
    if (error) { console.error('[course PUT items]', error.message); return NextResponse.json({ error: 'Could not save coverage.' }, { status: 500 }); }
  }
  return NextResponse.json({ success: true });
}
