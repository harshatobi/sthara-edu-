'use client';

import { CELL_V, solveOhm, type OhmParams } from '@/lib/lab/engines/ohm';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The circuit (cells, key, rheostat, ammeter, resistor with a voltmeter across it) beside the V-I graph. */
export default function OhmView({ params: p, conceal, runKey }: ViewProps<OhmParams>) {
  const s = solveOhm(p);
  // One reading per number of cells, at this rheostat setting: what the class would plot.
  const pts = [1, 2, 3, 4].map(n => solveOhm({ ...p, cells: n })).map(x => ({ x: x.i, y: x.v }));
  const k = useRun(runKey, conceal, 2400);
  const shown = conceal ? 0 : Math.ceil(k * pts.length);
  const meter = (cx: number, cy: number, letter: string, value: string) => (
    <g>
      <circle className="lb-meter" cx={cx} cy={cy} r={30} />
      <text className="lb-lbl" x={cx} y={cy + 6} textAnchor="middle">{letter}</text>
      <text className="lb-lbl" x={cx + 40} y={cy + 6}>{conceal ? '?' : value}</text>
    </g>
  );
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.r} ohm resistor with ${p.cells} cells and a ${p.rheo} ohm rheostat`}>
      {/* Main loop */}
      <path className="lb-wire" d="M60 120 H460 V380 H60 Z" />
      {/* Cells */}
      {Array.from({ length: p.cells }, (_, i) => (
        <g key={i}>
          <rect x={80 + i * 34} y={100} width={30} height={40} fill="#fff" />
          <line className="lb-res" x1={88 + i * 34} x2={88 + i * 34} y1={100} y2={140} />
          <line className="lb-res" x1={100 + i * 34} x2={100 + i * 34} y1={110} y2={130} strokeWidth={6} />
        </g>
      ))}
      <text className="lb-sm" x={80} y={88}>{p.cells} × {CELL_V} V</text>
      {/* Key */}
      <circle cx={260} cy={120} r={6} fill="#002147" /><circle cx={300} cy={120} r={6} fill="#002147" />
      <text className="lb-sm" x={280} y={100} textAnchor="middle">key</text>
      {/* Ammeter in series on the right */}
      <rect x={430} y={190} width={60} height={60} fill="#fff" />
      {meter(460, 220, 'A', `${fmt(s.i, 3)} A`)}
      {/* Rheostat along the bottom */}
      <rect x={300} y={366} width={120} height={28} rx={4} fill="#fff" stroke="#002147" strokeWidth={3} />
      {Array.from({ length: 9 }, (_, i) => <line key={i} className="lb-res" x1={312 + i * 12} x2={312 + i * 12} y1={366} y2={394} strokeWidth={1.5} />)}
      <path d={`M${300 + (120 * p.rheo) / 20} 352 l-8 -14 h16 Z`} fill="#E11D48" />
      <text className="lb-sm" x={360} y={420} textAnchor="middle">rheostat {fmt(p.rheo, 0)} Ω</text>
      {/* Resistor on the left side */}
      <rect x={44} y={210} width={32} height={80} fill="#fff" stroke="#002147" strokeWidth={3} />
      <text className="lb-lbl" x={96} y={256}>R = {fmt(p.r, 0)} Ω</text>
      {/* Voltmeter across the resistor */}
      <path className="lb-wire" d="M60 190 H200 V214 M200 286 V310 H60" style={{ strokeWidth: 2.5 }} />
      <rect x={168} y={214} width={64} height={72} fill="none" />
      {meter(200, 250, 'V', `${fmt(s.v, 2)} V`)}
      <Graph x={580} y={70} w={360} h={320} xLabel="I (A)" yLabel="V (V)" xMax={niceMax(Math.max(...pts.map(q => q.x)))} yMax={niceMax(Math.max(...pts.map(q => q.y)))}
        points={pts} shown={shown} line={{ slope: p.r }} hideLine={conceal || shown < pts.length} />
    </svg>
  );
}
