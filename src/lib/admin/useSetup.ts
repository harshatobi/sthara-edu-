'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Setup } from './setup';

/** The setup checklist (GET /api/admin/setup). `enabled` false skips the call (roles that don't set the school up). */
export function useSetup(enabled = true): { setup: Setup | null; error: string | null; loading: boolean } {
  const { getAuthToken } = useAuth();
  const [state, setState] = useState<{ setup: Setup | null; error: string | null; loading: boolean }>({ setup: null, error: null, loading: enabled });
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/admin/setup', { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json().catch(() => ({}));
        if (on) setState(res.ok ? { setup: d, error: null, loading: false } : { setup: null, error: d.error || 'Could not load the checklist.', loading: false });
      } catch { if (on) setState({ setup: null, error: 'Could not load the checklist.', loading: false }); }
    })();
    return () => { on = false; };
  }, [enabled, getAuthToken]);
  return state;
}
