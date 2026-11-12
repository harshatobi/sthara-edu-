'use client';

import { useEffect, useRef } from 'react';
import { induced, type EmiParams } from '@/lib/lab/engines/emi';
import { createStage, progress, usePlay, type Stage } from './lab3d';
import { MAG_VIEWS, inductionScene } from './magnetScenes';
import type { ViewProps } from './types';

/**
 * Electromagnetic induction in 3D (prototype): the magnet goes into the coil at
 * the chosen speed, the galvanometer swings while it moves, and the coil's near
 * face is named as the pole Lenz's law gives it. The size of the swing and the
 * pole are the engine's.
 */

const TAGS = 6;

export default function Emi3D({ params: p, conceal, runKey, onFail }: ViewProps<EmiParams> & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const tags = useRef<(HTMLSpanElement | null)[]>([]);
  const stage = useRef<Stage | null>(null);
  const live = useRef({ p, conceal });
  useEffect(() => { live.current = { p, conceal }; });
  // A faster magnet makes the same trip in less time.
  const play = usePlay(runKey, conceal, Math.max(450, Math.min(4000, 1250 / p.v)));
  // More turns are drawn as a tighter coil, up to what stays readable.
  const turns = Math.max(5, Math.min(22, Math.round(p.N / 45)));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const s = createStage(el, MAG_VIEWS.induction);
    if (!s) { onFail(); return; }
    stage.current = s;
    const scene = inductionScene(s, turns, () => {
      const L = live.current, r = induced(L.p);
      return {
        pole: L.p.pole === 'S' ? 'S' : 'N', move: L.p.motion === 'out' ? 'out' : L.p.motion === 'still' ? 'still' : 'in', k: progress(play),
        swing: r.swing * Math.min(1, r.emf / 0.5 + 0.3), face: r.face === 'N' || r.face === 'S' ? r.face : 'none', conceal: L.conceal,
      };
    });
    s.onFrame((t, dt) => {
      scene.update(t, dt);
      for (let i = 0; i < TAGS; i++) { const g = scene.tags[i]; s.tag(tags.current[i], g?.at ?? s.camera.position, g?.text ?? null); }
    });
    return () => { stage.current = null; s.dispose(); };
  }, [turns, onFail, play]);

  return (
    <div className="lab-3d" role="img" aria-label="A magnet, a coil and a galvanometer in 3D">
      <div className="lab-3d-stage" ref={host} />
      {Array.from({ length: TAGS }, (_, i) => <span key={i} className="lab-3d-label lab-3d-tag" ref={n => { tags.current[i] = n; }} style={{ opacity: 0 }} />)}
      <div className="lab-3d-looks">
        {MAG_VIEWS.induction.looks.map(l => <button key={l.label} type="button" onClick={() => stage.current?.view(l.from)}>{l.label}</button>)}
      </div>
      <div className="lab-3d-foot">
        <p className="lab-3d-note">{conceal ? 'Drag to turn it. Nothing moves until you reveal.' : `${p.N} turns. Drag to turn it; press Run to move the magnet.`}</p>
      </div>
    </div>
  );
}
