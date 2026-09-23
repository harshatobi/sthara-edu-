'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/** fetch() against /api/ops/* with the operator's bearer token; throws with the server's message. */
export function useOpsApi() {
  const { getAuthToken } = useAuth();
  return useCallback(async <T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const token = await getAuthToken();
    const res = await fetch(`/api/ops${path}`, {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404 && !data?.error) throw new Error('No live operator session. Sign in with an operator account.');
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data, status: res.status });
    return data as T;
  }, [getAuthToken]);
}
