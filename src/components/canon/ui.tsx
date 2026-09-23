/**
 * React ports of the Sthara 007 mockup's shared render helpers
 * (hmColor / bar / donut / .ch chips / .pbar header). Pair with
 * src/styles/canon.css — these render canon class names, not Tailwind.
 */
import type { ReactNode } from 'react';

export type Tone = 'g' | 'a' | 'r' | 'b' | 'p' | 'n';

/** Heat colour for a 0–100 score — identical thresholds to the mockup and the teacher heat map. */
export const hmColor = (v: number) =>
  v >= 75 ? '#10B981' : v >= 55 ? '#5FC79B' : v >= 40 ? '#F5B60B' : v >= 25 ? '#F98A4B' : '#E11D48';

/** Chip tone for a raw score/total (≥80% green, ≥60% amber, else red) — the mockup's scoreChip(). */
export const scoreTone = (score: number, total: number): Tone => {
  if (!total) return 'n';
  const p = score / total;
  return p >= 0.8 ? 'g' : p >= 0.6 ? 'a' : 'r';
};

export function Chip({ tone, children, className = '', title }: { tone: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span className={`ch ${tone} ${className}`} title={title}>{children}</span>;
}

export function Bar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className="bar"><i style={{ width: `${v}%`, background: color || hmColor(v) }} /></div>;
}

export function Donut({ value, color, size = 96 }: { value: number; color: string; size?: number }) {
  const c = 2 * Math.PI * 42;
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="#EDF1F7" strokeWidth="11" />
      <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, value))) / 100} ${c}`} transform="rotate(-90 50 50)" />
    </svg>
  );
}

export function PageBar({ eyebrow, title, sub, actions }: { eyebrow: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="pbar">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="eic">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Loading placeholder shaped like the page it stands in for, so layout doesn't jump. */
export function Skeleton({ h = 20, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skel" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}
