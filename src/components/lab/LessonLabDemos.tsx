'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { enginesForChapter, validateScene, type LabScene } from '@/lib/lab/registry';
import { encodeScene } from '@/lib/lab/url';

/**
 * Inside the lesson planner: the Live Lab demos attached to this lesson, ready
 * to present, and a way to set one up for its chapter. Attaching happens when
 * the demo is saved in the Live Lab.
 */
export default function LessonLabDemos({ lessonId, chapter }: { lessonId: string; chapter: string | null }) {
  const { profile } = useAuth();
  const [demos, setDemos] = useState<{ id: string; title: string; scene: LabScene }[] | null>(null);

  useEffect(() => {
    if (!profile?.schoolId) return;
    let cancelled = false;
    createClient().from('lab_scenes').select('id, title, scene').eq('school_id', profile.schoolId).eq('lesson_plan_id', lessonId)
      .order('updated_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        if (cancelled) return;
        setDemos((data ?? []).flatMap(d => { const scene = validateScene(d.scene); return scene ? [{ id: d.id, title: d.title, scene }] : []; }));
      });
    return () => { cancelled = true; };
  }, [profile?.schoolId, lessonId]);

  const fit = chapter ? enginesForChapter(chapter) : [];
  if (!demos?.length && !fit.length) return null;
  return (
    <div className="cmp-fld">
      <label>LIVE LAB DEMOS</label>
      {demos?.map(d => (
        <div key={d.id} className="li-row" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{d.title}</span>
          <Link className="btn sm red" href={`/teacher/lab/present?scene=${encodeScene(d.scene)}`}><Presentation size={12} weight="fill" /> Present</Link>
        </div>
      ))}
      {fit.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {fit.map(e => <Link key={e.id} className="btn sm" href={`/teacher/lab/build?e=${e.id}`}><Flask size={12} weight="bold" /> Set up {e.title.toLowerCase()}</Link>)}
        </div>
      )}
      {fit.length > 0 && <span className="muted" style={{ fontSize: 12 }}>Save the demo for this class and attach it to this lesson; it will show here.</span>}
    </div>
  );
}
