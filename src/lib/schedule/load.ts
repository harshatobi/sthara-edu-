/**
 * Loads a school's scheduling rows. The browser passes its own client, so RLS decides what comes back:
 * drafts only for timetable builders, the staff register only for those who manage it (and each
 * person's own row), leave only the caller's own unless they're in the office.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { all } from '@/lib/admin/loadRows';
import { sessionOf, sessionStart } from '@/lib/admin/format';
import type { BellSchedule, ScheduleRows } from './types';

export async function loadScheduleRows(db: SupabaseClient, schoolId: string, opts: { students?: boolean } = {}): Promise<ScheduleRows> {
  const session = sessionOf();
  const since = sessionStart(session);
  const s = (t: string, c: string) => db.from(t).select(c);
  const [school, wings, bells, periods, rooms, events, versions, staff, people, students, leave] = await Promise.all([
    db.from('schools').select('name').eq('id', schoolId).maybeSingle(),
    all((a, b) => s('sched_wings', 'id, name, grade_from, grade_to').eq('school_id', schoolId).order('grade_from').range(a, b)),
    all((a, b) => s('bell_schedules', 'id, name, wing_id, kind, weekdays').eq('school_id', schoolId).order('created_at').range(a, b)),
    all((a, b) => s('bell_periods', 'id, schedule_id, seq, label, kind, period_no, starts_at, ends_at').eq('school_id', schoolId).order('seq').range(a, b)),
    all((a, b) => s('rooms', 'id, name, kind, capacity, home_class, active').eq('school_id', schoolId).order('name').range(a, b)),
    // Last session's tail too, so a week that spans 1 April still shows its events.
    all((a, b) => s('academic_events', '*').eq('school_id', schoolId).gte('ends_on', `${Number(session.slice(0, 4)) - 1}-12-01`).order('starts_on').range(a, b)),
    all((a, b) => s('timetable_versions', 'id, session, name, status, effective_from, source, notes, published_at, created_at').eq('school_id', schoolId).order('created_at').range(a, b)),
    // '*' so the register still loads whichever columns this database has.
    all((a, b) => s('staff_members', '*').eq('school_id', schoolId).order('name').range(a, b)),
    all((a, b) => s('users', 'id, name, role, email, assignments, teacher_class, teacher_subject').eq('school_id', schoolId).in('role', ['teacher', 'admin']).order('name').range(a, b)),
    opts.students
      ? all((a, b) => s('users', 'student_class').eq('school_id', schoolId).eq('role', 'student').not('student_class', 'is', null).order('id').range(a, b))
      : Promise.resolve({ data: [], missing: false }),
    all((a, b) => s('leave_requests', 'id, staff_id, leave_type, from_date, to_date, half_day, status').eq('school_id', schoolId).eq('status', 'approved').gte('to_date', since).order('id').range(a, b)),
  ]);
  // Cover, duties, visiting sessions and comp-off for this session (RLS trims absences, sessions and comp-off).
  const [absences, covers, dutyPosts, roster, duties, visits, compOffs] = await Promise.all([
    all((a, b) => s('staff_absences', '*').eq('school_id', schoolId).gte('on_date', since).neq('status', 'cancelled').order('id').range(a, b)),
    all((a, b) => s('cover_assignments', '*').eq('school_id', schoolId).gte('on_date', since).order('id').range(a, b)),
    all((a, b) => s('duty_posts', '*').eq('school_id', schoolId).order('starts_at').range(a, b)),
    all((a, b) => s('duty_roster', '*').eq('school_id', schoolId).order('id').range(a, b)),
    all((a, b) => s('duty_assignments', '*').eq('school_id', schoolId).gte('on_date', since).order('on_date').range(a, b)),
    all((a, b) => s('visit_sessions', '*').eq('school_id', schoolId).gte('on_date', since).order('on_date').range(a, b)),
    all((a, b) => s('comp_off_grants', '*').eq('school_id', schoolId).gte('duty_on', since).order('duty_on').range(a, b)),
  ]);

  // Lessons of the versions this person can see (the current and next sessions; older ones stay archived).
  const vis = versions.data.filter(v => v.session >= session || v.status === 'published');
  const slots: any[] = [];
  for (let i = 0; i < vis.length; i += 50) {
    const ids = vis.slice(i, i + 50).map(v => v.id);
    const r = await all((a, b) => s('timetable_slots', '*')
      .in('version_id', ids).order('id').range(a, b));
    slots.push(...r.data);
  }

  const byBell = new Map<string, any[]>();
  for (const p of periods.data) byBell.set(p.schedule_id, [...(byBell.get(p.schedule_id) || []), p]);
  const hm = (t: string) => String(t || '').slice(0, 5);
  const shapedBells: BellSchedule[] = bells.data.map(b => ({
    id: b.id, name: b.name, wing_id: b.wing_id, kind: b.kind, weekdays: (b.weekdays || []).map(Number),
    periods: (byBell.get(b.id) || []).map(p => ({ id: p.id, seq: p.seq, label: p.label, kind: p.kind, period_no: p.period_no, starts_at: hm(p.starts_at), ends_at: hm(p.ends_at) })),
  }));

  const named = { sched_wings: wings, bell_schedules: bells, rooms, academic_events: events, timetable_versions: versions, staff_members: staff, cover_assignments: covers, duty_posts: dutyPosts };
  return {
    schoolName: school.data?.name || 'School',
    wings: wings.data, bells: shapedBells, rooms: rooms.data,
    events: events.data.map(e => ({ ...e, starts_at: e.starts_at ? hm(e.starts_at) : null, ends_at: e.ends_at ? hm(e.ends_at) : null })),
    versions: versions.data, slots, staff: staff.data, people: people.data,
    studentClasses: [...new Set(students.data.map((r: any) => r.student_class as string))],
    leave: leave.data,
    absences: absences.data.map(x => ({ ...x, period_nos: (x.period_nos || []).map(Number) })),
    covers: covers.data,
    dutyPosts: dutyPosts.data.map(p => ({ ...p, weekdays: (p.weekdays || []).map(Number), starts_at: hm(p.starts_at), ends_at: hm(p.ends_at) })),
    roster: roster.data,
    duties: duties.data.map(d => ({ ...d, starts_at: hm(d.starts_at), ends_at: hm(d.ends_at) })),
    visits: visits.data,
    compOffs: compOffs.data.map(g => ({ ...g, days: Number(g.days) })),
    missing: Object.entries(named).filter(([, r]) => r.missing).map(([k]) => k),
  };
}
