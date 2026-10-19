'use client';

import { useMemo } from 'react';
import { neutralPoint, SEP, type EfieldParams } from '@/lib/lab/engines/efield';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const PX = 18; // px per cm

type Charge = { x: number; y: number; q: number };

/** Field lines traced from the positive charges (step along E), and equipotentials as contour rings. */
export default function EfieldView({ params: p, conceal }: ViewProps<EfieldParams>) {
  const charges: Charge[] = useMemo(() => {
    if (p.setup === 'single') return [{ x: 300, y: 240, q: p.q }];
    if (p.setup === 'dipole') return [{ x: 500 - (SEP / 2) * PX, y: 240, q: p.q }, { x: 500 + (SEP / 2) * PX, y: 240, q: -p.q }];
    return [{ x: 500 - 1.5 * SEP * PX, y: 240, q: p.q }, { x: 500 + 1.5 * SEP * PX, y: 240, q: p.q2 }];
  }, [p.setup, p.q, p.q2]);
  const lines = useMemo(() => {
    const field = (x: number, y: number) => charges.reduce((acc, c) => {
      const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) || 1;
      return { x: acc.x + (c.q * dx) / (r2 * r), y: acc.y + (c.q * dy) / (r2 * r) };
    }, { x: 0, y: 0 });
    const out: string[] = [];
    for (const c of charges.filter(c => c.q > 0)) {
      const n = Math.round(8 * c.q);
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * (i + 0.5)) / n;
        let x = c.x + 12 * Math.cos(a), y = c.y + 12 * Math.sin(a);
        const pts = [`M${x.toFixed(1)} ${y.toFixed(1)}`];
        for (let s = 0; s < 400; s++) {
          const e = field(x, y), mag = Math.hypot(e.x, e.y);
          if (!mag) break;
          x += (6 * e.x) / mag; y += (6 * e.y) / mag;
          if (x < 0 || x > W || y < 0 || y > H) break;
          pts.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
          if (charges.some(o => o.q < 0 && Math.hypot(x - o.x, y - o.y) < 10)) break;
        }
        out.push(pts.join(' '));
      }
    }
    return out;
  }, [charges]);
  const probe = p.setup === 'like' ? null : p.setup === 'single' ? { x: charges[0].x + p.r * PX, y: 240 } : { x: 500 + p.r * PX, y: 240 };
  const neutral = p.setup === 'like' ? charges[0].x + neutralPoint(p.q, p.q2) * PX : null;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Electric field lines">
      {/* A nested svg clips the lines to the drawing; the outer one may be wider than its viewBox. */}
      <svg x={0} y={0} width={W} height={H} overflow="hidden">
      {p.setup === 'single' && [3, 6, 10, 16].map(r => <circle key={r} cx={charges[0].x} cy={240} r={r * PX} fill="none" className="lb-eq" />)}
      {lines.map((d, i) => <path key={i} d={d} fill="none" stroke="#2F6BFF" strokeWidth={1.6} opacity={0.75} />)}
      </svg>
      {charges.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={12} fill={c.q > 0 ? '#E11D48' : '#2F6BFF'} stroke="#002147" strokeWidth={2} />
          <text className="lb-lbl" x={c.x} y={c.y + 5} textAnchor="middle" fill="#fff">{c.q > 0 ? '+' : '−'}</text>
          <text className="lb-sm" x={c.x} y={c.y + 34} textAnchor="middle">{fmt(Math.abs(c.q), 1)} μC</text>
        </g>
      ))}
      {probe && probe.x < W - 10 && <g><circle cx={probe.x} cy={probe.y} r={6} fill="#F59E0B" stroke="#002147" /><text className="lb-sm" x={probe.x} y={probe.y - 14} textAnchor="middle">P, {fmt(p.r, 0)} cm</text></g>}
      {neutral !== null && !conceal && <g><circle cx={neutral} cy={240} r={7} fill="#F59E0B" stroke="#002147" /><text className="lb-sm" x={neutral} y={220} textAnchor="middle">E = 0</text></g>}
      <text className="lb-lbl" x={30} y={36}>{p.setup === 'single' ? 'One charge: field lines radial, equipotentials circles (dashed)' : p.setup === 'dipole' ? `Dipole, ${SEP} cm apart` : `Like charges, ${SEP * 3} cm apart`}</text>
    </svg>
  );
}
