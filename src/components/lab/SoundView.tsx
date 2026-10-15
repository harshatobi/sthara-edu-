'use client';

import { MEDIUM, solveSound, type SoundParams } from '@/lib/lab/engines/sound';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/**
 * Top: the pressure wave along the medium, 3½ wavelengths wide whatever the
 * pitch, with λ marked. Bottom: a clap travelling to the wall and back, slowed
 * down, with the true echo time on the clock.
 */
export default function SoundView({ params: p, conceal, runKey }: ViewProps<SoundParams>) {
  const r = solveSound(p);
  const k = useRun(runKey, conceal, 4000);
  const span = 3.5 * r.lambda; // metres shown
  const X = (x: number) => 60 + (880 * x) / span;
  const phase = k * 4 * Math.PI; // the wave drifts while running
  const d = Array.from({ length: 281 }, (_, i) => {
    const x = (span * i) / 280;
    return `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${(130 - 60 * Math.sin((2 * Math.PI * x) / r.lambda - phase)).toFixed(1)}`;
  }).join(' ');

  // Echo: person at 80px, wall at 900px. The pulse covers there-and-back over the run.
  const pos = k <= 0.5 ? 80 + (820 * k) / 0.5 : 900 - (820 * (k - 0.5)) / 0.5;
  const elapsed = r.echo * k;
  const running = k > 0 && k < 1;

  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.f} hertz sound in ${MEDIUM[p.medium].label}`}>
      <text className="lb-lbl" x={60} y={36}>{fmt(p.f, 0)} Hz in {MEDIUM[p.medium].label.toLowerCase()}, {r.v} m/s</text>
      <line className="lb-axis" x1={60} x2={940} y1={130} y2={130} />
      <path className="lb-curve" d={d} />
      <line className="lb-tick" x1={X(r.lambda * 0.25)} x2={X(r.lambda * 0.25)} y1={60} y2={210} style={{ stroke: '#9AA6B8', strokeDasharray: '4 4' }} />
      <line className="lb-tick" x1={X(r.lambda * 1.25)} x2={X(r.lambda * 1.25)} y1={60} y2={210} style={{ stroke: '#9AA6B8', strokeDasharray: '4 4' }} />
      <line x1={X(r.lambda * 0.25)} x2={X(r.lambda * 1.25)} y1={218} y2={218} stroke="#7C5CFC" strokeWidth={3} />
      <text className="lb-lbl" x={X(r.lambda * 0.75)} y={240} textAnchor="middle" style={{ fill: '#7C5CFC' }}>λ = {conceal ? '?' : r.lambda >= 1 ? `${fmt(r.lambda, 2)} m` : `${fmt(r.lambda * 100, 1)} cm`}</text>
      <text className="lb-sm" x={940} y={240} textAnchor="end">compressions at the crests, rarefactions at the troughs</text>

      <rect x={60} y={300} width={880} height={2} fill="#C9D6E8" />
      <circle cx={70} cy={360} r={16} fill="#002147" /><rect x={58} y={378} width={24} height={50} rx={8} fill="#002147" />
      <rect x={900} y={290} width={30} height={150} fill="#9AA6B8" />
      <line className="lb-axis" x1={80} x2={900} y1={455} y2={455} />
      <text className="lb-sm" x={490} y={474} textAnchor="middle">{fmt(p.d, 0)} m</text>
      {running && <circle cx={pos} cy={360} r={12} fill="none" stroke={k <= 0.5 ? '#E11D48' : '#2F6BFF'} strokeWidth={4} />}
      <text className="lb-lbl" x={500} y={340} textAnchor="middle">{k === 0 ? 'Clap!' : k < 0.5 ? 'Going out…' : k < 1 ? 'Coming back…' : conceal ? '' : `Echo after ${fmt(r.echo, 3)} s${r.distinct ? '' : ': too soon to hear separately'}`}</text>
      {running && <text className="lb-sm" x={500} y={400} textAnchor="middle">t = {fmt(elapsed, 3)} s (slowed down)</text>}
    </svg>
  );
}
