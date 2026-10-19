'use client';

import { energy, SERIES, transition, type BohrParams } from '@/lib/lab/engines/bohr';
import { colourOf } from '@/lib/lab/engines/waveOptics';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Orbits (not to scale), the energy-level ladder with the jump, and where the line falls in the spectrum. */
export default function BohrView({ params: p, conceal, runKey }: ViewProps<BohrParams>) {
  const k = useRun(runKey, conceal, 2500);
  const t = transition(p), done = !conceal && k >= 1;
  const cx = 200, cy = 240;
  const rOf = (n: number) => 18 + n * 26;
  const n = conceal ? p.upper : p.upper - (p.upper - p.lower) * Math.min(1, k * 1.4);
  const ang = k * 8;
  const ladder = (e: number) => 420 - (e + 13.6) / 13.6 * 360;
  const visible = t.lambda >= 380 && t.lambda <= 750;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hydrogen transition ${p.upper} to ${p.lower}`}>
      {[1, 2, 3, 4, 5, 6, 7].map(i => <circle key={i} cx={cx} cy={cy} r={rOf(i)} fill="none" stroke={i === p.upper || i === p.lower ? '#2F6BFF' : '#E8EDF4'} strokeWidth={i === p.upper || i === p.lower ? 2 : 1} />)}
      <circle cx={cx} cy={cy} r={8} fill="#E11D48" />
      <circle cx={cx + rOf(n) * Math.cos(ang)} cy={cy + rOf(n) * Math.sin(ang)} r={6} fill="#2F6BFF" />
      {done && <path d={`M${cx + rOf(p.lower) + 10} ${cy} q 15 -12 30 0 t 30 0 t 30 0`} fill="none" stroke={visible ? colourOf(t.lambda) : '#7C3AED'} strokeWidth={3} />}
      <text className="lb-sm" x={cx} y={460} textAnchor="middle">orbits not to scale</text>
      {/* Energy levels */}
      {[1, 2, 3, 4, 5, 6, 7].map(i => (
        <g key={i}>
          <line x1={460} x2={640} y1={ladder(energy(i))} y2={ladder(energy(i))} stroke={i === p.upper || i === p.lower ? '#002147' : '#C9D6E8'} strokeWidth={i === p.upper || i === p.lower ? 2.5 : 1.2} />
          {(i <= 4 || i === p.upper) && <text className="lb-sm" x={648} y={ladder(energy(i)) + 4}>n = {i}, {fmt(energy(i), 2)} eV</text>}
        </g>
      ))}
      {!conceal && <line x1={550} x2={550} y1={ladder(energy(p.upper))} y2={ladder(energy(p.upper)) + (ladder(energy(p.lower)) - ladder(energy(p.upper))) * Math.min(1, k * 1.4)} stroke="#E11D48" strokeWidth={4} />}
      {done && <>
        <text className="lb-lbl" x={460} y={30}>{fmt(t.E, 2)} eV photon · {fmt(t.lambda, 0)} nm · {SERIES[p.lower].name} ({SERIES[p.lower].region})</text>
      </>}
    </svg>
  );
}
