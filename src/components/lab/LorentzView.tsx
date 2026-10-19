'use client';

import { circle, PARTICLES, selectorSpeed, type LorentzParams } from '@/lib/lab/engines/lorentz';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The field region (crosses: B into the page), and the particle's path drawn as it moves. */
export default function LorentzView({ params: p, conceal, runKey }: ViewProps<LorentzParams>) {
  const k = useRun(runKey, conceal, 3000);
  const s = PARTICLES[p.particle];
  const x0 = 400, y0 = PARTICLES[p.particle].q > 0 ? 420 : 60, fx = 200, fy = 40, fw = 760, fh = 420;
  const crosses = [];
  for (let x = fx + 30; x < fx + fw; x += 60) for (let y = fy + 30; y < fy + fh; y += 60) crosses.push(<text key={`${x}-${y}`} className="lb-sm" x={x} y={y} textAnchor="middle" fill="#9AA6B8">×</text>);
  let path = '';
  if (p.mode === 'circle') {
    // Draw radius on a log-like scale so both mm and m circles fit, keeping the direction of curvature right.
    const r = circle(p).r, R = Math.max(30, Math.min(175, 60 * Math.log10(1 + r)));
    const up = s.q > 0 ? -1 : 1; // B into the page: positive charges moving right curve up
    const ang = (conceal ? 0 : k) * 2 * Math.PI;
    const pts = Array.from({ length: 121 }, (_, i) => (i / 120) * ang).map(a => ({ x: x0 + R * Math.sin(a), y: y0 + up * R * (1 - Math.cos(a)) }));
    path = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
  } else {
    const v0 = selectorSpeed(p.E, p.B), bend = Math.max(-1, Math.min(1, (p.v - v0) / v0)) * (s.q > 0 ? -1 : 1);
    const L = (conceal ? 0 : k) * 700;
    path = Array.from({ length: 61 }, (_, i) => (i / 60) * L).map((x, i) => `${i ? 'L' : 'M'}${(fx + x).toFixed(1)} ${(240 + bend * 160 * (x / 700) ** 2).toFixed(1)}`).join(' ');
  }
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Charged particle in a field">
      <rect x={fx} y={fy} width={fw} height={fh} fill="#F7F9FB" stroke="#C9D6E8" />
      {crosses}
      {p.mode === 'selector' && <>
        <rect x={fx} y={fy} width={fw} height={10} fill="#E11D48" opacity={0.6} />
        <rect x={fx} y={fy + fh - 10} width={fw} height={10} fill="#2F6BFF" opacity={0.6} />
        <text className="lb-sm" x={fx + 10} y={fy + 28}>+ plate (E downward)</text>
      </>}
      <path d={path} fill="none" stroke="#E11D48" strokeWidth={3} />
      <line x1={fx} x2={p.mode === 'circle' ? x0 : fx} y1={p.mode === 'circle' ? y0 : 240} y2={p.mode === 'circle' ? y0 : 240} stroke="#E11D48" strokeWidth={3} strokeDasharray="6 5" />
      <text className="lb-lbl" x={20} y={30}>{s.label} at {fmt(p.v, 1)} × 10⁵ m/s · B = {fmt(p.B, 0)} mT into the page</text>
      {!conceal && <text className="lb-sm" x={20} y={460}>{p.mode === 'circle' ? `r = mv/qB = ${(() => { const r = circle(p).r; return r >= 100 ? `${fmt(r / 100, 2)} m` : r >= 1 ? `${fmt(r, 1)} cm` : `${fmt(r * 10, 2)} mm`; })()} (drawn to fit)` : `straight through only at v = E/B = ${fmt(selectorSpeed(p.E, p.B), 2)} × 10⁵ m/s`}</text>}
    </svg>
  );
}
