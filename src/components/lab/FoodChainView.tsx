'use client';

import { solveChain, type FoodChainParams } from '@/lib/lab/engines/foodChain';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The energy pyramid (bar widths on a log scale so the top level stays visible) and the pesticide climbing beside it. */
export default function FoodChainView({ params: p, conceal, runKey }: ViewProps<FoodChainParams>) {
  const s = solveChain(p);
  const k = useRun(runKey, conceal, 3000);
  const shown = conceal ? 1 : Math.max(1, Math.ceil(k * s.length));
  // Rounded: Math.log10 can differ in the last digit between the server and the browser (hydration).
  const bar = (e: number) => Math.round(100 * (60 + 460 * (Math.log10(e / s[s.length - 1].energy + 1) / Math.log10(s[0].energy / s[s.length - 1].energy + 1)))) / 100;
  const h = Math.min(70, 360 / s.length);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A ${p.levels}-level food chain`}>
      <text className="lb-lbl" x={40} y={50}>Energy pyramid (widths on a log scale)</text>
      {s.map((x, i) => {
        const w = bar(x.energy), y = 420 - (i + 1) * h;
        const vis = i < shown;
        return (
          <g key={x.name} opacity={vis ? 1 : 0.15}>
            <rect x={320 - w / 2} y={y} width={w} height={h - 6} rx={6} fill={['#16A34A', '#84CC16', '#F59E0B', '#F97316', '#E11D48'][i]} />
            <text className="lb-lbl" x={320} y={y + h / 2 + 2} textAnchor="middle" style={{ fill: '#fff' }}>{x.name}</text>
            <text className="lb-sm" x={320 + w / 2 + 10} y={y + h / 2 + 2}>{!conceal || i === 0 ? `${fmt(x.energy, x.energy >= 10 ? 0 : 2)} kJ` : '? kJ'}</text>
          </g>
        );
      })}
      {p.pesticide > 0 && (
        <g>
          <text className="lb-lbl" x={700} y={50}>Pesticide (ppm)</text>
          {s.map((x, i) => {
            const y = 420 - (i + 1) * h, vis = i < shown;
            return (
              <g key={x.name} opacity={vis ? 1 : 0.15}>
                <text className="lb-sm" x={700} y={y + h / 2 + 2}>{x.name}</text>
                <rect x={840} y={y + 8} width={Math.max(4, 120 * (i + 1) / s.length)} height={h - 22} rx={4} fill="#7C5CFC" />
                <text className="lb-sm" x={840} y={y + h - 2}>{!conceal || i === 0 ? fmt(x.pesticide, x.pesticide >= 1 ? 1 : 4) : '?'}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
