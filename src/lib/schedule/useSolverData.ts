'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { sessionOf } from '@/lib/admin/format';
import { DEFAULT_SOLVER_SETTINGS, type LoadRuleRow, type RequirementRow, type SolverSettingsRow } from './solverInput';

export interface SolverData {
  session: string;
  requirements: RequirementRow[];
  rules: LoadRuleRow[];
  settings: SolverSettingsRow;
  /** False when the phase-4 tables aren't in this database yet. */
  available: boolean;
}

/** The requirements sheet, load rules and solver defaults for this school (read through RLS: builders, HR, leadership). */
export function useSolverData(session = sessionOf()) {
  const { profile, loading } = useAuth();
  const [data, setData] = useState<SolverData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const schoolId = profile?.schoolId;
  useEffect(() => {
    if (loading || !schoolId) return;
    let cancelled = false;
    const db = createClient();
    Promise.all([
      db.from('sched_requirements').select('id, session, class, subject, group_label, teacher_id, staff_member_id, periods_per_week, doubles, room_kind, room_id, max_per_day, combined_key, notes')
        .eq('school_id', schoolId).eq('session', session).order('class').limit(3000),
      db.from('teacher_load_rules').select('id, user_id, staff_member_id, target_per_week, max_per_day, max_per_week, max_consecutive, unavailable').eq('school_id', schoolId).limit(2000),
      db.from('sched_solver_settings').select('default_target_per_week, default_max_per_day, default_max_consecutive, class_teacher_first, subject_spread').eq('school_id', schoolId).maybeSingle(),
    ]).then(([r, l, s]) => {
      if (cancelled) return;
      const missing = [r.error, l.error].some(e => e && /does not exist|Could not find the table/i.test(e.message));
      if (!missing && (r.error || l.error || s.error)) { setError((r.error || l.error || s.error)!.message); return; }
      setData({
        session,
        requirements: (r.data || []) as RequirementRow[],
        rules: ((l.data || []) as LoadRuleRow[]).map(x => ({ ...x, unavailable: Array.isArray(x.unavailable) ? x.unavailable : [] })),
        settings: (s.data as SolverSettingsRow | null) ?? DEFAULT_SOLVER_SETTINGS,
        available: !missing,
      });
      setError(null);
    });
    return () => { cancelled = true; };
  }, [loading, schoolId, session, nonce]);
  return { data, error, reload: () => setNonce(n => n + 1) };
}
