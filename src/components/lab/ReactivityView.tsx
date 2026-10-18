'use client';

import { displaces, METALS, ORDER, result, type ReactivityParams } from '@/lib/lab/engines/reactivity';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** The chosen tube (metal strip in a salt solution, colour fading as it reacts) and the 4 × 4 grid of all tubes. */
export default function ReactivityView({ params: p, conceal, runKey }: ViewProps<ReactivityParams>) {
  const r = result(p), m = METALS[p.metal], s = METALS[p.salt];
  const k = useRun(runKey, conceal, 3000);
  const mix = (a: string, b: string, t: number) => {
    const h = (x: string) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const A = h(a), B = h(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  };
  const liquid = r.reacts ? mix(s.solutionHex, r.endHex, k) : s.solutionHex;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${m.name} in ${s.saltName} solution`}>
      <path d="M160 100 V360 a50 50 0 0 0 100 0 V100" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
      <path d="M163 180 V360 a47 47 0 0 0 94 0 V180 Z" fill={liquid} />
      <line x1={163} x2={257} y1={180} y2={180} stroke="#7EA6D8" strokeWidth={2} />
      <rect x={198} y={70} width={24} height={300} rx={3} fill={p.metal === 'Cu' ? '#C26A3D' : p.metal === 'Fe' ? '#6B7280' : '#B9C0C8'} />
      {r.reacts && k > 0 && <rect x={198} y={180} width={24} height={190} rx={3} fill={s.depositHex} opacity={k} />}
      <text className="lb-lbl" x={210} y={56} textAnchor="middle">{m.name} in {s.salt}</text>
      <foreignObject x={300} y={140} width={260} height={220}>
        <div style={{ fontSize: 16, lineHeight: 1.45, color: '#002147', fontWeight: 600 }}>
          {conceal ? 'Will it react?' : <><div>{r.seen}.</div>{r.equation && <div style={{ marginTop: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14 }}>{r.equation}</div>}</>}
        </div>
      </foreignObject>
      {/* All sixteen tubes: a tick where the metal displaces */}
      <g transform="translate(610 110)">
        <text className="lb-sm" x={150} y={-30} textAnchor="middle">metal (down) in salt solution (across): tick = displaces</text>
        {ORDER.map((salt, j) => <text key={salt} className="lb-lbl" x={95 + j * 70} y={-6} textAnchor="middle">{METALS[salt].salt}</text>)}
        {ORDER.map((metal, i) => (
          <g key={metal}>
            <text className="lb-lbl" x={20} y={34 + i * 70}>{metal}</text>
            {ORDER.map((salt, j) => {
              const here = metal === p.metal && salt === p.salt, yes = displaces({ metal, salt });
              return (
                <g key={salt}>
                  <rect x={70 + j * 70} y={10 + i * 70} width={50} height={50} rx={8} fill={here ? '#EAF2FF' : '#fff'} stroke={here ? '#2F6BFF' : '#E8EDF4'} strokeWidth={here ? 3 : 1.5} />
                  {!conceal && metal !== salt && (yes
                    ? <path d={`M${84 + j * 70} ${35 + i * 70} l8 8 l14 -16`} fill="none" stroke="#0B7A54" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                    : <line x1={88 + j * 70} x2={102 + j * 70} y1={35 + i * 70} y2={35 + i * 70} stroke="#9AA6B8" strokeWidth={3} strokeLinecap="round" />)}
                </g>
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
