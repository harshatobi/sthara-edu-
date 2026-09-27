import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { isUuid, str } from '@/lib/admin/serverAuth';
import type { Slot } from './types';

export const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
export const time = (v: unknown) => (typeof v === 'string' && TIME.test(v.trim()) ? v.trim().padStart(5, '0') : null);
export const uuidOrNull = (v: unknown) => (isUuid(v) ? v : null);

/** Postgres errors from the scheduling triggers and constraints, in words an office user can act on. */
export function dbError(e: { code?: string; message?: string } | null, fallback: string): NextResponse {
  const m = e?.message || '';
  if (/teacher clash|room clash/.test(m)) return NextResponse.json({ error: m.replace(/^.*?(teacher|room) clash: /, (_, k) => `${k === 'teacher' ? 'That teacher is' : 'That room is'} busy: `) }, { status: 409 });
  if (/is published; copy it/.test(m)) return NextResponse.json({ error: 'This timetable is published. Copy it to a new draft to change it.' }, { status: 409 });
  if (e?.code === '23505') {
    if (/uq_timetable_versions_effective/.test(m)) return NextResponse.json({ error: 'Another published timetable already starts on that date. Pick a different date.' }, { status: 409 });
    if (/uq_rooms_home_class/.test(m)) return NextResponse.json({ error: 'That section already has a home room.' }, { status: 409 });
    if (/uq_staff_members_code/.test(m)) return NextResponse.json({ error: 'Another staff member has that employee code.' }, { status: 409 });
    if (/uq_staff_members_user/.test(m)) return NextResponse.json({ error: 'That account is already on the staff register.' }, { status: 409 });
    return NextResponse.json({ error: 'That name is already taken. Pick another.' }, { status: 409 });
  }
  if (e?.code === '23514') return NextResponse.json({ error: 'Some of those values aren\'t allowed. Check the times and dates.' }, { status: 400 });
  console.error('[schedule]', m);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * Who can hold a lesson: teacher and office accounts of the school (a principal can teach too), and
 * active register members with no login as "s:" + id (a visiting dance teacher).
 */
export async function staffIds(db: SupabaseClient, schoolId: string): Promise<Set<string>> {
  const [{ data: users }, { data: register }] = await Promise.all([
    db.from('users').select('id').eq('school_id', schoolId).in('role', ['teacher', 'admin']),
    db.from('staff_members').select('id').eq('school_id', schoolId).eq('active', true).is('user_id', null),
  ]);
  return new Set([...(users || []).map(r => r.id), ...(register || []).map(r => `s:${r.id}`)]);
}
/** Names for clash messages: accounts by id, register members by "s:" + id. */
export async function staffNames(db: SupabaseClient, schoolId: string): Promise<Map<string, string>> {
  const [{ data: users }, { data: register }] = await Promise.all([
    db.from('users').select('id, name').eq('school_id', schoolId).in('role', ['teacher', 'admin']),
    db.from('staff_members').select('id, name').eq('school_id', schoolId),
  ]);
  return new Map([...(register || []).map(r => [`s:${r.id}`, r.name] as [string, string]), ...(users || []).map(r => [r.id, r.name || 'A teacher'] as [string, string])]);
}
export async function roomIds(db: SupabaseClient, schoolId: string): Promise<Set<string>> {
  const { data } = await db.from('rooms').select('id').eq('school_id', schoolId);
  return new Set((data || []).map(r => r.id));
}

/** One lesson from a request body, checked against the school's staff and rooms; a message when it isn't valid. */
export function cleanSlot(b: any, staff: Set<string>, rooms: Set<string>): Slot | string {
  const cls = str(b?.class, 40);
  if (!normClass(cls)) return 'Every lesson needs a class.';
  const weekday = Number(b?.weekday), period = Number(b?.period_no);
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return 'Pick a day.';
  if (!Number.isInteger(period) || period < 1 || period > 16) return 'Pick a period between 1 and 16.';
  const subject = str(b?.subject, 80);
  if (!subject) return 'Every lesson needs a subject.';
  const teacher = b?.teacher_id ? String(b.teacher_id) : null;
  const member = b?.staff_member_id ? String(b.staff_member_id) : null;
  if (teacher && member) return 'A lesson has one teacher.';
  if (teacher && !staff.has(teacher)) return 'That teacher isn\'t on this school\'s staff.';
  if (member && !staff.has(`s:${member}`)) return 'That person isn\'t on this school\'s staff register.';
  const room = b?.room_id ? String(b.room_id) : null;
  if (room && !rooms.has(room)) return 'That room isn\'t in this school.';
  return {
    class: displayClass(cls), group_label: str(b?.group_label, 40), weekday, period_no: period, subject,
    teacher_id: teacher, staff_member_id: member, room_id: room, combined: !!b?.combined,
  };
}
