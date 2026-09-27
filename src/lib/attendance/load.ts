/**
 * Loads staff attendance for a school between two dates. The browser passes its own client (RLS: everyone for those
 * who manage staff, otherwise just the caller's own rows); the server passes the service client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { all } from '@/lib/admin/loadRows';
import { addDays, teachingDays } from '@/lib/schedule/engine';
import { DEFAULT_SETTINGS, IST_OFFSET_MIN, localOf, peopleOf, type AttendanceRows, type Person, type Settings } from './engine';

export interface AttendanceData {
  rows: AttendanceRows;
  people: Person[];
  staff: any[];
  devices: { id: string; name: string; vendor: string | null; active: boolean; last_seen_at: string | null; created_at: string }[];
  reviews: any[];
  settingsSaved: boolean;
  missing: string[];
}

const hm = (t: string | null) => (t ? String(t).slice(0, 5) : t);

export async function loadAttendance(db: SupabaseClient, schoolId: string, from: string, to: string): Promise<AttendanceData> {
  const s = (t: string, c = '*') => db.from(t).select(c);
  // Punches are timestamps: widen by a day each side so night shifts and the UTC offset are covered.
  const fromTs = new Date(Date.parse(`${addDays(from, -1)}T00:00:00Z`) - IST_OFFSET_MIN * 60_000).toISOString();
  const toTs = new Date(Date.parse(`${addDays(to, 2)}T00:00:00Z`) - IST_OFFSET_MIN * 60_000).toISOString();
  const [settings, shifts, plans, overrides, punches, marks, leave, absences, events, bells, people, staff, devices, reviews, firstPunch, firstMark] = await Promise.all([
    db.from('attendance_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    all((a, b) => s('shifts').eq('school_id', schoolId).order('starts_at').range(a, b)),
    all((a, b) => s('staff_shift_plans').eq('school_id', schoolId).order('id').range(a, b)),
    all((a, b) => s('shift_overrides').eq('school_id', schoolId).gte('on_date', from).lte('on_date', to).order('id').range(a, b)),
    all((a, b) => s('staff_punches').eq('school_id', schoolId).gte('at', fromTs).lt('at', toTs).order('at').range(a, b)),
    all((a, b) => s('staff_day_marks').eq('school_id', schoolId).gte('on_date', from).lte('on_date', to).order('id').range(a, b)),
    all((a, b) => s('leave_requests', 'staff_id, staff_member_id, leave_type, from_date, to_date, half_day, status').eq('school_id', schoolId).eq('status', 'approved').gte('to_date', from).lte('from_date', to).order('id').range(a, b)),
    all((a, b) => s('staff_absences').eq('school_id', schoolId).gte('on_date', from).lte('on_date', to).eq('status', 'confirmed').order('id').range(a, b)),
    all((a, b) => s('academic_events').eq('school_id', schoolId).gte('ends_on', from).lte('starts_on', to).order('starts_on').range(a, b)),
    all((a, b) => s('bell_schedules', 'kind, weekdays').eq('school_id', schoolId).range(a, b)),
    all((a, b) => s('users', 'id, name, role, created_at').eq('school_id', schoolId).in('role', ['teacher', 'admin']).order('name').range(a, b)),
    all((a, b) => s('staff_members').eq('school_id', schoolId).order('name').range(a, b)),
    all((a, b) => s('attendance_devices', 'id, name, vendor, active, last_seen_at, created_at').eq('school_id', schoolId).order('created_at').range(a, b)),
    all((a, b) => s('attendance_month_reviews').eq('school_id', schoolId).gte('month', `${from.slice(0, 7)}-01`).lte('month', to).order('month').range(a, b)),
    // When the school started keeping staff attendance (no absences are proposed before it).
    db.from('staff_punches').select('at').eq('school_id', schoolId).order('at').limit(1).maybeSingle(),
    db.from('staff_day_marks').select('on_date').eq('school_id', schoolId).order('on_date').limit(1).maybeSingle(),
  ]);
  const starts = [firstPunch.data ? localOf(firstPunch.data.at).date : null, firstMark.data?.on_date ?? null].filter((x): x is string => !!x).sort();
  const st: Settings = settings.data ? {
    ...DEFAULT_SETTINGS, ...settings.data,
    teacher_start: hm(settings.data.teacher_start)!, teacher_end: hm(settings.data.teacher_end)!, office_start: hm(settings.data.office_start)!, office_end: hm(settings.data.office_end)!,
    min_full_hours: Number(settings.data.min_full_hours), geofence_lat: settings.data.geofence_lat === null ? null : Number(settings.data.geofence_lat),
    geofence_lng: settings.data.geofence_lng === null ? null : Number(settings.data.geofence_lng),
  } : { ...DEFAULT_SETTINGS };
  const named = { shifts, staff_shift_plans: plans, staff_punches: punches, staff_day_marks: marks };
  return {
    rows: {
      settings: st,
      shifts: shifts.data.map(x => ({ ...x, starts_at: hm(x.starts_at), ends_at: hm(x.ends_at) })),
      plans: plans.data.map(p => ({ ...p, off_days: (p.off_days || []).map(Number), off_cycle: (p.off_cycle || []).map(Number) })),
      overrides: overrides.data, punches: punches.data,
      marks: marks.data.map(m => ({ ...m, in_at: hm(m.in_at), out_at: hm(m.out_at) })),
      leave: leave.data, absences: absences.data.map(a => ({ ...a, period_nos: (a.period_nos || []).map(Number) })),
      events: events.data, trackedFrom: starts[0] ?? null, workingDays: teachingDays(bells.data.map(b => ({ ...b, weekdays: (b.weekdays || []).map(Number), periods: [] })) as any),
    },
    people: peopleOf(people.data, staff.data), staff: staff.data, devices: devices.data, reviews: reviews.data,
    settingsSaved: !!settings.data,
    missing: Object.entries(named).filter(([, r]) => r.missing).map(([k]) => k),
  };
}
