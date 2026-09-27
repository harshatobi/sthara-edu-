import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { fmtDate } from '@/lib/admin/format';
import { notifyPerson } from '@/lib/schedule/notify';
import { dbError, staffIds } from '@/lib/schedule/server';
import { personCols, personKey, type PersonKey } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * Compensatory days, granted case by case from a duty record (schedule.workforce).
 *   POST   { person, days: 0.5 | 1, dutyOn, source: 'roster' | 'duty' | 'cover' | 'other', sourceId?, note }
 *   DELETE { id }   revoke (kept for the record; an unused day comes off the balance)
 * For staff with a login the days add to their Compensatory leave balance.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const who = String(b.person || '') as PersonKey;
  if (!(await staffIds(db, admin.schoolId)).has(who)) return bad('Pick a member of staff.');
  const days = Number(b.days);
  if (days !== 0.5 && days !== 1) return bad('A comp-off is a half or a full day.');
  if (!ISO_DAY.test(String(b.dutyOn))) return bad('Pick the date of the duty.');
  if (!['roster', 'duty', 'cover', 'other'].includes(b.source)) return bad('Say which duty earned it.');
  const note = str(b.note, 500);
  if (!note) return bad('Add a note: what the duty was and why it earns a day.');
  const sourceId = isUuid(b.sourceId) ? b.sourceId : null;
  if (sourceId) {
    const { count } = await db.from('comp_off_grants').select('id', { count: 'exact', head: true })
      .eq('school_id', admin.schoolId).eq('source_id', sourceId).eq('duty_on', b.dutyOn).is('revoked_at', null)
      .or(who.startsWith('s:') ? `staff_member_id.eq.${who.slice(2)}` : `user_id.eq.${who}`);
    if (count) return bad('A comp-off was already granted for that duty.', 409);
  }
  const { error } = await db.from('comp_off_grants').insert({
    school_id: admin.schoolId, ...personCols(who), days, duty_on: b.dutyOn, source: b.source, source_id: sourceId, note, granted_by: admin.id,
  });
  if (error) return dbError(error, 'Could not grant the comp-off.');
  await notifyPerson(db, admin.schoolId, who, 'Compensatory leave granted',
    `${days === 1 ? 'A day' : 'Half a day'} of compensatory leave for your duty on ${fmtDate(b.dutyOn)}.${who.startsWith('s:') ? '' : ' Apply for it from Leave.'}`, {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick the grant.');
  const { data, error } = await db.from('comp_off_grants').update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
    .eq('id', b.id).eq('school_id', admin.schoolId).is('revoked_at', null).select('user_id, staff_member_id').maybeSingle();
  if (error) return dbError(error, 'Could not revoke it.');
  if (!data) return bad('It was already revoked.', 409);
  const who = personKey(data.user_id, data.staff_member_id);
  if (who) await notifyPerson(db, admin.schoolId, who, 'Compensatory leave withdrawn', 'A compensatory leave grant was withdrawn by the office.', {});
  return NextResponse.json({ ok: true });
}
