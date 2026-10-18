'use client';

import { solveSlab, type SlabParams } from '@/lib/lab/engines/slab';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Top view of the slab on paper, as students draw it: incident ray with pins,
 * normals at both faces, the ray inside, and the emergent ray with the
 * incident line continued (dashed) to show the sideways shift.
 */
export default function SlabView({ params: p, conceal }: ViewProps<SlabParams>) {
  const s = solveSlab(p);
  const px = 34; // px per cm: the thickest slab (8 cm) and its emergent ray still fit
  const top = 110, bot = top + p.t * px, left = 300, right = 700;
  // Incidence point O on the top face; light comes down from the upper left.
  const ox = 470;
  const inLen = 100;
  const ax = ox - inLen * Math.sin(rad(p.i)), ay = top - inLen * Math.cos(rad(p.i));
  const bx = ox + (bot - top) * Math.tan(rad(s.r));
  const outLen = 70;
  const cx = bx + outLen * Math.sin(rad(p.i)), cy = bot + outLen * Math.cos(rad(p.i));
  const ext = { x: ox + (bot - top + outLen) * Math.tan(rad(p.i)), y: bot + outLen };
  const arc = (x: number, y: number, from: number, to: number, r: number, down: boolean) => {
    const s1 = { x: x + r * Math.sin(rad(from)), y: y + (down ? 1 : -1) * r * Math.cos(rad(from)) };
    const s2 = { x: x + r * Math.sin(rad(to)), y: y + (down ? 1 : -1) * r * Math.cos(rad(to)) };
    return `M${s1.x} ${s1.y} A${r} ${r} 0 0 ${(to > from) === down ? 0 : 1} ${s2.x} ${s2.y}`;
  };
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ray entering a glass slab at ${p.i} degrees`}>
      <rect className="lb-glass" x={left} y={top} width={right - left} height={bot - top} />
      <text className="lb-sm" x={right + 10} y={top + 16}>glass, n = {fmt(p.n, 2)}</text>
      <text className="lb-sm" x={right + 10} y={top + 34}>{fmt(p.t, 1)} cm thick</text>
      {/* Normals */}
      <line className="lb-axis" x1={ox} x2={ox} y1={top - 95} y2={top + 60} />
      <line className="lb-axis" x1={bx} x2={bx} y1={bot - 60} y2={bot + 70} />
      {/* Incident ray with two pins */}
      <line className="lb-ray" x1={ax} y1={ay} x2={ox} y2={top} />
      {[0.35, 0.75].map(f => <circle key={f} cx={ax + (ox - ax) * f} cy={ay + (top - ay) * f} r={6} fill="#002147" />)}
      {/* Inside and emergent */}
      {!conceal && <line className="lb-ray" x1={ox} y1={top} x2={bx} y2={bot} />}
      {!conceal && <line className="lb-ray" x1={bx} y1={bot} x2={cx} y2={cy} />}
      {!conceal && p.i > 0 && <line className="lb-ray lb-virtual" x1={ox} y1={top} x2={ext.x} y2={ext.y} />}
      {!conceal && p.i > 0 && <>
        <path d={arc(ox, top, -p.i, 0, 50, false)} fill="none" stroke="#002147" strokeWidth={1.5} />
        <text className="lb-sm" x={ox + 12} y={top - 60}>i = {fmt(p.i, 0)}°</text>
        <path d={arc(ox, top, 0, s.r, 60, true)} fill="none" stroke="#002147" strokeWidth={1.5} />
        <text className="lb-sm" x={ox + 14} y={top + 78}>r = {fmt(s.r, 1)}°</text>
        <path d={arc(bx, bot, 0, p.i, 50, true)} fill="none" stroke="#002147" strokeWidth={1.5} />
        <text className="lb-sm" x={bx + 24} y={bot + 70}>e = {fmt(p.i, 0)}°</text>
      </>}
      <text className="lb-lbl" x={40} y={50}>Ray through a glass slab (top view)</text>
      {!conceal && p.i > 0 && <text className="lb-lbl" x={960} y={50} textAnchor="end">lateral shift {fmt(s.shift * 10, 1)} mm</text>}
    </svg>
  );
}
