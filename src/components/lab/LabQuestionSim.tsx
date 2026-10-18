'use client';

import { useState } from 'react';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/ssr/Play';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import { engineById } from '@/lib/lab/registry';
import type { LabRef } from '@/lib/lab/question';
import { LabControls, LabReadouts, LabView } from './LabStage';
import { useLabParams } from './useLabParams';

/**
 * The simulation a homework question is asked on. Students may move the
 * controls and run it before answering (the teacher's choice for lab
 * homework); the question is always about the set-up it opened with, and one
 * tap puts that back. Loaded only on pages that have a lab question.
 */
export default function LabQuestionSim({ lab }: { lab: LabRef }) {
  const engine = engineById(lab.engine);
  if (!engine) return null;
  return <Sim key={JSON.stringify(lab)} lab={lab} engine={engine} />;
}

function Sim({ lab, engine }: { lab: LabRef; engine: NonNullable<ReturnType<typeof engineById>> }) {
  const { params, setParam, blocked, replace } = useLabParams(engine, lab.params);
  const [runKey, setRunKey] = useState(0);
  // Value by value: stored set-ups come back from the database with their keys in another order.
  const moved = engine.params.some(s => params[s.key] !== lab.params[s.key]);
  return (
    <div className="lab-hw">
      <LabView engine={engine} params={params} setParam={setParam} conceal={false} runKey={runKey} locked={false} />
      <div className="lab-panel">
        <div className="lab-transport">
          <button type="button" className="btn pri sm" onClick={() => setRunKey(k => k + 1)}><Play size={13} weight="fill" /> Run</button>
          <button type="button" className="btn sm" disabled={!moved} onClick={() => { replace(lab.params); setRunKey(0); }}>
            <ArrowCounterClockwise size={13} weight="bold" /> Back to the question&apos;s set-up
          </button>
        </div>
        {moved && <p className="muted lab-hw-note">You changed the set-up. The question is about the one it started with.</p>}
        <LabControls engine={engine} params={params} setParam={setParam} locked={false} />
        {blocked && <p className="muted" style={{ color: 'var(--red)' }}>{blocked}</p>}
        <LabReadouts engine={engine} params={params} conceal={false} />
      </div>
    </div>
  );
}
