'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LoadTracker } from '@/lib/loadTracker';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { DEMO_STUDENT, demoRows } from '@/lib/demo/student';
import { buildSubjects, isAssignedTo, overallTml, shapeAssignment } from './shape';
import type { StudentDesk } from './types';
import { all, allByIds } from '@/lib/admin/loadRows';

interface Rows { assignments: any[]; submissions: any[]; tutor_sessions: any[]; tml_scores: any[] }

function assemble(rows: Rows, me: StudentDesk['me'], mode: StudentDesk['mode']): StudentDesk {
  const subBy = new Map(rows.submissions.map(s => [s.assignment_id, s]));
  const assignments = rows.assignments.map(a => shapeAssignment(a, subBy.get(a.id)));
  const subjects = buildSubjects(assignments, rows.tml_scores, rows.tutor_sessions);
  return { mode, me, assignments, subjects, overallTml: overallTml(subjects) };
}

async function loadLive(profile: UserProfile): Promise<Rows> {
  const supabase = createClient();
  const [s, t, m] = await Promise.all([
    supabase.from('submissions').select('*').eq('student_id', profile.uid),
    supabase.from('tutor_sessions').select('id, subject, topic, hint_depth, answer_revealed, created_at').eq('student_id', profile.uid),
    supabase.from('tml_scores').select('subject, topic_name, score, confidence_band, item_count, components, computed_at')
      .eq('student_id', profile.uid).order('computed_at', { ascending: false }).limit(1000),
  ]);
  if (s.error) throw s.error;
  const submittedIds = new Set((s.data || []).map(x => x.assignment_id));

  // Which assignments are this student's, from a light list of the whole school's (paged: a large school has more
  // than the 1,000 rows one request returns, and the student's class could be the part cut off), then the full
  // rows for those only. The student view: answer keys removed (staff read the table).
  const light = await all((from, to) => {
    const q = supabase.from('assignments_student').select('id, class, status, assigned_student_ids');
    return (profile.schoolId ? q.eq('school_id', profile.schoolId) : q).order('id').range(from, to);
  });
  const mineIds = light.data.filter(x => x.status !== 'draft').filter(x =>
    // Always keep anything the student already submitted, even if it's since been re-targeted.
    submittedIds.has(x.id) || isAssignedTo(x, profile.studentClass || '', profile.uid, profile.customStudentId || '')).map(x => x.id);
  const a = await allByIds(mineIds, (chunk, from, to) => supabase.from('assignments_student').select('*').in('id', chunk).order('id').range(from, to));

  // Assignments and submissions are required; tutor sessions and TML
  // snapshots degrade to "no evidence yet" rather than failing the desk.
  if (t.error) console.warn('[student desk] tutor_sessions unavailable:', t.error.message);
  if (m.error) console.warn('[student desk] tml_scores unavailable:', m.error.message);

  const submissions = s.data || [];
  const assignments = a.data;

  return { assignments, submissions, tutor_sessions: t.data || [], tml_scores: m.data || [] };
}

/** Data older than this is refreshed in the background when a page mounts. */
const STALE_MS = 30_000;

interface DeskState {
  desk: StudentDesk | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Background refresh if the data is older than STALE_MS. Never shows a skeleton. */
  refreshIfStale: () => void;
}

const DeskContext = createContext<DeskState | null>(null);

/**
 * Loads the student desk once for the whole /student area and keeps it across
 * tab switches (mounted in the student layout, which persists between pages).
 * Pages read it instantly; stale data is refreshed quietly behind the scenes.
 * Live Supabase rows when there's a real session; the canon demo dataset in
 * the local no-backend dev bypass (no session => `user` is null).
 */
export function StudentDeskProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading } = useAuth();
  const [desk, setDesk] = useState<StudentDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tracker] = useState(() => new LoadTracker(STALE_MS));
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const refreshIfStale = useCallback(() => { if (tracker.stale(Date.now())) reload(); }, [tracker, reload]);
  // The local no-backend dev bypass (no session): the canon demo dataset, never refreshed.
  const demoDesk = useMemo(() => (!authLoading && profile && !user ? assemble(demoRows(), DEMO_STUDENT, 'demo') : null), [authLoading, profile, user]);

  useEffect(() => {
    if (authLoading || !profile || !user) return;
    let cancelled = false;

    const me = {
      name: profile.name || 'Student',
      id: profile.customStudentId || '',
      cls: profile.studentClass || '',
      school: profile.branch || '',
    };
    tracker.start();
    loadLive(profile)
      .then(rows => { tracker.finish(true); if (!cancelled) { setDesk(assemble(rows, me, 'live')); setError(null); } })
      // A failed background refresh keeps showing the last good data; only a first load surfaces the error.
      .catch(e => { tracker.finish(false); if (!cancelled) setError(prev => (tracker.everLoaded ? prev : e?.message || 'Could not load your desk.')); });
    return () => { cancelled = true; };
  }, [authLoading, profile, user, nonce, tracker]);

  // Coming back to the tab after a while: refresh in the background.
  useEffect(() => {
    const onFocus = () => refreshIfStale();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshIfStale]);

  const shown = user ? desk : demoDesk;
  const value = useMemo(() => ({ desk: shown, error, loading: !shown && !error, reload, refreshIfStale }), [shown, error, reload, refreshIfStale]);
  return createElement(DeskContext.Provider, { value }, children);
}

/** Everything the student desk renders — from the shared provider, so tab switches are instant. */
export function useStudentDesk() {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error('useStudentDesk must be used inside <StudentDeskProvider> (the student layout).');
  const { refreshIfStale } = ctx;
  useEffect(() => { refreshIfStale(); }, [refreshIfStale]);
  return ctx;
}
