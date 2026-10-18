'use client';

import { CELL_CONC, ITEMS, solutionKind, solveOsmosis, type OsmosisParams } from '@/lib/lab/engines/osmosis';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** A beaker with the item, arrows for the net flow of water, a close-up of one cell, and the balance reading. */
export default function OsmosisView({ params: p, conceal, runKey }: ViewProps<OsmosisParams>) {
  const k = useRun(runKey, conceal, 3000);
  const t = conceal ? 0 : k;
  const now = solveOsmosis({ ...p, minutes: p.minutes * t });
  const scale = 1 + (now.pct / 100) * 2.2; // exaggerated so the change is visible
  const sugar = Math.round(p.conc * 30);
  const water = 18;
  const flowIn = now.dir === 'in', flowOut = now.dir === 'out';
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ITEMS[p.item].label} in ${p.conc} molar sugar solution`}>
      <path d="M90 110 V390 H360 V110" fill="none" stroke="#002147" strokeWidth={3} />
      <rect x={92} y={170} width={266} height={218} fill="#E3F0FF" opacity={0.75} />
      <g transform={`translate(225 290) scale(${scale})`}>
        {p.item === 'raisin' && <ellipse rx={30} ry={22} fill="#6B2E3E" />}
        {p.item === 'potato' && <rect x={-60} y={-14} width={120} height={28} rx={6} fill="#F2D28B" stroke="#B88A3B" strokeWidth={2} />}
        {p.item === 'egg' && <ellipse rx={44} ry={56} fill="#FFF8EC" stroke="#D6C7A8" strokeWidth={2} />}
      </g>
      <text className="lb-sm" x={225} y={420} textAnchor="middle">{p.conc === 0 ? 'pure water' : `${fmt(p.conc, 2)} M sugar solution`}</text>
      {/* Close-up of a cell at the membrane */}
      <g transform="translate(470 110)">
        <rect x={0} y={0} width={240} height={280} rx={14} fill="#F7F9FB" stroke="#C9D6E8" />
        <line x1={120} x2={120} y1={10} y2={270} stroke="#7C5CFC" strokeWidth={4} strokeDasharray="10 6" />
        <text className="lb-sm" x={60} y={26} textAnchor="middle">outside</text>
        <text className="lb-sm" x={180} y={26} textAnchor="middle">inside the cell</text>
        {Array.from({ length: water }, (_, i) => <circle key={`w${i}`} cx={20 + ((i * 37) % 85)} cy={50 + ((i * 53) % 200)} r={4} fill="#2F6BFF" />)}
        {Array.from({ length: water }, (_, i) => <circle key={`v${i}`} cx={140 + ((i * 41) % 85)} cy={50 + ((i * 29) % 200)} r={4} fill="#2F6BFF" />)}
        {Array.from({ length: sugar }, (_, i) => <rect key={`s${i}`} x={18 + ((i * 31) % 85)} y={46 + ((i * 47) % 200)} width={9} height={9} fill="#F59E0B" />)}
        {Array.from({ length: Math.round(CELL_CONC * 30) }, (_, i) => <rect key={`c${i}`} x={140 + ((i * 23) % 85)} y={46 + ((i * 61) % 200)} width={9} height={9} fill="#F59E0B" />)}
        {!conceal && (flowIn || flowOut) && (
          <g>
            <line x1={flowIn ? 70 : 170} x2={flowIn ? 170 : 70} y1={140} y2={140} stroke="#E11D48" strokeWidth={6} />
            <path d={flowIn ? 'M180 140 l-16 -10 v20 Z' : 'M60 140 l16 -10 v20 Z'} fill="#E11D48" />
          </g>
        )}
        <text className="lb-sm" x={120} y={300} textAnchor="middle">blue: water · orange: sugar (can&apos;t cross)</text>
      </g>
      {/* Balance */}
      <g transform="translate(760 250)">
        <rect x={0} y={40} width={200} height={70} rx={10} fill="#002147" />
        <rect x={20} y={56} width={160} height={38} rx={6} fill="#D1FAE5" />
        <text x={100} y={82} textAnchor="middle" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, fontWeight: 700, fill: '#002147' }}>{conceal ? '?.??' : fmt(now.end, now.end < 1 ? 3 : 2)} g</text>
        <text className="lb-sm" x={100} y={134} textAnchor="middle">after {fmt(p.minutes * t, 0)} min</text>
      </g>
      <text className="lb-lbl" x={40} y={50}>{ITEMS[p.item].label} · {solutionKind(p.conc)}</text>
    </svg>
  );
}
