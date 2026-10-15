'use client';

import { solveCollide, solvePush, type ForcesParams } from '@/lib/lab/engines/forces';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

function Arrow({ x1, x2, y, colour, label }: { x1: number; x2: number; y: number; colour: string; label?: string }) {
  if (Math.abs(x2 - x1) < 2) return null;
  const dir = x2 > x1 ? 1 : -1;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - dir * 14} y2={y} stroke={colour} strokeWidth={6} />
      <path d={`M${x2} ${y} l${-dir * 18} -11 v22 Z`} fill={colour} />
      {label && <text className="lb-lbl" x={(x1 + x2) / 2} y={y - 14} textAnchor="middle" style={{ fill: colour }}>{label}</text>}
    </g>
  );
}

export default function ForcesView(props: ViewProps<ForcesParams>) {
  return props.params.scenario === 'push' ? <Push {...props} /> : <Collide {...props} />;
}

/** A block pushed across a rough floor; the arrows are drawn to the engine's forces. */
function Push({ params: p, conceal, runKey }: ViewProps<ForcesParams>) {
  const r = solvePush(p);
  const k = useRun(runKey, conceal, 4000);
  const t = p.t * k, s = 0.5 * r.a * t * t;
  const track = Math.max(r.s, 1);
  const x = 200 + (520 * s) / track; // leaves room for a full-length push arrow at the start and friction at the end
  const fScale = 120 / Math.max(p.f, r.friction, 1);
  const size = 60 + Math.min(60, p.m1 * 1.6);
  const top = 330 - size;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pushing a ${p.m1} kilogram block with ${p.f} newtons`}>
      <rect x={40} y={330} width={920} height={16} fill="#C9D6E8" />
      {Array.from({ length: 46 }, (_, i) => <line key={i} x1={44 + i * 20} y1={346} x2={34 + i * 20} y2={362} stroke="#9AA6B8" strokeWidth={2} />)}
      <text className="lb-sm" x={40} y={390}>Floor: μ = {fmt(p.mu, 2)}{conceal ? '' : <tspan style={{ fill: '#B45309' }}> · friction (orange) {fmt(r.friction, 1)} N</tspan>}</text>
      <rect x={x - size / 2} y={top} width={size} height={size} rx={6} fill="#4C8DFF" stroke="#002147" strokeWidth={3} />
      <text className="lb-lbl" x={x} y={top + size / 2 + 6} textAnchor="middle" style={{ fill: '#fff' }}>{fmt(p.m1, 1)} kg</text>
      <Arrow x1={x - size / 2 - 10 - p.f * fScale} x2={x - size / 2 - 10} y={top + size / 2} colour="#E11D48" label={`Push ${fmt(p.f, 0)} N`} />
      {!conceal && <Arrow x1={x + size / 2 + 10 + r.friction * fScale} x2={x + size / 2 + 10} y={324} colour="#F59E0B" />}
      <text className="lb-lbl" x={40} y={50}>t = {fmt(t, 1)} s</text>
      {!conceal && <text className="lb-lbl" x={960} y={50} textAnchor="end">{r.moves ? `a = ${fmt(r.a, 2)} m/s² · v = ${fmt(r.a * t, 2)} m/s · s = ${fmt(s, 2)} m` : 'Forces balance: it stays at rest'}</text>}
    </svg>
  );
}

/** Two trolleys on a track: they close in, collide at the moment the engine says, and move off at its velocities. */
function Collide({ params: p, conceal, runKey }: ViewProps<ForcesParams>) {
  const r = solveCollide(p);
  const k = useRun(runKey, conceal, 4500);
  const w1 = 70 + Math.min(70, p.m1 * 2), w2 = 70 + Math.min(70, p.m2 * 2);
  const x1s = 240, x2s = 640; // starting centres (px)
  const gap = x2s - x1s - (w1 + w2) / 2;
  // Animation time: the collision happens 40% of the way through; px per (m/s × s) chosen to fit.
  const tc = 0.4;
  const closing = p.u1 - p.u2;
  const scale = r.meet ? gap / (tc * closing) : 60;
  let x1: number, x2: number;
  if (!r.meet || k <= tc) { x1 = x1s + p.u1 * scale * k; x2 = x2s + p.u2 * scale * k; }
  else { const a = k - tc; x1 = x1s + p.u1 * scale * tc + r.v1 * scale * a; x2 = x2s + p.u2 * scale * tc + r.v2 * scale * a; }
  const clamp = (x: number, w: number) => Math.max(40 + w / 2, Math.min(960 - w / 2, x));
  x1 = clamp(x1, w1); x2 = clamp(x2, w2);
  const after = r.meet && k > tc;
  const trolley = (x: number, w: number, m: number, label: string, colour: string) => (
    <g>
      <rect x={x - w / 2} y={250} width={w} height={60} rx={8} fill={colour} stroke="#002147" strokeWidth={3} />
      <circle cx={x - w / 2 + 18} cy={318} r={11} fill="#002147" /><circle cx={x + w / 2 - 18} cy={318} r={11} fill="#002147" />
      <text className="lb-lbl" x={x} y={287} textAnchor="middle" style={{ fill: '#fff' }}>{fmt(m, 1)} kg</text>
      <text className="lb-sm" x={x} y={236} textAnchor="middle">{label}</text>
    </g>
  );
  const vText = (v: number) => `${v > 0 ? '→' : v < 0 ? '←' : ''} ${fmt(Math.abs(v), 2)} m/s`;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trolleys of ${p.m1} and ${p.m2} kilograms colliding`}>
      <rect x={40} y={329} width={920} height={8} fill="#C9D6E8" />
      {trolley(x1, w1, p.m1, `Trolley 1 ${after ? vText(r.v1) : vText(p.u1)}`, '#2F6BFF')}
      {trolley(x2, w2, p.m2, `Trolley 2 ${after ? vText(r.v2) : vText(p.u2)}`, '#7C5CFC')}
      <text className="lb-lbl" x={40} y={60}>{after ? 'After the collision' : 'Before the collision'}</text>
      <text className="lb-lbl" x={960} y={60} textAnchor="end">Momentum {conceal && !after ? fmt(r.pBefore, 2) : fmt(after ? r.pAfter : r.pBefore, 2)} kg m/s</text>
      {!r.meet && !conceal && <text className="lb-lbl" x={500} y={420} textAnchor="middle">Trolley 2 moves away at least as fast: they never meet.</text>}
      {after && !conceal && <text className="lb-sm" x={500} y={420} textAnchor="middle">Kinetic energy {fmt(r.keBefore, 1)} J → {fmt(r.keAfter, 1)} J</text>}
    </svg>
  );
}
