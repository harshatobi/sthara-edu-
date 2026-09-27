import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { daysBetween, fmtDate, isoDay } from '@/lib/admin/format';
import { candidatesFor, needsOn, type Need } from '@/lib/schedule/cover';
import { hhmm, namesOf } from '@/lib/schedule/engine';
import { loadScheduleRows } from '@/lib/schedule/load';
import { notifyPerson } from '@/lib/schedule/notify';
import { dbError, staffIds } from '@/lib/schedule/server';
import { personCols, personKey, type PersonKey } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * Cover for absent teachers (schedule.academic).
 *   POST   { action: 'absent', person, date, portion: 'full' | 'am' | 'pm', reason? }    someone is off today
 *   POST   { action: 'release', person, date, periods: number[], reason }             free a teacher for some periods
 *   POST   { action: 'confirm' | 'cancel', id }                                         an absence (WhatsApp reports need confirming)
 *   PUT    { action: 'assign', date, slotIds, sub, overCap? }                           a substitute for one lesson (all sections of a combined one)
 *   PUT    { action: 'not_needed', date, slotIds }                                      no cover needed (half-day leave, class away)
 *   DELETE { date, slotIds }                                                            undo an assignment
 * `person` and `sub` are person keys: an account id, or "s:" + a register id. Every assignment is re-checked
 * here against the day's needs and who is free; the substitute is told in the app and on WhatsApp.
 */
const AHEAD = 90, BEHIND = 30;
const dateOk = (d: unknown): d is string => typeof d === 'string' && ISO_DAY.test(d) && daysBetween(isoDay(), d) <= AHEAD && daysBetween(d, isoDay()) <= BEHIND;
const PORTIONS = ['full', 'am', 'pm'];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.action === 'absent' || b.action === 'release') {
    const who = String(b.person || '') as PersonKey;
    if (!(await staffIds(db, admin.schoolId)).has(who)) return bad('Pick a member of staff.');
    if (!dateOk(b.date)) return bad(`Pick a date within the last ${BEHIND} or next ${AHEAD} days.`);
    const reason = str(b.reason, 500);
    let row: Record<string, unknown>;
    if (b.action === 'absent') {
      if (!PORTIONS.includes(b.portion)) return bad('Full day, morning or afternoon?');
      row = { kind: 'absent', portion: b.portion, period_nos: [] };
    } else {
      const periods = [...new Set<number>((Array.isArray(b.periods) ? b.periods : []).map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= 16);
      if (!periods.length) return bad('Pick the periods to release them from.');
      if (!reason) return bad('Say why they are released (training, event duty).');
      row = { kind: 'release', portion: 'periods', period_nos: periods.sort((x, y) => x - y) };
    }
    const { data, error } = await db.from('staff_absences').insert({
      school_id: admin.schoolId, ...personCols(who), on_date: b.date, ...row, reason: reason || null, status: 'confirmed', source: 'office',
      created_by: admin.id, confirmed_by: admin.id, confirmed_at: new Date().toISOString(),
    }).select('id').single();
    return error ? dbError(error, 'Could not record that.') : NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === 'confirm' || b.action === 'cancel') {
    if (!isUuid(b.id)) return bad('Pick an absence.');
    const { data: a } = await db.from('staff_absences').select('*').eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
    if (!a) return bad('That absence no longer exists.', 404);
    if (b.action === 'confirm') {
      if (a.status !== 'reported') return bad('It is already confirmed or cancelled.', 409);
      const { error } = await db.from('staff_absences').update({ status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() }).eq('id', a.id);
      return error ? dbError(error, 'Could not confirm it.') : NextResponse.json({ ok: true });
    }
    const { error } = await db.from('staff_absences').update({ status: 'cancelled' }).eq('id', a.id);
    if (error) return dbError(error, 'Could not cancel it.');
    // Covers arranged for lessons that no longer need one are removed, and the substitutes told.
    const rows = await loadScheduleRows(db, admin.schoolId);
    const { stale } = needsOn(a.on_date, rows);
    const names = namesOf(rows);
    for (const c of stale) {
      await db.from('cover_assignments').delete().eq('id', c.id);
      const sub = personKey(c.sub_user_id, c.sub_staff_member_id);
      if (sub) await notifyPerson(db, admin.schoolId, sub, 'Cover no longer needed', `${c.subject} in ${c.class}, period ${c.period_no} on ${fmtDate(c.on_date)}: ${names.get(personKey(c.absent_user_id, c.absent_staff_member_id) || '') || 'the teacher'} is in after all.`, { coverId: c.id });
    }
    return NextResponse.json({ ok: true, removed: stale.length });
  }
  return bad('Unknown action.');
}

