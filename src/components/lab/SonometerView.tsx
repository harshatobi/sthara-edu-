'use client';

import { drive, G, lengthFor, type SonometerParams } from '@/lib/lab/engines/sonometer';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The movable bridge slides in until the wire resonates and the paper rider flies off. */
export default function SonometerView({ params: p, conceal, runKey }: ViewProps<SonometerParams>) {
  const k = useRun(runKey, conceal, 3500);
  const f = drive(p), l = lengthFor(f, p.M, p.wire);
  const x0 = 120, px = 8; // px per cm
  const lNow = conceal ? 100 : 100 - (100 - l) * Math.min(1, k / 0.8);
  const near = Math.max(0, 1 - Math.abs(lNow - l) / 6);
  const amp = conceal ? 0 : near * 22 * Math.abs(Math.sin(k * 60));
  const bx = x0 + lNow * px, y = 200;
  const flown = !conceal && k > 0.85;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sonometer">
      <rect x={x0 - 40} y={y + 40} width={100 * px + 80} height={70} rx={6} fill="#E8D3B4" stroke="#002147" strokeWidth={2} />
      {Array.from({ length: 11 }, (_, i) => i * 10).map(c => <g key={c}><line x1={x0 + c * px} x2={x0 + c * px} y1={y + 40} y2={y + 52} stroke="#002147" /><text className="lb-sm" x={x0 + c * px} y={y + 70} textAnchor="middle">{c}</text></g>)}
      <polygon points={`${x0 - 8},${y + 40} ${x0 + 8},${y + 40} ${x0},${y}`} fill="#002147" />
      <polygon points={`${bx - 8},${y + 40} ${bx + 8},${y + 40} ${bx},${y}`} fill="#E11D48" />
      <path d={`M${x0 - 30} ${y} L${x0} ${y} Q ${(x0 + bx) / 2} ${y - amp * 2} ${bx} ${y} L${x0 + 100 * px + 40} ${y}`} fill="none" stroke="#556378" strokeWidth={2} />
      {!flown && <path d={`M${(x0 + bx) / 2 - 10} ${y - 2} l10 -14 l10 14`} fill="none" stroke="#E11D48" strokeWidth={3} />}
      {flown && <path d={`M${(x0 + bx) / 2 + 20} ${y - 70} l10 -14 l10 14`} fill="none" stroke="#E11D48" strokeWidth={3} transform={`rotate(30 ${(x0 + bx) / 2 + 30} ${y - 77})`} />}
      <circle cx={x0 + 100 * px + 40} cy={y + 10} r={14} fill="#C9D6E8" stroke="#002147" strokeWidth={2} />
      <line x1={x0 + 100 * px + 54} x2={x0 + 100 * px + 54} y1={y + 10} y2={y + 140} stroke="#002147" />
      <rect x={x0 + 100 * px + 34} y={y + 140} width={40} height={16 + p.M * 6} rx={3} fill="#9AA6B8" />
      <text className="lb-sm" x={x0 + 100 * px + 54} y={y + 180 + p.M * 6} textAnchor="middle">{fmt(p.M, 1)} kg</text>
      {p.mode === 'mains'
        ? <g><rect x={x0 + 120} y={y + 112} width={60} height={40} fill="#556378" /><text className="lb-sm" x={x0 + 150} y={y + 172} textAnchor="middle">electromagnet on AC mains</text></g>
        : <g transform={`translate(${x0 + 40} ${y + 130})`}><path d="M0 0 v60 M30 0 v60 M0 60 q15 20 30 0 M15 76 v40" stroke="#556378" strokeWidth={6} fill="none" /><text className="lb-sm" x={60} y={60}>{fmt(Number(p.f), 1)} Hz fork on the box</text></g>}
      <text className="lb-lbl" x={40} y={50}>Tension {fmt(p.M * G, 1)} N · wire vibrates at {fmt(f, 1)} Hz</text>
      {flown && <text className="lb-lbl" x={40} y={82} fill="#E11D48">Resonance at l = {fmt(l, 1)} cm: the paper rider flies off</text>}
    </svg>
  );
}
