'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { all } from '@/lib/admin/loadRows';
import { istDay } from '@/lib/feed/rules';
import { teachingDays, wingOf } from '@/lib/schedule/engine';
import type { AcademicEvent, Wing } from '@/lib/schedule/types';
import type { Mark } from '@/lib/attendance/register';

/** The academic session (April to March) that `day` falls in starts on this date. */
export const sessionFrom = (day: string) => `${Number(day.slice(5, 7)) >= 4 ? day.slice(0, 4) : Number(day.slice(0, 4)) - 1}-04-01`;

export interface Calendar { workingDays: number[]; events: AcademicEvent[]; wings: Wing[]; schoolName: string }
export interface History {
  /** student -> day -> mark, for the whole session so far. */
  marks: Record<string, Record<string, Mark>>;
  notes: Record<string, Record<string, string>>;
}

/** The school calendar (holidays, teaching weekdays, wings). Staff can read it; loaded once per school. */
export function useCalendar(schoolId: string | null | undefined) {
  const [cal, setCal] = useState<Calendar | null>(null);
  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    const db = createClient();
    const from = sessionFrom(istDay());
    Promise.all([
      db.from('academic_events').select('id, title, kind, starts_on, ends_on, wing_ids, bell_schedule_id, suspends_classes, staff_scope, starts_at, ends_at, notes').eq('school_id', schoolId).gte('ends_on', from),
      db.from('bell_schedules').select('kind, weekdays, wing_id').eq('school_id', schoolId),
      db.from('sched_wings').select('id, name, grade_from, grade_to').eq('school_id', schoolId),
      db.from('schools').select('name').eq('id', schoolId).maybeSingle(),
    ]).then(([ev, bells, wings, school]) => {
      if (!alive) return;
      // Any of these missing (a school that hasn't set up its calendar) just means fewer days are marked off.
      setCal({
        events: (ev.data || []) as AcademicEvent[],
        workingDays: teachingDays((bells.data || []).map(b => ({ id: '', name: '', wing_id: b.wing_id, kind: b.kind, weekdays: (b.weekdays || []).map(Number), periods: [] }))),
        wings: (wings.data || []) as Wing[],
        schoolName: school.data?.name || 'School',
      });
    });
    return () => { alive = false; };
  }, [schoolId]);
  return cal;
}

export const wingIdOf = (cls: string, cal: Calendar | null) => (cal ? wingOf(cls, cal.wings)?.id ?? null : null);

/**
 * The class's register for the session so far. Keyed by the roster and a reload nonce; a stale
 * result (the teacher switched class mid-load) is dropped.
 */
export function useHistory(studentIds: string[], nonce: number) {
  const key = `${studentIds.join(',')}|${nonce}`;
  const [state, setState] = useState<{ key: string; data: History | null; err: string | null } | null>(null);
  useEffect(() => {
    if (!studentIds.length) return;
    let alive = true;
    const db = createClient();
    const from = sessionFrom(istDay());
    all((a, b) => db.from('attendance').select('id, student_id, day, status, note').in('student_id', studentIds).gte('day', from).order('id').range(a, b))
      .then(r => {
        if (!alive) return;
        if (r.missing) { setState({ key, data: null, err: 'Attendance is not switched on for this school yet (database update pending).' }); return; }
        const marks: History['marks'] = {}, notes: History['notes'] = {};
        for (const row of r.data) {
          (marks[row.student_id] ||= {})[row.day] = row.status as Mark;
          if (row.note) (notes[row.student_id] ||= {})[row.day] = row.note;
        }
        setState({ key, data: { marks, notes }, err: null });
      })
      .catch(e => { if (alive) setState({ key, data: null, err: e?.message || 'Could not load the register.' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // While a reload of the same class is in flight, keep showing what we had (no flash of skeletons after a save).
  const roster = studentIds.join(',');
  const current = state && (state.key === key || state.key.startsWith(`${roster}|`)) ? state : null;
  return useMemo(() => ({
    history: studentIds.length ? current?.data ?? null : EMPTY,
    err: current?.err ?? null,
    /** Changes whenever a fresh load lands: views key their local edits on it. */
    version: current?.key ?? 'none',
  }), [current, studentIds.length]);
}

const EMPTY: History = { marks: {}, notes: {} };
