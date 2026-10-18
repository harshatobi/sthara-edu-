'use client';

import { useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { enginesFor, fittingPredictions, scenePredictions } from '@/lib/lab/registry';
import { buildLabQuestion } from '@/lib/lab/question';
import type { LabEngine, Params } from '@/lib/lab/types';
import type { Question } from '@/lib/teacher/questions';
import { normClass } from '@/lib/teacher/scope';
import { LabControls, LabView } from './LabStage';
import { useLabParams } from './useLabParams';
import { useSavedScenes } from './useSavedScenes';

/** Engine-built MCQs for a set-up; the server rebuilds them again on save. */
function toQuestions(engine: string, params: Params, ids: string[], prompts: Record<string, string | undefined> = {}): Question[] {
  return ids.flatMap(id => {
    const b = buildLabQuestion({ engine, params, prediction: id });
    return b ? [{ type: 'mcq' as const, questionText: prompts[id] || b.prompt, options: b.options, answer: b.answer, marks: 1, why: b.why, lab: b.lab }] : [];
  });
}

/**
 * Adds Live Lab questions to homework or a quiz: from one of the class's saved
 * demos, or set up here. Options and answers are the engine's; students can
 * try the simulation themselves before answering.
 */
export default function LabQuestionPicker({ cls, chapter, onAdd, onClose }: {
  cls: string; chapter: string; onAdd: (qs: Question[]) => void; onClose: () => void;
}) {
  const engines = useMemo(() => enginesFor(cls, chapter || null), [cls, chapter]);
  const { scenes } = useSavedScenes();
  const saved = (scenes ?? []).filter(s => normClass(s.class) === normClass(cls) && s.scene.predictions.length);
  const [tab, setTab] = useState<'new' | 'saved'>('new');
  const [engineId, setEngineId] = useState(engines[0]?.id ?? '');
  const engine = engines.find(e => e.id === engineId) ?? engines[0];

  return (
    <div className="lab-pick">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>Live lab question</b>
        <div className="seg" role="tablist" aria-label="Where the set-up comes from">
          <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>Set one up</button>
          <button role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>Saved demos ({saved.length})</button>
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn sm" onClick={onClose}>Close</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Students can move the controls and run it before answering, so questions that ask them to reason (why, what if) work best.
        The options and the right answer always come from the simulation.
      </p>

      {tab === 'new' && (engine ? (
        <>
          <div className="lab-ctl" style={{ maxWidth: 360 }}>
            <label htmlFor="lab-pick-engine">Simulation</label>
            <select id="lab-pick-engine" value={engine.id} onChange={e => setEngineId(e.target.value)}>
              {engines.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <Setup key={engine.id} engine={engine} onAdd={onAdd} />
        </>
      ) : <p className="muted">No simulation fits {cls} yet.</p>)}

      {tab === 'saved' && (
        !scenes ? <p className="muted">Loading saved demos…</p>
          : !saved.length ? <p className="muted">No saved demo for {cls} has questions yet. Set one up instead.</p>
            : saved.map(s => {
              const qs = scenePredictions(s.scene);
              return (
                <div key={s.id} className="li-row" style={{ alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{s.title} <span className="muted">· {qs.length} question{qs.length === 1 ? '' : 's'}</span></span>
                  <button className="btn sm" onClick={() => onAdd(toQuestions(s.scene.engine, s.scene.params, qs.map(q => q.id), Object.fromEntries(s.scene.predictions.map(p => [p.id, p.prompt]))))}>
                    <Plus size={13} weight="bold" /> Add {qs.length === 1 ? 'it' : `all ${qs.length}`}
                  </button>
                </div>
              );
            })
      )}
    </div>
  );
}

function Setup({ engine, onAdd }: { engine: LabEngine<any>; onAdd: (qs: Question[]) => void }) {
  const { params, setParam, blocked } = useLabParams(engine);
  const all = useMemo(() => fittingPredictions(engine.id, params), [engine.id, params]);
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = picked.filter(id => all.some(q => q.id === id));
  return (
    <>
      <div className="lab-hw" style={{ margin: 0 }}>
        <LabView engine={engine} params={params} setParam={setParam} conceal={false} runKey={0} locked={false} />
        <div className="lab-panel"><LabControls engine={engine} params={params} setParam={setParam} locked={false} /></div>
      </div>
      {blocked && <p className="muted" style={{ color: 'var(--red)' }}>{blocked}</p>}
      <div className="lab-pick-qs">
        {all.map(q => (
          <label key={q.id}>
            <input type="checkbox" checked={chosen.includes(q.id)} onChange={() => setPicked(chosen.includes(q.id) ? chosen.filter(x => x !== q.id) : [...chosen, q.id])} />
            <span>{q.prompt}</span>
          </label>
        ))}
      </div>
      <div>
        <button className="btn pri sm" disabled={!chosen.length} onClick={() => { onAdd(toQuestions(engine.id, params, chosen)); setPicked([]); }}>
          <Plus size={13} weight="bold" /> Add {chosen.length || ''} question{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  );
}
