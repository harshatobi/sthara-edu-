'use client';

import { useEffect, useRef } from 'react';
import { deflection, type MagParams } from '@/lib/lab/engines/magnetism';
import { COLOUR, createStage, progress, usePlay, type Stage } from './lab3d';
import { MAG_VIEWS, inductionScene, motorScene, solenoidScene, wireScene, type Scene3D } from './magnetScenes';
import type { ViewProps } from './types';

/**
 * Magnetism, motors and induction in 3D (prototype). These are the lessons a
 * flat page handles worst: the field round a wire, the poles of a solenoid and
 * Fleming's left-hand rule are all about three directions at right angles. The
 * class can turn each one and look along the wire or the coil. Directions and
 * sizes are the engine's; while the class predicts, the answer (arrowheads,
 * needles, poles, the push on the rod) is left off.
 */

const KEY: Record<MagParams['scenario'], { colour: string; name: string }[]> = {
  wire: [{ colour: COLOUR.current, name: 'Current' }, { colour: COLOUR.field, name: 'Magnetic field' }],
  solenoid: [{ colour: COLOUR.current, name: 'Current' }, { colour: COLOUR.field, name: 'Magnetic field' }],
  motor: [{ colour: COLOUR.current, name: 'Current' }, { colour: COLOUR.field, name: 'Magnetic field' }, { colour: COLOUR.force, name: 'Force' }],
  induction: [],
};
const TAGS = 6;

export default function Magnetism3D({ params: p, conceal, runKey, onFail }: ViewProps<MagParams> & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const live = useRef({ p, conceal });
  useEffect(() => { live.current = { p, conceal }; });
  const play = usePlay(runKey, conceal, p.scenario === 'induction' ? (p.speed === 'fast' ? 900 : 2200) : 1600);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el, MAG_VIEWS[p.scenario]);
    if (!s) { onFail(); return; }
    stage.current = s;
    const now = () => ({ ...live.current, k: progress(play) });
    const scene: Scene3D = p.scenario === 'wire' ? wireScene(s, now) : p.scenario === 'solenoid' ? solenoidScene(s, now) : p.scenario === 'motor' ? motorScene(s, now)
      : inductionScene(s, 10, () => { const L = now(); return { pole: L.p.pole, move: L.p.move, k: L.k, swing: deflection(L.p) / 2, conceal: L.conceal }; });
    s.onFrame((t, dt) => {
      scene.update(t, dt);
      for (let i = 0; i < TAGS; i++) { const g = scene.tags[i]; s.tag(tags.current[i], g?.at ?? s.camera.position, g?.text ?? null); }
    });
    return () => { stage.current = null; s.dispose(); };
  }, [p.scenario, onFail, play]);

  const view = MAG_VIEWS[p.scenario];
  return (
    <div className="lab-3d" role="img" aria-label="The experiment in 3D">
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">
        {view.looks.map(l => <button key={l.label} type="button" onClick={() => stage.current?.view(l.from)}>{l.label}</button>)}
      </div>
      <div className="lab-3d-foot">
        <div className="lab-3d-key">{KEY[p.scenario].map(k => <span key={k.name}><i style={{ background: k.colour }} />{k.name}</span>)}</div>
        <p className="lab-3d-note">{conceal ? 'Drag to turn it. The answer is left off until you reveal.' : p.scenario === 'motor' || p.scenario === 'induction' ? 'Drag to turn it. Press Run to see it happen.' : 'Drag to turn it.'}</p>
      </div>
    </div>
  );
}
