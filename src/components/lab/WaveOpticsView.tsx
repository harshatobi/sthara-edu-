'use client';

import { colourOf, intensityAt, widthOf, type WaveOpticsParams } from '@/lib/lab/engines/waveOptics';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;

/** The pattern on the screen, drawn to scale, and the intensity curve across it. */
export default function WaveOpticsView({ params: p, conceal }: ViewProps<WaveOpticsParams>) {
  const w = widthOf(p);
  const span = Math.max(w * (p.mode === 'double' ? 6 : 2.5), 4); // mm shown either side
  const px = 420 / span, cx = 500;
  const colour = colourOf(p.lambda);
  const strips = Array.from({ length: 280 }, (_, i) => -span + (2 * span * i) / 279);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.mode} slit pattern`}>
      <rect x={60} y={80} width={880} height={110} fill="#0B1220" />
      {!conceal && strips.map((y, i) => <rect key={i} x={cx + y * px - 1.6} y={80} width={3.4} height={110} fill={colour} opacity={intensityAt(p, y)} />)}
      <line x1={60} x2={940} y1={330} y2={330} className="lb-axis" />
      {!conceal && <path d={strips.map((y, i) => `${i ? 'L' : 'M'}${(cx + y * px).toFixed(1)} ${(330 - 110 * intensityAt(p, y)).toFixed(1)}`).join(' ')} fill="none" stroke={colour} strokeWidth={3} />}
      {!conceal && <>
        <line x1={cx - (p.mode === 'single' ? w / 2 : 0) * px} x2={cx + (p.mode === 'single' ? w / 2 : w) * px} y1={210} y2={210} stroke="#E11D48" strokeWidth={3} />
        <text className="lb-sm" x={cx} y={232} textAnchor="middle">{p.mode === 'single' ? `central maximum ${fmt(w, 2)} mm` : `β = ${fmt(w, 2)} mm`}</text>
      </>}
      <text className="lb-lbl" x={60} y={50}>{p.mode === 'double' ? 'Two slits' : 'One slit'} · {fmt(p.lambda, 0)} nm · {p.mode === 'double' ? 'd' : 'a'} = {fmt(p.gap, 2)} mm · D = {fmt(p.D, 1)} m</text>
      <text className="lb-sm" x={60} y={420}>screen, magnified: ±{fmt(span, 1)} mm shown</text>
    </svg>
  );
}
