'use client';

import { halfDeflection, ig, N, seriesFor, shuntFor, type GalvoParams } from '@/lib/lab/engines/galvanometer';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** A 30-0-30 galvanometer dial with the circuit; the shunt goes in and the needle drops to half. */
export default function GalvanometerView({ params: p, conceal, runKey }: ViewProps<GalvoParams>) {
  const k = useRun(runKey, conceal, 3000);
  const half = p.mode === 'half';
  const h = halfDeflection(p);
  const shuntIn = half && !conceal && k > 0.5;
  const div = half ? (shuntIn ? p.theta / 2 : p.theta) : conceal ? 0 : N * Math.min(1, k * 1.2);
  const ang = (div / N) * 60;
  const cx = 300, cy = 290, r = 180;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Galvanometer">
      <path d={`M${cx - r * Math.sin(Math.PI / 3)} ${cy - r * Math.cos(Math.PI / 3)} A ${r} ${r} 0 0 1 ${cx + r * Math.sin(Math.PI / 3)} ${cy - r * Math.cos(Math.PI / 3)}`} fill="none" stroke="#002147" strokeWidth={2} />
      {Array.from({ length: 13 }, (_, i) => (i - 6) * 5).map(d => {
        const a = ((d / N) * 60 * Math.PI) / 180;
        return <g key={d}><line x1={cx + (r - 14) * Math.sin(a)} y1={cy - (r - 14) * Math.cos(a)} x2={cx + r * Math.sin(a)} y2={cy - r * Math.cos(a)} stroke="#002147" strokeWidth={d % 10 === 0 ? 2.5 : 1.5} /><text className="lb-sm" x={cx + (r + 18) * Math.sin(a)} y={cy - (r + 18) * Math.cos(a) + 4} textAnchor="middle">{Math.abs(d)}</text></g>;
      })}
      <line x1={cx} y1={cy} x2={cx + (r - 20) * Math.sin((ang * Math.PI) / 180)} y2={cy - (r - 20) * Math.cos((ang * Math.PI) / 180)} stroke="#E11D48" strokeWidth={4} style={{ transition: 'all .6s ease' }} />
      <circle cx={cx} cy={cy} r={10} fill="#002147" />
      <text className="lb-lbl" x={cx} y={cy + 40} textAnchor="middle">G = {fmt(p.G, 0)} Ω</text>
      <g transform="translate(560 80)">
        {half ? <>
          <text className="lb-lbl" x={0} y={0}>Cell {fmt(p.E, 1)} V, R = {fmt(h.R, 0)} Ω in series</text>
          <text className="lb-sm" x={0} y={32}>without the shunt: {p.theta} divisions</text>
          <text className="lb-sm" x={0} y={58} fill={shuntIn ? '#E11D48' : undefined}>shunt S = {fmt(h.S, 1)} Ω across G: {shuntIn ? `${fmt(p.theta / 2, 0)} divisions` : '...'}</text>
          {!conceal && k >= 1 && <>
            <text className="lb-lbl" x={0} y={110} fill="#E11D48">G = RS/(R − S) = {fmt(h.Gcalc, 1)} Ω</text>
            <text className="lb-lbl" x={0} y={142} fill="#E11D48">k = E/(R + G)θ = {fmt(p.k, 1)} μA/div</text>
          </>}
        </> : <>
          <text className="lb-lbl" x={0} y={0}>Full scale: I_g = kN = {fmt(ig(p) * 1000, 2)} mA</text>
          <text className="lb-sm" x={0} y={32}>{p.mode === 'volt' ? `wanted: a 0-${fmt(p.volts, 0)} V voltmeter` : `wanted: a 0-${fmt(p.amps, 1)} A ammeter`}</text>
          {!conceal && <text className="lb-lbl" x={0} y={80} fill="#E11D48">{p.mode === 'volt' ? `${fmt(seriesFor(p), 0)} Ω in series` : `${fmt(shuntFor(p), 4)} Ω shunt in parallel`}</text>}
          {!conceal && <text className="lb-sm" x={0} y={110}>full deflection now means {p.mode === 'volt' ? `${fmt(p.volts, 0)} V` : `${fmt(p.amps, 1)} A`}</text>}
        </>}
      </g>
    </svg>
  );
}
