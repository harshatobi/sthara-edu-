import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { bad, deny, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { daysBetween, isoDay } from '@/lib/admin/format';
import { LEAVE_TYPES } from '@/lib/admin/constants';
import { dbError, staffIds, time } from '@/lib/schedule/server';
import { personCols, type PersonKey } from '@/lib/schedule/types';
import { loadAttendance } from '@/lib/attendance/load';
import { monthOf, localOf } from '@/lib/attendance/engine';
import { importPunches, runNoShowCheck } from '@/lib/attendance/server';

export const dynamic = 'force-dynamic';

/**
 * Staff attendance and shifts (schedule.workforce: the HR manager and principal).
 *   PUT    { entity: 'settings', ... }                                  hours, grace, rules (each switchable), geofence, no-show alerts
 *   PUT    { entity: 'shift', id?, name, startsAt, endsAt, active? }
 *   PUT    { entity: 'plan', person, mode, shiftId?, rotation?, offMode, offDays?, offCycle?, anchorDate?, worksHolidays?, rulesExempt?, graceMin?, note? }
 *   PUT    { entity: 'override', person, date, kind: 'shift' | 'off' | 'work', shiftId?, reason }
 *   PUT    { entity: 'swap', date, reason, a: { person, kind, shiftId? }, b: { person, kind, shiftId? } }   two overrides, one swap
 *   PUT    { entity: 'mark', person, date, status, inAt?, outAt?, source: 'register' | 'override', reason? }   an override needs a reason
 *   PUT    { entity: 'leave', staffMemberId, type, from, to, halfDay?, reason }   leave for staff with no login (pending, approved as usual)
 *   POST   { entity: 'import', punches: [{ code, at, direction }] }    a biometric export, matched by employee code
 *   POST   { entity: 'device', name, vendor? }                          a push device; the token is shown once
 *   POST   { entity: 'review', person, month, waived: string[], note? } confirm a month (loss of pay after waivers)
 *   POST   { entity: 'noshow_check' }                                    run the no-show check now (also run by the scheduler)
 *   DELETE { entity: 'shift' | 'override' | 'mark' | 'device' | 'review', id }
 */
const KINDS = ['shift', 'off', 'work'];
const STATUSES = ['present', 'absent', 'half_day', 'off'];
const day = (v: unknown) => (typeof v === 'string' && ISO_DAY.test(v) ? v : null);

async function person(db: any, schoolId: string, v: unknown): Promise<PersonKey | null> {
  const k = String(v || '');
  return (await staffIds(db, schoolId)).has(k) ? k : null;
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const now = new Date().toISOString();

  if (b.entity === 'settings') {
    const t = (k: string, dflt: string) => (b[k] === undefined ? dflt : time(b[k]));
    const row: Record<string, unknown> = {
      school_id: admin.schoolId,
      teacher_start: t('teacherStart', '07:45'), teacher_end: t('teacherEnd', '15:00'), office_start: t('officeStart', '09:00'), office_end: t('officeEnd', '17:00'),
      grace_min: Number(b.graceMin ?? 10), lates_rule: b.latesRule !== false, lates_per_half_day: Number(b.latesPerHalfDay ?? 3),
      short_rule: b.shortRule !== false, min_full_hours: Number(b.minFullHours ?? 6), absent_rule: b.absentRule !== false,
      geofence_lat: b.geofenceLat === null || b.geofenceLat === '' || b.geofenceLat === undefined ? null : Number(b.geofenceLat),
      geofence_lng: b.geofenceLng === null || b.geofenceLng === '' || b.geofenceLng === undefined ? null : Number(b.geofenceLng),
      geofence_radius_m: Number(b.geofenceRadius ?? 200), noshow_alerts: b.noshowAlerts !== false, updated_by: admin.id, updated_at: now,
    };
    if (['teacher_start', 'teacher_end', 'office_start', 'office_end'].some(k => !row[k])) return bad('Times look like 07:45.');
    if (String(row.teacher_end) <= String(row.teacher_start) || String(row.office_end) <= String(row.office_start)) return bad('The day must end after it starts.');
    if (!Number.isInteger(row.grace_min) || (row.grace_min as number) < 0 || (row.grace_min as number) > 120) return bad('Grace is 0 to 120 minutes.');
    if (!Number.isInteger(row.lates_per_half_day) || (row.lates_per_half_day as number) < 1 || (row.lates_per_half_day as number) > 31) return bad('Lates per half day is 1 to 31.');
    if (!(Number(row.min_full_hours) >= 1 && Number(row.min_full_hours) <= 16)) return bad('A full day is 1 to 16 hours.');
    if ((row.geofence_lat === null) !== (row.geofence_lng === null)) return bad('Give both latitude and longitude, or neither.');
    if (row.geofence_lat !== null && (!(Math.abs(Number(row.geofence_lat)) <= 90) || !(Math.abs(Number(row.geofence_lng)) <= 180))) return bad('That location doesn\'t look right.');
    if (!(Number(row.geofence_radius_m) >= 50 && Number(row.geofence_radius_m) <= 5000)) return bad('The campus radius is 50 to 5000 metres.');
    const { error } = await db.from('attendance_settings').upsert(row, { onConflict: 'school_id' });
    return error ? dbError(error, 'Could not save the settings.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'shift') {
    const name = str(b.name, 60);
    const s = time(b.startsAt), e = time(b.endsAt);
    if (!name) return bad('Name the shift.');
    if (!s || !e || s === e) return bad('Give the start and end times (an end before the start means it ends the next morning).');
    const row = { school_id: admin.schoolId, name, starts_at: s, ends_at: e, active: b.active !== false };
    const { error } = isUuid(b.id)
      ? await db.from('shifts').update(row).eq('id', b.id).eq('school_id', admin.schoolId)
      : await db.from('shifts').insert(row);
    return error ? dbError(error, 'Could not save the shift.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'plan') {
    const who = await person(db, admin.schoolId, b.person);
    if (!who) return bad('Pick a member of staff.');
    const { data: shifts } = await db.from('shifts').select('id').eq('school_id', admin.schoolId);
    const shiftIds = new Set((shifts || []).map(x => x.id));
    const mode = b.mode === 'rotating' ? 'rotating' : 'fixed';
    const rotation = (Array.isArray(b.rotation) ? b.rotation : []).filter((x: unknown) => typeof x === 'string' && shiftIds.has(x)).slice(0, 8);
    if (mode === 'fixed' && !shiftIds.has(b.shiftId)) return bad('Pick their shift.');
    if (mode === 'rotating' && rotation.length < 2) return bad('A rotation needs at least two weeks of shifts.');
    const offMode = ['fixed', 'rotating', 'none'].includes(b.offMode) ? b.offMode : 'fixed';
    const wd = (xs: unknown) => [...new Set<number>((Array.isArray(xs) ? xs : []).map(Number))].filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
    const offDays = wd(b.offDays), offCycle = (Array.isArray(b.offCycle) ? b.offCycle : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 1 && d <= 7).slice(0, 8);
    if (offMode === 'fixed' && !offDays.length) return bad('Pick their weekly off.');
    if (offMode === 'rotating' && offCycle.length < 2) return bad('A rotating weekly off needs at least two weeks.');
    const grace = b.graceMin === null || b.graceMin === '' || b.graceMin === undefined ? null : Number(b.graceMin);
    if (grace !== null && (!Number.isInteger(grace) || grace < 0 || grace > 120)) return bad('Their grace is 0 to 120 minutes.');
    const row: Record<string, unknown> = {
      school_id: admin.schoolId, ...personCols(who), mode, shift_id: mode === 'fixed' ? b.shiftId : null, rotation: mode === 'rotating' ? rotation : [],
      off_mode: offMode, off_days: offMode === 'fixed' ? offDays : [], off_cycle: offMode === 'rotating' ? offCycle : [],
      anchor_date: day(b.anchorDate) ?? isoDay(), works_holidays: !!b.worksHolidays, rules_exempt: !!b.rulesExempt, grace_min: grace,
      note: str(b.note, 500) || null, updated_by: admin.id, updated_at: now,
    };
    const col = who.startsWith('s:') ? 'staff_member_id' : 'user_id';
    const { data: existing } = await db.from('staff_shift_plans').select('id').eq(col, who.replace(/^s:/, '')).maybeSingle();
    const { error } = existing ? await db.from('staff_shift_plans').update(row).eq('id', existing.id) : await db.from('staff_shift_plans').insert(row);
    return error ? dbError(error, 'Could not save the plan.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'override' || b.entity === 'swap') {
    const date = day(b.date);
    if (!date) return bad('Pick the date.');
    const reason = str(b.reason, 300);
    if (!reason) return bad('Give a reason (it is kept with the change).');
    const sides = b.entity === 'swap' ? [b.a, b.b] : [b];
    const group = b.entity === 'swap' ? randomUUID() : null;
    const rows: any[] = [];
    for (const x of sides) {
      const who = await person(db, admin.schoolId, x?.person);
      if (!who) return bad('Pick a member of staff.');
      if (!KINDS.includes(x?.kind)) return bad('Another shift, a day off, or a working day?');
      if (x.kind === 'shift' && !isUuid(x.shiftId)) return bad('Pick the shift.');
      rows.push({ school_id: admin.schoolId, ...personCols(who), on_date: date, kind: x.kind, shift_id: x.kind === 'shift' ? x.shiftId : null, swap_group: group, reason, created_by: admin.id });
    }
    if (b.entity === 'swap' && rows[0].user_id === rows[1].user_id && rows[0].staff_member_id === rows[1].staff_member_id) return bad('Pick two different people.');
    for (const r of rows) {
      const col = r.user_id ? 'user_id' : 'staff_member_id';
      await db.from('shift_overrides').delete().eq(col, r[col]).eq('on_date', date);
    }
    const { error } = await db.from('shift_overrides').insert(rows);
    return error ? dbError(error, 'Could not save the change.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'mark') {
    const who = await person(db, admin.schoolId, b.person);
    if (!who) return bad('Pick a member of staff.');
    const date = day(b.date);
    if (!date || date > isoDay()) return bad('Pick today or an earlier day.');
    if (daysBetween(date, isoDay()) > 62) return bad('That is more than two months ago.');
    if (!STATUSES.includes(b.status)) return bad('Present, absent, half day or off?');
    const source = b.source === 'override' ? 'override' : 'register';
    const reason = str(b.reason, 300);
    if (source === 'override' && !reason) return bad('A correction needs a reason.');
    const inAt = b.inAt ? time(b.inAt) : null, outAt = b.outAt ? time(b.outAt) : null;
    if ((b.inAt && !inAt) || (b.outAt && !outAt)) return bad('Times look like 07:50.');
    // A confirmed month is closed: corrections to it need the review reopened first.
    const col = who.startsWith('s:') ? 'staff_member_id' : 'user_id';
    const { data: closed } = await db.from('attendance_month_reviews').select('id').eq(col, who.replace(/^s:/, '')).eq('month', `${date.slice(0, 7)}-01`).maybeSingle();
    if (closed) return bad('That month is confirmed. Reopen its review to change a day.', 409);
    const row: Record<string, unknown> = { school_id: admin.schoolId, ...personCols(who), on_date: date, status: b.status, in_at: inAt, out_at: outAt, source, reason: reason || null, created_by: admin.id, updated_at: now };
    await db.from('staff_day_marks').delete().eq(col, who.replace(/^s:/, '')).eq('on_date', date);
    const { error } = await db.from('staff_day_marks').insert(row);
    return error ? dbError(error, 'Could not save the register.') : NextResponse.json({ ok: true });
  }

  if (b.entity === 'leave') {
    if (!isUuid(b.staffMemberId)) return bad('Pick the member of staff.');
    const { data: m } = await db.from('staff_members').select('id, name, user_id').eq('id', b.staffMemberId).eq('school_id', admin.schoolId).maybeSingle();
    if (!m) return bad('That person isn\'t on the register.');
    if (m.user_id) return bad(`${m.name} has a login and applies for leave themselves.`);
    if (!(b.type in LEAVE_TYPES)) return bad('Pick a leave type.');
    const from = day(b.from), to = day(b.to) ?? from;
    if (!from || !to || to < from) return bad('Pick the dates.');
    if (b.halfDay && to !== from) return bad('A half day is a single date.');
    const reason = str(b.reason, 1000);
    if (!reason) return bad('Give a reason.');
    const { data: clash } = await db.from('leave_requests').select('id').eq('staff_member_id', m.id).in('status', ['pending', 'approved']).lte('from_date', to).gte('to_date', from).limit(1);
    if (clash?.length) return bad('They already have leave on some of those dates.', 409);
    const { error } = await db.from('leave_requests').insert({
      school_id: admin.schoolId, staff_id: null, staff_member_id: m.id, leave_type: b.type, from_date: from, to_date: to, half_day: !!b.halfDay, reason,
      source: 'office', entered_by: admin.id,
    });
    return error ? dbError(error, 'Could not save the leave.') : NextResponse.json({ ok: true });
  }
  return bad('Unknown item.');
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ['schedule.workforce', 'schedule.academic']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');

  // Anyone who arranges cover or manages staff can run the no-show check (opening the boards does).
  if (b.entity === 'noshow_check') {
    const r = await runNoShowCheck(db, admin.schoolId);
    return NextResponse.json({ ok: true, ...r });
  }
  const denied = deny(admin, 'schedule.workforce');
  if (denied) return denied;

  if (b.entity === 'import') {
    const raw = Array.isArray(b.punches) ? b.punches.slice(0, 20000) : [];
    if (!raw.length) return bad('There are no punches to import.');
    const r = await importPunches(db, admin.schoolId, raw, { createdBy: admin.id, deviceId: null });
    return 'error' in r ? bad(r.error) : NextResponse.json({ ok: true, ...r });
  }

  if (b.entity === 'device') {
    const name = str(b.name, 80);
    if (!name) return bad('Name the device (e.g. Main gate biometric).');
    const token = randomBytes(24).toString('base64url');
    const { data, error } = await db.from('attendance_devices').insert({
      school_id: admin.schoolId, name, vendor: str(b.vendor, 60) || null, token_hash: createHash('sha256').update(token).digest('hex'), created_by: admin.id,
    }).select('id').single();
    return error ? dbError(error, 'Could not add the device.') : NextResponse.json({ ok: true, id: data.id, token });
  }

  if (b.entity === 'review') {
    const who = await person(db, admin.schoolId, b.person);
    if (!who) return bad('Pick a member of staff.');
    const month = typeof b.month === 'string' && /^\d{4}-\d{2}(-01)?$/.test(b.month) ? `${b.month.slice(0, 7)}-01` : null;
    if (!month) return bad('Pick the month.');
    const today = localOf(Date.now()).date;
    if (month > today) return bad('That month hasn\'t started.');
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const data = await loadAttendance(db, admin.schoolId, month, last);
    const p = data.people.find(x => x.key === who);
    if (!p) return bad('That person isn\'t on the attendance.');
    const summary = monthOf(month, p, data.rows, today);
    const waived = (Array.isArray(b.waived) ? b.waived : []).filter((k: unknown) => typeof k === 'string' && summary.proposals.some(x => x.key === k));
    const lop = summary.proposals.filter(x => !waived.includes(x.key)).reduce((n, x) => n + x.days, 0);
    const kept: Record<string, unknown> = { ...summary };
    delete kept.days;  // the month's totals and proposals; the day-by-day detail is recomputed on demand
    const col = who.startsWith('s:') ? 'staff_member_id' : 'user_id';
    await db.from('attendance_month_reviews').delete().eq(col, who.replace(/^s:/, '')).eq('month', month);
    const { error } = await db.from('attendance_month_reviews').insert({
      school_id: admin.schoolId, ...personCols(who), month, summary: kept, waived, lop_days: lop, note: str(b.note, 1000) || null, confirmed_by: admin.id,
    });
    return error ? dbError(error, 'Could not confirm the month.') : NextResponse.json({ ok: true, lopDays: lop });
  }
  return bad('Unknown action.');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.workforce');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  const table = ({ shift: 'shifts', override: 'shift_overrides', mark: 'staff_day_marks', device: 'attendance_devices', review: 'attendance_month_reviews', plan: 'staff_shift_plans' } as Record<string, string>)[b?.entity];
  if (!table || !isUuid(b.id)) return bad('Pick something to remove.');
  if (b.entity === 'override') {
    // Undoing one side of a swap undoes both.
    const { data: o } = await db.from('shift_overrides').select('swap_group').eq('id', b.id).eq('school_id', admin.schoolId).maybeSingle();
    if (o?.swap_group) {
      const { error } = await db.from('shift_overrides').delete().eq('swap_group', o.swap_group).eq('school_id', admin.schoolId);
      return error ? dbError(error, 'Could not undo the swap.') : NextResponse.json({ ok: true });
    }
  }
  if (b.entity === 'device') {
    const { error } = await db.from('attendance_devices').update({ active: false }).eq('id', b.id).eq('school_id', admin.schoolId);
    return error ? dbError(error, 'Could not switch the device off.') : NextResponse.json({ ok: true });
  }
  const { error } = await db.from(table).delete().eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not remove it.') : NextResponse.json({ ok: true });
}
