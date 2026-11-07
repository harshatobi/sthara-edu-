'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Today } from './todayServer';

/** Today's live queues and registers for this office account (GET /api/admin/today). Null until loaded or on failure. */
export function useToday(nonce = 0): Today | null {
  const { getAuthToken } = useAuth();
  const [today, setToday] = useState<Today | null>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch('/api/admin/today', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && on) setToday(await res.json());
      } catch { /* the page still works on the desk's own counts */ }
    })();
    return () => { on = false; };
  }, [getAuthToken, nonce]);
  return today;
}
