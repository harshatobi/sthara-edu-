'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { loadScheduleRows } from './load';
import type { ScheduleRows } from './types';

/** The school's scheduling rows for the signed-in teacher or office account, with reload and an authenticated API call. */
export function useSchedule(opts: { students?: boolean } = {}) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [rows, setRows] = useState<ScheduleRows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const students = !!opts.students;

  useEffect(() => {
    if (authLoading || !profile?.schoolId || !user) return;
    let cancelled = false;
    loadScheduleRows(createClient(), profile.schoolId, { students })
      .then(r => { if (!cancelled) { setRows(r); setError(null); loaded.current = true; } })
      .catch(e => { if (!cancelled && !loaded.current) setError(e?.message || 'Could not load the schedule.'); });
    return () => { cancelled = true; };
  }, [authLoading, profile?.schoolId, user, students, nonce]);

  const call = useCallback(async <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown): Promise<T> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data;
  }, [getAuthToken]);

  return { rows, error, reload, call, me: profile?.uid ?? null };
}
