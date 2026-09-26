'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { CURRENT_SESSION } from '@/lib/curriculum';
import { normClass, normSubject } from './scope';
import { topicKey } from './desk';
import { buildCourse, defaultTerm, shapeLesson, type CoursePlan, type Lesson } from './course';
import { useTeacherDesk } from './useTeacherDesk';

export interface CourseAssignment { id: string; title: string; type: string; status: string; dueAt: string | null; chapterKey: string }

interface Raw { key: string; plan: any | null; progress: any[]; lessons: any[]; assignments: any[] }

/**
 * Everything the Syllabus workspace shows for one class + subject: the term
 * plan, coverage rows, lesson plans and the assignments set on each chapter.
 * Coverage edits apply optimistically and roll back if the save fails.
 */
export function useCourse(cls: string, subject: string) {
  const { profile } = useAuth();
  const { call } = useTeacherDesk();
  const [loaded, setRaw] = useState<Raw | null>(null);
  // Data for another class/subject (mid-switch) counts as not loaded yet.
  const raw = loaded?.key === `${cls}::${subject}` ? loaded : null;
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!profile?.schoolId || !cls || !subject) return;
    let cancelled = false;
    const db = createClient();
    const school = profile.schoolId;
    Promise.all([
      db.from('course_plans').select('*').eq('school_id', school).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION).maybeSingle(),
      db.from('syllabus_progress').select('*').eq('school_id', school).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION),
      db.from('lesson_plans').select('*').eq('school_id', school).eq('class', cls).eq('subject', subject).eq('session', CURRENT_SESSION)
        .order('lesson_date', { ascending: true, nullsFirst: false }).order('period', { ascending: true, nullsFirst: false }),
      db.from('assignments').select('id, title, type, status, due_date, units, class, subject').eq('school_id', school),
    ]).then(([p, g, l, a]) => {
      if (cancelled) return;
      const err = p.error || g.error || l.error || a.error;
      if (err) { setError(err.message); return; }
      setError(null);
      setRaw({
        key: `${cls}::${subject}`, plan: p.data, progress: g.data || [], lessons: l.data || [],
        // Assignments for this class + subject (RLS: staff see the whole school's).
        assignments: (a.data || []).filter(x => normClass(x.class) === normClass(cls) && normSubject(x.subject) === normSubject(subject)),
      });
    }).catch(e => { if (!cancelled) setError(e?.message || 'Could not load the course. Check your connection.'); });
    return () => { cancelled = true; };
  }, [profile?.schoolId, cls, subject, nonce]);

  const plan: CoursePlan = useMemo(() => raw?.plan
    ? { termStart: raw.plan.term_start, termEnd: raw.plan.term_end, periodsPerWeek: raw.plan.periods_per_week, periodMinutes: raw.plan.period_minutes, saved: true }
    : { ...defaultTerm(), periodsPerWeek: 6, periodMinutes: 40, saved: false }, [raw]);
  const chapters = useMemo(() => (raw ? buildCourse(cls, subject, raw.progress) : []), [raw, cls, subject]);
  const lessons: Lesson[] = useMemo(() => (raw?.lessons ?? []).map(shapeLesson), [raw]);
  const assignments: CourseAssignment[] = useMemo(() => (raw?.assignments ?? []).map(a => ({
    id: a.id, title: a.title, type: a.type, status: a.status, dueAt: a.due_date,
    chapterKey: topicKey(Array.isArray(a.units) && a.units[0] ? a.units[0] : a.title),
  })), [raw]);
  const assessedKeys = useMemo(() => new Set(assignments.filter(a => a.status !== 'draft').map(a => a.chapterKey)), [assignments]);

  /** Coverage / pacing edits: optimistic, then saved; rolls back on failure. */
  const saveItems = useCallback(async (items: { chapterKey: string; topic?: string; status?: string; taughtOn?: string | null; plannedStart?: string | null; plannedEnd?: string | null; note?: string | null }[]) => {
    const before = raw;
    setRaw(r => {
      if (!r) return r;
      const progress = [...r.progress];
      for (const it of items) {
        const topic = it.topic ?? '';
        const i = progress.findIndex(p => p.chapter_key === it.chapterKey && (p.topic || '') === topic);
        const old = i >= 0 ? progress[i] : { chapter_key: it.chapterKey, topic, status: 'not_started' };
        const next = {
          ...old,
          ...(it.status !== undefined ? { status: it.status, taught_on: it.status === 'taught' ? (it.taughtOn ?? old.taught_on ?? new Date().toISOString().slice(0, 10)) : null } : {}),
          ...(it.plannedStart !== undefined ? { planned_start: it.plannedStart } : {}),
          ...(it.plannedEnd !== undefined ? { planned_end: it.plannedEnd } : {}),
          ...(it.note !== undefined ? { note: it.note } : {}),
        };
        if (i >= 0) progress[i] = next; else progress.push(next);
      }
      return { ...r, progress };
    });
    try {
      await call('/api/teacher/course', 'PUT', { class: cls, subject, items: items.map(it => ({ ...it, topic: it.topic ?? '' })) });
    } catch (e) {
      setRaw(before);
      throw e;
    }
  }, [raw, call, cls, subject]);

  const savePlan = useCallback(async (p: Omit<CoursePlan, 'saved'>) => {
    await call('/api/teacher/course', 'PUT', { class: cls, subject, plan: p });
    reload();
  }, [call, cls, subject, reload]);

  return { loading: !raw && !error, error, plan, chapters, lessons, assignments, assessedKeys, saveItems, savePlan, reload, call };
}

export type Course = ReturnType<typeof useCourse>;
