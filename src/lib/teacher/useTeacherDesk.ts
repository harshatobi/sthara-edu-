'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { assembleDesk, type TeacherDesk } from './desk';
import { loadTeacherRows } from './loadRows';
import { teachingScope } from './scope';

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
    loadTeacherRows(createClient(), { schoolId: profile.schoolId!, uid: profile.uid }, scope)
      .then(rows => { if (!cancelled) { setDesk(assembleDesk(rows, me, scope, 'live')); setError(null); loadedAt.current = Date.now(); } })
      .catch(e => { if (!cancelled) setError(prev => (loadedAt.current ? prev : e?.message || 'Could not load your desk.')); })
      .finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
    // Keyed on identity, not object references: a silent profile refresh must not reload the desk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.uid, profile?.schoolId, user?.id, scope, nonce]);

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
