'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { assembleAdminDesk, type AdminDesk } from './desk';
import { loadAdminRows } from './loadRows';

const STALE_MS = 30_000;

interface DeskState {
  desk: AdminDesk | null;
  error: string | null;
  reload: () => void;
  /** Authenticated call to an admin API route; throws the route's error message. */
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}

const Ctx = createContext<DeskState | null>(null);

/** Loads the whole school once for the /admin area (mounted in the layout). */
export function AdminDeskProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [desk, setDesk] = useState<AdminDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (authLoading || !profile || !user || !profile.schoolId) return;
    let cancelled = false;
    inFlight.current = true;
    loadAdminRows(createClient(), { schoolId: profile.schoolId!, uid: profile.uid, superadmin: profile.role === 'superadmin' })
      .then(rows => { if (!cancelled) { setDesk(assembleAdminDesk(rows)); setError(null); loadedAt.current = Date.now(); } })
      .catch(e => { if (!cancelled) setError(prev => (loadedAt.current ? prev : e?.message || 'Could not load the school.')); })
      .finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [authLoading, profile, user, nonce]);

  useEffect(() => {
    const onFocus = () => { if (!inFlight.current && loadedAt.current && Date.now() - loadedAt.current > STALE_MS) reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

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

  const value = useMemo(() => ({ desk, error, reload, call }), [desk, error, reload, call]);
  return createElement(Ctx.Provider, { value }, children);
}

export function useAdminDesk() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminDesk must be used inside <AdminDeskProvider> (the admin layout).');
  return ctx;
}
