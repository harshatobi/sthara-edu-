'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { classPredictions, type ClassPrediction, type LabRun } from '@/lib/teacher/misconceptions';
import { validateScene } from '@/lib/lab/registry';
import { presentHref } from '@/lib/lab/url';
import { labClassOptions } from './useClassRun';

const DAYS = 90;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Where your classes' Live Lab predictions went wrong (last 90 days): a wrong
 * option that took a share of the hands, or a wrong class answer. Counted
 * hands only, so this is about the class, never a student. Hidden when
 * nothing stands out.
 */
export default function PredictionMisses() {
  const { profile } = useAuth();
  const desk = useOptionalTeacherDesk();
  const options = useMemo(() => labClassOptions(desk?.desk?.scope ?? []), [desk?.desk?.scope]);
  const [runs, setRuns] = useState<LabRun[] | null>(null);
  const classes = useMemo(() => [...new Set(options.map(o => o.cls))], [options]);

  useEffect(() => {
    if (!profile?.schoolId || !classes.length) return;
    let cancelled = false;
    createClient().from('lab_runs').select('class, subject, updated_at, results, scene').eq('school_id', profile.schoolId)
      .in('class', classes).gte('updated_at', new Date(Date.now() - DAYS * 86_400_000).toISOString())
      .order('updated_at', { ascending: false }).limit(300)
      .then(({ data }) => { if (!cancelled) setRuns((data ?? []) as LabRun[]); });
    return () => { cancelled = true; };
  }, [profile?.schoolId, classes]);

  const groups = useMemo(() => (runs ? options.map(o => ({ o, misses: classPredictions(runs, o.cls, o.subject) })).filter(g => g.misses.length) : []), [runs, options]);
  if (!groups.length) return null;

  return (
    <section style={{ marginBottom: 26 }}>
      <h2 className="lab-section">Where predictions went wrong</h2>
      <p className="muted" style={{ margin: '-4px 0 12px', fontSize: 13 }}>From your lessons in the last {DAYS} days. Counted hands only, so this is about the class, not any one student. The Copilot uses it when you plan the next lesson.</p>
      <div className="lab-grid">
        {groups.flatMap(({ o, misses }) => misses.map((m, i) => <Miss key={`${o.key}:${i}`} cls={o.cls} subject={o.subject} m={m} />))}
      </div>
    </section>
  );
}

function Miss({ cls, subject, m }: { cls: string; subject: string; m: ClassPrediction }) {
  const scene = validateScene(m.scene);
  return (
    <div className="lab-card" style={{ cursor: 'default' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink)' }}>{m.question}</p>
      <p>{m.mode === 'hands' ? <><b className="lab-miss-no">{m.hands} of {m.counted} hands</b> chose</> : <b className="lab-miss-no">The class agreed on</b>} <b style={{ color: 'var(--ink)' }}>{m.chosen}</b></p>
      <p>Right answer: <b style={{ color: 'var(--ink)' }}>{m.correct}</b></p>
      <div className="lab-chips">
        <span className="lab-chip">{cls}</span>
        <span className="lab-chip">{m.topic}</span>
        <span className="lab-chip">{day(m.when)}</span>
      </div>
      {scene && (
        <div className="lab-transport">
          <Link className="btn sm pri" href={presentHref(scene, { class: cls, subject })}><Presentation size={13} weight="fill" /> Present again</Link>
        </div>
      )}
    </div>
  );
}
