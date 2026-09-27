import { NextResponse, type NextRequest } from 'next/server';
import { bad, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { bellProblems } from '@/lib/schedule/engine';
import { dbError, time, uuidOrNull } from '@/lib/schedule/server';
import type { BellPeriod, PeriodKind, RoomKind } from '@/lib/schedule/types';
import { displayClass, normClass } from '@/lib/teacher/scope';

export const dynamic = 'force-dynamic';

/**
 * Wings, bell schedules and rooms (schedule.academic).
 *   PUT    { entity: 'wing', id?, name, gradeFrom, gradeTo }
 *   PUT    { entity: 'bell', id?, name, wingId?, kind: 'regular' | 'variant', weekdays: number[], periods: BellPeriod[] }
 *          the periods replace the schedule's rows wholesale
 *   PUT    { entity: 'room', id?, name, kind, capacity?, homeClass?, active? }
 *   POST   { entity: 'starter' }   a typical CBSE day (Mon-Fri 8 periods, Saturday half day) when the school has no bells yet
 *   DELETE { entity, id }
 */
const PERIOD_KINDS: PeriodKind[] = ['period', 'break', 'lunch', 'assembly', 'other'];
const ROOM_KINDS: RoomKind[] = ['classroom', 'lab', 'hall', 'library', 'ground', 'other'];
const TABLE = { wing: 'sched_wings', bell: 'bell_schedules', room: 'rooms' } as const;

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !(b.entity in TABLE)) return bad('Say what to save.');
  const id = b.id === undefined || b.id === null ? null : isUuid(b.id) ? b.id : undefined;
  if (id === undefined) return bad('Unknown item.');

  if (b.entity === 'wing') {
    const name = str(b.name, 60);
    const from = Number(b.gradeFrom), to = Number(b.gradeTo);
    if (!name) return bad('Name the wing.');
    if (![from, to].every(n => Number.isInteger(n) && n >= 0 && n <= 12) || to < from) return bad('Grades run from 0 (pre-primary) to 12, and the last must be at least the first.');
    const { data: others } = await db.from('sched_wings').select('id, name, grade_from, grade_to').eq('school_id', admin.schoolId);
    const overlap = (others || []).find(w => w.id !== id && from <= w.grade_to && to >= w.grade_from);
    if (overlap) return bad(`Those grades overlap ${overlap.name} (${overlap.grade_from}–${overlap.grade_to}). A grade belongs to one wing.`);
    const row = { school_id: admin.schoolId, name, grade_from: from, grade_to: to };
    const q = id ? db.from('sched_wings').update(row).eq('id', id).eq('school_id', admin.schoolId) : db.from('sched_wings').insert(row);
    const { error } = await q;
    return error ? dbError(error, 'Could not save the wing.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'bell') {
    const name = str(b.name, 80);
    if (!name) return bad('Name the bell schedule.');
    const kind = b.kind === 'variant' ? 'variant' : 'regular';
    const weekdays: number[] = kind === 'regular'
      ? [...new Set<number>((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number))].filter(d => Number.isInteger(d) && d >= 1 && d <= 7).sort()
      : [];
    if (kind === 'regular' && !weekdays.length) return bad('Pick the days this schedule runs on.');
    const wingId = uuidOrNull(b.wingId);
    if (wingId) {
      const { data: w } = await db.from('sched_wings').select('id').eq('id', wingId).eq('school_id', admin.schoolId).maybeSingle();
      if (!w) return bad('Unknown wing.');
    }
    const raw = Array.isArray(b.periods) ? b.periods.slice(0, 40) : [];
    if (!raw.length) return bad('Add at least one period.');
    const periods: BellPeriod[] = [];
    for (const [i, p] of raw.entries()) {
      const k = PERIOD_KINDS.includes(p?.kind) ? p.kind as PeriodKind : 'period';
      const s = time(p?.starts_at), e = time(p?.ends_at);
      const label = str(p?.label, 40) || (k === 'period' ? `Period ${p?.period_no ?? i + 1}` : k[0].toUpperCase() + k.slice(1));
      if (!s || !e) return bad(`${label}: give a start and end time like 08:40.`);
      const no = k === 'period' ? Number(p?.period_no) : null;
      if (k === 'period' && (!Number.isInteger(no) || no! < 1 || no! > 16)) return bad(`${label}: teaching periods are numbered 1 to 16.`);
      periods.push({ seq: i + 1, label, kind: k, period_no: no, starts_at: s, ends_at: e });
    }
    const problems = bellProblems(periods);
    if (problems.length) return bad(problems[0]);
    // Two regular schedules for the same wing can't both claim a weekday.
    if (kind === 'regular') {
      const { data: others } = await db.from('bell_schedules').select('id, name, weekdays, wing_id').eq('school_id', admin.schoolId).eq('kind', 'regular');
      const taken = (others || []).find(o => o.id !== id && (o.wing_id ?? null) === wingId && (o.weekdays || []).some((d: number) => weekdays.includes(Number(d))));
      if (taken) return bad(`${taken.name} already covers some of those days for this wing. Take the days off it first, or make this a variant for special days.`);
    }
    const row = { school_id: admin.schoolId, name, wing_id: wingId, kind, weekdays, updated_at: new Date().toISOString() };
    let scheduleId = id;
    if (id) {
      const { data, error } = await db.from('bell_schedules').update(row).eq('id', id).eq('school_id', admin.schoolId).select('id').maybeSingle();
      if (error) return dbError(error, 'Could not save the bell schedule.');
      if (!data) return bad('That bell schedule no longer exists.', 404);
      await db.from('bell_periods').delete().eq('schedule_id', id);
    } else {
      const { data, error } = await db.from('bell_schedules').insert(row).select('id').single();
      if (error) return dbError(error, 'Could not save the bell schedule.');
      scheduleId = data.id;
    }
    const { error } = await db.from('bell_periods').insert(periods.map(p => ({ ...p, schedule_id: scheduleId, school_id: admin.schoolId })));
    return error ? dbError(error, 'Could not save the periods.') : NextResponse.json({ ok: true, id: scheduleId });
  }

  // room
  const name = str(b.name, 60);
  if (!name) return bad('Name the room.');
  const kind = ROOM_KINDS.includes(b.kind) ? b.kind : 'classroom';
  const capacity = b.capacity === '' || b.capacity === null || b.capacity === undefined ? null : Number(b.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000)) return bad('Capacity is a whole number of seats.');
  const home = str(b.homeClass, 40);
  const row = { school_id: admin.schoolId, name, kind, capacity, home_class: normClass(home) ? displayClass(home) : null, active: b.active !== false };
  const q = id ? db.from('rooms').update(row).eq('id', id).eq('school_id', admin.schoolId) : db.from('rooms').insert(row);
  const { error } = await q;
  return error ? dbError(error, 'Could not save the room.') : NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (b?.entity !== 'starter') return bad('Unknown action.');
  const { count } = await db.from('bell_schedules').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId);
  if (count) return bad('This school already has bell schedules.', 409);

  const P = (no: number, s: string, e: string) => ({ label: `Period ${no}`, kind: 'period', period_no: no, starts_at: s, ends_at: e });
  const X = (label: string, kind: string, s: string, e: string) => ({ label, kind, period_no: null, starts_at: s, ends_at: e });
  const plans = [
    { name: 'Regular day', kind: 'regular', weekdays: [1, 2, 3, 4, 5], periods: [
      X('Assembly', 'assembly', '08:00', '08:20'), P(1, '08:20', '09:00'), P(2, '09:00', '09:40'), P(3, '09:40', '10:20'),
      X('Short break', 'break', '10:20', '10:35'), P(4, '10:35', '11:15'), P(5, '11:15', '11:55'), X('Lunch', 'lunch', '11:55', '12:30'),
      P(6, '12:30', '13:10'), P(7, '13:10', '13:50'), P(8, '13:50', '14:30')] },
    { name: 'Saturday half day', kind: 'regular', weekdays: [6], periods: [
      X('Assembly', 'assembly', '08:00', '08:15'), P(1, '08:15', '08:50'), P(2, '08:50', '09:25'), P(3, '09:25', '10:00'),
      X('Break', 'break', '10:00', '10:15'), P(4, '10:15', '10:50'), P(5, '10:50', '11:25')] },
    { name: 'Exam day', kind: 'variant', weekdays: [], periods: [X('Reporting', 'other', '08:30', '09:00'), P(1, '09:00', '12:00')] },
  ];
  for (const p of plans) {
    const { data, error } = await db.from('bell_schedules').insert({ school_id: admin.schoolId, name: p.name, kind: p.kind, weekdays: p.weekdays, wing_id: null }).select('id').single();
    if (error) return dbError(error, 'Could not create the starter schedules.');
    const { error: e2 } = await db.from('bell_periods').insert(p.periods.map((x, i) => ({ ...x, seq: i + 1, schedule_id: data.id, school_id: admin.schoolId })));
    if (e2) return dbError(e2, 'Could not create the starter periods.');
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || !(b.entity in TABLE) || !isUuid(b.id)) return bad('Pick something to remove.');
  if (b.entity === 'bell') {
    const { count } = await db.from('academic_events').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId).eq('bell_schedule_id', b.id).gte('ends_on', new Date().toISOString().slice(0, 10));
    if (count) return bad(`${count} upcoming calendar ${count === 1 ? 'entry uses' : 'entries use'} this schedule. Change ${count === 1 ? 'it' : 'them'} first.`, 409);
  }
  if (b.entity === 'wing') {
    const { count } = await db.from('bell_schedules').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId).eq('wing_id', b.id);
    if (count) return bad('This wing has its own bell schedules. Remove or move them first.', 409);
  }
  if (b.entity === 'room') {
    // Rooms used by a published timetable are retired, not deleted, so past timetables keep their rooms.
    const { count } = await db.from('timetable_slots').select('id', { count: 'exact', head: true }).eq('school_id', admin.schoolId).eq('room_id', b.id);
    if (count) {
      const { error } = await db.from('rooms').update({ active: false, home_class: null }).eq('id', b.id).eq('school_id', admin.schoolId);
      return error ? dbError(error, 'Could not retire the room.') : NextResponse.json({ ok: true, retired: true });
    }
  }
  const { error } = await db.from(TABLE[b.entity as keyof typeof TABLE]).delete().eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not remove it.') : NextResponse.json({ ok: true });
}
