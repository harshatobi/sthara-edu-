'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { PencilSimpleIcon as PencilSimple } from '@phosphor-icons/react/dist/ssr/PencilSimple';
import { CopyIcon as Copy } from '@phosphor-icons/react/dist/ssr/Copy';
import { TrashIcon as Trash } from '@phosphor-icons/react/dist/ssr/Trash';
import { Skeleton } from '@/components/canon/ui';
import { engineById } from '@/lib/lab/registry';
import { encodeScene, presentHref } from '@/lib/lab/url';
import { useOptionalTeacherDesk } from '@/lib/teacher/useTeacherDesk';
import { useSavedScenes, type SavedScene } from './useSavedScenes';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** The school's saved demos: yours to present, edit or delete; colleagues' to present or copy. */
export default function SavedDemos() {
  const desk = useOptionalTeacherDesk();
  const { scenes, error, reload } = useSavedScenes();
  const [tab, setTab] = useState<'mine' | 'school'>('mine');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  if (!desk) return null;

  const mine = (scenes ?? []).filter(s => s.mine), school = (scenes ?? []).filter(s => !s.mine);
  const list = tab === 'mine' ? mine : school;

  const remove = async (s: SavedScene) => {
    setBusy(s.id); setFail(null);
    try { await desk.call('/api/teacher/lab', 'DELETE', { id: s.id }); setConfirm(null); reload(); }
    catch (e: any) { setFail(e?.message || 'Could not delete the demo.'); }
    finally { setBusy(null); }
  };

  return (
    <section style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 className="lab-section" style={{ margin: 0 }}>Saved demos</h2>
        <div className="seg" role="tablist" aria-label="Whose demos">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Mine ({mine.length})</button>
          <button role="tab" aria-selected={tab === 'school'} className={tab === 'school' ? 'on' : ''} onClick={() => setTab('school')}>From colleagues ({school.length})</button>
        </div>
      </div>
      {error && <p className="muted" style={{ color: 'var(--red)' }}>{error}</p>}
      {fail && <p className="muted" role="alert" style={{ color: 'var(--red)' }}>{fail}</p>}
      {!scenes && !error && <div className="lab-grid"><Skeleton h={120} /><Skeleton h={120} /><Skeleton h={120} /></div>}
      {scenes && !list.length && (
        <p className="muted">{tab === 'mine' ? 'Nothing saved yet. Set up a simulation below and save it for a class.' : 'No colleague has saved a demo yet.'}</p>
      )}
      {scenes && list.length > 0 && (
        <div className="lab-grid">
          {list.map(s => {
            const e = engineById(s.scene.engine);
            const enc = encodeScene(s.scene);
            const edit = `/teacher/lab/build?${new URLSearchParams({ scene: enc, id: s.id, class: s.class, subject: s.subject, ...(s.lessonPlanId ? { lesson: s.lessonPlanId } : {}) })}`;
            return (
              <div key={s.id} className="lab-card" style={{ cursor: 'default' }}>
                <h3>{s.title}</h3>
                <p>{e?.title} · {s.class}{s.mine ? '' : ` · ${s.author ?? 'A colleague'}`} · {day(s.updatedAt)}</p>
                {s.lessonTitle && <p>Lesson: {s.lessonTitle}</p>}
                <div className="lab-transport" style={{ marginTop: 'auto' }}>
                  <Link className="btn sm red" href={presentHref(s.scene, { class: s.class, subject: s.subject, demo: s.id })}><Presentation size={13} weight="fill" /> Present</Link>
                  {s.mine
                    ? <Link className="btn sm" href={edit}><PencilSimple size={13} weight="bold" /> Edit</Link>
                    : <Link className="btn sm" href={`/teacher/lab/build?scene=${enc}`}><Copy size={13} weight="bold" /> Make my copy</Link>}
                  {s.mine && (confirm === s.id
                    ? <><button className="btn sm red" disabled={busy === s.id} onClick={() => remove(s)}>{busy === s.id ? 'Deleting…' : 'Delete for good'}</button><button className="btn sm" onClick={() => setConfirm(null)}>Keep</button></>
                    : <button className="btn sm" aria-label={`Delete ${s.title}`} onClick={() => setConfirm(s.id)}><Trash size={13} weight="bold" /></button>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
