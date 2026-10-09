'use client';

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Attendance-style trend charts: one series, a percentage by week, with a reference line (75% for CBSE).
 * Empty weeks are gaps, never zeros. TrendChart is the full chart (crosshair + tooltip, keyboard, a table for
 * screen readers); Sparkline is the inline version for a row.
 */
export interface Pt { label: string; value: number | null; note?: string }

/** Week-by-week points (from lib/attendance/register weeklyTrend), labelled by each week's Monday. */
export const weeklyPts = (t: { week: string; pct: number | null; marked: number }[]): Pt[] => t.map(p => ({
  label: new Date(`${p.week}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  value: p.pct, note: p.marked ? `${p.marked} marks` : undefined,
}));

const W = 640, H = 200, PAD = { l: 34, r: 12, t: 12, b: 26 };

function scale(points: Pt[], ref: number, w: number, h: number, pad: typeof PAD) {
  const vals = points.flatMap(p => (p.value === null ? [] : [p.value]));
  const lo = Math.max(0, Math.min(ref - 10, ...vals.map(v => v - 5)));
  const floor = Math.floor(lo / 10) * 10;
  const x = (i: number) => pad.l + (points.length < 2 ? (w - pad.l - pad.r) / 2 : (i * (w - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((100 - v) * (h - pad.t - pad.b)) / (100 - floor || 1);
  return { x, y, floor };
}

/** Line segments that break at null values. */
function paths(points: Pt[], x: (i: number) => number, y: (v: number) => number) {
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  return segs;
}

export function TrendChart({ points, refValue = 75, refLabel = '75% (CBSE)', title, unit = '%' }: { points: Pt[]; refValue?: number; refLabel?: string; title: string; unit?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { x, y, floor } = scale(points, refValue, W, H, PAD);
  const ticks = [floor, Math.round((floor + 100) / 2 / 5) * 5, 100].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const has = points.some(p => p.value !== null);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover(h => Math.max(0, Math.min(points.length - 1, (h ?? points.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const hp = hover !== null ? points[hover] : null;

  return (
    <figure className="tl" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="sr">{title}. Use the left and right arrow keys to read each week. A table follows.</figcaption>
      {!has ? <p className="muted" style={{ padding: '30px 0', textAlign: 'center' }}>No marks yet to draw a trend.</p> : (
        <div className="tl-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} tabIndex={0} onPointerMove={pick} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setHover(null)}>
            {ticks.map(v => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="tl-grid" />
                <text x={PAD.l - 6} y={y(v) + 3.5} className="tl-ax" textAnchor="end">{v}</text>
              </g>
            ))}
            <line x1={PAD.l} x2={W - PAD.r} y1={y(refValue)} y2={y(refValue)} className="tl-ref" />
            <text x={W - PAD.r} y={y(refValue) - 5} className="tl-ref-t" textAnchor="end">{refLabel}</text>
            {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
              <text key={i} x={x(i)} y={H - 8} className="tl-ax" textAnchor="middle">{p.label}</text>
            ))}
            {paths(points, x, y).map((d, i) => <path key={i} d={d} className="tl-line" />)}
            {points.map((p, i) => p.value !== null && (points.length <= 16 || i === points.length - 1 || hover === i) && (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 3.5} className={`tl-pt ${p.value < refValue ? 'low' : ''}`} />
            ))}
            {hp && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} className="tl-cross" />}
          </svg>
          {hp && (
            <div className="tl-tip" style={{ left: `${(x(hover!) / W) * 100}%` }} role="status">
              <b>{hp.value === null ? 'No marks' : `${hp.value}${unit}`}</b>
              <span>{hp.label}{hp.note ? ` · ${hp.note}` : ''}</span>
              {hp.value !== null && hp.value < refValue && <em>Below {refValue}{unit}</em>}
            </div>
          )}
        </div>
      )}
      <table className="sr">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Week</th><th scope="col">Attendance</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.value === null ? 'no marks' : `${p.value}${unit}`}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** A row-sized trend: line, reference line, last point. */
export function Sparkline({ points, refValue = 75, label, w = 96, h = 26 }: { points: Pt[]; refValue?: number; label: string; w?: number; h?: number }) {
  const pad = { l: 2, r: 4, t: 4, b: 4 };
  const vals = points.filter(p => p.value !== null);
  if (vals.length < 2) return <span className="spk-none" aria-label={`${label}: not enough weeks yet`}>–</span>;
  const { x, y } = scale(points, refValue, w, h, pad);
  const lastI = points.map(p => p.value !== null).lastIndexOf(true);
  const first = vals[0].value!, last = vals[vals.length - 1].value!;
  return (
    <svg className="spk" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`${label}: ${first}% to ${last}% over ${vals.length} weeks`}>
      <title>{`${label}: ${points.map(p => `${p.label} ${p.value === null ? '–' : `${p.value}%`}`).join(', ')}`}</title>
      <line x1={pad.l} x2={w - pad.r} y1={y(refValue)} y2={y(refValue)} className="spk-ref" />
      {paths(points, x, y).map((d, i) => <path key={i} d={d} className="spk-line" />)}
      <circle cx={x(lastI)} cy={y(points[lastI].value!)} r={2.6} className={`spk-pt ${points[lastI].value! < refValue ? 'low' : ''}`} />
    </svg>
  );
}
