'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth, type UserProfile } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { assembleDesk, type DeskRows, type TeacherDesk } from './desk';
import { teachingScope, type ScopeEntry } from './scope';

async function loadLive(profile: UserProfile, scope: ScopeEntry[]): Promise<DeskRows> {
  const supabase = createClient();
  const school = profile.schoolId!;
  // Row-level security already limits a teacher to their own school.
  const [students, assignments] = await Promise.all([
    supabase.from('users').select('id, name, email, student_class, custom_student_id').eq('school_id', school).eq('role', 'student'),
    supabase.from('assignments').select('*').eq('school_id', school).eq('teacher_id', profile.uid).order('created_at', { ascending: false }),
  ]);
  if (students.error) throw students.error;
  if (assignments.error) throw assignments.error;

  const ids = (assignments.data || []).map(a => a.id);
  const studentIds = (students.data || []).map(s => s.id);
  const subjects = [...new Set(scope.map(e => e.subject).filter(Boolean))];
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [subs, tml, alerts] = await Promise.all([
    ids.length
      ? supabase.from('submissions')
        .select('id, assignment_id, student_id, score, max_score, grade, teacher_approved, ai_graded, ai_result, ai_feedback, answers, image_urls, submitted_at, teacher_note, type')
        .in('assignment_id', ids)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase.from('tml_scores').select('student_id, subject, topic_name, score, confidence_band, components, item_count, computed_at')
        .in('student_id', studentIds).order('computed_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('proctor_alerts').select('id, student_id, student_name, assignment_id, assignment_title, switch_count, flagged_at')
      .eq('school_id', school).gte('flagged_at', since),
  ]);
  if (subs.error) throw subs.error;
  const gradedIds = (subs.data || []).filter((x: any) => x.teacher_approved === true).map((x: any) => x.id);
  const items = gradedIds.length
    ? await supabase.from('submission_items').select('submission_id, question_index, score').in('submission_id', gradedIds).eq('teacher_confirmed', true)
    : { data: [], error: null };
  // TML and proctoring degrade to "no evidence yet" rather than failing the desk.
  if (tml.error) console.warn('[teacher desk] tml_scores unavailable:', tml.error.message);
  if (alerts.error) console.warn('[teacher desk] proctor_alerts unavailable:', alerts.error.message);

  const tmlRows = (tml.data || []).filter((r: any) => !subjects.length || subjects.some(s => s.toLowerCase() === String(r.subject || '').toLowerCase()));
  return { students: students.data || [], assignments: assignments.data || [], submissions: subs.data || [], tml: tmlRows, alerts: alerts.data || [], items: items.data || [] };
}

const STALE_MS = 30_000;

interface DeskState {
  desk: TeacherDesk | null;
  error: string | null;
  reload: () => void;
  refreshIfStale: () => void;
  /** Authenticated call to a teacher API route; throws the route's error message. */
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}

const Ctx = createContext<DeskState | null>(null);

/** Loads the teacher desk once for the whole /teacher area (mounted in the layout). */
export function TeacherDeskProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [desk, setDesk] = useState<TeacherDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const refreshIfStale = useCallback(() => {
    if (!inFlight.current && loadedAt.current && Date.now() - loadedAt.current > STALE_MS) reload();
  }, [reload]);

  const scope = useMemo(() => teachingScope({
    assignments: profile?.assignments, teacher_class: profile?.teacherClass, teacher_subject: profile?.teacherSubject,
  }), [profile?.assignments, profile?.teacherClass, profile?.teacherSubject]);

  useEffect(() => {
    if (authLoading || !profile || !user || !profile.schoolId) return;
    let cancelled = false;
    inFlight.current = true;
    const me = { id: profile.uid, name: profile.name || 'Teacher', subject: profile.teacherSubject || scope[0]?.subject || '' };
    loadLive(profile, scope)
      .then(rows => { if (!cancelled) { setDesk(assembleDesk(rows, me, scope, 'live')); setError(null); loadedAt.current = Date.now(); } })
      .catch(e => { if (!cancelled) setError(prev => (loadedAt.current ? prev : e?.message || 'Could not load your desk.')); })
      .finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [authLoading, profile, user, scope, nonce]);

  useEffect(() => {
    const onFocus = () => refreshIfStale();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshIfStale]);

  const call = useCallback(async (path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data;
  }, [getAuthToken]);

  const value = useMemo(() => ({ desk, error, reload, refreshIfStale, call }), [desk, error, reload, refreshIfStale, call]);
  return createElement(Ctx.Provider, { value }, children);
}

export function useTeacherDesk() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTeacherDesk must be used inside <TeacherDeskProvider> (the teacher layout).');
  const { refreshIfStale } = ctx;
  useEffect(() => { refreshIfStale(); }, [refreshIfStale]);
  return ctx;
}
