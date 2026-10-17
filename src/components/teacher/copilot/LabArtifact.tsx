'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/ssr/Play';
import { CheckIcon as Check } from '@phosphor-icons/react/dist/ssr/Check';
import { Chip } from '@/components/canon/ui';
import { LabView } from '@/components/lab/LabStage';
import { ANSWER_MODES, engineById, scenePredictions } from '@/lib/lab/registry';
import { encodeScene } from '@/lib/lab/url';
import type { Artifact } from '@/lib/teacher/copilot';

const LETTERS = 'ABCD';

/**
 * A Live Lab demo the Copilot set up. The model only chose the engine, its
 * values and the wording; every answer shown here is the engine's.
 */
export default function LabArtifact({ a, sample, onRefine }: { a: Extract<Artifact, { kind: 'lab' }>; sample?: string | null; onRefine?: (text: string) => void }) {
  const [runKey, setRunKey] = useState(0);
  const engine = engineById(a.scene.engine);
  if (!engine) return null;
  const questions = scenePredictions(a.scene);
  const link = encodeScene(a.scene);
  const mode = ANSWER_MODES.find(m => m.value === a.scene.answer);
  return (
    <div className={`art${sample ? ' sample' : ''}`}>
      <div className="art-hd">
        <div style={{ minWidth: 0 }}>
          {sample && <Chip tone="a">EXAMPLE</Chip>}{' '}
          <Chip tone="p">LIVE LAB</Chip>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{a.title}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {engine.title} · {engine.chapters[0]} · {questions.length} prediction{questions.length === 1 ? '' : 's'}{mode ? ` · ${mode.label.toLowerCase()}` : ''}
          </div>
        </div>
      </div>
      <div className="art-bd">
        {a.scene.narration && <p style={{ marginBottom: 10 }}>{a.scene.narration}</p>}
        <LabView engine={engine} params={a.scene.params} setParam={() => {}} conceal={false} runKey={runKey} locked />
        {questions.map((q, i) => (
          <div className="art-q" key={q.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b>{i + 1}.</b><span style={{ flex: 1 }}>{q.prompt}</span></div>
            <div className="opts">{q.options.map((o, k) => <span key={o} className={k === q.correct ? 'ok' : ''}>{LETTERS[k]}. {o}{k === q.correct && <Check size={11} weight="bold" />}</span>)}</div>
            <div className="why">Worked out by the simulation: {q.explain}</div>
          </div>
        ))}
      </div>
      {sample ? <div className="art-ft muted" style={{ fontSize: 12 }}>{sample}</div> : (
        <div className="art-ft">
          <Link className="btn sm red" href={`/teacher/lab/present?scene=${link}`}><Presentation size={13} weight="fill" /> Present to class</Link>
          <Link className="btn sm" href={`/teacher/lab/build?scene=${link}`}><Flask size={13} weight="bold" /> Open in Live Lab</Link>
          <button className="btn sm" onClick={() => setRunKey(k => k + 1)}><Play size={13} weight="fill" /> Run</button>
          <span style={{ flex: 1 }} />
          {onRefine && ['Try different values', 'Ask easier questions', 'Use another experiment'].map(r => <button key={r} className="btn sm" onClick={() => onRefine(r)}>{r}</button>)}
        </div>
      )}
    </div>
  );
}
