'use client';

import { combined, solveBench, type BenchParams, type BenchSolution } from '@/lib/lab/engines/lensBench';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
const AXIS = 250;

/** The bench seen from the side: needles, the mirror or lens, and two rays that locate the image. */
export default function LensBenchView({ params: p, conceal, runKey }: ViewProps<BenchParams>) {
  const k = useRun(runKey, conceal, 1800);
  const s = solveBench(p) as Required<BenchSolution>;
  const mirror = p.device === 'concave-mirror' || p.device === 'convex-mirror';
  const span = p.device === 'concave-mirror' ? Math.max(p.u, s.v) + 20 : p.u + (s.v2 ?? s.v) + 20;
  const px = Math.min(5, 880 / span);
  const el = p.device === 'concave-mirror' ? 60 + span * px - 10 : 60 + p.u * px; // element's x
  const obj = p.device === 'concave-mirror' ? el - p.u * px : 60;
  const h = 50, img = { x: p.device === 'concave-mirror' ? el - s.v * px : el + s.v * px, h: Math.max(-140, -h * (s.v / p.u)) };
  const showImg = !conceal;
  const needle = (x: number, hh: number, colour: string, label: string, dashed = false) => (
    <g>
      <line x1={x} x2={x} y1={AXIS} y2={AXIS - hh} stroke={colour} strokeWidth={4} strokeDasharray={dashed ? '6 5' : undefined} />
      <polygon points={`${x - 7},${AXIS - hh + (hh > 0 ? 10 : -10)} ${x + 7},${AXIS - hh + (hh > 0 ? 10 : -10)} ${x},${AXIS - hh}`} fill={colour} />
      <text className="lb-sm" x={x} y={hh > 0 ? AXIS + 24 : AXIS - hh + 24} textAnchor="middle">{label}</text>
    </g>
  );
  const lensShape = (x: number, concave = false) => concave
    ? <path d={`M${x - 12} ${AXIS - 90} Q ${x} ${AXIS} ${x - 12} ${AXIS + 90} H${x + 12} Q ${x} ${AXIS} ${x + 12} ${AXIS - 90} Z`} className="lb-glass" />
    : <path d={`M${x} ${AXIS - 90} Q ${x + 22} ${AXIS} ${x} ${AXIS + 90} Q ${x - 22} ${AXIS} ${x} ${AXIS - 90} Z`} className="lb-glass" />;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Optical bench: ${p.device}`}>
      <line x1={30} x2={970} y1={AXIS} y2={AXIS} className="lb-axis" />
      <rect x={40} y={400} width={920} height={14} fill="#E8EDF4" stroke="#9AA6B8" />
      {Array.from({ length: Math.floor(span / 10) + 1 }, (_, i) => i * 10).map(c => <line key={c} x1={60 + c * px} x2={60 + c * px} y1={400} y2={408} stroke="#002147" />)}
      <text className="lb-sm" x={40} y={436}>bench, cm marks</text>
      {needle(obj, h, '#E11D48', `object, u = ${fmt(p.u, 0)} cm`)}
      {p.device === 'concave-mirror' && <path d={`M${el} ${AXIS - 100} Q ${el + 24} ${AXIS} ${el} ${AXIS + 100}`} className="lb-mirror" />}
      {(p.device === 'convex-lens' || p.device === 'convex-mirror' || p.device === 'concave-lens') && lensShape(el)}
      {p.device === 'combo' && <>{lensShape(el - 6)}{lensShape(el + 6)}</>}
      {/* Rays from the object tip to the image tip */}
      {showImg && !mirror && p.device !== 'concave-lens' && (
        <g opacity={k}>
          <path d={`M${obj} ${AXIS - h} L${el} ${AXIS - h} L${img.x} ${AXIS - img.h}`} className="lb-ray" />
          <path d={`M${obj} ${AXIS - h} L${img.x} ${AXIS - img.h}`} className="lb-ray" />
        </g>
      )}
      {showImg && p.device === 'concave-mirror' && (
        <g opacity={k}>
          <path d={`M${obj} ${AXIS - h} L${el} ${AXIS - h} L${img.x} ${AXIS - img.h}`} className="lb-ray" />
          <path d={`M${obj} ${AXIS - h} L${el} ${AXIS} L${img.x} ${AXIS - img.h}`} className="lb-ray" />
        </g>
      )}
      {p.device === 'convex-mirror' && (() => {
        const mx = el + s.x * px;
        return <g>
          <path d={`M${mx} ${AXIS - 90} Q ${mx - 20} ${AXIS} ${mx} ${AXIS + 90}`} className="lb-mirror" />
          {showImg && <line className="lb-eq" x1={el + s.v1 * px} x2={el + s.v1 * px} y1={AXIS - 120} y2={AXIS + 120} />}
          {showImg && <text className="lb-sm" x={el + s.v1 * px} y={AXIS - 128} textAnchor="middle">C of the mirror = lens image I</text>}
          {showImg && <text className="lb-sm" x={(mx + el + s.v1 * px) / 2} y={AXIS + 140} textAnchor="middle">R = {fmt(s.R, 1)} cm</text>}
        </g>;
      })()}
      {p.device === 'concave-lens' && (() => {
        const cx = el + s.d * px;
        return <g>
          {lensShape(cx, true)}
          {showImg && <>
            <line className="lb-eq" x1={el + s.v1 * px} x2={el + s.v1 * px} y1={AXIS - 100} y2={AXIS + 100} />
            <text className="lb-sm" x={el + s.v1 * px} y={AXIS - 108} textAnchor="middle">I₁</text>
            {needle(el + s.v2 * px, -h * 0.8, '#7C5CFC', `I₂ at ${fmt(s.v2, 1)} cm`)}
          </>}
        </g>;
      })()}
      {showImg && (p.device === 'concave-mirror' || p.device === 'convex-lens' || p.device === 'combo') && needle(img.x, img.h, '#7C5CFC', `image, v = ${fmt(s.v, 1)} cm`)}
      <text className="lb-lbl" x={40} y={40}>{p.device === 'combo' ? `f₁ = ${fmt(p.f, 0)} cm + f₂ = ${fmt(p.f2, 0)} cm in contact: F = ${conceal ? '?' : `${fmt(combined(p.f, p.f2), 1)} cm`}` : p.device === 'convex-mirror' ? `Convex lens f = ${fmt(p.f, 0)} cm with a convex mirror` : p.device === 'concave-lens' ? `Convex lens f = ${fmt(p.f, 0)} cm with a concave lens` : `${p.device === 'concave-mirror' ? 'Concave mirror' : 'Convex lens'}, f = ${fmt(p.f, 0)} cm`}</text>
    </svg>
  );
}
