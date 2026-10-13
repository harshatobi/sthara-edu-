'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Department, DocRow, Employee, ExitRow, Grade, HrSettings, Job, Post } from './engine';

export interface PeopleData {
  can: { manage: boolean; sensitive: boolean }; today: string; settings: HrSettings; people: Employee[];
  departments: Department[]; grades: Grade[]; posts: Post[]; exits: ExitRow[]; documents: DocRow[]; upcoming: Job[];
  gaps: Record<string, string[]>;
}
export type Call = <T = any>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown) => Promise<T>;

/**
 * The employee master for the signed-in office account. Everything comes through /api/admin/people (the HR
 * tables aren't readable from the browser), so this is a fetch, a reload and an authenticated call.
 */
export function usePeople() {
  const { user, loading: authLoading, getAuthToken } = useAuth();
  const [data, setData] = useState<PeopleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaded = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  /** JSON by default; a FormData body is sent as a multipart upload. */
  const call = useCallback<Call>(async (path, method, body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const form = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(path, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(form || method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
      body: method === 'GET' ? undefined : form ? (body as FormData) : JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    // A failed import still carries the row-by-row report.
    if (!res.ok && !(res.status === 422 && json?.rows)) throw new Error(json?.error || 'Something went wrong. Try again.');
    return json;
  }, [getAuthToken]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    call<PeopleData>('/api/admin/people', 'GET')
      .then(d => { if (!cancelled) { setData(d); setError(null); loaded.current = true; } })
      .catch(e => { if (!cancelled && !loaded.current) setError(e?.message || 'Could not load the employee master.'); });
    return () => { cancelled = true; };
  }, [authLoading, user, call, nonce]);

  return { data, error, reload, call };
}
