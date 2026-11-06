'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface TutorAssignmentLite {
  id: string; subject: string; topic: string; mode: 'standard' | 'hots'; source: 'critical_gap' | 'teacher';
  dueOn: string | null; score: number | null; by: string | null;
}

/** The student's open tutor assignments (Critical Gap and teacher-set), for the dashboard. Empty on the demo desk. */
export function useTutorAssignments(skip: boolean): TutorAssignmentLite[] {
  const { getAuthToken } = useAuth();
  const tokenRef = useRef(getAuthToken);
  useEffect(() => { tokenRef.current = getAuthToken; });
  const [items, setItems] = useState<TutorAssignmentLite[]>([]);
  useEffect(() => {
    if (skip) return;
    let on = true;
    (async () => {
      try {
        const res = await fetch('/api/tutor/sessions', { headers: { Authorization: `Bearer ${await tokenRef.current()}` } });
        const d = await res.json().catch(() => ({}));
        if (on && res.ok) setItems(d.assignments ?? []);
      } catch { /* the dashboard works without it */ }
    })();
    return () => { on = false; };
  }, [skip]);
  return skip ? [] : items;
}
