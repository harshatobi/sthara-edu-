'use client';

import { solveResonance, type ResonanceParams } from '@/lib/lab/engines/resonance';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The water is lowered; the standing wave appears (and the column booms) at l₁ and again at l₂. */
export default function ResonanceView({ params: p, conceal, runKey }: ViewProps<ResonanceParams>) {
  const s = solveResonance(p);
  const k = useRun(runKey, conceal, 6000);
  const top = 50, px = Math.min(4, 360 / (s.l2 + 10)); // px per cm
  const l = conceal ? 4 : (s.l2 + 6) * k;
  const boom = Math.max(0, 1 - Math.abs(l - s.l1) / 2) + Math.max(0, 1 - Math.abs(l - s.l2) / 2);
  const x = 300, w = 46;
  const waveL = (s.lambda * px) / 4;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resonance tube">
      <rect x={x - w / 2} y={top} width={w} height={(s.l2 + 20) * px} fill="#FBFCFE" stroke="#002147" strokeWidth={2} />
      <rect x={x - w / 2 + 2} y={top + l * px} width={w - 4} height={Math.max(0, (s.l2 + 20 - l) * px - 2)} fill="#DCEBFF" />
      {Array.from({ length: Math.floor((s.l2 + 20) / 10) + 1 }, (_, i) => i * 10).map(c => <g key={c}><line x1={x + w / 2} x2={x + w / 2 + 10} y1={top + c * px} y2={top + c * px} stroke="#002147" /><text className="lb-sm" x={x + w / 2 + 14} y={top + c * px + 4}>{c}</text></g>)}
      {/* Fork over the mouth */}
      <path d={`M${x - 14} ${top - 44} v30 M${x + 14} ${top - 44} v30`} stroke="#556378" strokeWidth={5} />
      {/* Standing wave envelope at resonance: a node at the water, an antinode just above the mouth */}
      {boom > 0.05 && <g opacity={boom}>
        {[-1, 1].map(sg => <path key={sg} d={Array.from({ length: 41 }, (_, i) => { const y = top + l * px - (i / 40) * (l * px + 0.3 * p.D * px); const d = (top + l * px - y) / waveL * (Math.PI / 2); return `${i ? 'L' : 'M'}${(x + sg * 18 * Math.abs(Math.sin(d))).toFixed(1)} ${y.toFixed(1)}`; }).join(' ')} fill="none" stroke="#E11D48" strokeWidth={2.5} />)}
      </g>}
      <text className="lb-lbl" x={480} y={80}>{fmt(s.f, 1)} Hz fork · room {fmt(p.t, 0)} °C · D = {fmt(p.D, 1)} cm</text>
      {!conceal && <>
        <text className="lb-sm" x={480} y={116}>air column {fmt(l, 1)} cm{boom > 0.5 ? ': loud!' : ''}</text>
        {k > (s.l1 / (s.l2 + 6)) && <text className="lb-lbl" x={480} y={160} fill="#E11D48">l₁ = {fmt(s.l1, 1)} cm</text>}
        {k >= 1 && <>
          <text className="lb-lbl" x={480} y={192} fill="#E11D48">l₂ = {fmt(s.l2, 1)} cm</text>
          <text className="lb-sm" x={480} y={228}>v = 2f(l₂ − l₁) = {fmt(s.v, 0)} m/s</text>
          <text className="lb-sm" x={480} y={252}>end correction e = (l₂ − 3l₁)/2 = {fmt(s.e, 1)} cm</text>
        </>}
      </>}
    </svg>
  );
}
