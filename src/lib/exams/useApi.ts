'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type Call = <T = any>(path: string, method?: 'GET' | 'POST', body?: unknown) => Promise<T>;

/** An authenticated call to an app API route; throws the route's message. */
export function useCall(): Call {
  const { getAuthToken } = useAuth();
  return useCallback<Call>(async (path, method = 'GET', body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || 'Something went wrong. Try again.');
    return json;
  }, [getAuthToken]) as Call;
}

/** GETs `path` once signed in (and again on reload or when the path changes); null path waits. */
export function useApi<T>(path: string | null) {
  const { user, loading: authLoading } = useAuth();
  const call = useCall();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const shownFor = useRef<string | null>(null);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    if (authLoading || !user || !path) return;
    let cancelled = false;
    // A different path shows its own loading state; a reload of the same path keeps the old data on screen.
    if (shownFor.current !== path) { setData(null); setError(null); }
    call<T>(path)
      .then(d => { if (!cancelled) { setData(d); setError(null); shownFor.current = path; } })
      .catch(e => { if (!cancelled) setError(e?.message || 'Could not load.'); });
    return () => { cancelled = true; };
  }, [authLoading, user, path, call, nonce]);
  return { data, error, reload, call, setData };
}
