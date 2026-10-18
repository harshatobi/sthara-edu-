'use client';

import { solveResp, type RespirationParams } from '@/lib/lab/engines/respiration';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Conical flask with seeds and a KOH tube, bent delivery tube into a beaker; the water creeps up the tube. */
export default function RespirationView({ params: p, conceal, runKey }: ViewProps<RespirationParams>) {
  const s = solveResp(p);
  const k = useRun(runKey, conceal, 4000);
  const rise = conceal ? 0 : s.rise * k;
  const tubeX = 560, waterTop = 400, px = 12;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.seeds} seeds ${p.koh === 'yes' ? 'with' : 'without'} potassium hydroxide`}>
      {/* Flask */}
      <path d="M260 130 V200 L170 380 Q165 400 185 400 H385 Q405 400 400 380 L310 200 V130" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
      <rect x={250} y={112} width={70} height={22} rx={4} fill="#8B5E3C" />
      {Array.from({ length: 26 }, (_, i) => <ellipse key={i} cx={200 + ((i * 41) % 170)} cy={380 - ((i * 13) % 40)} rx={10} ry={7} fill={p.seeds === 'germinating' ? '#D9B26B' : '#9C8A6A'} stroke="#7A5A2F" />)}
      {p.seeds === 'germinating' && Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${210 + i * 20} ${372 - ((i * 13) % 40)} q6 -14 0 -22`} fill="none" stroke="#16A34A" strokeWidth={2} />)}
      {p.koh === 'yes' && <g><line x1={285} x2={285} y1={134} y2={260} stroke="#002147" strokeWidth={1.5} /><path d="M270 260 V300 a15 15 0 0 0 30 0 V260 Z" fill="#E9D5FF" stroke="#002147" strokeWidth={2} /><text className="lb-sm" x={320} y={290}>KOH</text></g>}
      {/* Delivery tube: up from the cork, across, down into the beaker */}
      <path d={`M300 112 V80 H${tubeX} V${waterTop + 40}`} fill="none" stroke="#002147" strokeWidth={8} strokeLinejoin="round" />
      <path d={`M300 112 V80 H${tubeX} V${waterTop + 40}`} fill="none" stroke="#F5F8FC" strokeWidth={4} strokeLinejoin="round" />
      <line x1={tubeX} x2={tubeX} y1={waterTop + 40} y2={waterTop - rise * px} stroke="#60A5FA" strokeWidth={4} />
      <path d={`M${tubeX - 70} ${waterTop - 20} V${waterTop + 60} H${tubeX + 70} V${waterTop - 20}`} fill="none" stroke="#002147" strokeWidth={3} />
      <rect x={tubeX - 68} y={waterTop} width={136} height={58} fill="#DCEBFF" opacity={0.8} />
      {/* Scale beside the tube */}
      {Array.from({ length: 4 }, (_, i) => (
        <g key={i}><line className="lb-tick" x1={tubeX + 14} x2={tubeX + 24} y1={waterTop - i * 5 * px} y2={waterTop - i * 5 * px} /><text className="lb-sm" x={tubeX + 30} y={waterTop - i * 5 * px + 4}>{i * 5} cm</text></g>
      ))}
      <text className="lb-lbl" x={40} y={50}>{p.seeds === 'germinating' ? 'Germinating seeds' : 'Boiled seeds'}, {p.koh === 'yes' ? 'with KOH' : 'no KOH'} · {fmt(p.minutes * (conceal ? 0 : k), 0)} min</text>
      {!conceal && <text className="lb-lbl" x={960} y={50} textAnchor="end">water rose {fmt(rise, 1)} cm</text>}
    </svg>
  );
}
