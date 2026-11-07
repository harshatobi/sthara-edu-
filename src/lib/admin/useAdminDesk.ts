'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { assembleAdminDesk, type AdminDesk } from './desk';
import { loadAdminCore, loadAdminRows } from './loadRows';

const STALE_MS = 30_000;

interface DeskState {
  desk: AdminDesk | null;
  error: string | null;
  reload: () => void;
  /** Ask for the whole-school data (once asked, it stays loaded and reloads with the rest). */
  ensureFull: () => void;
  /** Authenticated call to an admin API route; throws the route's error message. */
  call: <T = any>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body: unknown) => Promise<T>;
}

const Ctx = createContext<DeskState | null>(null);

/**
 * The /admin area's school data (mounted in the layout), in two levels (2026-11-06). Every page gets the core at
 * once: the school and the role grants, which is all the nav and most pages need. The whole school (students,
 * mastery, fees, admissions, workforce...) loads only when a page that shows it asks (DeskGate full, or
 * useAdminDesk('full')), and then stays for the visit. Before, every admin page fetched all of it.
 */
export function AdminDeskProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [desk, setDesk] = useState<AdminDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [wantFull, setWantFull] = useState(false);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const ensureFull = useCallback(() => setWantFull(true), []);

  useEffect(() => {
    if (authLoading || !profile || !user || !profile.schoolId) return;
    let cancelled = false;
    inFlight.current = true;
    const who = { schoolId: profile.schoolId!, uid: profile.uid, superadmin: profile.role === 'superadmin' };
    const db = createClient();
    const fail = (e: any) => { if (!cancelled) setError(prev => (loadedAt.current ? prev : e?.message || 'Could not load the school.')); };
    // The core first (or alongside), so the nav and permission checks never wait on the whole school; it never
    // replaces a whole-school desk already shown.
    if (!loadedAt.current || !wantFull) {
      loadAdminCore(db, who).then(rows => {
        if (cancelled) return;
        setDesk(prev => (prev?.full && wantFull ? prev : assembleAdminDesk(rows, Date.now(), false)));
        setError(null);
        if (!wantFull) { loadedAt.current = Date.now(); inFlight.current = false; }
      }).catch(fail);
    }
    if (wantFull) {
      loadAdminRows(db, who).then(rows => {
        if (cancelled) return;
        setDesk(assembleAdminDesk(rows, Date.now(), true));
        setError(null);
        loadedAt.current = Date.now();
      }).catch(fail).finally(() => { if (!cancelled) inFlight.current = false; });
    }
    return () => { cancelled = true; };
  }, [authLoading, profile, user, nonce, wantFull]);

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

  const value = useMemo(() => ({ desk, error, reload, ensureFull, call }), [desk, error, reload, ensureFull, call]);
  return createElement(Ctx.Provider, { value }, children);
}

/**
 * The admin desk. Pass 'full' from a page that reads the whole-school parts (students, academics, workforce,
 * fees, admissions, compliance, wellness...): it asks for them, and `desk` stays null until they are loaded.
 */
export function useAdminDesk(scope: 'core' | 'full' = 'core') {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminDesk must be used inside <AdminDeskProvider> (the admin layout).');
  const { ensureFull } = ctx;
  useEffect(() => { if (scope === 'full') ensureFull(); }, [scope, ensureFull]);
  return useMemo(() => (scope === 'full' && ctx.desk && !ctx.desk.full ? { ...ctx, desk: null } : ctx), [ctx, scope]);
}
