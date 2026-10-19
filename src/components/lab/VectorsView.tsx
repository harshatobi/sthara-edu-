'use client';

import { solveVectors, type VectorParams } from '@/lib/lab/engines/vectors';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Gravesand's apparatus with the parallelogram drawn on the strings: its diagonal stands straight up, as long as W. */
export default function VectorsView({ params: p, conceal, runKey }: ViewProps<VectorParams>) {
  const s = solveVectors(p);
  const k = useRun(runKey, conceal, 2500);
  const knot = { x: 430, y: 280 }, rad = (d: number) => (d * Math.PI) / 180;
  const scale = Math.min(0.42, 230 / p.W); // px per g wt, so the diagonal stays on the board
  const along = (a: number, len: number, side: -1 | 1) => ({ x: knot.x + side * Math.sin(rad(a)) * len, y: knot.y - Math.cos(rad(a)) * len });
  const pTip = along(s.alpha, p.P * scale, -1), qTip = along(s.beta, p.Q * scale, 1);
  const diag = { x: pTip.x + qTip.x - knot.x, y: pTip.y + qTip.y - knot.y };
  const pulleyL = along(s.alpha, 250, -1), pulleyR = along(s.beta, 250, 1);
  const show = !conceal && k > 0.3;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Parallelogram law of forces">
      <rect x={110} y={14} width={640} height={440} rx={6} fill="#FBFCFE" stroke="#C9D6E8" />
      {/* Strings over the pulleys, weights hanging */}
      {[{ pu: pulleyL, w: p.P, label: 'P' }, { pu: pulleyR, w: p.Q, label: 'Q' }].map(o => (
        <g key={o.label}>
          <line x1={knot.x} y1={knot.y} x2={o.pu.x} y2={o.pu.y} stroke="#002147" strokeWidth={2} />
          <circle cx={o.pu.x} cy={o.pu.y} r={14} fill="#C9D6E8" stroke="#002147" strokeWidth={2} />
          <line x1={o.pu.x + (o.label === 'P' ? -14 : 14)} y1={o.pu.y} x2={o.pu.x + (o.label === 'P' ? -14 : 14)} y2={o.pu.y + 110} stroke="#002147" strokeWidth={2} />
          <rect x={o.pu.x + (o.label === 'P' ? -34 : -6)} y={o.pu.y + 110} width={40} height={44} rx={5} fill="#9AA6B8" />
          <text className="lb-lbl" x={o.pu.x + (o.label === 'P' ? -14 : 14)} y={o.pu.y + 138} textAnchor="middle" fill="#fff">{o.label}</text>
        </g>
      ))}
      <line x1={knot.x} y1={knot.y} x2={knot.x} y2={knot.y + 110} stroke="#002147" strokeWidth={2} />
      <rect x={knot.x - 26} y={knot.y + 110} width={52} height={54} rx={6} fill="#F59E0B" />
      <text className="lb-lbl" x={knot.x} y={knot.y + 144} textAnchor="middle">W</text>
      {/* The parallelogram, drawn to scale */}
      {show && (
        <g opacity={Math.min(1, (k - 0.3) / 0.4)}>
          <line x1={knot.x} y1={knot.y} x2={pTip.x} y2={pTip.y} stroke="#2F6BFF" strokeWidth={5} />
          <line x1={knot.x} y1={knot.y} x2={qTip.x} y2={qTip.y} stroke="#10B981" strokeWidth={5} />
          <line x1={pTip.x} y1={pTip.y} x2={diag.x} y2={diag.y} className="lb-axis" />
          <line x1={qTip.x} y1={qTip.y} x2={diag.x} y2={diag.y} className="lb-axis" />
          <line x1={knot.x} y1={knot.y} x2={diag.x} y2={diag.y} stroke="#E11D48" strokeWidth={5} />
          <text className="lb-sm" x={diag.x + 10} y={diag.y - 6} fill="#E11D48">R = {fmt(Math.hypot(diag.x - knot.x, diag.y - knot.y) / scale, 0)} g wt</text>
        </g>
      )}
      <circle cx={knot.x} cy={knot.y} r={6} fill="#002147" />
      <g transform="translate(780 70)">
        <text className="lb-lbl" x={0} y={0}>P = {fmt(p.P, 0)} g wt</text>
        <text className="lb-lbl" x={0} y={30}>Q = {fmt(p.Q, 0)} g wt</text>
        <text className="lb-lbl" x={0} y={60}>W = {conceal ? '?' : `${fmt(p.W, 0)} g wt`}</text>
        <text className="lb-sm" x={0} y={100}>α = {fmt(s.alpha, 0)}° · β = {fmt(s.beta, 0)}°</text>
      </g>
    </svg>
  );
}
