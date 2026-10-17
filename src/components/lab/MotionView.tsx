'use client';

import { samples, stateAt, type MotionParams } from '@/lib/lab/engines/motion';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** A car on a road above its distance–time and velocity–time graphs, drawn as time runs. */
export default function MotionView({ params: p, conceal, runKey }: ViewProps<MotionParams>) {
  const k = useRun(runKey, conceal, 5000);
  const t = p.t * k;
  const now = stateAt(p, t);
  const pts = samples(p);
  const sMax = Math.max(1, ...pts.map(x => x.s)), vMax = Math.max(1, ...pts.map(x => Math.abs(x.v)));

  // Road: 60 → 940 px spans the whole distance of the run.
  const roadX = (s: number) => 60 + (880 * s) / sMax;
  const graph = (x0: number, val: (q: typeof pts[0]) => number, max: number, label: string, unit: string) => {
    const gx = (tt: number) => x0 + (400 * tt) / p.t, gy = (v: number) => 450 - (180 * v) / max;
    const drawn = pts.filter(q => q.t <= t + 1e-9);
    const d = drawn.map((q, i) => `${i ? 'L' : 'M'}${gx(q.t).toFixed(1)} ${gy(val(q)).toFixed(1)}`).join(' ');
    return (
      <g>
        <line className="lb-tick" x1={x0} y1={450} x2={x0 + 400} y2={450} />
        <line className="lb-tick" x1={x0} y1={450} x2={x0} y2={260} />
        {[0.5, 1].map(f => <line key={f} className="lb-grid" x1={x0} x2={x0 + 400} y1={gy(max * f)} y2={gy(max * f)} />)}
        <text className="lb-sm" x={x0 - 8} y={gy(max) + 4} textAnchor="end">{fmt(max, 1)}</text>
        <text className="lb-sm" x={x0 - 8} y={454} textAnchor="end">0</text>
        <text className="lb-sm" x={x0 + 400} y={470} textAnchor="end">{fmt(p.t, 0)} s</text>
        <text className="lb-lbl" x={x0} y={250}>{label} ({unit})</text>
        {d && <path className="lb-curve" d={d} />}
        {drawn.length > 0 && <circle cx={gx(t)} cy={gy(val(now))} r={6} fill="#E11D48" />}
      </g>
    );
  };

  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Car starting at ${p.u} metres per second, accelerating at ${p.a}, for ${p.t} seconds`}>
      <rect x={40} y={110} width={920} height={60} rx={8} fill="#E8EDF4" />
      <line x1={40} x2={960} y1={140} y2={140} stroke="#fff" strokeWidth={4} strokeDasharray="24 18" />
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <g key={f}>
          <line className="lb-tick" x1={roadX(sMax * f)} x2={roadX(sMax * f)} y1={172} y2={182} />
          <text className="lb-sm" x={roadX(sMax * f)} y={198} textAnchor="middle">{fmt(sMax * f, 1)} m</text>
        </g>
      ))}
      <g transform={`translate(${roadX(now.s)} 0)`}>
        <rect x={-46} y={88} width={92} height={34} rx={10} fill="#2F6BFF" />
        <rect x={-28} y={72} width={52} height={24} rx={8} fill="#4C8DFF" />
        <circle cx={-26} cy={124} r={10} fill="#002147" /><circle cx={26} cy={124} r={10} fill="#002147" />
      </g>
      <text className="lb-lbl" x={40} y={40}>t = {fmt(t, 1)} s</text>
      {!conceal && <text className="lb-lbl" x={960} y={40} textAnchor="end">v = {fmt(now.v, 2)} m/s · s = {fmt(now.s, 2)} m</text>}
      {graph(80, q => q.s, sMax, 'Distance', 'm')}
      {graph(560, q => q.v, vMax, 'Velocity', 'm/s')}
    </svg>
  );
}
