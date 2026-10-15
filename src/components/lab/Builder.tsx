'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { CheckSquareIcon as CheckSquare } from '@phosphor-icons/react/dist/ssr/CheckSquare';
import { SquareIcon as Square } from '@phosphor-icons/react/dist/ssr/Square';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { Empty, PageBar } from '@/components/canon/ui';
import { ANSWER_MODES, engineById, scenePredictions, type AnswerMode, type LabScene } from '@/lib/lab/registry';
import { decodeScene, encodeScene } from '@/lib/lab/url';
import type { LabEngine } from '@/lib/lab/types';
import LabStage from './LabStage';
import LabPrint from './LabPrint';
import { useLabParams } from './useLabParams';

const LETTERS = 'ABCD';

export default function Builder() {
  const sp = useSearchParams();
  const fromLink = decodeScene(sp.get('scene'));
  const engine = engineById(fromLink?.engine ?? sp.get('e'));
  if (!engine) {
    return (
      <Empty icon={<Flask size={28} weight="duotone" />} title="That simulation isn't in the lab">
        <Link href="/teacher/lab" style={{ textDecoration: 'underline' }}>Pick one from the Live Lab</Link>.
      </Empty>
    );
  }
  return <Build key={engine.id} engine={engine} initial={fromLink} />;
}

function Build({ engine, initial }: { engine: LabEngine<any>; initial: LabScene | null }) {
  const { params, setParam, blocked, reset } = useLabParams(engine, initial?.params);
  const [title, setTitle] = useState(initial?.title ?? engine.title);
  const [narration, setNarration] = useState(initial?.narration ?? '');
  // Re-worded prompts from the Copilot are kept per question id.
  // They can name the values ("object at 15 cm"), so they are dropped once the setup changes.
  const [saved] = useState<Record<string, string | undefined>>(() => Object.fromEntries((initial?.predictions ?? []).map(p => [p.id, p.prompt])));
  const untouched = !!initial && JSON.stringify(params) === JSON.stringify(initial.params);
  const prompts = untouched ? saved : {};
  const [picked, setPicked] = useState<string[] | null>(initial?.predictions.length ? initial.predictions.map(p => p.id) : null);
  const [answer, setAnswer] = useState<AnswerMode>(initial?.answer ?? 'hands');
  const [runKey, setRunKey] = useState(0);
  const [withKey, setWithKey] = useState(true);

  // Every question that fits these values, with its engine-worked answer.
  const all = useMemo(() => scenePredictions({ engine: engine.id, params, title, predictions: [], answer: 'hands' }), [engine.id, params, title]);
  const chosen = (picked ?? all.slice(0, 3).map(q => q.id)).filter(id => all.some(q => q.id === id));
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]);

  const scene: LabScene = {
    engine: engine.id, params, title: title.trim() || engine.title,
    predictions: all.filter(q => chosen.includes(q.id)).map(q => ({ id: q.id, prompt: prompts[q.id] })),
    narration: narration.trim() || undefined,
    answer,
  };

  return (
    <>
      <PageBar eyebrow={`LIVE LAB · ${engine.chapters.join(' · ').toUpperCase()}`} title={engine.title} sub={engine.blurb}
        actions={<>
          <Link className="btn" href="/teacher/lab"><ArrowLeft size={15} weight="bold" /> All simulations</Link>
          <button className="btn" onClick={() => window.print()} disabled={!scene.predictions.length} title={scene.predictions.length ? 'A4 worksheet for the class' : 'Pick at least one prediction to print'}>
            <Printer size={15} weight="bold" /> Print worksheet
          </button>
          <Link className="btn red" href={`/teacher/lab/present?scene=${encodeScene(scene)}`}><Presentation size={16} weight="fill" /> Present to class</Link>
        </>} />

      <LabStage engine={engine} params={params} setParam={setParam} runKey={runKey} onRun={() => setRunKey(k => k + 1)} onReset={reset} />
      {blocked && <p className="muted" style={{ color: 'var(--red)', marginTop: 10 }}>{blocked}</p>}

      <div className="lab-stage" style={{ marginTop: 18 }}>
        <div className="lab-panel">
          <h4>Predictions to put to the class ({chosen.length})</h4>
          <p className="muted">Only you see the answers here. In class each one is asked, hands are counted, then the simulation reveals it.</p>
          <div className="lab-qs">
            {all.map(q => {
              const on = chosen.includes(q.id);
              return (
                <button key={q.id} className={`lab-q${on ? ' on' : ''}`} onClick={() => toggle(q.id)} aria-pressed={on}>
                  {on ? <CheckSquare size={18} weight="fill" color="var(--blue)" /> : <Square size={18} />}
                  <span>
                    <b>{prompts[q.id] || q.prompt}</b>
                    <small>{q.options.map((o, k) => `${LETTERS[k]}. ${o}`).join('   ')}</small>
                    <small>Answer: <b>{LETTERS[q.correct]}. {q.options[q.correct]}</b></small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="lab-panel">
          <h4>How the class answers</h4>
          <div className="seg" role="radiogroup" aria-label="How the class answers" style={{ flexWrap: 'wrap' }}>
            {ANSWER_MODES.map(m => (
              <button key={m.value} role="radio" aria-checked={answer === m.value} className={answer === m.value ? 'on' : ''} onClick={() => setAnswer(m.value)}>{m.label}</button>
            ))}
          </div>
          <p className="muted">{ANSWER_MODES.find(m => m.value === answer)!.note} No student devices needed; you can change it during the lesson too.</p>
          <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={withKey} onChange={e => setWithKey(e.target.checked)} /> Print the answer key on a separate page
          </label>
          <h4>Title on screen</h4>
          <input className="lab-title-in" value={title} maxLength={140} onChange={e => setTitle(e.target.value)} />
          <h4>What you&apos;ll say first (optional)</h4>
          <textarea className="lab-title-in" style={{ fontWeight: 500, minHeight: 110, resize: 'vertical' }} maxLength={2000} value={narration}
            placeholder="One or two lines to open with, shown on the first screen." onChange={e => setNarration(e.target.value)} />
        </div>
      </div>
      <LabPrint scene={scene} engine={engine} questions={scenePredictions(scene)} withKey={withKey} />
    </>
  );
}
