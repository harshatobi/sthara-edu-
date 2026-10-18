'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { all } from '@/lib/admin/loadRows';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { normClass } from '@/lib/teacher/scope';
import { practicalsForClass } from '@/lib/lab/practicals';
import { labClassOptions, type ClassOption } from '../useClassRun';

/** The teacher's Class 9 and 10 science classes; the chosen one lives in ?class= so links and reloads keep it. */
export function usePracticalClass() {
  const desk = useOptionalTeacherDesk();
  const sp = useSearchParams(), router = useRouter(), path = usePathname();
  const options = useMemo<ClassOption[]>(() => labClassOptions(desk?.desk?.scope ?? []).filter(o => practicalsForClass(o.cls).length > 0), [desk?.desk?.scope]);
  const asked = sp.get('class');
  const target = options.find(o => o.key === asked) ?? options.find(o => o.cls === asked) ?? options[0] ?? null;
  const choose = useCallback((key: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set('class', key);
    router.replace(`${path}?${q}`);
  }, [sp, router, path]);
  const students = useMemo(() => {
    const c = desk?.desk?.classes.find(x => target && normClass(x.cls) === normClass(target.cls));
    return (c?.students ?? []).map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo })).sort((a, b) => a.rollNo.localeCompare(b.rollNo, 'en', { numeric: true }) || a.name.localeCompare(b.name));
  }, [desk?.desk?.classes, target]);
  return { desk, options, target, choose, students, loading: !desk?.desk };
}

export interface ProgressRow { student_id: string; practical: string; done_on: string | null; record: 'none' | 'submitted' | 'checked'; viva: number | null }

/** The class's practical progress, read directly (row-level security: staff of the same school). */
export function useProgress(cls: string | null, subject: string | null) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  useEffect(() => {
    if (!profile?.schoolId || !cls || !subject) return;
    let cancelled = false;
    const db = createClient();
    all((a, b) => db.from('practical_progress').select('student_id, practical, done_on, record, viva').eq('school_id', profile.schoolId!)
      .eq('class', cls).eq('subject', subject).order('student_id').order('practical').range(a, b))
      .then(r => { if (!cancelled) { setRows((r.data ?? []) as ProgressRow[]); setError(null); } }, e => { if (!cancelled) setError((e as Error)?.message || 'Could not load progress.'); });
    return () => { cancelled = true; };
  }, [profile?.schoolId, cls, subject, nonce]);
  const byKey = useMemo(() => new Map((rows ?? []).map(r => [`${r.student_id}|${r.practical}`, r])), [rows]);
  return { rows, byKey, error, reload, setRows };
}
