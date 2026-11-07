'use client';

import { ArrowDownRightIcon as ArrowDownRight } from '@phosphor-icons/react/dist/ssr/ArrowDownRight';
import { ArrowUpRightIcon as ArrowUpRight } from '@phosphor-icons/react/dist/ssr/ArrowUpRight';
import { hmColor } from '@/components/canon/ui';
import type { Pt } from '@/components/canon/TrendLine';
import type { Series, Spread } from '@/lib/teacher/masteryTrend';

export const initials = (n: string) => n.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const firstName = (n: string) => n.split(' ')[0];

const monthDay = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
/** Series -> chart points labelled by week. */
export const pts = (s: Series, weeks: string[]): Pt[] => s.map((v, i) => ({ label: monthDay(weeks[i]), value: v }));

/** "+6" / "−4" / "0" with an arrow; null renders an en dash (not enough weeks). */
export function Delta({ v, title = 'Change over the last 4 weeks' }: { v: number | null; title?: string }) {
  if (v === null) return <span className="ms-delta none" title={`${title}: not enough weeks yet`}>New</span>;
  const cls = v >= 2 ? 'up' : v <= -2 ? 'down' : 'flat';
  const Icon = cls === 'up' ? ArrowUpRight : cls === 'down' ? ArrowDownRight : null;
  return (
    <span className={`ms-delta ${cls}`} title={title}>
      {Icon && <Icon size={13} weight="bold" aria-hidden />}{v > 0 ? '+' : v < 0 ? '−' : ''}{Math.abs(v)}
      <span className="sr"> points {title.toLowerCase()}</span>
    </span>
  );
}

/** Score as a coloured number (red / amber / green heat bands). */
export function Score({ v, size = 15 }: { v: number | null; size?: number }) {
  return v === null
    ? <span className="ms-score none" style={{ fontSize: Math.min(size, 13) }}>Not yet</span>
    : <b className="ms-score" style={{ fontSize: size, color: hmColor(v) }}>{v}%</b>;
}

/**
 * The class on one chapter: every classmate as a dot on 0–100, the middle half as a band, the average as a line,
 * and this student as the large dot.
 */
export function DotStrip({ values, me, sp, label }: { values: number[]; me: number | null; sp: Spread | null; label: string }) {
  const W = 520, H = 64, L = 12, R = 12;
  const x = (v: number) => L + (v / 100) * (W - L - R);
  return (
    <svg className="ms-strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 40, 75, 100].map(t => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={14} y2={44} className="ms-strip-tick" />
          <text x={x(t)} y={60} textAnchor="middle" className="ms-strip-ax">{t}</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(100)} y1={29} y2={29} className="ms-strip-axis" />
      {sp && <rect x={x(sp.q1)} y={20} width={Math.max(2, x(sp.q3) - x(sp.q1))} height={18} rx={5} className="ms-strip-iqr" />}
      {values.map((v, i) => <circle key={i} cx={x(v)} cy={29} r={4} className="ms-strip-dot" style={{ fill: hmColor(v) }} />)}
      {sp && <line x1={x(sp.avg)} x2={x(sp.avg)} y1={10} y2={48} className="ms-strip-avg" />}
      {sp && <text x={x(sp.avg)} y={8} textAnchor="middle" className="ms-strip-ax">avg {sp.avg}</text>}
      {me !== null && <circle cx={x(me)} cy={29} r={9} className="ms-strip-me" style={{ fill: hmColor(me) }} />}
    </svg>
  );
}
