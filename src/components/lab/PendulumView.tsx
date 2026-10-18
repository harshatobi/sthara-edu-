'use client';

import { G, heightAt, solvePendulum, type PendulumParams } from '@/lib/lab/engines/pendulum';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The pendulum swings (slowed down) through two full oscillations; the bars show PE turning into KE and back. */
export default function PendulumView({ params: p, conceal, runKey }: ViewProps<PendulumParams>) {
  const s = solvePendulum(p);
  const k = useRun(runKey, conceal, 6000);
  // Two oscillations; the bob starts at the release angle (cos form, small-angle motion).
  const phi = conceal ? p.angle : p.angle * Math.cos(2 * Math.PI * 2 * k);
  const scale = 300 / 150, L = p.len * scale;
  const px = 330, py = 60, rad = (d: number) => (d * Math.PI) / 180;
  const bx = px + L * Math.sin(rad(phi)), by = py + L * Math.cos(rad(phi));
  const lowY = py + L, hY = (h: number) => lowY - h * 100 * scale;
  const h = heightAt(p, phi), m = p.m / 1000;
  const pe = m * G * h, ke = Math.max(0, s.pe - pe);
  const bar = (x: number, val: number, label: string, colour: string) => (
    <g>
      <rect x={x} y={90} width={64} height={300} rx={8} fill="#F2F5F9" />
      <rect x={x} y={390 - (300 * val) / s.pe} width={64} height={(300 * val) / s.pe} rx={8} fill={colour} />
      <text className="lb-lbl" x={x + 32} y={416} textAnchor="middle">{label}</text>
      {!conceal && <text className="lb-sm" x={x + 32} y={436} textAnchor="middle">{fmt(val * 1000, 1)} mJ</text>}
    </g>
  );
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.len} centimetre pendulum released at ${p.angle} degrees`}>
      <rect x={px - 90} y={py - 14} width={180} height={14} fill="#C9D6E8" />
      <line className="lb-axis" x1={px} x2={px} y1={py} y2={lowY + 20} />
      {/* Release height, marked on both sides */}
      <line className="lb-eq" x1={px - L - 20} x2={px + L + 20} y1={hY(s.h)} y2={hY(s.h)} />
      <text className="lb-sm" x={px + L * Math.sin(rad(p.angle)) + 30} y={hY(s.h) - 8}>{fmt(s.h * 100, 1)} cm above the lowest point</text>
      <line className="lb-tick" x1={px - 40} x2={px + 40} y1={lowY + 18} y2={lowY + 18} />
      <text className="lb-sm" x={px} y={lowY + 38} textAnchor="middle">lowest point</text>
      <line x1={px} y1={py} x2={bx} y2={by} stroke="#002147" strokeWidth={2.5} />
      <circle cx={bx} cy={by} r={10 + Math.min(14, p.m / 40)} fill="#E11D48" stroke="#002147" strokeWidth={2} />
      <text className="lb-lbl" x={40} y={40}>{fmt(p.len, 0)} cm · released at {fmt(p.angle, 0)}°</text>
      {!conceal && <text className="lb-lbl" x={600} y={40}>speed {fmt(Math.sqrt(2 * G * Math.max(0, s.h - h)), 2)} m/s</text>}
      {bar(640, conceal ? s.pe : pe, 'PE', '#2F6BFF')}
      {bar(740, conceal ? 0 : ke, 'KE', '#F59E0B')}
      {bar(840, s.pe, 'Total', '#10B981')}
    </svg>
  );
}
