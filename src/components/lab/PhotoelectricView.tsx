'use client';

import { HC, METALS, solvePhoto, type PhotoParams } from '@/lib/lab/engines/photoelectric';
import { colourOf } from '@/lib/lab/engines/waveOptics';
import { fmt } from '@/lib/lab/types';
import { Graph } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Photons hit the plate; electrons fly off (or not), faster for shorter wavelengths, more for brighter light. */
export default function PhotoelectricView({ params: p, conceal, runKey }: ViewProps<PhotoParams>) {
  const k = useRun(runKey, conceal, 3000);
  const s = solvePhoto(p);
  const colour = p.lambda < 400 ? '#7C3AED' : colourOf(p.lambda);
  const t = conceal ? 0 : (k * 3) % 1;
  const n = p.intensity * 3;
  const speed = s.emits ? 60 + Math.sqrt(s.K) * 120 : 0;
  // V₀ against ν for this metal: from threshold to 2 × 10¹⁵ Hz.
  const nu0 = (s.phi / 4.136e-15) / 1e14;
  const line = Array.from({ length: 2 }, (_, i) => nu0 + i * (20 - nu0)).map(nu => ({ x: nu, y: Math.max(0, 4.136e-15 * nu * 1e14 - s.phi) }));
  const nuNow = (HC / p.lambda / 4.136e-15) / 1e14;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Photoelectric effect">
      <rect x={300} y={120} width={20} height={240} fill="#9AA6B8" stroke="#002147" />
      <text className="lb-sm" x={310} y={384} textAnchor="middle">{METALS[p.metal].label}</text>
      {Array.from({ length: n }, (_, i) => {
        const y = 140 + (i * 200) / n, x = 60 + ((t + i / n) % 1) * 240;
        return <path key={i} d={`M${x - 30} ${y - 20} q 8 -10 16 0 t 16 0`} fill="none" stroke={colour} strokeWidth={3} opacity={0.85} transform={`rotate(20 ${x} ${y})`} />;
      })}
      {s.emits && !conceal && Array.from({ length: n }, (_, i) => {
        const y = 150 + (i * 200) / n, x = 330 + ((t + i / n) % 1) * speed * 1.6;
        return <circle key={i} cx={Math.min(560, x)} cy={y} r={5} fill="#2F6BFF" />;
      })}
      <text className="lb-lbl" x={40} y={40}>{fmt(p.lambda, 0)} nm ({fmt(s.E, 2)} eV photons), brightness ×{p.intensity}</text>
      {!conceal && <text className="lb-sm" x={40} y={440}>{s.emits ? `electrons out with up to ${fmt(s.K, 2)} eV: stopping potential ${fmt(s.V0, 2)} V` : `no electrons: ${fmt(s.E, 2)} eV < work function ${fmt(s.phi, 2)} eV (threshold ${fmt(s.threshold, 0)} nm)`}</text>}
      <Graph x={620} y={60} w={320} h={300} xLabel="ν (10¹⁴ Hz)" yLabel="V₀ (V)" xMax={20} yMax={8}
        points={conceal || !s.emits ? [] : [{ x: nuNow, y: s.V0 }]} line={{ path: line }} hideLine={conceal} />
    </svg>
  );
}
