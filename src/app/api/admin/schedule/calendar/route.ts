import { NextResponse, type NextRequest } from 'next/server';
import { bad, ISO_DAY, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { daysBetween } from '@/lib/admin/format';
import { dbError, time, uuidOrNull } from '@/lib/schedule/server';
import type { EventKind, StaffScope } from '@/lib/schedule/types';

export const dynamic = 'force-dynamic';

/**
 * The academic calendar (schedule.academic).
 *   PUT    { id?, title, kind, startsOn, endsOn, wingIds?: string[], bellScheduleId?, suspendsClasses?, staffScope?, startsAt?, endsAt?, notes? }
 *   DELETE { id }
 * A holiday suspends classes unless told otherwise; an event with a variant bell schedule swaps it in for those days.
 */
const KINDS: EventKind[] = ['holiday', 'exam', 'ptm', 'meeting', 'event', 'other'];
const SCOPES: StaffScope[] = ['all', 'teaching', 'office', 'none'];

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b) return bad('Invalid request.');
  const id = b.id ? (isUuid(b.id) ? b.id : null) : null;
  if (b.id && !id) return bad('Unknown calendar entry.');
  const title = str(b.title, 120);
  if (!title) return bad('Give it a title.');
  const kind: EventKind = KINDS.includes(b.kind) ? b.kind : 'event';
  const startsOn = String(b.startsOn || ''), endsOn = String(b.endsOn || b.startsOn || '');
  if (!ISO_DAY.test(startsOn) || !ISO_DAY.test(endsOn)) return bad('Pick the dates.');
  if (endsOn < startsOn) return bad('The end date must be on or after the start date.');
  if (daysBetween(startsOn, endsOn) > 366) return bad('A calendar entry can span at most a year.');

  const wingIds = Array.isArray(b.wingIds) ? [...new Set(b.wingIds.filter(isUuid))] as string[] : [];
  if (wingIds.length) {
    const { data } = await db.from('sched_wings').select('id').eq('school_id', admin.schoolId).in('id', wingIds);
    if ((data || []).length !== wingIds.length) return bad('Unknown wing.');
  }
  const bellId = uuidOrNull(b.bellScheduleId);
  if (bellId) {
    const { data } = await db.from('bell_schedules').select('id, kind').eq('id', bellId).eq('school_id', admin.schoolId).maybeSingle();
    if (!data) return bad('Unknown bell schedule.');
    if (data.kind !== 'variant') return bad('Only a variant bell schedule (exam day, half day) can be swapped in for a date.');
  }
  const startsAt = b.startsAt ? time(b.startsAt) : null, endsAt = b.endsAt ? time(b.endsAt) : null;
  if ((b.startsAt && !startsAt) || (b.endsAt && !endsAt)) return bad('Times look like 14:00.');
  if (startsAt && endsAt && endsAt <= startsAt) return bad('The end time must be after the start time.');
  const suspends = typeof b.suspendsClasses === 'boolean' ? b.suspendsClasses : kind === 'holiday';
  if (suspends && bellId) return bad('A day off has no bells. Either suspend classes or swap in a bell schedule, not both.');
  const scope: StaffScope = SCOPES.includes(b.staffScope) ? b.staffScope
    : kind === 'ptm' ? 'teaching' : kind === 'meeting' ? 'all' : 'none';

  const row = {
    school_id: admin.schoolId, title, kind, starts_on: startsOn, ends_on: endsOn, wing_ids: wingIds.length ? wingIds : null,
    bell_schedule_id: bellId, suspends_classes: suspends, staff_scope: scope, starts_at: startsAt, ends_at: endsAt,
    notes: str(b.notes, 2000) || null, updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await db.from('academic_events').update(row).eq('id', id).eq('school_id', admin.schoolId).select('id').maybeSingle();
    if (error) return dbError(error, 'Could not save the calendar entry.');
    if (!data) return bad('That calendar entry no longer exists.', 404);
    return NextResponse.json({ ok: true, id });
  }
  const { data, error } = await db.from('academic_events').insert({ ...row, created_by: admin.id }).select('id').single();
  return error ? dbError(error, 'Could not save the calendar entry.') : NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, 'schedule.academic');
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!isUuid(b?.id)) return bad('Pick a calendar entry.');
  const { error } = await db.from('academic_events').delete().eq('id', b.id).eq('school_id', admin.schoolId);
  return error ? dbError(error, 'Could not remove the calendar entry.') : NextResponse.json({ ok: true });
}
