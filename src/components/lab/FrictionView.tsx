'use client';

import { downForce, G, KEEP, limitingFriction, rollingPull, type FrictionParams } from '@/lib/lab/engines/friction';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const rad = (d: number) => (d * Math.PI) / 180;

export default function FrictionView({ params: p, conceal, runKey }: ViewProps<FrictionParams>) {
  const k = useRun(runKey, conceal, 3500);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Friction: ${p.mode}`}>
      {p.mode === 'incline' ? <Incline p={p} conceal={conceal} /> : p.mode === 'double' ? <Double p={p} k={k} conceal={conceal} /> : <Board p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Board({ p, k, conceal }: { p: FrictionParams; k: number; conceal: boolean }) {
  const s = limitingFriction(p), roll = p.mode === 'roll';
  // The pan fills up to the limiting load, then the block starts to move.
  const pull = roll ? rollingPull(p) : s.pull;
  const shown = conceal ? 0 : Math.min(1, k / 0.7) * pull;
  const moved = conceal ? 0 : Math.max(0, (k - 0.7) / 0.3) ** 2 * 120;
  const y = 230, bx = 120 + moved;
  const R = [0, 200, 400, 600, 800].map(l => ((p.m + l) / 1000) * G);
  return (
    <g>
      <rect x={60} y={y} width={500} height={16} fill="#C9D6E8" stroke="#002147" />
      <circle cx={572} cy={y + 2} r={14} fill="#F7F9FB" stroke="#002147" strokeWidth={2} />
      {roll
        ? <circle cx={bx + 50} cy={y - 40} r={40} fill="#F59E0B" stroke="#002147" strokeWidth={2} />
        : <rect x={bx} y={y - 60} width={110} height={60} rx={4} fill="#B45309" stroke="#002147" strokeWidth={2} />}
      {p.load > 0 && <rect x={bx + 30} y={y - (roll ? 80 : 60) - 26} width={50} height={26} rx={3} fill="#9AA6B8" />}
      <line x1={bx + (roll ? 90 : 110)} y1={y - (roll ? 40 : 30)} x2={572} y2={y - 12} stroke="#002147" strokeWidth={1.5} />
      <line x1={586} y1={y + 2} x2={586} y2={y + 110 + moved * 0.3} stroke="#002147" strokeWidth={1.5} />
      <path d={`M556 ${y + 110 + moved * 0.3} h60 l-8 18 h-44 z`} fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <text className="lb-sm" x={586} y={y + 150 + moved * 0.3} textAnchor="middle">{fmt(shown, 0)} g wt</text>
      <text className="lb-lbl" x={60} y={60}>{roll ? 'Roller' : 'Block'} {fmt(p.m, 0)} g + load {fmt(p.load, 0)} g · R = {fmt(s.R, 2)} N</text>
      {!conceal && k > 0.7 && <text className="lb-lbl" x={60} y={88} fill="#E11D48">{roll ? 'Keeps rolling' : 'Starts to slide'} at {fmt(pull, 0)} g wt</text>}
      {!roll && <Graph x={680} y={70} w={270} h={280} xLabel="R (N)" yLabel="F (N)" xMax={niceMax(R[4])} yMax={niceMax(R[4] * s.mu)} points={conceal ? [] : R.map(r => ({ x: r, y: r * s.mu }))} line={{ slope: s.mu }} hideLine={conceal} />}
    </g>
  );
}

function Incline({ p, conceal }: { p: FrictionParams; conceal: boolean }) {
  const a = rad(p.angle), x0 = 80, y0 = 400, len = 460;
  const top = { x: x0 + len * Math.cos(a), y: y0 - len * Math.sin(a) };
  const rc = { x: x0 + 0.55 * len * Math.cos(a) - 34 * Math.sin(a), y: y0 - 0.55 * len * Math.sin(a) - 34 * Math.cos(a) };
  const F = downForce(p.m, p.angle), mg = (p.m / 1000) * G, sc = 110 / Math.max(mg, 0.5);
  const angles = [10, 20, 30, 40, 50];
  return (
    <g>
      <polygon points={`${x0},${y0} ${top.x},${y0} ${top.x},${top.y}`} fill="#E8EDF4" stroke="#002147" strokeWidth={2} />
      <text className="lb-sm" x={x0 + 70} y={y0 - 10}>θ = {fmt(p.angle, 0)}°</text>
      <circle cx={rc.x} cy={rc.y} r={34} fill="#F59E0B" stroke="#002147" strokeWidth={2} />
      <line x1={rc.x} y1={rc.y} x2={top.x - 10 * Math.cos(a)} y2={top.y - 34 * Math.cos(a)} stroke="#002147" strokeWidth={1.5} />
      {!conceal && <>
        <line x1={rc.x} y1={rc.y} x2={rc.x} y2={rc.y + mg * sc} stroke="#E11D48" strokeWidth={4} />
        <text className="lb-sm" x={rc.x + 6} y={rc.y + mg * sc} fill="#E11D48">mg</text>
        <line x1={rc.x} y1={rc.y} x2={rc.x - F * sc * Math.cos(a)} y2={rc.y + F * sc * Math.sin(a)} stroke="#2F6BFF" strokeWidth={4} />
        <text className="lb-sm" x={rc.x - F * sc * Math.cos(a) - 6} y={rc.y + F * sc * Math.sin(a) + 18} textAnchor="end" fill="#2F6BFF">mg sin θ = {fmt(F, 2)} N</text>
      </>}
      <Graph x={680} y={70} w={270} h={280} xLabel="sin θ" yLabel="F (N)" xMax={1} yMax={niceMax(mg)} points={conceal ? [] : angles.map(d => ({ x: Math.sin(rad(d)), y: downForce(p.m, d) }))} line={{ slope: mg }} hideLine={conceal} />
    </g>
  );
}

function Double({ p, k, conceal }: { p: FrictionParams; k: number; conceal: boolean }) {
  const a = rad(p.angle), cx = 480, base = 400;
  const h0 = 200 * Math.min(1, 420 * Math.tan(a) / 200); // 20 cm, scaled down so a shallow plane still fits
  const run = h0 / Math.tan(a);
  const L = { x: cx - run, y: base - h0 }, R = { x: cx + run, y: base - h0 };
  // Down the left side, then up the right to KEEP × the height.
  const pos = conceal ? 0 : k;
  const hNow = pos < 0.5 ? h0 * (1 - pos * 2) : h0 * KEEP * ((pos - 0.5) * 2);
  const ball = { x: pos < 0.5 ? cx - hNow / Math.tan(a) : cx + hNow / Math.tan(a), y: base - hNow - 14 };
  return (
    <g>
      <path d={`M${Math.max(20, L.x - 40)} ${L.y - 40 * Math.tan(a)} L${cx} ${base} L${Math.min(980, R.x + 40)} ${R.y - 40 * Math.tan(a)}`} fill="none" stroke="#002147" strokeWidth={5} />
      <line className="lb-eq" x1={40} x2={960} y1={base - h0} y2={base - h0} />
      <text className="lb-sm" x={44} y={base - h0 - 8}>release height 20 cm</text>
      {!conceal && <><line className="lb-axis" x1={cx} x2={960} y1={base - h0 * KEEP} y2={base - h0 * KEEP} /><text className="lb-sm" x={956} y={base - h0 * KEEP + 18} textAnchor="end">rises to {fmt(KEEP * 20, 1)} cm</text></>}
      <circle cx={ball.x} cy={ball.y} r={14} fill="#E11D48" stroke="#002147" strokeWidth={2} />
      <text className="lb-lbl" x={40} y={50}>Double inclined plane, {fmt(p.angle, 0)}° each side</text>
    </g>
  );
}
