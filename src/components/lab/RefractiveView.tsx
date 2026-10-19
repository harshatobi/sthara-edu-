'use client';

import { apparentDepth, lateralShift, liquidLens, mirrorLiquid, type RefractiveParams } from '@/lib/lab/engines/refractive';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const rad = (d: number) => (d * Math.PI) / 180;

export default function RefractiveView({ params: p, conceal, runKey }: ViewProps<RefractiveParams>) {
  const k = useRun(runKey, conceal, 3000);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Refractive index: ${p.mode}`}>
      {p.mode === 'microscope' ? <Microscope p={p} k={k} conceal={conceal} /> : p.mode === 'slab' ? <Slab p={p} conceal={conceal} /> : <Needle p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Microscope({ p, k, conceal }: { p: RefractiveParams; k: number; conceal: boolean }) {
  const base = 420, px = Math.min(50, 220 / p.t), slabTop = base - p.t * px, app = apparentDepth(p.t, p.n);
  // Three focusings: mark, mark through the slab, powder on top.
  const stage = conceal ? 0 : Math.min(2, Math.floor(k * 3));
  const focusY = [base, base - (p.t - app) * px, slabTop][stage];
  const R1 = 5;
  const reads = [R1, R1 + p.t - app, R1 + p.t];
  return (
    <g>
      <rect x={140} y={base} width={300} height={16} fill="#9AA6B8" />
      <line x1={270} x2={310} y1={base - 1} y2={base - 1} stroke="#E11D48" strokeWidth={4} />
      {stage >= 1 && <rect x={180} y={slabTop} width={220} height={p.t * px} className="lb-glass" />}
      {stage >= 2 && <rect x={260} y={slabTop - 4} width={60} height={4} fill="#556378" />}
      {stage === 1 && <line className="lb-eq" x1={160} x2={420} y1={base - (p.t - app) * px} y2={base - (p.t - app) * px} />}
      {/* Microscope tube, focused a fixed working distance above the point it sees */}
      <rect x={270} y={focusY - 150} width={40} height={90} rx={6} fill="#C9D6E8" stroke="#002147" strokeWidth={2} />
      <rect x={278} y={focusY - 60} width={24} height={24} fill="#556378" />
      <line x1={460} x2={460} y1={60} y2={base} stroke="#002147" strokeWidth={3} />
      <line x1={312} x2={460} y1={focusY - 110} y2={focusY - 110} className="lb-axis" />
      <g transform="translate(560 100)">
        <text className="lb-lbl" x={0} y={0}>Travelling microscope, LC 0.001 cm</text>
        {['Mark on the base: R₁', 'Mark through the slab: R₂', 'Powder on top: R₃'].map((t, i) => <text key={t} className="lb-sm" x={0} y={40 + i * 28} fill={i === stage && !conceal ? '#E11D48' : undefined}>{t} {i <= stage && !conceal ? `= ${fmt(reads[i], 3)} cm` : ''}</text>)}
        {!conceal && stage === 2 && <text className="lb-lbl" x={0} y={160} fill="#E11D48">n = (R₃ − R₁)/(R₃ − R₂) = {fmt(p.n, 2)}</text>}
      </g>
    </g>
  );
}

function Needle({ p, k, conceal }: { p: RefractiveParams; k: number; conceal: boolean }) {
  const lens = p.mode === 'lens-liquid';
  const s = lens ? liquidLens(p.f1, p.n) : null;
  const before = lens ? p.f1 : p.R, after = lens ? s!.F : mirrorLiquid(p.R, p.n);
  const withLiquid = !conceal && k > 0.4;
  const h = withLiquid ? after : before;
  const base = 420, px = Math.min(8, 340 / Math.max(before, after));
  return (
    <g>
      {lens ? <>
        <rect x={200} y={base} width={240} height={10} fill="#9AA6B8" />
        {withLiquid && <path d={`M260 ${base} Q 320 ${base - 14} 380 ${base} Z`} fill="#2F6BFF" opacity={0.5} />}
        <path d={`M250 ${base - 4} Q 320 ${base - 40} 390 ${base - 4} Q 320 ${base + 4} 250 ${base - 4} Z`} className="lb-glass" />
      </> : <>
        <path d={`M220 ${base - 40} Q 320 ${base + 20} 420 ${base - 40}`} className="lb-mirror" />
        {withLiquid && <path d={`M240 ${base - 26} Q 320 ${base + 14} 400 ${base - 26} Z`} fill="#2F6BFF" opacity={0.5} />}
      </>}
      <line x1={320} x2={320} y1={base - h * px} y2={base - h * px - 50} stroke="#E11D48" strokeWidth={3} />
      <circle cx={320} cy={base - h * px} r={4} fill="#E11D48" />
      <line className="lb-axis" x1={470} x2={470} y1={base} y2={base - h * px} />
      <text className="lb-sm" x={480} y={base - (h * px) / 2}>{conceal ? '?' : `${fmt(h, 1)} cm`}</text>
      <text className="lb-lbl" x={560} y={100}>{lens ? 'Convex lens on a plane mirror' : 'Concave mirror'}</text>
      <text className="lb-sm" x={560} y={130}>needle and image coincide (no parallax)</text>
      {!conceal && <g transform="translate(560 170)">
        <text className="lb-sm" x={0} y={0}>{lens ? `lens alone: f₁ = ${fmt(p.f1, 1)} cm` : `without liquid: R = ${fmt(p.R, 1)} cm`}</text>
        {withLiquid && <text className="lb-sm" x={0} y={28}>{lens ? `with liquid: F = ${fmt(s!.F, 1)} cm` : `with liquid: R' = ${fmt(after, 1)} cm`}</text>}
        {withLiquid && k >= 1 && <text className="lb-lbl" x={0} y={70} fill="#E11D48">n = {fmt(lens ? 1 + s!.R / Math.abs(s!.fl) : p.R / after, 2)}</text>}
      </g>}
    </g>
  );
}

function Slab({ p, conceal }: { p: RefractiveParams; conceal: boolean }) {
  const s = lateralShift(p.t, p.n, p.i), px = Math.min(60, 200 / p.t);
  const top = 160, bottom = top + p.t * px, x = 360;
  const inc = { x: x - Math.tan(rad(p.i)) * 140, y: top - 140 };
  const exitX = x + Math.tan(rad(s.r)) * p.t * px;
  const out = { x: exitX + Math.tan(rad(p.i)) * 140, y: bottom + 140 };
  return (
    <g>
      <rect x={120} y={top} width={560} height={p.t * px} className="lb-glass" />
      <line className="lb-axis" x1={x} x2={x} y1={top - 120} y2={bottom + 40} />
      <path d={`M${inc.x} ${inc.y} L${x} ${top} L${exitX} ${bottom} L${out.x} ${out.y}`} className="lb-ray" />
      <path d={`M${x} ${top} L${x + Math.tan(rad(p.i)) * (p.t * px + 140)} ${bottom + 140}`} className="lb-ray lb-virtual" />
      <text className="lb-sm" x={inc.x} y={inc.y - 8}>i = {fmt(p.i, 0)}°</text>
      {!conceal && <text className="lb-lbl" x={720} y={200}>lateral shift d = {fmt(s.d, 2)} cm</text>}
      {!conceal && <text className="lb-sm" x={720} y={228}>r = {fmt(s.r, 1)}° · emergent ray parallel to incident</text>}
    </g>
  );
}
