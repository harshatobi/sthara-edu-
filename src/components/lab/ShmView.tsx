'use client';

import { extension, G, periodPendulum, periodSpring, SECONDS_L, tauOf, type ShmParams } from '@/lib/lab/engines/shm';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const RUN_MS = 8000;

/** The pendulum or spring moves at real speed for a few seconds; the graph beside it is the one the class plots. */
export default function ShmView({ params: p, conceal, runKey }: ViewProps<ShmParams>) {
  const k = useRun(runKey, conceal, RUN_MS);
  const t = k * (RUN_MS / 1000); // seconds of motion, real time
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.mode === 'spring' ? 'A loaded spring' : 'A simple pendulum'}>
      {p.mode === 'spring' ? <Spring p={p} t={t} conceal={conceal} /> : <Pendulum p={p} t={t} conceal={conceal} />}
    </svg>
  );
}

function Pendulum({ p, t, conceal }: { p: ShmParams; t: number; conceal: boolean }) {
  const T = periodPendulum(p.L), tau = tauOf(p.m);
  const amp0 = p.mode === 'damped' ? 14 : 8;
  // Damped: shown speeded up 10 times so the decay is visible within the run.
  const tt = p.mode === 'damped' ? t * 10 : t;
  const amp = p.mode === 'damped' ? amp0 * Math.exp(-tt / (2 * tau)) : amp0;
  const phi = conceal ? amp0 : amp * Math.cos((2 * Math.PI * tt) / T);
  const px = 230, py = 50, L = Math.min(330, p.L * 2.2), rad = (d: number) => (d * Math.PI) / 180;
  const bob = 8 + Math.cbrt(p.m) * 2;
  const bx = px + L * Math.sin(rad(phi)), by = py + L * Math.cos(rad(phi));
  const swings = Math.floor(tt / T);
  // Right: L-T² for 5 lengths (the line through the origin), or A² against time for damping.
  const lengths = [40, 60, 80, 100, 120];
  return (
    <g>
      <rect x={px - 80} y={py - 14} width={160} height={14} fill="#C9D6E8" />
      <line className="lb-axis" x1={px} x2={px} y1={py} y2={py + L + 30} />
      <line x1={px} y1={py} x2={bx} y2={by} stroke="#002147" strokeWidth={2.5} />
      <circle cx={bx} cy={by} r={bob} fill={p.mode === 'mass' ? '#7C5CFC' : '#E11D48'} stroke="#002147" strokeWidth={2} />
      <text className="lb-lbl" x={40} y={440}>L = {fmt(p.L, 0)} cm · {fmt(p.m, 0)} g bob</text>
      {!conceal && <text className="lb-sm" x={40} y={464}>{p.mode === 'damped' ? `shown 10× faster · ${swings} oscillations` : `t = ${fmt(t, 1)} s · ${swings} oscillation${swings === 1 ? '' : 's'} · T = ${fmt(T, 2)} s`}</text>}
      {p.mode === 'damped' ? (() => {
        const tMax = niceMax(tau * 2.5), pts = Array.from({ length: 7 }, (_, i) => (tMax * i) / 6).map(x => ({ x, y: 100 * Math.exp(-x / tau) }));
        return <Graph x={560} y={60} w={380} h={300} xLabel="time (s)" yLabel="A² (cm²)" xMax={tMax} yMax={100} points={conceal ? [] : pts.filter(q => q.x <= tt)}
          line={{ path: Array.from({ length: 41 }, (_, i) => (tMax * i) / 40).map(x => ({ x, y: 100 * Math.exp(-x / tau) })) }} hideLine={conceal} />;
      })() : (() => {
        const pts = lengths.map(l => ({ x: periodPendulum(l) ** 2, y: l }));
        const xMax = niceMax(periodPendulum(150) ** 2);
        return (
          <g>
            <Graph x={560} y={60} w={380} h={300} xLabel="T² (s²)" yLabel="L (cm)" xMax={xMax} yMax={150} points={conceal ? [] : pts}
              line={{ slope: (G / (4 * Math.PI ** 2)) * 100 }} hideLine={conceal} />
            {!conceal && p.mode === 'pendulum' && <>
              <line className="lb-eq" x1={560 + (380 * 4) / xMax} x2={560 + (380 * 4) / xMax} y1={60} y2={360} />
              <text className="lb-sm" x={560 + (380 * 4) / xMax + 6} y={80}>T² = 4 s²: L = {fmt(SECONDS_L, 1)} cm</text>
            </>}
          </g>
        );
      })()}
    </g>
  );
}

function Spring({ p, t, conceal }: { p: ShmParams; t: number; conceal: boolean }) {
  const x = extension(p.m, p.k), T = periodSpring(p.m, p.k);
  const top = 50, natural = 120, pxPerCm = 6;
  const osc = t > 0 && t < RUN_MS / 1000 && !conceal ? 20 * Math.cos((2 * Math.PI * t) / T) * Math.exp(-t / 6) : 0;
  const len = natural + (conceal ? 0 : Math.min(280, x * pxPerCm)) + osc;
  const coils = 14, cx = 220;
  const path = Array.from({ length: coils * 2 + 1 }, (_, i) => `${i ? 'L' : 'M'}${cx + (i === 0 || i === coils * 2 ? 0 : i % 2 ? 22 : -22)} ${top + (len * i) / (coils * 2)}`).join(' ');
  const loads = [50, 100, 150, 200, 250].filter(m => m <= 500);
  const xMax = niceMax(extension(250, p.k));
  return (
    <g>
      <rect x={cx - 80} y={top - 16} width={160} height={16} fill="#C9D6E8" />
      <path d={path} fill="none" stroke="#002147" strokeWidth={2.5} />
      <rect x={cx - 30} y={top + len} width={60} height={46} rx={6} fill="#F59E0B" />
      <text className="lb-sm" x={cx} y={top + len + 28} textAnchor="middle">{fmt(p.m, 0)} g</text>
      {/* Scale with the pointer */}
      <line x1={340} x2={340} y1={top + natural} y2={top + natural + 300} stroke="#002147" strokeWidth={2} />
      {Array.from({ length: 11 }, (_, i) => i * 5).map(c => <g key={c}><line x1={340} x2={352} y1={top + natural + c * pxPerCm} y2={top + natural + c * pxPerCm} stroke="#002147" /><text className="lb-sm" x={358} y={top + natural + c * pxPerCm + 4}>{c}</text></g>)}
      <line x1={cx + 30} x2={340} y1={top + len} y2={top + len} className="lb-eq" />
      <text className="lb-sm" x={330} y={top + natural - 10} textAnchor="end">cm</text>
      <text className="lb-lbl" x={40} y={440}>k = {fmt(p.k, 0)} N/m</text>
      {!conceal && <text className="lb-sm" x={40} y={464}>extension {fmt(x, 1)} cm · period {fmt(T, 2)} s</text>}
      <Graph x={560} y={60} w={380} h={300} xLabel="extension (cm)" yLabel="load (N)" xMax={xMax} yMax={niceMax(0.25 * G)}
        points={conceal ? [] : loads.map(m => ({ x: extension(m, p.k), y: (m / 1000) * G }))} line={{ slope: p.k / 100 }} hideLine={conceal} />
    </g>
  );
}
