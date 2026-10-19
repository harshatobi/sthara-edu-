'use client';

import { MATERIALS, resistanceOf, type WireParams } from '@/lib/lab/engines/wire';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The circuit with the wire stretched on a metre scale; the V-I graph or the fall in potential along it. */
export default function WireView({ params: p, conceal, runKey }: ViewProps<WireParams>) {
  const k = useRun(runKey, conceal, 3000);
  const { R } = resistanceOf(p), V = p.I * R;
  const x0 = 80, x1 = 80 + p.L * 5, y = 120;
  const probe = p.mode === 'drop' ? x0 + (x1 - x0) * (conceal ? 0.5 : k) : x1;
  const vProbe = V * ((probe - x0) / (x1 - x0));
  const currents = [0.2, 0.4, 0.6, 0.8, 1.0].map(f => f * Math.max(p.I, 0.5));
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resistance wire circuit">
      <line x1={x0} x2={x1} y1={y} y2={y} stroke="#B45309" strokeWidth={4} />
      <rect x={x0} y={y + 10} width={x1 - x0} height={12} fill="#F7F9FB" stroke="#9AA6B8" />
      <path className="lb-wire" d={`M${x0} ${y} V${y + 160} H${x0 + 90} M${x0 + 150} ${y + 160} H${x0 + 230} M${x0 + 290} ${y + 160} H${x1} V${y}`} />
      <path className="lb-flow" d={`M${x0} ${y} H${x1}`} style={{ animationDuration: `${1.2 / p.I}s` }} />
      <g transform={`translate(${x0 + 90} ${y + 145})`}><line x1={0} x2={0} y1={0} y2={30} stroke="#002147" strokeWidth={3} /><line x1={14} x2={14} y1={8} y2={22} stroke="#002147" strokeWidth={5} /><line x1={28} x2={28} y1={0} y2={30} stroke="#002147" strokeWidth={3} /><line x1={42} x2={42} y1={8} y2={22} stroke="#002147" strokeWidth={5} /></g>
      <circle cx={x0 + 260} cy={y + 160} r={24} className="lb-meter" /><text className="lb-lbl" x={x0 + 260} y={y + 166} textAnchor="middle">A</text>
      <text className="lb-sm" x={x0 + 260} y={y + 204} textAnchor="middle">{fmt(p.I, 2)} A</text>
      {/* Voltmeter from the start of the wire to the probe */}
      <path d={`M${x0} ${y} V${y - 60} H${(x0 + probe) / 2 - 24} M${(x0 + probe) / 2 + 24} ${y - 60} H${probe} V${y}`} fill="none" stroke="#2F6BFF" strokeWidth={2} />
      <circle cx={(x0 + probe) / 2} cy={y - 60} r={24} className="lb-meter" /><text className="lb-lbl" x={(x0 + probe) / 2} y={y - 54} textAnchor="middle">V</text>
      {!conceal && <text className="lb-sm" x={(x0 + probe) / 2} y={y - 92} textAnchor="middle">{fmt(vProbe, 2)} V</text>}
      <text className="lb-lbl" x={40} y={420}>{MATERIALS[p.material].label}, {fmt(p.L, 0)} cm, ⌀ {fmt(p.d, 2)} mm</text>
      {!conceal && <text className="lb-sm" x={40} y={446}>R = {fmt(R, 2)} Ω</text>}
      {p.mode === 'vi'
        ? <Graph x={620} y={60} w={320} h={300} xLabel="I (A)" yLabel="V (V)" xMax={niceMax(currents[4])} yMax={niceMax(currents[4] * R)} points={conceal ? [] : currents.slice(0, Math.ceil(k * 5)).map(i => ({ x: i, y: i * R }))} line={{ slope: R }} hideLine={conceal || k < 1} />
        : <Graph x={620} y={60} w={320} h={300} xLabel="length (cm)" yLabel="V (V)" xMax={niceMax(p.L)} yMax={niceMax(V)} points={conceal ? [] : [0.2, 0.4, 0.6, 0.8, 1].filter(f => f <= k + 1e-9).map(f => ({ x: f * p.L, y: f * V }))} line={{ slope: V / p.L }} hideLine={conceal || k < 1} />}
    </svg>
  );
}
