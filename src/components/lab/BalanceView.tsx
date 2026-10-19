'use client';

import type { ReactNode } from 'react';
import { solveBalance, type BalanceParams } from '@/lib/lab/engines/balance';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** A beam balance loaded weight by weight, or a metre scale balanced by moments. */
export default function BalanceView({ params: p, conceal, runKey }: ViewProps<BalanceParams>) {
  const k = useRun(runKey, conceal, 3500);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.mode === 'beam' ? 'A beam balance' : 'A metre scale balanced on a knife edge'}>
      {p.mode === 'beam' ? <Beam p={p} k={k} conceal={conceal} /> : <Moments p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Beam({ p, k, conceal }: { p: BalanceParams; k: number; conceal: boolean }) {
  const s = solveBalance(p);
  // Weights go on one by one; the beam tips toward the heavier side until the last one.
  const n = conceal ? 0 : Math.round(k * s.weights.length);
  const on = s.weights.slice(0, n), load = on.reduce((a, b) => a + b, 0);
  const tilt = Math.max(-9, Math.min(9, ((p.m - load) / Math.max(p.m, 1)) * 30));
  const cx = 500, cy = 120, arm = 240, rad = (tilt * Math.PI) / 180;
  const lx = cx - arm * Math.cos(rad), ly = cy - arm * Math.sin(rad) * -1, rx = cx + arm * Math.cos(rad), ry = cy - arm * Math.sin(rad);
  const pan = (x: number, y: number, label: string, items: ReactNode) => (
    <g>
      <line x1={x} y1={y} x2={x - 60} y2={y + 160} stroke="#9AA6B8" strokeWidth={1.5} />
      <line x1={x} y1={y} x2={x + 60} y2={y + 160} stroke="#9AA6B8" strokeWidth={1.5} />
      <path d={`M${x - 75} ${y + 160} Q ${x} ${y + 190} ${x + 75} ${y + 160} Z`} fill="#C9D6E8" stroke="#002147" strokeWidth={2} />
      {items}
      <text className="lb-sm" x={x} y={y + 214} textAnchor="middle">{label}</text>
    </g>
  );
  return (
    <g>
      <rect x={cx - 12} y={cy} width={24} height={300} fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <rect x={cx - 120} y={420} width={240} height={20} rx={4} fill="#9AA6B8" />
      <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#002147" strokeWidth={8} strokeLinecap="round" />
      <polygon points={`${cx - 10},${cy + 4} ${cx + 10},${cy + 4} ${cx},${cy - 14}`} fill="#E11D48" />
      <line x1={cx} y1={cy} x2={cx - Math.sin(rad) * 160} y2={cy + Math.cos(rad) * 160} stroke="#E11D48" strokeWidth={3} />
      <text className="lb-sm" x={cx + 20} y={cy + 200}>pointer</text>
      {pan(lx, ly, `object ${conceal ? '?' : `${fmt(p.m, 2)} g`}`, <rect x={lx - 26} y={ly + 130} width={52} height={36} rx={6} fill="#F59E0B" />)}
      {pan(rx, ry, `weights ${fmt(load, 2)} g`, on.map((w, i) => (
        <rect key={i} x={rx - 60 + (i % 6) * 21} y={ry + 158 - 14 - Math.floor(i / 6) * 16} width={18} height={Math.max(6, Math.min(14, Math.log10(w * 100 + 1) * 5))} rx={2} fill={w >= 1 ? '#B45309' : '#9AA6B8'} />
      )))}
      <text className="lb-lbl" x={40} y={40}>{n === s.weights.length && !conceal ? `Balanced: ${s.weights.map(w => (w >= 1 ? `${w} g` : `${fmt(w * 1000, 0)} mg`)).join(' + ')}` : 'Add weights, heaviest first'}</text>
    </g>
  );
}

function Moments({ p, k, conceal }: { p: BalanceParams; k: number; conceal: boolean }) {
  const s = solveBalance(p);
  const x0 = 100, cm = 8, edge = x0 + 50 * cm, y = 200;
  const d2 = conceal ? s.d2 * 0.6 : s.d2 * (0.4 + 0.6 * k);
  const tilt = Math.max(-6, Math.min(6, (p.known * d2 - p.m * p.d1) / (p.m * p.d1) * 20));
  return (
    <g transform={`rotate(${tilt} ${edge} ${y})`}>
      <rect x={x0} y={y - 14} width={100 * cm} height={14} fill="#F7F9FB" stroke="#002147" strokeWidth={2} />
      {Array.from({ length: 11 }, (_, i) => i * 10).map(c => <g key={c}><line x1={x0 + c * cm} x2={x0 + c * cm} y1={y - 14} y2={y - 4} stroke="#002147" /><text className="lb-sm" x={x0 + c * cm} y={y - 20} textAnchor="middle">{c}</text></g>)}
      <polygon points={`${edge - 16},${y + 34} ${edge + 16},${y + 34} ${edge},${y}`} fill="#E11D48" transform={`rotate(${-tilt} ${edge} ${y})`} />
      {[{ x: edge - p.d1 * cm, label: `${fmt(p.m, 0)} g`, c: '#F59E0B', d: `d₁ ${fmt(p.d1, 0)} cm` }, { x: edge + d2 * cm, label: `${fmt(p.known, 0)} g`, c: '#2F6BFF', d: `d₂ ${fmt(d2, 1)} cm` }].map((h, i) => (
        <g key={i}>
          <line x1={h.x} x2={h.x} y1={y} y2={y + 90} stroke="#002147" strokeWidth={1.5} />
          <rect x={h.x - 26} y={y + 90} width={52} height={50} rx={6} fill={h.c} />
          <text className="lb-sm" x={h.x} y={y + 160} textAnchor="middle">{i === 0 && conceal ? '?' : h.label}</text>
          <text className="lb-sm" x={h.x} y={y + 180} textAnchor="middle">{h.d}</text>
        </g>
      ))}
      <text className="lb-lbl" x={x0} y={60}>Knife edge at 50 cm, the scale&apos;s centre of gravity · m·d₁ = M·d₂</text>
    </g>
  );
}
