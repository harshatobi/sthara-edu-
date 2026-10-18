'use client';

import { path, STIMULI, type ReflexParams } from '@/lib/lab/engines/reflex';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The arc as a diagram: receptor, sensory neuron into a cross-section of the spinal cord, motor neuron out to the muscle; an impulse runs along it. */
export default function ReflexView({ params: p, conceal, runKey }: ViewProps<ReflexParams>) {
  const s = STIMULI[p.stimulus], steps = path(p);
  const k = useRun(runKey, conceal, 3500);
  const pts = [{ x: 120, y: 360 }, { x: 330, y: 250 }, { x: 560, y: 210 }, { x: 760, y: 260 }, { x: 880, y: 360 }];
  const d = `M${pts[0].x} ${pts[0].y} C200 300 260 240 ${pts[1].x} ${pts[1].y} S480 200 ${pts[2].x} ${pts[2].y} S700 230 ${pts[3].x} ${pts[3].y} S840 330 ${pts[4].x} ${pts[4].y}`;
  const at = conceal ? -1 : Math.min(4, Math.floor(k * 5));
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Reflex arc for ${s.label}`}>
      <text className="lb-lbl" x={40} y={50}>{s.label}</text>
      {/* Spinal cord cross-section */}
      <ellipse cx={560} cy={210} rx={110} ry={80} fill="#F1F5F9" stroke="#002147" strokeWidth={2.5} />
      <path d="M520 170 Q560 150 600 170 Q620 210 600 250 Q560 270 520 250 Q500 210 520 170 Z" fill="#E9D5FF" stroke="#7C5CFC" strokeWidth={1.5} />
      <text className="lb-sm" x={560} y={115} textAnchor="middle">spinal cord</text>
      <path d={d} fill="none" stroke="#9AA6B8" strokeWidth={4} />
      {!conceal && <path d={d} fill="none" stroke="#E11D48" strokeWidth={5} strokeDasharray="2000" strokeDashoffset={2000 * (1 - k)} />}
      <circle cx={pts[0].x} cy={pts[0].y} r={16} fill="#FCD34D" stroke="#002147" />
      <rect x={pts[4].x - 30} y={pts[4].y - 16} width={70} height={36} rx={16} fill="#FCA5A5" stroke="#002147" />
      {pts.map((q, i) => (
        <g key={i} opacity={conceal || i <= at ? 1 : 0.35}>
          <text className="lb-sm" x={q.x} y={q.y + (i === 2 ? 110 : 44)} textAnchor="middle">{conceal && i > 0 && i < 4 ? '?' : ['Receptor', 'Sensory neuron', s.relay ? 'Relay in spinal cord' : 'Spinal cord', 'Motor neuron', 'Effector'][i]}</text>
        </g>
      ))}
      {!conceal && k >= 1 && <text className="lb-lbl" x={960} y={50} textAnchor="end">{s.action}</text>}
      {!conceal && <text className="lb-sm" x={40} y={440}>{steps.join(' → ')}</text>}
    </svg>
  );
}
