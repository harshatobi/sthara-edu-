'use client';

import { balanceAt, unknownOf, type BridgeParams } from '@/lib/lab/engines/bridge';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The jockey sweeps the wire; the galvanometer needle swings through zero at the null point. */
export default function BridgeView({ params: p, conceal, runKey }: ViewProps<BridgeParams>) {
  const k = useRun(runKey, conceal, 4000);
  const X = unknownOf(p), l = balanceAt(p.R, X);
  const x0 = 100, px = 8, y = 330;
  // Sweep from 10 cm to the null point, overshooting a little and settling.
  const at = conceal ? 20 : k < 0.8 ? 10 + (l + 8 - 10) * (k / 0.8) : l + 8 * (1 - (k - 0.8) / 0.2);
  const deflect = Math.max(-40, Math.min(40, (at - l) * 3));
  const gx = x0 + 50 * px;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Metre bridge">
      {/* Copper strips and the gaps */}
      <path d={`M${x0} ${y} V${y - 150} H${x0 + 30 * px} M${x0 + 40 * px} ${y - 150} H${x0 + 60 * px} M${x0 + 70 * px} ${y - 150} H${x0 + 100 * px} V${y}`} className="lb-wire" />
      <rect x={x0 + 30 * px} y={y - 168} width={10 * px} height={36} rx={4} fill="#DCEBFF" stroke="#2F6BFF" strokeWidth={2} />
      <text className="lb-lbl" x={x0 + 35 * px} y={y - 144} textAnchor="middle">R {fmt(p.R, 0)} Ω</text>
      <rect x={x0 + 60 * px} y={y - 168} width={10 * px} height={36} rx={4} fill="#FDE7D9" stroke="#E11D48" strokeWidth={2} />
      <text className="lb-lbl" x={x0 + 65 * px} y={y - 144} textAnchor="middle">{p.mode === 'single' ? 'X' : p.mode === 'series' ? 'X₁ + X₂' : 'X₁ ∥ X₂'}</text>
      {/* The wire on the scale */}
      <line x1={x0} x2={x0 + 100 * px} y1={y} y2={y} stroke="#B45309" strokeWidth={4} />
      <rect x={x0} y={y + 8} width={100 * px} height={14} fill="#F7F9FB" stroke="#9AA6B8" />
      {Array.from({ length: 11 }, (_, i) => i * 10).map(c => <g key={c}><line x1={x0 + c * px} x2={x0 + c * px} y1={y + 8} y2={y + 20} stroke="#002147" /><text className="lb-sm" x={x0 + c * px} y={y + 40} textAnchor="middle">{c}</text></g>)}
      {/* Galvanometer from the middle strip to the jockey */}
      <circle cx={gx} cy={y - 80} r={30} className="lb-meter" />
      <line x1={gx} x2={gx + Math.sin((deflect * Math.PI) / 180) * 24} y1={y - 76} y2={y - 76 - Math.cos((deflect * Math.PI) / 180) * 24} stroke="#E11D48" strokeWidth={3} />
      <text className="lb-sm" x={gx} y={y - 56} textAnchor="middle">G</text>
      <path d={`M${gx} ${y - 150} V${y - 110} M${gx} ${y - 50} L${x0 + at * px} ${y - 12}`} fill="none" stroke="#002147" strokeWidth={1.5} />
      <polygon points={`${x0 + at * px - 6},${y - 14} ${x0 + at * px + 6},${y - 14} ${x0 + at * px},${y}`} fill="#002147" />
      <text className="lb-lbl" x={40} y={440}>Jockey at {fmt(at, 1)} cm</text>
      {!conceal && k >= 1 && <text className="lb-lbl" x={980} y={440} textAnchor="end" fill="#E11D48">Null point l = {fmt(l, 1)} cm · X = R(100 − l)/l = {fmt(X, 2)} Ω</text>}
      {p.mode !== 'single' && <text className="lb-sm" x={40} y={40}>X₁ = {fmt(p.X1, 1)} Ω, X₂ = {fmt(p.X2, 1)} Ω in {p.mode}</text>}
    </svg>
  );
}
