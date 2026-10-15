'use client';

import { dropAt, fallTime, gOf, solveLever, type EnergyParams } from '@/lib/lab/engines/energy';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function EnergyView(props: ViewProps<EnergyParams>) {
  return props.params.scenario === 'drop' ? <Drop {...props} /> : <Lever {...props} />;
}

/** The ball falls under gravity (slowed so it can be followed); the bars show PE turning into KE. */
function Drop({ params: p, conceal, runKey }: ViewProps<EnergyParams>) {
  const T = fallTime(p);
  const k = useRun(runKey, conceal, Math.max(1800, T * 1000 * 1.6));
  const t = T * k;
  const y = Math.max(0, p.h - 0.5 * gOf(p) * t * t);
  const e = dropAt(p, conceal ? p.h : y);
  const Y = (h: number) => 420 - (360 * h) / p.h;
  const bar = (x: number, val: number, label: string, colour: string) => (
    <g>
      <rect x={x} y={60} width={70} height={360} rx={8} fill="#F2F5F9" />
      <rect x={x} y={420 - (360 * val) / e.total} width={70} height={(360 * val) / e.total} rx={8} fill={colour} />
      <text className="lb-lbl" x={x + 35} y={446} textAnchor="middle">{label}</text>
      {!conceal && <text className="lb-sm" x={x + 35} y={466} textAnchor="middle">{fmt(val, val >= 100 ? 0 : 1)} J</text>}
    </g>
  );
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.m} kilogram object falling from ${p.h} metres`}>
      <rect x={100} y={420} width={420} height={14} fill="#C9D6E8" />
      <line className="lb-tick" x1={300} x2={300} y1={60} y2={420} />
      {[0, 0.25, 0.5, 0.75, 1].map(f => (
        <g key={f}><line className="lb-tick" x1={292} x2={308} y1={Y(p.h * f)} y2={Y(p.h * f)} /><text className="lb-sm" x={284} y={Y(p.h * f) + (f === 0 ? -6 : 4)} textAnchor="end">{fmt(p.h * f, 1)} m</text></g>
      ))}
      <circle cx={400} cy={Y(conceal ? p.h : y) - 18} r={18} fill="#E11D48" stroke="#002147" strokeWidth={2} />
      <text className="lb-sm" x={430} y={Y(conceal ? p.h : y) - 14}>{fmt(p.m, 1)} kg</text>
      {!conceal && <text className="lb-lbl" x={100} y={40}>height {fmt(y, 2)} m · speed {fmt(e.v, 2)} m/s</text>}
      {bar(620, e.pe, 'PE', '#2F6BFF')}
      {bar(730, e.ke, 'KE', '#F59E0B')}
      {bar(840, e.pe + e.ke, 'Total', '#10B981')}
    </svg>
  );
}

/** A lever in balance: fulcrum, load and effort placed by class, arms to scale. */
function Lever({ params: p, conceal }: ViewProps<EnergyParams>) {
  const r = solveLever(p);
  const span = Math.max(p.loadArm, p.effortArm) * (p.lever === '1' ? 2 : 1);
  const sc = 760 / (p.lever === '1' ? p.loadArm + p.effortArm : span);
  // Positions along the beam (px), fulcrum F, load L, effort E.
  let F: number, L: number, E: number;
  if (p.lever === '1') { L = 120; F = L + p.loadArm * sc; E = F + p.effortArm * sc; }
  else { F = 120; L = F + p.loadArm * sc; E = F + p.effortArm * sc; }
  const beamY = 260;
  const loadSize = 40 + Math.min(60, p.load / 12);
  // Drawn to scale only once revealed: a scaled arrow would hint at the answer.
  const effortLen = conceal ? 100 : Math.min(170, 40 + (r.effort / Math.max(r.effort, p.load)) * 130);
  const xs = [F, L, E];
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Class ${p.lever} lever with a ${p.load} newton load`}>
      <rect x={Math.min(...xs) - 30} y={beamY - 8} width={Math.max(...xs) - Math.min(...xs) + 60} height={16} rx={6} fill="#C08A4B" stroke="#002147" strokeWidth={2} />
      <path d={`M${F} ${beamY + 8} l-34 70 h68 Z`} fill="#002147" />
      <text className="lb-lbl" x={F} y={beamY + 104} textAnchor="middle">Fulcrum</text>
      <rect x={L - loadSize / 2} y={beamY - 8 - loadSize} width={loadSize} height={loadSize} rx={4} fill="#7C5CFC" />
      <text className="lb-lbl" x={L} y={beamY - 20 - loadSize} textAnchor="middle">Load {fmt(p.load, 0)} N</text>
      {/* Effort pulls down on a class 1 lever, up on classes 2 and 3. */}
      {(() => {
        const down = p.lever === '1';
        const y1 = down ? beamY - 8 - effortLen : beamY + 8 + effortLen, y2 = down ? beamY - 10 : beamY + 10;
        return (
          <g>
            <line x1={E} x2={E} y1={y1} y2={y2 + (down ? -14 : 14)} stroke="#E11D48" strokeWidth={6} />
            <path d={`M${E} ${y2} l-11 ${down ? -18 : 18} h22 Z`} fill="#E11D48" />
            <text className="lb-lbl" x={E + 16} y={down ? y1 + 16 : y1 - 4} style={{ fill: '#E11D48' }}>Effort {conceal ? '?' : `${fmt(r.effort, 1)} N`}</text>
          </g>
        );
      })()}
      <g>
        <line className="lb-axis" x1={F} x2={L} y1={beamY + 140} y2={beamY + 140} />
        <text className="lb-sm" x={(F + L) / 2} y={beamY + 160} textAnchor="middle">load arm {fmt(p.loadArm, 2)} m</text>
        <line className="lb-axis" x1={F} x2={E} y1={beamY + 180} y2={beamY + 180} />
        <text className="lb-sm" x={(F + E) / 2} y={beamY + 200} textAnchor="middle">effort arm {fmt(p.effortArm, 2)} m</text>
      </g>
      {!conceal && <text className="lb-lbl" x={960} y={50} textAnchor="end">MA = {fmt(r.ma, 2)}</text>}
      <text className="lb-lbl" x={40} y={50}>Class {p.lever} lever</text>
    </svg>
  );
}
