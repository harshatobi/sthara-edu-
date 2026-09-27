import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { fmtDate } from '@/lib/admin/format';
import { awayOn, addDays, hhmm, minutes, namesOf, weekdayOf } from '@/lib/schedule/engine';
import { busyOn, regularLessons } from '@/lib/schedule/cover';
import { loadScheduleRows } from '@/lib/schedule/load';
import { notifyPerson } from '@/lib/schedule/notify';
import { dbError, staffIds, time } from '@/lib/schedule/server';
import { DAY_NAMES, DAY_SHORT, personCols, personKey, type DutyKind, type PersonKey } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * Duties.
 *   PUT    { entity: 'post', id?, name, kind, weekdays, startsAt, endsAt, location?, needed?, active? }        schedule.workforce
 *   DELETE { entity: 'post', id }                                                                          schedule.workforce
 *   PUT    { entity: 'roster', postId, weekday, people: PersonKey[], force? }                               schedule.workforce
 *          the fixed weekly roster for one post on one weekday; refuses someone teaching then unless force
 *   PUT    { entity: 'duty', id?, date, startsAt, endsAt, kind, title, eventId?, roomId?, person, note?, force? }
 *          a dated duty: invigilation needs schedule.academic, event and other duties schedule.workforce
 *   DELETE { entity: 'duty', id }
 *   POST   { entity: 'notify', weekOf }   send each person their duties for that week (WhatsApp / in-app)  schedule.workforce
 */
