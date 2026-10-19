'use client';

import { induced, type EmiParams } from '@/lib/lab/engines/emi';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The magnet moves along the coil's axis; the galvanometer swings while it moves, and the coil's face shows its pole. */
export default function EmiView({ params: p, conceal, runKey }: ViewProps<EmiParams>) {
  const k = useRun(runKey, conceal, 2500);
  const r = induced(p);
  const moving = !conceal && p.motion !== 'still' && k > 0 && k < 1;
  const t = conceal ? 0 : k;
  const far = 60, near = 330;
  const mx = p.motion === 'in' ? far + (near - far) * t : p.motion === 'out' ? near - (near - far) * t : near;
  const swing = moving ? r.swing * Math.min(1, r.emf / 0.5 + 0.3) * 40 * Math.sin(Math.PI * t) : 0;
  const cy = 200;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Magnet and coil">
      {/* Magnet: the pole facing the coil on its right end */}
      <g transform={`translate(${mx - 200} ${cy - 25})`}>
        <rect x={0} y={0} width={100} height={50} fill={p.pole === 'N' ? '#2F6BFF' : '#E11D48'} />
        <rect x={100} y={0} width={100} height={50} fill={p.pole === 'N' ? '#E11D48' : '#2F6BFF'} />
        <text className="lb-lbl" x={50} y={32} textAnchor="middle" fill="#fff">{p.pole === 'N' ? 'S' : 'N'}</text>
        <text className="lb-lbl" x={150} y={32} textAnchor="middle" fill="#fff">{p.pole}</text>
      </g>
      {/* Coil */}
      {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx={380 + i * 22} cy={cy} rx={14} ry={60} fill="none" stroke="#B45309" strokeWidth={4} />)}
      {moving && r.face !== 'none' && <text className="lb-lbl" x={360} y={cy - 74} textAnchor="middle" fill={r.face === 'N' ? '#E11D48' : '#2F6BFF'}>{r.face}</text>}
      <path d={`M380 ${cy + 60} V${cy + 160} H560 M640 ${cy + 160} H622 M622 ${cy + 160} H${380 + 11 * 22} V${cy + 60}`} fill="none" stroke="#002147" strokeWidth={2} />
      <circle cx={600} cy={cy + 160} r={38} className="lb-meter" />
      <line x1={600} y1={cy + 172} x2={600 + 30 * Math.sin((swing * Math.PI) / 180)} y2={cy + 172 - 30 * Math.cos((swing * Math.PI) / 180)} stroke="#E11D48" strokeWidth={3} />
      <text className="lb-sm" x={600} y={cy + 214} textAnchor="middle">G</text>
      <text className="lb-lbl" x={40} y={40}>{p.N} turns · magnet {p.motion === 'in' ? 'pushed in' : p.motion === 'out' ? 'pulled out' : 'held still'} at {fmt(p.v, 1)} m/s</text>
      {!conceal && <text className="lb-sm" x={40} y={70}>{p.motion === 'still' ? 'no change in flux: no current' : `emf ≈ ${fmt(r.emf * 1000, 1)} mV while it moves; near face becomes ${r.face}`}</text>}
    </svg>
  );
}
