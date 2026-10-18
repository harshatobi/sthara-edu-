'use client';

import { solveTrolley, type TrolleyParams } from '@/lib/lab/engines/trolley';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Runway, trolley, string over a pulley at the table's edge, and the hanger falling; a clock and the distance marks. */
export default function TrolleyView({ params: p, conceal, runKey }: ViewProps<TrolleyParams>) {
  const s = solveTrolley(p);
  const k = useRun(runKey, conceal, Math.max(1500, s.time * 1000 * 1.5));
  const t = s.time * k, d = 0.5 * s.a * t * t;
  // Distances are measured at the trolley's front edge: start mark to end mark is the timed distance.
  const startX = 230, endX = startX + 560, px = (m: number) => startX + (560 * m) / p.dist;
  const front = px(d), tx = front - 110, table = 260, pulleyX = 860;
  const hangY = 300 + (120 * d) / p.dist;
  const size = 26 + Math.min(30, p.hang / 8);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.trolley} gram trolley pulled by a ${p.hang} gram hanging mass`}>
      <rect x={60} y={table} width={810} height={14} fill="#C9D6E8" />
      <rect x={60} y={table + 14} width={14} height={180} fill="#C9D6E8" />
      <line className="lb-tick" x1={startX} x2={startX} y1={table - 60} y2={table} />
      <line className="lb-tick" x1={endX} x2={endX} y1={table - 60} y2={table} />
      <text className="lb-sm" x={startX} y={table - 68} textAnchor="middle">start</text>
      <text className="lb-sm" x={endX} y={table - 68} textAnchor="middle">{fmt(p.dist, 2)} m</text>
      {/* Trolley, its front edge at the measured distance */}
      <g transform={`translate(${tx} 0)`}>
        <rect x={0} y={table - 48} width={110} height={34} rx={6} fill="#2F6BFF" />
        <circle cx={22} cy={table - 8} r={9} fill="#002147" /><circle cx={88} cy={table - 8} r={9} fill="#002147" />
        <text x={55} y={table - 26} textAnchor="middle" style={{ fill: '#fff', fontSize: 13, fontWeight: 700 }}>{fmt(p.trolley, 0)} g</text>
      </g>
      <line x1={tx + 110} y1={table - 32} x2={pulleyX} y2={table - 32} stroke="#002147" strokeWidth={2} />
      <circle cx={pulleyX} cy={table - 12} r={20} fill="#fff" stroke="#002147" strokeWidth={3} />
      <line x1={pulleyX + 20} y1={table - 12} x2={pulleyX + 20} y2={hangY} stroke="#002147" strokeWidth={2} />
      <rect x={pulleyX + 20 - size / 2} y={hangY} width={size} height={size} rx={4} fill="#7C5CFC" />
      <text className="lb-sm" x={pulleyX + 20 + size / 2 + 8} y={hangY + size / 2 + 4}>{fmt(p.hang, 0)} g</text>
      <text className="lb-lbl" x={40} y={50}>t = {fmt(t, 2)} s</text>
      {!conceal && <text className="lb-lbl" x={960} y={50} textAnchor="end">a = {fmt(s.a, 2)} m/s² · covers {fmt(p.dist, 2)} m in {fmt(s.time, 2)} s</text>}
      <text className="lb-sm" x={40} y={76}>Friction compensated: the runway is tilted just enough that the trolley keeps moving at steady speed when given a push.</text>
    </svg>
  );
}
