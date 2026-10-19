'use client';

import { NUCLIDES, solveNucleus, type NucleusParams } from '@/lib/lab/engines/nucleus';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;

/** The binding-energy-per-nucleon curve, with every listed nucleus marked and the chosen one highlighted. */
/** Label positions where neighbouring points would overlap (by mass number). */
const PLACE: Record<number, { dx: number; dy: number; end?: boolean }> = {
  12: { dx: 12, dy: 18 }, 16: { dx: 4, dy: -14 }, 235: { dx: -12, dy: -12, end: true }, 238: { dx: -4, dy: 22, end: true },
};

export default function NucleusView({ params: p, conceal }: ViewProps<NucleusParams>) {
  const s = solveNucleus(p.nuclide);
  const x = (A: number) => 120 + (A / 240) * 800, y = (e: number) => 400 - (e / 10) * 330;
  const all = Object.keys(NUCLIDES).map(solveNucleus);
  // A smooth guide through the measured points (semi-empirical shape between them).
  const guide = all.slice().sort((a, b) => a.A - b.A);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Binding energy per nucleon curve">
      <line x1={120} x2={920} y1={400} y2={400} stroke="#002147" strokeWidth={2} />
      <line x1={120} x2={120} y1={60} y2={400} stroke="#002147" strokeWidth={2} />
      {[0, 2, 4, 6, 8, 10].map(e => <g key={e}><line x1={120} x2={920} y1={y(e)} y2={y(e)} className="lb-grid" /><text className="lb-sm" x={110} y={y(e) + 4} textAnchor="end">{e}</text></g>)}
      {[0, 60, 120, 180, 240].map(A => <text key={A} className="lb-sm" x={x(A)} y={420} textAnchor="middle">{A}</text>)}
      <text className="lb-lbl" x={120} y={46}>binding energy per nucleon (MeV)</text>
      <text className="lb-lbl" x={920} y={450} textAnchor="end">mass number A</text>
      <path d={guide.map((g, i) => `${i ? 'L' : 'M'}${x(g.A).toFixed(1)} ${y(g.perNucleon).toFixed(1)}`).join(' ')} className="lb-curve" opacity={0.5} />
      {all.map(g => (
        <g key={g.label}>
          <circle cx={x(g.A)} cy={y(g.perNucleon)} r={g.label === s.label ? 9 : 5} fill={g.label === s.label ? '#E11D48' : '#2F6BFF'} stroke="#fff" strokeWidth={2} />
          <text className="lb-sm" x={x(g.A) + (PLACE[g.A]?.dx ?? 10)} y={y(g.perNucleon) + (PLACE[g.A]?.dy ?? (g.A < 10 ? 16 : -10))} textAnchor={PLACE[g.A]?.end ? 'end' : 'start'}>{g.label}</text>
        </g>
      ))}
      <text className="lb-sm" x={x(56)} y={y(9.6)} textAnchor="middle">peak near iron</text>
      <text className="lb-sm" x={x(20)} y={y(2.5)}>fusion →</text>
      <text className="lb-sm" x={x(215)} y={y(6.5)} textAnchor="end">← fission</text>
      {!conceal && <text className="lb-lbl" x={920} y={300} textAnchor="end">{s.label}: Δm = {fmt(s.dm, 5)} u, E_b = {fmt(s.Eb, 1)} MeV, {fmt(s.perNucleon, 2)} MeV per nucleon</text>}
    </svg>
  );
}
