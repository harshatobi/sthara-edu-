import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '@/lib/teacher/serverAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { limitOf } from '@/lib/settings/limits';
import { fmtDate } from '@/lib/admin/format';
import { isUuid } from '@/lib/admin/serverAuth';
import { alertCoordinators } from '@/lib/schedule/notify';

export const dynamic = 'force-dynamic';

/**
 * A substitute flags a problem with a cover they've been given (they can't decline it).
 *   PUT { coverId, note }   the coordinator is alerted; the cover stays assigned until they change it
 */
export async function PUT(req: NextRequest) {
  const auth = await requireStaff(req);
  if ('res' in auth) return auth.res;
  const { db, staff } = auth;
  if (!checkRateLimit(`cover-flag:${staff.id}`, ...limitOf('leave')).allowed) return NextResponse.json({ error: 'Too many requests at once.' }, { status: 429 });
  const b = await req.json().catch(() => null);
  const note = typeof b?.note === 'string' ? b.note.trim().slice(0, 500) : '';
  if (!isUuid(b?.coverId)) return NextResponse.json({ error: 'Pick the cover.' }, { status: 400 });
  if (!note) return NextResponse.json({ error: 'Say what the problem is.' }, { status: 400 });
  const { data: c, error } = await db.from('cover_assignments').update({ flag_note: note, flagged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', b.coverId).eq('school_id', staff.schoolId).eq('sub_user_id', staff.id).eq('status', 'assigned')
    .select('class, subject, period_no, on_date').maybeSingle();
  if (error) { console.error('[cover flag]', error.message); return NextResponse.json({ error: 'Could not send that.' }, { status: 500 }); }
  if (!c) return NextResponse.json({ error: 'That cover isn\'t yours, or it was changed. Refresh your schedule.' }, { status: 404 });
  await alertCoordinators(db, staff.schoolId, 'Cover problem flagged',
    `${staff.name} flagged the cover for ${c.subject} in ${c.class}, period ${c.period_no} on ${fmtDate(c.on_date)}: "${note}"`, { coverId: b.coverId });
  return NextResponse.json({ ok: true });
}
