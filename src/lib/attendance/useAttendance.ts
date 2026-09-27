'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { loadAttendance, type AttendanceData } from './load';

/** Staff attendance between two dates for the signed-in account (RLS: everyone for HR, otherwise their own). */
export function useAttendance(from: string, to: string) {
  const { profile, user, loading, getAuthToken } = useAuth();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    if (loading || !profile?.schoolId || !user) return;
    let cancelled = false;
    loadAttendance(createClient(), profile.schoolId, from, to)
      .then(d => { if (!cancelled) { setData(d); setError(null); loaded.current = true; } })
      .catch(e => { if (!cancelled && !loaded.current) setError(e?.message || 'Could not load attendance.'); });
    return () => { cancelled = true; };
  }, [loading, profile?.schoolId, user, from, to, nonce]);
  const call = useCallback(async <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown): Promise<T> => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || 'Something went wrong. Try again.');
    return out;
  }, [getAuthToken]);
  return { data, error, reload, call, me: profile?.uid ?? null };
}
