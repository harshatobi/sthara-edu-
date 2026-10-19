'use client';

import { depressionMm, extensionMm, G, type ElasticParams } from '@/lib/lab/engines/elastic';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function ElasticView({ params: p, conceal, runKey }: ViewProps<ElasticParams>) {
  const k = useRun(runKey, conceal, 3000);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.mode === 'searle' ? "Searle's apparatus" : 'A loaded metre scale'}>
      {p.mode === 'searle' ? <Searle p={p} k={k} conceal={conceal} /> : <Beam p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Searle({ p, k, conceal }: { p: ElasticParams; k: number; conceal: boolean }) {
  const loads = Array.from({ length: Math.round(p.M / 0.5) }, (_, i) => (i + 1) * 0.5);
  const on = conceal ? 0 : Math.max(1, Math.round(k * loads.length));
  const M = conceal ? 0 : loads[on - 1] ?? p.M;
  const x = extensionMm({ ...p, M });
  const drop = Math.min(60, x * 25); // magnified on the drawing
  const top = 30, len = 240;
  return (
    <g>
      <rect x={120} y={top - 14} width={260} height={14} fill="#C9D6E8" />
      {/* Reference wire (left) and experimental wire (right) */}
      <line x1={190} x2={190} y1={top} y2={top + len} stroke="#9AA6B8" strokeWidth={2} />
      <line x1={310} x2={310} y1={top} y2={top + len + drop} stroke="#002147" strokeWidth={2} />
      <rect x={170} y={top + len} width={160} height={30} fill="#E8EDF4" stroke="#002147" strokeWidth={1.5} />
      <text className="lb-sm" x={250} y={top + len + 50} textAnchor="middle">spirit level and micrometer</text>
      <line x1={310} x2={310} y1={top + len + 30 + drop} y2={top + len + 80 + drop} stroke="#002147" strokeWidth={1.5} />
      {loads.slice(0, on).map((_, i) => <rect key={i} x={286} y={top + len + 80 + drop + i * 10} width={48} height={9} rx={2} fill="#B45309" />)}
      <text className="lb-sm" x={350} y={top + len + 96 + drop}>{fmt(M, 1)} kg</text>
      <text className="lb-sm" x={150} y={top + len - 10} textAnchor="end">reference</text>
      <text className="lb-sm" x={330} y={top + 20}>{fmt(p.L, 1)} m, ⌀ {fmt(p.d, 2)} mm</text>
      {!conceal && <text className="lb-lbl" x={60} y={460}>Extension at {fmt(M, 1)} kg: {fmt(x, 2)} mm (micrometer, LC 0.01 mm)</text>}
      <Graph x={600} y={60} w={340} h={300} xLabel="extension (mm)" yLabel="load (kg)" xMax={niceMax(extensionMm(p))} yMax={niceMax(p.M)}
        points={conceal ? [] : loads.slice(0, on).map(m => ({ x: extensionMm({ ...p, M: m }), y: m }))} line={{ slope: p.M / extensionMm(p) }} hideLine={conceal || on < loads.length} />
    </g>
  );
}

function Beam({ p, k, conceal }: { p: ElasticParams; k: number; conceal: boolean }) {
  const d = depressionMm(p.support, p.W, p.span) * (conceal ? 0 : k);
  const x0 = 120, len = p.span * 5.5, y = 200, sag = Math.min(150, d * 3);
  const end = p.support === 'end';
  const path = end
    ? `M${x0} ${y} Q ${x0 + len * 0.6} ${y} ${x0 + len} ${y + sag}`
    : `M${x0} ${y} Q ${x0 + len / 2} ${y + 2 * sag} ${x0 + len} ${y}`;
  const loadAt = end ? { x: x0 + len, y: y + sag } : { x: x0 + len / 2, y: y + sag };
  const loads = [100, 200, 300, 400, 500];
  return (
    <g>
      {end ? <rect x={x0 - 60} y={y - 40} width={60} height={80} fill="#9AA6B8" /> : <>
        <polygon points={`${x0 - 14},${y + 34} ${x0 + 14},${y + 34} ${x0},${y + 4}`} fill="#E11D48" />
        <polygon points={`${x0 + len - 14},${y + 34} ${x0 + len + 14},${y + 34} ${x0 + len},${y + 4}`} fill="#E11D48" />
      </>}
      <path d={path} fill="none" stroke="#B45309" strokeWidth={10} strokeLinecap="round" />
      <line className="lb-axis" x1={x0} x2={x0 + len + 20} y1={y} y2={y} />
      <line x1={loadAt.x} x2={loadAt.x} y1={loadAt.y} y2={loadAt.y + 60} stroke="#002147" strokeWidth={1.5} />
      <rect x={loadAt.x - 22} y={loadAt.y + 60} width={44} height={40} rx={5} fill="#9AA6B8" />
      <text className="lb-sm" x={loadAt.x} y={loadAt.y + 120} textAnchor="middle">{fmt(p.W, 0)} g</text>
      {!conceal && <text className="lb-lbl" x={60} y={60}>Depression {fmt(d, 2)} mm ({end ? 'clamped at one end' : 'on two knife edges'}, span {fmt(p.span, 0)} cm, drawn 3× deeper)</text>}
      <Graph x={660} y={250} w={280} h={160} xLabel="load (g)" yLabel="depression (mm)" xMax={500} yMax={niceMax(depressionMm(p.support, 500, p.span))}
        points={conceal ? [] : loads.map(w => ({ x: w, y: depressionMm(p.support, w, p.span) }))} line={{ slope: depressionMm(p.support, 1, p.span) }} hideLine={conceal} />
      <text className="lb-sm" x={660} y={460}>g = {G} m/s²</text>
    </g>
  );
}
