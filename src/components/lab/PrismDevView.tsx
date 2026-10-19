'use client';

import { deviationAt, iMin, minDeviation, type PrismParams } from '@/lib/lab/engines/prismDev';
import { fmt } from '@/lib/lab/types';
import { Graph } from './Graph';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const rad = (d: number) => (d * Math.PI) / 180;

/** The ray through the prism (pins and protractor style) and the i-δ curve with its minimum. */
export default function PrismDevView({ params: p, conceal }: ViewProps<PrismParams>) {
  const r = deviationAt(p.n, p.A, p.i)!;
  const apex = { x: 260, y: 90 }, side = 300, half = rad(p.A / 2);
  const L = { x: apex.x - side * Math.sin(half), y: apex.y + side * Math.cos(half) }, R = { x: apex.x + side * Math.sin(half), y: L.y };
  // Entry point halfway down the left face; its normal points out to the left.
  const P = { x: (apex.x + L.x) / 2, y: (apex.y + L.y) / 2 };
  const outL = { x: -Math.cos(half), y: -Math.sin(half) };
  const inDir = (angleFromNormal: number, normal: { x: number; y: number }, sign: number) => {
    // Rotate the inward normal (−normal) by the angle; sign picks the side.
    const a = rad(angleFromNormal) * sign, nx = -normal.x, ny = -normal.y;
    return { x: nx * Math.cos(a) - ny * Math.sin(a), y: nx * Math.sin(a) + ny * Math.cos(a) };
  };
  const dIn = inDir(p.i, outL, -1); // incident direction (travelling into the face)
  const start = { x: P.x - dIn.x * 200, y: P.y - dIn.y * 200 };
  const dR1 = inDir(r.r1, outL, -1);
  // Intersect the refracted ray with the right face.
  const t = (() => {
    const ex = R.x - apex.x, ey = R.y - apex.y;
    const den = dR1.x * ey - dR1.y * ex;
    return ((apex.x - P.x) * ey - (apex.y - P.y) * ex) / den;
  })();
  const Q = { x: P.x + dR1.x * t, y: P.y + dR1.y * t };
  const outR = { x: Math.cos(half), y: -Math.sin(half) };
  const dOut = (() => { const a = rad(r.e), nx = outR.x, ny = outR.y; return { x: nx * Math.cos(a) - ny * Math.sin(a), y: nx * Math.sin(a) + ny * Math.cos(a) }; })();
  const end = { x: Q.x + dOut.x * 220, y: Q.y + dOut.y * 220 };
  const lo = iMin(p.n, p.A);
  const curve = Array.from({ length: 60 }, (_, k) => lo + ((85 - lo) * k) / 59).map(i => ({ i, d: deviationAt(p.n, p.A, i)?.d })).filter((x): x is { i: number; d: number } => x.d !== undefined);
  const dm = minDeviation(p.n, p.A);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ray through a ${p.A} degree prism`}>
      <polygon points={`${apex.x},${apex.y} ${L.x},${L.y} ${R.x},${R.y}`} className="lb-glass" />
      <text className="lb-sm" x={apex.x} y={apex.y - 10} textAnchor="middle">A = {fmt(p.A, 0)}°</text>
      <line className="lb-axis" x1={P.x - outL.x * 60} y1={P.y - outL.y * 60} x2={P.x + outL.x * 60} y2={P.y + outL.y * 60} />
      <path d={`M${start.x} ${start.y} L${P.x} ${P.y} L${Q.x} ${Q.y} L${end.x} ${end.y}`} className="lb-ray" />
      <line className="lb-axis" x1={P.x} y1={P.y} x2={P.x + dIn.x * 300} y2={P.y + dIn.y * 300} />
      <text className="lb-sm" x={start.x - 10} y={start.y - 8}>i = {fmt(p.i, 0)}°</text>
      {!conceal && <text className="lb-sm" x={end.x} y={end.y + 18} textAnchor="end">e = {fmt(r.e, 1)}°, δ = {fmt(r.d, 1)}°</text>}
      <Graph x={600} y={60} w={340} h={300} xLabel="i (°)" yLabel="δ (°)" xMax={90} yMax={90}
        points={conceal ? [] : [{ x: p.i, y: r.d }]} line={{ path: curve.map(c => ({ x: c.i, y: c.d })) }} hideLine={conceal} />
      {!conceal && <>
        <line className="lb-eq" x1={600} x2={940} y1={60 + 300 - (dm / 90) * 300} y2={60 + 300 - (dm / 90) * 300} />
        <text className="lb-sm" x={940} y={60 + 300 - (dm / 90) * 300 - 8} textAnchor="end">δₘ = {fmt(dm, 1)}°</text>
      </>}
    </svg>
  );
}
