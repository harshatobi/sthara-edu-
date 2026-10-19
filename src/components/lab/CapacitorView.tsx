'use client';

import { combo, plateC, type CapacitorParams } from '@/lib/lab/engines/capacitor';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The circuit with charges appearing on the plates; for parallel plates, the field between them and the slab. */
export default function CapacitorView({ params: p, conceal, runKey }: ViewProps<CapacitorParams>) {
  const k = useRun(runKey, conceal, 2000);
  const charge = conceal ? 0 : k;
  const cap = (x: number, y: number, label: string, n: number, vertical = false) => (
    <g>
      {vertical
        ? <><line x1={x - 30} x2={x + 30} y1={y - 10} y2={y - 10} stroke="#002147" strokeWidth={5} /><line x1={x - 30} x2={x + 30} y1={y + 10} y2={y + 10} stroke="#002147" strokeWidth={5} /></>
        : <><line x1={x - 10} x2={x - 10} y1={y - 30} y2={y + 30} stroke="#002147" strokeWidth={5} /><line x1={x + 10} x2={x + 10} y1={y - 30} y2={y + 30} stroke="#002147" strokeWidth={5} /></>}
      {Array.from({ length: Math.round(n * charge) }, (_, i) => vertical
        ? <g key={i}><text className="lb-sm" x={x - 26 + i * 10} y={y - 16} fill="#E11D48">+</text><text className="lb-sm" x={x - 26 + i * 10} y={y + 28} fill="#2F6BFF">−</text></g>
        : <g key={i}><text className="lb-sm" x={x - 26} y={y - 22 + i * 10} fill="#E11D48">+</text><text className="lb-sm" x={x + 18} y={y - 22 + i * 10} fill="#2F6BFF">−</text></g>)}
      <text className="lb-sm" x={x} y={vertical ? y + 52 : y + 54} textAnchor="middle">{label}</text>
    </g>
  );
  if (p.mode === 'plate') {
    const C = plateC(p.A, p.d, p.K), gap = 30 + p.d * 14, h = 120 + Math.sqrt(p.A) * 6;
    return (
      <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Parallel plate capacitor">
        <rect x={300 - gap / 2 - 10} y={240 - h / 2} width={10} height={h} fill="#E11D48" />
        <rect x={300 + gap / 2} y={240 - h / 2} width={10} height={h} fill="#2F6BFF" />
        {p.K > 1 && <rect x={300 - gap / 2 + 2} y={240 - h / 2 + 6} width={gap - 4} height={h - 12} fill="#FDE68A" opacity={0.7} />}
        {Array.from({ length: Math.max(3, Math.round(12 / p.K)) }, (_, i) => <line key={i} x1={300 - gap / 2} x2={300 + gap / 2} y1={240 - h / 2 + ((i + 1) * h) / (Math.max(3, Math.round(12 / p.K)) + 1)} y2={240 - h / 2 + ((i + 1) * h) / (Math.max(3, Math.round(12 / p.K)) + 1)} stroke="#F59E0B" strokeWidth={1.5} opacity={charge} />)}
        <text className="lb-lbl" x={560} y={120}>A = {fmt(p.A, 0)} cm², d = {fmt(p.d, 1)} mm, K = {p.K}</text>
        {!conceal && <text className="lb-lbl" x={560} y={160} fill="#E11D48">C = Kε₀A/d = {fmt(C, 1)} pF</text>}
        <text className="lb-sm" x={560} y={200}>{p.K > 1 ? 'the dielectric weakens the field inside (fewer lines)' : 'air between the plates'}</text>
      </svg>
    );
  }
  const C = combo(p), Q = C * p.V;
  const series = p.mode === 'series';
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Capacitors in ${p.mode}`}>
      {series ? <>
        <path d="M120 120 H230 M270 120 H430 M470 120 H600 V360 H120 V120" className="lb-wire" />
        {cap(250, 120, `C₁ ${fmt(p.C1, 0)} μF`, 4)}
        {cap(450, 120, `C₂ ${fmt(p.C2, 0)} μF`, 4)}
      </> : <>
        <path d="M120 120 H600 V360 H120 Z M340 120 V170 M340 210 V250 M340 250 H480 V210 M480 170 V120" className="lb-wire" />
        {cap(340, 190, `C₁ ${fmt(p.C1, 0)} μF`, Math.min(6, p.C1 / 2), true)}
        {cap(480, 190, `C₂ ${fmt(p.C2, 0)} μF`, Math.min(6, p.C2 / 2), true)}
      </>}
      <g transform="translate(330 346)"><line x1={0} x2={0} y1={0} y2={28} stroke="#002147" strokeWidth={3} /><line x1={12} x2={12} y1={7} y2={21} stroke="#002147" strokeWidth={5} /></g>
      <text className="lb-sm" x={340} y={400} textAnchor="middle">{fmt(p.V, 0)} V</text>
      <g transform="translate(660 120)">
        <text className="lb-lbl" x={0} y={0}>{series ? 'Series: same charge on each' : 'Parallel: same voltage on each'}</text>
        {!conceal && <>
          <text className="lb-sm" x={0} y={34}>C = {fmt(C, 2)} μF</text>
          <text className="lb-sm" x={0} y={60}>Q = CV = {fmt(Q, 1)} μC</text>
          <text className="lb-sm" x={0} y={86}>U = ½CV² = {fmt(0.5 * C * p.V ** 2 / 1000, 3)} mJ</text>
          {series && <text className="lb-sm" x={0} y={112}>V₁ = {fmt(Q / p.C1, 2)} V, V₂ = {fmt(Q / p.C2, 2)} V</text>}
        </>}
      </g>
    </svg>
  );
}
