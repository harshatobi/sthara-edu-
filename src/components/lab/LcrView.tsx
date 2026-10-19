'use client';

import { currentAt, solveLcr, type LcrParams } from '@/lib/lab/engines/lcr';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';

const W = 1000, H = 480;

/** The resonance curve (current against frequency) with this frequency marked, and the phasor diagram. */
export default function LcrView({ params: p, conceal }: ViewProps<LcrParams>) {
  const s = solveLcr(p);
  const fMax = niceMax(Math.max(s.f0 * 2.2, p.f * 1.1));
  const iMax = niceMax((p.V / p.R) * 1000);
  const curve = Array.from({ length: 160 }, (_, i) => (fMax * (i + 1)) / 160).map(f => ({ x: f, y: currentAt(p, f) * 1000 }));
  // Phasors: V_R along x, V_L up, V_C down, resultant V at φ.
  const ox = 180, oy = 240, sc = 150 / Math.max(s.I * p.R, s.I * s.XL, s.I * s.XC, 1e-9);
  const VR = s.I * p.R * sc, VL = s.I * s.XL * sc, VC = s.I * s.XC * sc;
  const arrow = (x2: number, y2: number, colour: string, label: string) => (
    <g>
      <line x1={ox} y1={oy} x2={x2} y2={y2} stroke={colour} strokeWidth={4} />
      <circle cx={x2} cy={y2} r={4} fill={colour} />
      <text className="lb-sm" x={x2 + 6} y={y2 - 6} fill={colour}>{label}</text>
    </g>
  );
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Series LCR resonance">
      <text className="lb-lbl" x={40} y={40}>Phasors at {fmt(p.f, 0)} Hz</text>
      <line className="lb-axis" x1={ox - 20} x2={ox + 180} y1={oy} y2={oy} />
      {!conceal && <>
        {arrow(ox + VR, oy, '#10B981', 'V_R (with I)')}
        {arrow(ox, oy - VL, '#2F6BFF', 'V_L')}
        {arrow(ox, oy + VC, '#7C5CFC', 'V_C')}
        {arrow(ox + VR, oy - (VL - VC), '#E11D48', `V, φ = ${fmt(s.phi, 0)}°`)}
      </>}
      <Graph x={480} y={60} w={460} h={300} xLabel="frequency (Hz)" yLabel="current (mA rms)" xMax={fMax} yMax={iMax}
        points={conceal ? [] : [{ x: p.f, y: s.I * 1000 }]} line={{ path: curve }} hideLine={conceal} />
      {!conceal && <>
        <line className="lb-eq" x1={480 + (460 * s.f0) / fMax} x2={480 + (460 * s.f0) / fMax} y1={60} y2={360} />
        <text className="lb-sm" x={480 + (460 * s.f0) / fMax + 6} y={76}>f₀ = {fmt(s.f0, 0)} Hz</text>
      </>}
      <text className="lb-sm" x={40} y={440}>R = {fmt(p.R, 0)} Ω · L = {fmt(p.L, 0)} mH · C = {fmt(p.C, 0)} μF · {fmt(p.V, 0)} V rms</text>
    </svg>
  );
}
