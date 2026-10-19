'use client';

import { columnAt, solveBoyle, type BoyleParams } from '@/lib/lab/engines/boyle';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';

const W = 1000, H = 480;

/** The two limbs of the apparatus, with P-V and P-1/V for the readings the class would take. */
export default function BoyleView({ params: p, conceal }: ViewProps<BoyleParams>) {
  const s = solveBoyle(p);
  const sc = 4; // px per cm
  const closedTop = 150, base = 400;
  // While the class predicts, the apparatus is shown before the open limb is moved.
  const closedLevel = closedTop + (conceal ? p.l0 : s.l) * sc + 10;
  const openLevel = closedLevel - (conceal ? 0 : p.h) * sc;
  const hs = [-20, -10, 0, 10, 20, 30];
  const pts = hs.map(h => ({ P: p.H + h, l: columnAt(p, h) }));
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Boyle's law apparatus">
      {/* Closed tube */}
      <rect x={120} y={closedTop} width={30} height={base - closedTop} fill="none" stroke="#002147" strokeWidth={2} />
      <rect x={122} y={closedTop + 2} width={26} height={closedLevel - closedTop - 2} fill="#DCEBFF" />
      <rect x={122} y={closedLevel} width={26} height={base - closedLevel} fill="#9AA6B8" />
      {/* Open tube, moved up or down */}
      <rect x={260} y={Math.max(20, openLevel - 80)} width={30} height={base - Math.max(20, openLevel - 80)} fill="none" stroke="#002147" strokeWidth={2} />
      <rect x={262} y={openLevel} width={26} height={base - openLevel} fill="#9AA6B8" />
      <path d={`M135 ${base} q 0 40 70 40 q 70 0 70 -40`} fill="none" stroke="#9AA6B8" strokeWidth={16} />
      <line className="lb-eq" x1={100} x2={320} y1={closedLevel} y2={closedLevel} />
      <line className="lb-axis" x1={150} x2={320} y1={openLevel} y2={openLevel} />
      <text className="lb-sm" x={330} y={openLevel + 4}>h = {fmt(p.h, 0)} cm</text>
      <text className="lb-sm" x={110} y={closedTop + (closedLevel - closedTop) / 2} textAnchor="end">air {conceal ? '?' : `${fmt(s.l, 1)} cm`}</text>
      <text className="lb-lbl" x={40} y={30}>P = H + h = {fmt(p.H, 1)} {p.h >= 0 ? '+' : '−'} {fmt(Math.abs(p.h), 0)} = {fmt(s.P, 1)} cm Hg</text>
      <Graph x={470} y={60} w={200} h={300} xLabel="V (l, cm)" yLabel="P (cm Hg)" xMax={niceMax(pts[0].l)} yMax={niceMax(pts[5].P)}
        points={conceal ? [] : pts.map(q => ({ x: q.l, y: q.P }))} line={{ path: Array.from({ length: 26 }, (_, i) => columnAt(p, -20 + i * 2)).map(l => ({ x: l, y: (p.H * p.l0) / l })) }} hideLine={conceal} />
      <Graph x={750} y={60} w={200} h={300} xLabel="1/V (1/cm)" yLabel="P (cm Hg)" xMax={niceMax(1 / pts[5].l)} yMax={niceMax(pts[5].P)}
        points={conceal ? [] : pts.map(q => ({ x: 1 / q.l, y: q.P }))} line={{ slope: p.H * p.l0 }} hideLine={conceal} />
    </svg>
  );
}