const KINDS: DutyKind[] = ['gate', 'bus', 'lunch', 'corridor', 'assembly', 'event', 'other'];

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.workforce', 'schedule.academic']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  if (b.entity === 'post') {
    const denied = deny(admin, 'schedule.workforce');
    if (denied) return denied;
    const id = b.id ? (isUuid(b.id) ? b.id : null) : null;
    if (b.id && !id) return bad('Unknown duty post.');
    const name = str(b.name, 80);
    if (!name) return bad('Name the duty post.');
    const s = time(b.startsAt), e = time(b.endsAt);
    if (!s || !e) return bad('Give the start and end times, like 07:30.');
    if (e <= s) return bad('The end time must be after the start time.');
    const weekdays = [...new Set<number>((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number))].filter(d => Number.isInteger(d) && d >= 1 && d <= 7).sort();
    if (!weekdays.length) return bad('Pick the days this post runs.');
    const needed = Number(b.needed || 1);
    if (!Number.isInteger(needed) || needed < 1 || needed > 20) return bad('People needed is 1 to 20.');
    const row = { school_id: admin.schoolId, name, kind: KINDS.includes(b.kind) ? b.kind : 'other', weekdays, starts_at: s, ends_at: e, location: str(b.location, 80) || null, needed, active: b.active !== false };
    if (id) {
      const { data, error } = await db.from('duty_posts').update(row).eq('id', id).eq('school_id', admin.schoolId).select('id').maybeSingle();
      if (error) return dbError(error, 'Could not save the duty post.');
      if (!data) return bad('That duty post no longer exists.', 404);
      // People rostered on days the post no longer runs come off the roster.
      await db.from('duty_roster').delete().eq('post_id', id).not('weekday', 'in', `(${weekdays.join(',')})`);
      return NextResponse.json({ ok: true, id });
    }
    const { data, error } = await db.from('duty_posts').insert(row).select('id').single();
    return error ? dbError(error, 'Could not save the duty post.') : NextResponse.json({ ok: true, id: data.id });
  }

  if (b.entity === 'roster') {
    const denied = deny(admin, 'schedule.workforce');
    if (denied) return denied;
    if (!isUuid(b.postId)) return bad('Pick a duty post.');
    const weekday = Number(b.weekday);
    const { data: post } = await db.from('duty_posts').select('*').eq('id', b.postId).eq('school_id', admin.schoolId).maybeSingle();
    if (!post) return bad('That duty post no longer exists.', 404);
    if (!(post.weekdays || []).map(Number).includes(weekday)) return bad(`${post.name} doesn't run on ${DAY_NAMES[weekday] || 'that day'}.`);
    const people = [...new Set((Array.isArray(b.people) ? b.people : []).map(String))] as PersonKey[];
    if (people.length > 20) return bad('That is more than 20 people.');
    const allowed = await staffIds(db, admin.schoolId);
    if (people.some(p => !allowed.has(p))) return bad('Everyone on a roster must be on this school\'s staff.');
    if (!b.force && people.length) {
      // Nobody on duty while they're teaching or on another post at the same time that day.
      const rows = await loadScheduleRows(db, admin.schoolId);
      const names = namesOf(rows);
      const s = minutes(post.starts_at), e = minutes(post.ends_at);
      const today = new Date().toISOString().slice(0, 10);
      const lessons = regularLessons(rows, weekday, today);
      const others = rows.roster.filter(r => r.weekday === weekday && r.post_id !== post.id);
      const posts = new Map(rows.dutyPosts.map(p => [p.id, p]));
      for (const p of people) {
        const l = lessons.find(x => personKey(x.slot.teacher_id, x.slot.staff_member_id) === p && x.start < e && s < x.end);
        if (l) return NextResponse.json({ error: `${names.get(p)} teaches ${l.slot.subject} in ${l.slot.class} at ${hhmm(l.startAt, true)} on ${DAY_NAMES[weekday]}s.`, clash: true }, { status: 409 });
        const o = others.find(r => personKey(r.user_id, r.staff_member_id) === p && (() => { const q = posts.get(r.post_id); return q?.active && minutes(q.starts_at) < e && s < minutes(q.ends_at); })());
        if (o) return NextResponse.json({ error: `${names.get(p)} is already on ${posts.get(o.post_id)!.name} at that time on ${DAY_NAMES[weekday]}s.`, clash: true }, { status: 409 });
      }
    }
    const { error: delErr } = await db.from('duty_roster').delete().eq('post_id', post.id).eq('weekday', weekday);
    if (delErr) return dbError(delErr, 'Could not update the roster.');
    if (people.length) {
      const { error } = await db.from('duty_roster').insert(people.map(p => ({ school_id: admin.schoolId, post_id: post.id, weekday, ...personCols(p), created_by: admin.id })));
      if (error) return dbError(error, 'Could not update the roster.');
    }
    return NextResponse.json({ ok: true, short: Math.max(0, post.needed - people.length) });
  }

  if (b.entity === 'duty') {
    const kind = ['invigilation', 'event', 'other'].includes(b.kind) ? b.kind : null;
    if (!kind) return bad('Pick the kind of duty.');
    const denied = deny(admin, kind === 'invigilation' ? 'schedule.academic' : 'schedule.workforce');
    if (denied) return denied;
    const id = b.id ? (isUuid(b.id) ? b.id : null) : null;
    if (b.id && !id) return bad('Unknown duty.');
    if (!ISO_DAY.test(String(b.date))) return bad('Pick the date.');
    const s = time(b.startsAt), e = time(b.endsAt);
    if (!s || !e || e <= s) return bad('Give start and end times, the end after the start.');
    const title = str(b.title, 120);
    if (!title) return bad('Give the duty a title.');
    const who = String(b.person || '') as PersonKey;
    if (!(await staffIds(db, admin.schoolId)).has(who)) return bad('Pick a member of staff.');
    if (b.eventId) {
      const { data: ev } = await db.from('academic_events').select('id, kind, starts_on, ends_on').eq('id', b.eventId).eq('school_id', admin.schoolId).maybeSingle();
      if (!ev) return bad('Unknown calendar entry.');
      if (b.date < ev.starts_on || b.date > ev.ends_on) return bad('That date is outside the calendar entry.');
    }
    if (b.roomId) {
      const { data: room } = await db.from('rooms').select('id').eq('id', b.roomId).eq('school_id', admin.schoolId).maybeSingle();
      if (!room) return bad('Unknown room.');
    }
    if (!b.force) {
      const rows = await loadScheduleRows(db, admin.schoolId);
      const names = namesOf(rows);
      const busy = (busyOn(b.date, rows).get(who) || []).find(x => x.dutyId !== id && x.start < minutes(e) && minutes(s) < x.end);
      if (busy) return NextResponse.json({ error: `${names.get(who)} has ${busy.what} then.`, clash: true }, { status: 409 });
      if (awayOn(b.date, who, rows).some(a => a.portion === 'full' || a.unsureHalf)) return NextResponse.json({ error: `${names.get(who)} is away that day.`, clash: true }, { status: 409 });
    }
    const row = {
      school_id: admin.schoolId, on_date: b.date, starts_at: s, ends_at: e, kind, title, event_id: isUuid(b.eventId) ? b.eventId : null,
      room_id: isUuid(b.roomId) ? b.roomId : null, ...personCols(who), note: str(b.note, 500) || null,
    };
    if (id) {
      const { data, error } = await db.from('duty_assignments').update(row).eq('id', id).eq('school_id', admin.schoolId).select('id').maybeSingle();
      if (error) return dbError(error, 'Could not save the duty.');
      if (!data) return bad('That duty no longer exists.', 404);
    } else {
      const { error } = await db.from('duty_assignments').insert({ ...row, created_by: admin.id });
      if (error) return dbError(error, 'Could not save the duty.');
    }
    await notifyPerson(db, admin.schoolId, who, kind === 'invigilation' ? 'Invigilation duty' : 'Duty assigned',
      `${title} on ${fmtDate(b.date)}, ${hhmm(s, true)}–${hhmm(e, true)}.`, { date: b.date });
    return NextResponse.json({ ok: true });
  }
  return bad('Unknown item.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.workforce', 'schedule.academic']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !isUuid(b.id)) return bad('Pick something to remove.');
  if (b.entity === 'post') {
    const denied = deny(admin, 'schedule.workforce');
    if (denied) return denied;
    const { error } = await db.from('duty_posts').delete().eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not remove the post.') : NextResponse.json({ ok: true });
  }
  if (b.entity === 'duty') {
    const { data: d } = await db.from('duty_assignments').select('kind').eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
    if (!d) return bad('That duty no longer exists.', 404);
    const denied = deny(admin, d.kind === 'invigilation' ? 'schedule.academic' : 'schedule.workforce');
    if (denied) return denied;
    const { error } = await db.from('duty_assignments').delete().eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not remove the duty.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown item.');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (b?.entity !== 'notify' || !ISO_DAY.test(String(b.weekOf))) return bad('Pick the week.');
  const monday = addDays(b.weekOf, 1 - weekdayOf(b.weekOf));
  const rows = await loadScheduleRows(db, admin.schoolId);
  const posts = new Map(rows.dutyPosts.map(p => [p.id, p]));
  const lines = new Map<PersonKey, string[]>();
  const add = (k: PersonKey | null, line: string) => { if (k) lines.set(k, [...(lines.get(k) || []), line]); };
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const wd = weekdayOf(date);
    const off = rows.events.some(e => e.suspends_classes && !e.wing_ids?.length && e.starts_on <= date && e.ends_on >= date);
    if (!off) {
      for (const r of rows.roster) {
        const p = posts.get(r.post_id);
        if (p?.active && r.weekday === wd && p.weekdays.includes(wd)) add(personKey(r.user_id, r.staff_member_id), `${DAY_SHORT[wd]} ${fmtDate(date, true)}: ${p.name}, ${hhmm(p.starts_at, true)}–${hhmm(p.ends_at, true)}${p.location ? `, ${p.location}` : ''}`);
      }
    }
    for (const d of rows.duties) if (d.on_date === date) add(personKey(d.user_id, d.staff_member_id), `${DAY_SHORT[wd]} ${fmtDate(date, true)}: ${d.title}, ${hhmm(d.starts_at, true)}–${hhmm(d.ends_at, true)}`);
  }
  let sent = 0;
  for (const [k, ls] of lines) {
    await notifyPerson(db, admin.schoolId, k, `Your duties, week of ${fmtDate(monday, true)}`, ls.join('\n'), { weekOf: monday });
    sent++;
  }
  return NextResponse.json({ ok: true, people: sent });
}
