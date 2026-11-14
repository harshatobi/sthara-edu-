import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { normClass, normSubject } from '@/lib/teacher/scope';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { todayIso, addDays } from '@/lib/teacher/course';
import { runRetention } from '@/lib/studio/after';

export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Retention checks (Studio follow-ups), the teacher's own.
 *   GET   ?class=&subject=                         scheduled, could-not-hand-out, and recently handed out
 *   PATCH { id, action: 'skip' | 'move' | 'now', date? }
 *         skip   don't hand this one out          move   a different date (today to 60 days on)
 *         now    hand it out today
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  const cls = String(req.nextUrl.searchParams.get('class') || '').slice(0, 40);
  const subject = String(req.nextUrl.searchParams.get('subject') || '').slice(0, 80);
  // bounded: one teacher's follow-ups from the last 60 days on (a few dozen)
  const { data } = await db.from('studio_followups').select('id, class, subject, chapter_name, topics, student_ids, due_on, status, note, assignment_id, source_assignment_id')
    .eq('teacher_id', staff.id).gte('due_on', addDays(todayIso(), -21)).order('due_on').limit(200);
  const rows = (data || []).filter(f => (!cls || normClass(f.class) === normClass(cls)) && (!subject || normSubject(f.subject) === normSubject(subject)));
  return NextResponse.json({ followups: rows.map(f => ({ ...f, students: f.student_ids?.length || null, student_ids: undefined })) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff(req, { academic: true });
  if ('res' in auth) return auth.res;
  const { staff, db } = auth;
  if (!checkRateLimit(`studioWrites:${staff.id}`, ...limitOf('studioWrites')).allowed) return bad('Too many changes at once. Try again in a few minutes.', 429);
  const b = await req.json().catch(() => null);
  const id = typeof b?.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : '';
  const { data: f } = id ? await db.from('studio_followups').select('id, teacher_id, status').eq('id', id).maybeSingle() : { data: null };
  if (!f || f.teacher_id !== staff.id) return bad('Unknown retention check.', 404);
  const today = todayIso();
  switch (b?.action) {
    case 'skip': {
      if (f.status === 'assigned') return bad('This one has already gone to students.', 409);
      await db.from('studio_followups').update({ status: 'skipped' }).eq('id', f.id);
      return NextResponse.json({ ok: true });
    }
    case 'move': {
      const date = typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '';
      if (!date || date < today || date > addDays(today, 60)) return bad('Pick a date from today to two months on.');
      if (f.status === 'assigned') return bad('This one has already gone to students.', 409);
      await db.from('studio_followups').update({ status: 'scheduled', due_on: date, note: null }).eq('id', f.id);
      return NextResponse.json({ ok: true });
    }
    case 'now': {
      if (f.status === 'assigned') return bad('This one has already gone to students.', 409);
      if (f.status !== 'scheduled') await db.from('studio_followups').update({ status: 'scheduled', note: null }).eq('id', f.id);
      const r = await runRetention(db, { today, id: f.id });
      if (!r.assigned) {
        const { data: after } = await db.from('studio_followups').select('note').eq('id', f.id).maybeSingle();
        return bad(after?.note || 'It couldn’t be handed out. Make one in the Studio instead.', 409);
      }
      return NextResponse.json({ ok: true });
    }
    default: return bad('Unknown action.');
  }
}
