'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Child, FamilyView } from './family';
import type { ProbeFinding } from './probe';

const STALE_MS = 45_000;

interface FamilyState {
  view: FamilyView | null;
  findings: ProbeFinding[];
  error: string | null;
  /** The child in focus across pages (remembered per parent). */
  child: Child | null;
  setChildId: (id: string) => void;
  reload: () => void;
  /** Authenticated call to a parent API route; throws the route's message. */
  call: <T = any>(path: string, method?: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown) => Promise<T>;
}

const Ctx = createContext<FamilyState | null>(null);

/** Loads the family once for the whole /parent area (mounted in the layout). */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { profile, user, loading: authLoading, getAuthToken } = useAuth();
  const [view, setView] = useState<FamilyView | null>(null);
  const [findings, setFindings] = useState<ProbeFinding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [childId, setChildIdState] = useState<string | null>(() => {
    try { return profile?.uid ? localStorage.getItem(`sthara.parent.child.${profile.uid}`) : null; } catch { return null; }
  });
  const loadedAt = useRef(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  const key = profile?.uid ? `sthara.parent.child.${profile.uid}` : null;

  const call = useCallback(async (path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Your session has expired. Sign in again.');
    const res = await fetch(path, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) as FamilyState['call'];

  useEffect(() => {
    if (authLoading || !user?.id || !profile?.uid) return;
    let cancelled = false;
    call<{ view: FamilyView; findings: ProbeFinding[] }>('/api/parent/desk')
      .then(d => { if (!cancelled) { setView(d.view); setFindings(d.findings); setError(null); loadedAt.current = Date.now(); } })
      .catch(e => { if (!cancelled && !loadedAt.current) setError(e?.message || 'Could not load your family’s records.'); });
    return () => { cancelled = true; };
  }, [authLoading, user?.id, profile?.uid, nonce, call]);

  useEffect(() => {
    const onFocus = () => { if (loadedAt.current && Date.now() - loadedAt.current > STALE_MS) reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const setChildId = useCallback((id: string) => {
    setChildIdState(id);
    if (key) try { localStorage.setItem(key, id); } catch { /* ignore */ }
  }, [key]);

  const child = useMemo(() => view?.children.find(c => c.id === childId) ?? view?.children[0] ?? null, [view, childId]);
  const value = useMemo(() => ({ view, findings, error, child, setChildId, reload, call }), [view, findings, error, child, setChildId, reload, call]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFamily must be used inside <FamilyProvider> (the parent layout).');
  return ctx;
}