/** The need that holds these lessons on this date, from a fresh load (never trusted from the client). */
async function needFor(db: any, schoolId: string, date: string, slotIds: unknown) {
  const ids = Array.isArray(slotIds) ? slotIds.filter(isUuid) : [];
  if (!ids.length) return { error: 'Pick the lesson.' } as const;
  const rows = await loadScheduleRows(db, schoolId);
  const need = needsOn(date, rows).needs.find(n => ids.every(id => n.lessons.some(l => l.slot.id === id)));
  if (!need) return { error: 'That lesson doesn\'t need cover on that date. Refresh the cover board.' } as const;
  return { need, rows } as const;
}

const lessonWords = (n: Need, date: string) => `${n.subject} in ${n.classes}, period ${n.period_no} (${hhmm(n.startAt, true)}–${hhmm(n.endAt, true)}) on ${fmtDate(date)}`;

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !dateOk(b.date)) return bad('Pick a date.');
  const found = await needFor(db, admin.schoolId, b.date, b.slotIds);
  if ('error' in found) return bad(found.error!, 409);
  const { need, rows } = found;
  const names = namesOf(rows);
  const before = need.state === 'assigned' ? need.sub : null;
  const snapshot = (slotId: string) => {
    const l = need.lessons.find(x => x.slot.id === slotId)!;
    return {
      school_id: admin.schoolId, on_date: b.date, slot_id: slotId, class: l.slot.class, period_no: l.slot.period_no, subject: l.slot.subject,
      absent_user_id: need.person.startsWith('s:') ? null : need.person, absent_staff_member_id: need.person.startsWith('s:') ? need.person.slice(2) : null,
      reason: need.reason, assigned_by: admin.id, updated_at: new Date().toISOString(), flag_note: null, flagged_at: null,
    };
  };
  const slotIds = need.lessons.map(l => l.slot.id!);

  if (b.action === 'not_needed') {
    const { error } = await db.from('cover_assignments').upsert(slotIds.map(id => ({ ...snapshot(id), status: 'not_needed', sub_user_id: null, sub_staff_member_id: null })), { onConflict: 'on_date,slot_id' });
    if (error) return dbError(error, 'Could not save that.');
    if (before) await notifyPerson(db, admin.schoolId, before, 'Cover cancelled', `You no longer cover ${lessonWords(need, b.date)}.`, { date: b.date });
    return NextResponse.json({ ok: true });
  }

  if (b.action !== 'assign') return bad('Unknown action.');
  const sub = String(b.sub || '') as PersonKey;
  const { ranked, atCap } = candidatesFor(need, b.date, rows);
  const ok = ranked.find(c => c.person === sub) ?? (b.overCap ? atCap.find(c => c.person === sub) : undefined);
  if (!ok) {
    return atCap.some(c => c.person === sub)
      ? NextResponse.json({ error: `${names.get(sub)} already has ${atCap.find(c => c.person === sub)!.coversToday} covers that day. Confirm to give them another.`, atCap: true }, { status: 409 })
      : bad(`${names.get(sub) || 'That person'} isn't free for that period.`, 409);
  }
  const { error } = await db.from('cover_assignments').upsert(slotIds.map(id => ({ ...snapshot(id), status: 'assigned', ...(sub.startsWith('s:') ? { sub_user_id: null, sub_staff_member_id: sub.slice(2) } : { sub_user_id: sub, sub_staff_member_id: null }) })), { onConflict: 'on_date,slot_id' });
  if (error) return dbError(error, 'Could not assign the cover.');
  const room = need.lessons[0].slot.room_id ? rows.rooms.find(r => r.id === need.lessons[0].slot.room_id)?.name : rows.rooms.find(r => r.home_class && r.home_class === need.lessons[0].slot.class)?.name;
  await notifyPerson(db, admin.schoolId, sub, 'Cover assigned', `Please take ${lessonWords(need, b.date)}${room ? ` in ${room}` : ''}, for ${names.get(need.person) || 'a colleague'}.`, { date: b.date, slotIds });
  if (before && before !== sub) await notifyPerson(db, admin.schoolId, before, 'Cover changed', `Someone else now covers ${lessonWords(need, b.date)}.`, { date: b.date });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !ISO_DAY.test(String(b.date)) || !Array.isArray(b.slotIds) || !b.slotIds.every(isUuid)) return bad('Pick the lesson.');
  const { data: rows, error } = await db.from('cover_assignments').delete().eq('school_id', admin.schoolId).eq('on_date', b.date).in('slot_id', b.slotIds).select('*');
  if (error) return dbError(error, 'Could not undo that.');
  const c = (rows || []).find(r => r.status === 'assigned');
  const sub = c ? personKey(c.sub_user_id, c.sub_staff_member_id) : null;
  if (c && sub) await notifyPerson(db, admin.schoolId, sub, 'Cover cancelled', `You no longer cover ${c.subject} in ${c.class}, period ${c.period_no} on ${fmtDate(c.on_date)}.`, { date: b.date });
  return NextResponse.json({ ok: true });
}
