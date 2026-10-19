'use client';

import { G, rangeAt, solveProjectile, type ProjectileParams } from '@/lib/lab/engines/projectile';
import { fmt } from '@/lib/lab/types';
import { niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The path traced as it flies, with its complementary-angle twin dashed, and range against angle below. */
export default function ProjectileView({ params: p, conceal, runKey }: ViewProps<ProjectileParams>) {
  const s = solveProjectile(p);
  const k = useRun(runKey, conceal, 3000);
  const maxR = niceMax((p.u * p.u) / G), maxH = niceMax(Math.max((p.u * p.u) / (2 * G) * 0.5, s.H));
  const sc = Math.min(820 / maxR, 250 / maxH);
  const ox = 70, oy = 320;
  const at = (angle: number, t: number) => { const a = (angle * Math.PI) / 180; return { x: ox + p.u * Math.cos(a) * t * sc, y: oy - (p.u * Math.sin(a) * t - 0.5 * G * t * t) * sc }; };
  const path = (angle: number, upTo: number) => {
    const T = (2 * p.u * Math.sin((angle * Math.PI) / 180)) / G;
    return Array.from({ length: 61 }, (_, i) => at(angle, (T * upTo * i) / 60)).map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
  };
  const twin = 90 - p.angle;
  const ball = at(p.angle, s.T * k);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projectile at ${p.angle} degrees`}>
      <line x1={40} x2={960} y1={oy} y2={oy} stroke="#002147" strokeWidth={2} />
      {[0.25, 0.5, 0.75, 1].map(f => <g key={f}><line x1={ox + maxR * f * sc} x2={ox + maxR * f * sc} y1={oy} y2={oy + 8} stroke="#002147" /><text className="lb-sm" x={ox + maxR * f * sc} y={oy + 24} textAnchor="middle">{fmt(maxR * f, 1)} m</text></g>)}
      {!conceal && p.angle !== 45 && <path d={path(twin, 1)} fill="none" stroke="#9AA6B8" strokeWidth={2} strokeDasharray="6 6" />}
      <path d={path(p.angle, conceal ? 0 : k)} className="lb-curve" />
      <circle cx={conceal ? ox : ball.x} cy={conceal ? oy : ball.y} r={9} fill="#E11D48" stroke="#002147" strokeWidth={2} />
      {!conceal && k >= 1 && <>
        <line className="lb-eq" x1={ox + (s.R / 2) * sc} x2={ox + (s.R / 2) * sc} y1={oy} y2={oy - s.H * sc} />
        <text className="lb-sm" x={ox + (s.R / 2) * sc + 6} y={oy - s.H * sc - 8}>H = {fmt(s.H, 2)} m</text>
        <text className="lb-lbl" x={ox + s.R * sc} y={oy - 12} textAnchor="middle" fill="#E11D48">R = {fmt(s.R, 1)} m</text>
        {p.angle !== 45 && <text className="lb-sm" x={ox + s.R * sc} y={oy + 44} textAnchor="middle">{fmt(twin, 0)}° (dashed) lands at the same place</text>}
      </>}
      <text className="lb-lbl" x={40} y={40}>{fmt(p.u, 0)} m/s at {fmt(p.angle, 0)}°</text>
      {/* Range against angle, 0°-90° */}
      <g transform="translate(70 380)">
        <text className="lb-sm" x={0} y={0}>range against angle</text>
        <path d={Array.from({ length: 46 }, (_, i) => i * 2).map((d, i) => `${i ? 'L' : 'M'}${(d * 9).toFixed(1)} ${(80 - (rangeAt(p.u, d) / maxR) * 70).toFixed(1)}`).join(' ')} fill="none" stroke="#2F6BFF" strokeWidth={2.5} />
        <line x1={0} x2={810} y1={80} y2={80} stroke="#9AA6B8" />
        {[0, 15, 30, 45, 60, 75, 90].map(d => <text key={d} className="lb-sm" x={d * 9} y={96} textAnchor="middle">{d}°</text>)}
        {!conceal && <circle cx={p.angle * 9} cy={80 - (s.R / maxR) * 70} r={6} fill="#E11D48" />}
      </g>
    </svg>
  );
}
