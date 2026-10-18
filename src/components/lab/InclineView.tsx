'use client';

import { accel, stateAt, timeToBottom, type InclineParams } from '@/lib/lab/engines/incline';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The slope with the trolley and a mark every 0.2 s, beside its distance-time and velocity-time graphs. */
export default function InclineView({ params: p, conceal, runKey }: ViewProps<InclineParams>) {
  const T = timeToBottom(p);
  const k = useRun(runKey, conceal, Math.max(2500, T * 1000 * 1.6));
  const t = conceal ? 0 : T * k;
  const now = stateAt(p, t);
  // Drawn steeper than life so the slope is visible; the numbers are the real ones.
  const draw = Math.max(p.angle * 2, 8) * (Math.PI / 180);
  const x0 = 60, y0 = 120, L = 400;
  const at = (s: number) => ({ x: x0 + (L * s / p.len) * Math.cos(draw), y: y0 + (L * s / p.len) * Math.sin(draw) });
  const marks = Array.from({ length: Math.floor(T / 0.2) + 1 }, (_, i) => i * 0.2).filter(tt => tt <= t + 1e-9);
  const samples = Array.from({ length: 41 }, (_, i) => (T * i) / 40);
  const pos = at(now.s);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A trolley rolling down a ${p.angle} degree slope`}>
      <path d={`M${x0} ${y0} L${at(p.len).x} ${at(p.len).y} L${x0} ${at(p.len).y} Z`} fill="#E8EDF4" stroke="#9AA6B8" strokeWidth={2} />
      {marks.map(tt => { const q = at(stateAt(p, tt).s); return <circle key={tt} cx={q.x} cy={q.y} r={4} fill="#E11D48" />; })}
      <g transform={`translate(${pos.x} ${pos.y}) rotate(${(draw * 180) / Math.PI})`}>
        <rect x={-30} y={-30} width={46} height={20} rx={4} fill="#2F6BFF" />
        <circle cx={-20} cy={-6} r={6} fill="#002147" /><circle cx={6} cy={-6} r={6} fill="#002147" />
      </g>
      <text className="lb-sm" x={x0 + 30} y={at(p.len).y - 10}>{fmt(p.angle, 1)}° (drawn steeper)</text>
      <text className="lb-lbl" x={40} y={50}>t = {fmt(t, 2)} s · a dot every 0.2 s</text>
      {!conceal && <text className="lb-lbl" x={40} y={76}>s = {fmt(now.s, 3)} m · v = {fmt(now.v, 2)} m/s · a = {fmt(accel(p), 2)} m/s²</text>}
      <Graph x={540} y={60} w={180} h={150} xLabel="t (s)" yLabel="s (m)" xMax={niceMax(T)} yMax={niceMax(p.len)}
        points={[]} line={{ path: samples.filter(tt => tt <= t + 1e-9).map(tt => ({ x: tt, y: stateAt(p, tt).s })) }} />
      <Graph x={790} y={60} w={180} h={150} xLabel="t (s)" yLabel="v (m/s)" xMax={niceMax(T)} yMax={niceMax(accel(p) * T)}
        points={[]} line={{ path: samples.filter(tt => tt <= t + 1e-9).map(tt => ({ x: tt, y: stateAt(p, tt).v })) }} />
    </svg>
  );
}
