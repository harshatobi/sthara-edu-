'use client';

import { speedOf, travelTime, type PulseParams } from '@/lib/lab/engines/pulse';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const X0 = 70, X1 = 930, Y = 230, COILS = 90;

/**
 * The slinky as a row of coils. A transverse pulse is a bump that runs along
 * and comes back inverted; a longitudinal one is a bunching of coils. The
 * run is slowed so the class can follow it; the clock shows real time.
 */
export default function PulseView({ params: p, conceal, runKey }: ViewProps<PulseParams>) {
  const T = travelTime(p);
  const k = useRun(runKey, conceal, 5200);
  const t = 2 * T * k; // there and back
  const along = t <= T ? t / T : 2 - t / T; // 0 → 1 → 0
  const back = t > T;
  const width = 0.07; // pulse width as a share of the length
  const coils = Array.from({ length: COILS + 1 }, (_, i) => i / COILS);
  const bump = (u: number) => (k > 0 && k < 1 ? Math.exp(-(((u - along) / width) ** 2)) : 0);
  const xOf = (u: number) => {
    if (p.kind !== 'push') return X0 + u * (X1 - X0);
    // A compression: coils near the pulse crowd towards it.
    const d = u - along;
    return X0 + (u - 0.6 * width * Math.sign(d) * bump(u) * Math.min(1, Math.abs(d) / width)) * (X1 - X0);
  };
  const yOf = (u: number) => (p.kind === 'side' ? Y - (back ? -1 : 1) * 70 * bump(u) : Y);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.len} metre slinky with a ${p.kind === 'side' ? 'transverse' : 'longitudinal'} pulse`}>
      <rect x={X0 - 40} y={Y - 50} width={18} height={100} fill="#C9D6E8" />
      <rect x={X1 + 22} y={Y - 50} width={18} height={100} fill="#C9D6E8" />
      <text className="lb-sm" x={X0 - 31} y={Y + 74} textAnchor="middle">hand</text>
      <text className="lb-sm" x={X1 + 31} y={Y + 74} textAnchor="middle">fixed end</text>
      {coils.map((u, i) => (
        <ellipse key={i} cx={xOf(u)} cy={yOf(u)} rx={4} ry={22} fill="none" stroke={i % 10 === 0 ? '#E11D48' : '#2F6BFF'} strokeWidth={2} />
      ))}
      <line className="lb-axis" x1={X0} x2={X1} y1={Y + 110} y2={Y + 110} />
      <text className="lb-sm" x={(X0 + X1) / 2} y={Y + 130} textAnchor="middle">{fmt(p.len, 1)} m</text>
      <text className="lb-lbl" x={40} y={50}>t = {fmt(t, 2)} s{back ? ' · coming back' : ''}</text>
      {!conceal && <text className="lb-lbl" x={960} y={50} textAnchor="end">speed {fmt(speedOf(p), 2)} m/s · to the end in {fmt(T, 2)} s</text>}
      <text className="lb-sm" x={40} y={76}>Red coils are marked: they move about their places, they don&apos;t travel.</text>
    </svg>
  );
}
