'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { all } from '@/lib/admin/loadRows';
import { validateScene, type LabScene } from '@/lib/lab/registry';

export interface SavedScene {
  id: string; class: string; subject: string; chapter: string | null; title: string; scene: LabScene;
  lessonPlanId: string | null; lessonTitle: string | null; author: string | null; mine: boolean; updatedAt: string;
}

/**
 * The school's saved Live Lab demos, read directly (row-level security: staff
 * of the same school). Rows whose set-up the engine no longer accepts are left
 * out rather than shown half-working.
 */
export function useSavedScenes() {
  const { profile } = useAuth();
  const [scenes, setScenes] = useState<SavedScene[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if (!profile?.schoolId) return;
    let cancelled = false;
    const db = createClient();
    all((a, b) => db.from('lab_scenes')
      .select('id, class, subject, chapter, title, scene, lesson_plan_id, teacher_id, updated_at, author:users!lab_scenes_teacher_id_fkey(name), lesson:lesson_plans!lab_scenes_lesson_plan_id_fkey(title)')
      .eq('school_id', profile.schoolId!).order('updated_at', { ascending: false }).order('id').range(a, b))
      .then(r => {
        if (cancelled) return;
        setError(null);
        setScenes((r.data ?? []).flatMap((x: any) => {
          const scene = validateScene(x.scene);
          return scene ? [{
            id: x.id, class: x.class, subject: x.subject, chapter: x.chapter, title: x.title, scene,
            lessonPlanId: x.lesson_plan_id, lessonTitle: x.lesson?.title ?? null, author: x.author?.name ?? null,
            mine: x.teacher_id === profile.uid, updatedAt: x.updated_at,
          }] : [];
        }));
      }, e => { if (!cancelled) setError((e as Error)?.message || 'Could not load saved demos.'); });
    return () => { cancelled = true; };
  }, [profile?.schoolId, profile?.uid, nonce]);

  return { scenes, error, reload };
}
