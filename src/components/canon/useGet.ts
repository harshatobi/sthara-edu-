'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** GET an API route with the session token; `reload` fetches again. Errors come back as text. */
export function useGet<T>(path: string | null) {
  const { getAuthToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    if (!path) return;
    let live = true;
    (async () => {
      const token = await getAuthToken();
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Something went wrong. Try again.');
      return body as T;
    })()
      .then(d => { if (live) { setData(d); setError(null); } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Something went wrong.'); });
    return () => { live = false; };
  }, [path, nonce, getAuthToken]);
  return { data, error, reload };
}
