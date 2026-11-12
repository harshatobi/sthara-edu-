'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { engineById } from '@/lib/lab/registry';
import { LabControls, LabReadouts, LabView } from '@/components/lab/LabStage';
import { useLabParams } from '@/components/lab/useLabParams';
import '@/styles/canon.css';
import '@/styles/lab.css';

const PROTOTYPES = ['reactions', 'microscope'];

/** A 3D prototype as the builder and the presenter show it (?e=reactions or ?e=microscope), with a switch for "the class is predicting". */
export default function Preview() {
  const asked = useSearchParams().get('e');
  return <Bench key={asked} id={asked && PROTOTYPES.includes(asked) ? asked : 'reactions'} />;
}

function Bench({ id }: { id: string }) {
  const engine = engineById(id)!;
  const { params, setParam } = useLabParams(engine);
  const [runKey, setRunKey] = useState(0);
  const [conceal, setConceal] = useState(false);
  return (
    <div className="canon" data-role="teacher">
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 16px' }}>{engine.title} · 3D prototype</h1>
        <p style={{ margin: '-8px 0 16px', fontSize: 13 }}>{PROTOTYPES.map(e => <a key={e} href={`/lab-preview?e=${e}`} style={{ marginRight: 14, textDecoration: 'underline' }}>{engineById(e)!.title}</a>)}</p>
        <div className="lab-stage">
          <LabView engine={engine} params={params} setParam={setParam} conceal={conceal} runKey={runKey} locked={false} />
          <div className="lab-side">
            <div className="lab-panel">
              <div className="lab-transport">
                <button className="btn pri sm" disabled={conceal} onClick={() => setRunKey(k => k + 1)}>Run</button>
                <button className="btn sm" aria-pressed={conceal} onClick={() => { setConceal(c => !c); setRunKey(0); }}>{conceal ? 'Reveal' : 'Class is predicting'}</button>
              </div>
              <LabControls engine={engine} params={params} setParam={setParam} locked={false} />
            </div>
            <div className="lab-panel"><h4>Readings</h4><LabReadouts engine={engine} params={params} conceal={conceal} /></div>
          </div>
        </div>
      </main>
    </div>
  );
}
