'use client';

import { useId } from 'react';
import { LIMIT_LABEL, solvePhoto, starchResult, type PhotoParams } from '@/lib/lab/engines/photosynthesis';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function PhotosynthesisView(props: ViewProps<PhotoParams>) {
  return props.params.scenario === 'bubbles' ? <Bubbles {...props} /> : <Starch {...props} />;
}

/** Lamp at its distance, a beaker with Hydrilla under an inverted funnel and test tube, bubbles rising at the real rate (scaled). */
function Bubbles({ params: p, conceal, runKey }: ViewProps<PhotoParams>) {
  const s = solvePhoto(p);
  const k = useRun(runKey, conceal, 8000);
  const lampX = 560 - p.dist * 5;
  const count = conceal ? 0 : Math.round((s.rate / 60) * 14);
  const phase = k * 6;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Hydrilla with a lamp ${p.dist} centimetres away at ${p.temp} degrees`}>
      <g transform={`translate(${lampX} 220)`}>
        <rect x={-30} y={-20} width={44} height={40} rx={6} fill="#002147" />
        <path d="M14 -26 L54 -50 L54 50 L14 26 Z" fill="#FDE68A" opacity={0.6} />
        <text className="lb-sm" x={-8} y={50} textAnchor="middle">lamp</text>
      </g>
      <line className="lb-axis" x1={lampX + 20} x2={600} y1={300} y2={300} />
      <text className="lb-sm" x={(lampX + 600) / 2} y={318} textAnchor="middle">{fmt(p.dist, 0)} cm</text>
      <path d="M600 110 V400 H860 V110" fill="none" stroke="#002147" strokeWidth={3} />
      <rect x={602} y={150} width={256} height={248} fill="#DCEBFF" opacity={0.7} />
      <path d="M660 390 L800 390 L740 300 V140 H720 V300 Z" fill="none" stroke="#002147" strokeWidth={2.5} />
      {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${700 + i * 10} 385 q${-14 + i * 7} -40 ${-4 + i * 4} -70`} fill="none" stroke="#16A34A" strokeWidth={4} />)}
      {Array.from({ length: count }, (_, i) => {
        const y = 300 - (((i / Math.max(count, 1)) * 160 + phase * 40) % 160);
        return <circle key={i} cx={730 + ((i * 7) % 6) - 3} cy={y} r={3.5} fill="#fff" stroke="#2F6BFF" strokeWidth={1.2} />;
      })}
      <g transform="translate(900 140)">
        <rect x={-6} y={0} width={12} height={220} rx={6} fill="#fff" stroke="#002147" strokeWidth={2} />
        <rect x={-3} y={220 - (200 * p.temp) / 50} width={6} height={(200 * p.temp) / 50} fill="#E11D48" />
        <text className="lb-sm" x={0} y={244} textAnchor="middle">{fmt(p.temp, 0)} °C</text>
      </g>
      <text className="lb-lbl" x={40} y={50}>Hydrilla in water with {fmt(p.co2, 2)} g NaHCO₃</text>
      {!conceal && <text className="lb-lbl" x={40} y={76}>{fmt(s.rate, 0)} bubbles a minute · limited by {LIMIT_LABEL[s.limit].toLowerCase()}</text>}
    </svg>
  );
}

/** A leaf after boiling in alcohol and adding iodine: blue-black where starch formed, brown where not. */
function Starch({ params: p, conceal }: ViewProps<PhotoParams>) {
  const r = starchResult(p);
  const clip = `leaf-${useId().replace(/:/g, '')}`;
  const yes = '#1E1B4B', no = '#B45309', plain = '#E9E4CF';
  const fillOf = (i: number) => (conceal ? plain : r[i]?.starch ? yes : no);
  const leaf = 'M300 380 C180 330 160 180 300 90 C440 180 420 330 300 380 Z';
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Iodine test on a leaf">
      <defs><clipPath id={clip}><path d={leaf} /></clipPath></defs>
      <path d={leaf} fill={fillOf(0)} stroke="#002147" strokeWidth={2.5} />
      {p.leaf === 'variegated' && <path clipPath={`url(#${clip})`} d="M160 90 H230 C250 200 240 300 220 400 H160 Z M370 90 H440 V400 H380 C360 300 350 200 370 90 Z" fill={fillOf(1)} />}
      {p.leaf === 'covered' && <rect clipPath={`url(#${clip})`} x={250} y={180} width={100} height={110} fill={fillOf(1)} />}
      <line x1={300} x2={300} y1={100} y2={400} stroke="#002147" strokeWidth={2} opacity={0.5} />
      <text className="lb-lbl" x={40} y={50}>{p.leaf === 'variegated' ? 'Variegated leaf, in sunlight' : p.leaf === 'covered' ? 'Destarched leaf, partly covered with black paper, then sunlight' : 'Plant kept in the dark for three days'}</text>
      <foreignObject x={520} y={140} width={440} height={240}>
        <div style={{ fontSize: 17, lineHeight: 1.5, color: '#002147', fontWeight: 600 }}>
          {conceal ? 'Where will iodine turn the leaf blue-black?' : r.map(x => <div key={x.region}>{x.region}: {x.starch ? 'blue-black (starch)' : 'brown (no starch)'}</div>)}
        </div>
      </foreignObject>
    </svg>
  );
}
