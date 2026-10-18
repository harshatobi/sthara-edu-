'use client';

import { LATHER_MAX, solveSoap, waterKind, type SoapParams } from '@/lib/lab/engines/soap';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const PX = 40; // px per cm of lather

/** Two tubes side by side: soft (distilled) water and this water, after shaking, with lather heights on a scale. */
export default function SoapView({ params: p, conceal, runKey }: ViewProps<SoapParams>) {
  const k = useRun(runKey, conceal, 2200);
  const tube = (x: number, ppm: number, label: string) => {
    const s = solveSoap({ ...p, hardness: ppm });
    const lather = conceal ? 0 : s.lather * k;
    const water = 340;
    return (
      <g>
        <path d={`M${x} 80 V${water + 50} a40 40 0 0 0 80 0 V80`} fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
        <path d={`M${x + 3} ${water - 10} V${water + 50} a37 37 0 0 0 74 0 V${water - 10} Z`} fill="#DCEBFF" />
        {Array.from({ length: Math.round(lather * 6) }, (_, i) => (
          <circle key={i} cx={x + 14 + ((i * 23) % 54)} cy={water - 16 - ((i * 7) % (lather * PX + 1))} r={6 + (i % 3)} fill="#fff" stroke="#9AA6B8" strokeWidth={1} />
        ))}
        {!conceal && s.scum && k > 0.3 && <rect x={x + 6} y={water - 6} width={68} height={8} rx={3} fill="#E6E1D3" />}
        <text className="lb-lbl" x={x + 40} y={60} textAnchor="middle">{label}</text>
        <text className="lb-sm" x={x + 40} y={water + 120} textAnchor="middle">{waterKind(ppm)}, {fmt(ppm, 0)} ppm</text>
        {!conceal && <text className="lb-lbl" x={x + 40} y={water + 142} textAnchor="middle">{fmt(s.lather, 1)} cm lather</text>}
      </g>
    );
  };
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.cleaner} in soft water and in water of ${p.hardness} ppm hardness`}>
      {/* Scale for the lather height above the water line */}
      <line className="lb-tick" x1={170} x2={170} y1={330 - LATHER_MAX * PX} y2={330} />
      {Array.from({ length: LATHER_MAX + 1 }, (_, i) => (
        <g key={i}><line className="lb-tick" x1={162} x2={170} y1={330 - i * PX} y2={330 - i * PX} /><text className="lb-sm" x={156} y={334 - i * PX} textAnchor="end">{i}</text></g>
      ))}
      <text className="lb-sm" x={150} y={330 - LATHER_MAX * PX - 14} textAnchor="middle">cm</text>
      {tube(220, 0, 'Distilled water')}
      {tube(400, p.hardness, 'This water')}
      <foreignObject x={560} y={110} width={400} height={260}>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: '#002147', fontWeight: 600 }}>
          {p.soap} mL of {p.cleaner} solution in 10 mL of water, each tube shaken 10 times.
          {!conceal && p.cleaner === 'soap' && p.hardness > 0 && <div style={{ marginTop: 10 }}>The hard water used up {fmt(solveSoap(p).used, 1)} mL of soap as a white scum before any lather formed.</div>}
          {!conceal && p.cleaner === 'detergent' && <div style={{ marginTop: 10 }}>Detergent forms no scum, so it lathers equally in both.</div>}
        </div>
      </foreignObject>
    </svg>
  );
}
