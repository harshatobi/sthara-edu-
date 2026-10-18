'use client';

import { fmt } from '@/lib/lab/types';

/** A nice round top for an axis (12 → 15, 0.37 → 0.4). */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
}

/**
 * A small graph inside a lab SVG: axes from zero, gridlines, plotted points
 * (readings) and an optional line (the law they follow). Points beyond
 * `shown` are not drawn yet, so a run can plot them one by one.
 */
export function Graph({ x, y, w, h, xLabel, yLabel, xMax, yMax, points, line, shown, hideLine }: {
  x: number; y: number; w: number; h: number;
  xLabel: string; yLabel: string; xMax: number; yMax: number;
  points: { x: number; y: number }[];
  /** y = slope · x through the origin, or a free polyline. */
  line?: { slope: number } | { path: { x: number; y: number }[] };
  shown?: number;
  hideLine?: boolean;
}) {
  const X = (v: number) => x + (w * v) / xMax, Y = (v: number) => y + h - (h * v) / yMax;
  const pts = points.slice(0, shown ?? points.length);
  const ticks = [0.25, 0.5, 0.75, 1];
  return (
    <g>
      {ticks.map(f => <line key={`gx${f}`} className="lb-grid" x1={x} x2={x + w} y1={Y(yMax * f)} y2={Y(yMax * f)} />)}
      {ticks.map(f => <line key={`gy${f}`} className="lb-grid" x1={X(xMax * f)} x2={X(xMax * f)} y1={y} y2={y + h} />)}
      <line className="lb-tick" x1={x} y1={y + h} x2={x + w} y2={y + h} />
      <line className="lb-tick" x1={x} y1={y + h} x2={x} y2={y} />
      {[0.5, 1].map(f => <text key={`ty${f}`} className="lb-sm" x={x - 8} y={Y(yMax * f) + 4} textAnchor="end">{fmt(yMax * f, 2)}</text>)}
      {[0.5, 1].map(f => <text key={`tx${f}`} className="lb-sm" x={X(xMax * f)} y={y + h + 18} textAnchor="middle">{fmt(xMax * f, 2)}</text>)}
      <text className="lb-sm" x={x - 8} y={y + h + 4} textAnchor="end">0</text>
      <text className="lb-lbl" x={x} y={y - 10}>{yLabel}</text>
      <text className="lb-lbl" x={x + w} y={y + h + 40} textAnchor="end">{xLabel}</text>
      {line && !hideLine && ('slope' in line
        ? <line className="lb-curve" x1={X(0)} y1={Y(0)} x2={X(Math.min(xMax, yMax / Math.max(line.slope, 1e-9)))} y2={Y(Math.min(yMax, xMax * line.slope))} />
        : <path className="lb-curve" d={line.path.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)} ${Y(q.y).toFixed(1)}`).join(' ')} />)}
      {pts.map((q, i) => <circle key={i} cx={X(q.x)} cy={Y(q.y)} r={6} fill="#E11D48" stroke="#fff" strokeWidth={2} />)}
    </g>
  );
}
