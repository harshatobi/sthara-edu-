'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowsOutIcon as ArrowsOut } from '@phosphor-icons/react/dist/ssr/ArrowsOut';
import { XIcon as X } from '@phosphor-icons/react/dist/ssr/X';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/ssr/Play';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { MinusIcon as Minus } from '@phosphor-icons/react/dist/ssr/Minus';
import { ArrowRightIcon as ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { Empty } from '@/components/canon/ui';
import { ANSWER_MODES, engineById, scenePredictions, type AnswerMode, type LabScene } from '@/lib/lab/registry';
import { decodeScene, encodeScene } from '@/lib/lab/url';
import { LabControls, LabReadouts, LabView } from './LabStage';
import { useLabParams } from './useLabParams';

const LETTERS = 'ABCD';

type Step = { kind: 'intro' } | { kind: 'question'; i: number; revealed: boolean } | { kind: 'explore' };

export default function Presenter() {
  // Decoded once per link, so the questions and steps below stay cached across taps.
  const raw = useSearchParams().get('scene');
  const scene = useMemo(() => decodeScene(raw), [raw]);
  if (!scene) {
    return (
      <Empty icon={<Flask size={28} weight="duotone" />} title="This lab link doesn't open">
        It may have been cut short or edited. <Link href="/teacher/lab" style={{ textDecoration: 'underline' }}>Open the Live Lab</Link> and set it up again.
      </Empty>
    );
  }
  return <Show scene={scene} />;
}

function Show({ scene }: { scene: LabScene }) {
  const engine = engineById(scene.engine)!;
  const { params, setParam, blocked, replace } = useLabParams(engine, scene.params);
  // Questions are fixed to the setup as it was saved: their answers belong to those values.
  const questions = useMemo(() => scenePredictions(scene), [scene]);
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [votes, setVotes] = useState<Record<string, number[]>>({});
  // The teacher's choice for this lesson; switchable mid-lesson (no time to count: tap the class answer).
  const [mode, setMode] = useState<AnswerMode>(scene.answer);
  const [classPick, setClassPick] = useState<Record<string, number>>({});
  const [runKey, setRunKey] = useState(0);

  const q = step.kind === 'question' ? questions[step.i] : null;
  const asking = step.kind === 'question' && !step.revealed;
  const run = useCallback(() => setRunKey(k => k + 1), []);

  const order = useMemo<Step[]>(() => [
    { kind: 'intro' },
    ...questions.flatMap((_, i): Step[] => [{ kind: 'question', i, revealed: false }, { kind: 'question', i, revealed: true }]),
    { kind: 'explore' },
  ], [questions]);
  const at = order.findIndex(o => o.kind === step.kind && (o.kind !== 'question' || (step.kind === 'question' && o.i === step.i && o.revealed === step.revealed)));

  const go = useCallback((dir: 1 | -1) => {
    const next = order[Math.max(0, Math.min(order.length - 1, at + dir))];
    if (next === order[at]) return;
    if (next.kind === 'question') {
      replace(scene.params);
      // Revealing runs the simulation so the class sees the answer happen.
      setRunKey(k => (next.revealed && dir === 1 ? k + 1 : 0));
    }
    setStep(next);
  }, [order, at, replace, scene.params]);

  const vote = useCallback((opt: number, d: 1 | -1) => {
    if (!q || mode === 'think') return;
    if (mode === 'class') { setClassPick(c => ({ ...c, [q.id]: opt })); return; }
    setVotes(v => {
      const row = [...(v[q.id] ?? q.options.map(() => 0))];
      row[opt] = Math.max(0, row[opt] + d);
      return { ...v, [q.id]: row };
    });
  }, [q, mode]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => { /* the browser said no; the page is already full-window */ });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === ' ') { e.preventDefault(); if (!asking) run(); }
      else if (e.key === 'f' || e.key === 'F') fullscreen();
      else if (asking && /^[1-4]$/.test(e.key) && q && Number(e.key) <= q.options.length) vote(Number(e.key) - 1, 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, run, vote, asking, q]);

  const tally = q ? votes[q.id] ?? q.options.map(() => 0) : [];
  const total = tally.reduce((s, n) => s + n, 0);
  const picked = q ? classPick[q.id] : undefined;
  const back = `/teacher/lab/build?scene=${encodeScene(scene)}`;

  return (
    <div className="lab-show">
      <div className="lab-show-top">
        <h1>{scene.title}</h1>
        <span className="muted">{engine.chapters[0]}</span>
        <button className="btn sm" onClick={fullscreen} title="Full screen (F)"><ArrowsOut size={14} weight="bold" /> Full screen</button>
        <Link className="btn sm" href={back} title="Back to setup"><X size={14} weight="bold" /> Close</Link>
      </div>

      <div className="lab-show-main">
        <LabView engine={engine} params={params} setParam={setParam} conceal={asking} runKey={runKey} locked={step.kind === 'question'} />

        <div className="lab-ask">
          {step.kind === 'intro' && (
            <>
              <span className="lb-step">Live lab</span>
              <h2>{engine.title}</h2>
              {scene.narration ? <p className="lab-narr">{scene.narration}</p> : <p className="lab-narr">{engine.blurb}</p>}
              <button className="btn red" onClick={() => go(1)}>
                {questions.length ? <>Start: {questions.length} prediction{questions.length === 1 ? '' : 's'}</> : 'Start exploring'} <ArrowRight size={15} weight="bold" />
              </button>
            </>
          )}

          {q && step.kind === 'question' && (
            <>
              <span className="lb-step">Predict {step.i + 1} of {questions.length}{step.revealed ? ' · revealed' : ''}</span>
              <h2>{q.prompt}</h2>
              <div className="lab-opts">
                {q.options.map((o, k) => {
                  const right = step.revealed && k === q.correct, wrong = step.revealed && k !== q.correct;
                  return (
                    <div key={o} className={`lab-opt${right ? ' lb-right' : ''}${wrong ? ' lb-wrong' : ''}`}
                      onClick={() => asking && vote(k, 1)} role={asking && mode !== 'think' ? 'button' : undefined}>
                      {step.revealed && mode === 'hands' && <span className="lab-bar" style={{ width: total ? `${(tally[k] / total) * 100}%` : 0 }} />}
                      <span className="lb-k">{LETTERS[k]}</span>
                      <span className="lb-t">{o}</span>
                      {mode === 'hands' && <span className="lb-n">{tally[k] || ''}</span>}
                      {mode === 'class' && picked === k && <span className="lab-picked">Class answer</span>}
                      {asking && mode === 'hands' && (
                        <span className="lab-vote" onClick={e => e.stopPropagation()}>
                          <button aria-label={`One fewer for ${LETTERS[k]}`} onClick={() => vote(k, -1)}><Minus size={13} weight="bold" /></button>
                          <button aria-label={`One more for ${LETTERS[k]}`} onClick={() => vote(k, 1)}><Plus size={13} weight="bold" /></button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {asking && (
                <p className="lab-keys">
                  {mode === 'hands' && <>Count the hands: tap an answer or press <kbd>1</kbd>–<kbd>{q.options.length}</kbd>. </>}
                  {mode === 'class' && <>Tap the answer the class agrees on, or press <kbd>1</kbd>–<kbd>{q.options.length}</kbd>. </>}
                  {mode === 'think' && <>Give them a moment to decide. </>}
                  Then <kbd>→</kbd> to reveal.
                </p>
              )}
              {!asking && (
                <div className="lab-explain">
                  {mode === 'hands' && total > 0 && <b>{Math.round((tally[q.correct] / total) * 100)}% got it. </b>}
                  {mode === 'class' && picked !== undefined && <b>{picked === q.correct ? 'The class got it. ' : `The class said ${LETTERS[picked]}; it's ${LETTERS[q.correct]}. `}</b>}
                  {q.explain}
                </div>
              )}
              {asking && (
                <div className="seg" role="radiogroup" aria-label="How the class answers" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                  {ANSWER_MODES.map(m => (
                    <button key={m.value} role="radio" aria-checked={mode === m.value} className={mode === m.value ? 'on' : ''} onClick={() => setMode(m.value)}>{m.label}</button>
                  ))}
                </div>
              )}
            </>
          )}

          {step.kind === 'explore' && (
            <>
              <span className="lb-step">Explore</span>
              <h2>Now change it and see</h2>
              <LabControls engine={engine} params={params} setParam={setParam} locked={false} />
              {blocked && <p className="muted" style={{ color: 'var(--red)' }}>{blocked}</p>}
              <LabReadouts engine={engine} params={params} conceal={false} />
            </>
          )}

          <div className="lab-bottom" style={{ marginTop: 'auto' }}>
            <div className="lab-dots" aria-hidden>
              {questions.map((_, i) => <i key={i} className={step.kind === 'question' && step.i >= i || step.kind === 'explore' ? 'on' : ''} />)}
            </div>
            {!asking && <button className="btn sm" onClick={run} title="Run (Space)"><Play size={13} weight="fill" /> Run</button>}
            <button className="btn sm" onClick={() => go(-1)} disabled={step.kind === 'intro'} aria-label="Back"><ArrowLeft size={14} weight="bold" /></button>
            {step.kind !== 'explore' && (
              <button className="btn pri sm" onClick={() => go(1)}>
                {asking ? 'Reveal' : step.kind === 'intro' ? 'Start' : step.kind === 'question' && step.i === questions.length - 1 ? 'Explore' : 'Next'} <ArrowRight size={14} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="lab-keys"><kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>Space</kbd> run · <kbd>F</kbd> full screen</p>
    </div>
  );
}
