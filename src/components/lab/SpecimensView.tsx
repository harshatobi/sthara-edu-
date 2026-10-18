'use client';

import type { ReactNode } from 'react';
import { FLOWER, SEED, SPECIMENS, type FlowerPart, type SeedPart, type SpecimenKey, type SpecimensParams } from '@/lib/lab/engines/specimens';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const INK = '#002147', HL = '#E11D48';

/** Each specimen as a labelled-diagram style drawing, centred on (0, 0) in a 360 × 360 box. */
const DRAW: Record<SpecimenKey, ReactNode> = {
  spirogyra: (
    <g>
      {[-60, 0, 60].map(y => (
        <g key={y}>
          <rect x={-170} y={y - 16} width={340} height={32} rx={6} fill="#DCFCE7" stroke="#15803D" strokeWidth={2} />
          {[-120, -40, 40, 120].map(x => <line key={x} x1={x} x2={x} y1={y - 16} y2={y + 16} stroke="#15803D" strokeWidth={1.5} />)}
          <path d={`M-170 ${y} ${Array.from({ length: 17 }, (_, i) => `Q${-160 + i * 20} ${y + (i % 2 ? 13 : -13)} ${-150 + i * 20} ${y}`).join(' ')}`} fill="none" stroke="#16A34A" strokeWidth={3} />
        </g>
      ))}
    </g>
  ),
  mushroom: (
    <g>
      <path d="M-150 -30 Q0 -200 150 -30 Z" fill="#E7D3B0" stroke={INK} strokeWidth={2.5} />
      {Array.from({ length: 13 }, (_, i) => <line key={i} x1={-140 + i * 23} x2={-120 + i * 20} y1={-30} y2={-10} stroke="#92400E" strokeWidth={1.5} />)}
      <path d="M-150 -30 H150 L120 -10 H-120 Z" fill="#C8A97E" stroke={INK} strokeWidth={2} />
      <rect x={-22} y={-10} width={44} height={160} rx={10} fill="#F3E8D2" stroke={INK} strokeWidth={2.5} />
      <path d="M-22 40 Q0 55 22 40" fill="none" stroke={INK} strokeWidth={2} />
      <path d="M-40 150 Q-20 175 0 150 Q20 175 40 150" fill="none" stroke="#92400E" strokeWidth={2} />
    </g>
  ),
  moss: (
    <g>
      {[-70, 0, 70].map((x, k) => (
        <g key={x}>
          <line x1={x} x2={x} y1={140} y2={-20} stroke="#15803D" strokeWidth={4} />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${x} ${120 - i * 20} q${i % 2 ? 22 : -22} -8 ${i % 2 ? 30 : -30} -24`} fill="none" stroke="#16A34A" strokeWidth={4} />)}
          {k === 1 && <><line x1={x} x2={x} y1={-20} y2={-130} stroke="#A16207" strokeWidth={2.5} /><ellipse cx={x} cy={-148} rx={12} ry={20} fill="#A16207" /></>}
          {[-12, 0, 12].map(d => <line key={d} x1={x} x2={x + d * 2} y1={140} y2={170} stroke="#78350F" strokeWidth={1.5} />)}
        </g>
      ))}
    </g>
  ),
  fern: (
    <g>
      <path d="M0 170 Q10 0 -10 -170" fill="none" stroke="#166534" strokeWidth={5} />
      {Array.from({ length: 14 }, (_, i) => {
        const y = 140 - i * 22, len = 120 - Math.abs(i - 4) * 8;
        return (
          <g key={i}>
            <path d={`M${2 - i * 0.5} ${y} q${-len * 0.5} -18 ${-len} -10 q${len * 0.5} 22 ${len} 10 Z`} fill="#22C55E" stroke="#166534" strokeWidth={1.2} />
            <path d={`M${2 - i * 0.5} ${y} q${len * 0.5} -18 ${len} -10 q${-len * 0.5} 22 ${-len} 10 Z`} fill="#22C55E" stroke="#166534" strokeWidth={1.2} />
            {i % 3 === 1 && [0.4, 0.6, 0.8].map(f => <circle key={f} cx={len * f} cy={y - 6} r={3} fill="#92400E" />)}
          </g>
        );
      })}
    </g>
  ),
  pine: (
    <g>
      {Array.from({ length: 8 }, (_, row) => { const n = 4 + (row < 4 ? row : 7 - row); return Array.from({ length: n }, (_, j) => {
        const x = (j - (n - 1) / 2) * 42, y = -150 + row * 40;
        return <path key={`${row}-${j}`} d={`M${x - 22} ${y} Q${x} ${y - 26} ${x + 22} ${y} Q${x} ${y + 30} ${x - 22} ${y} Z`} fill="#A16207" stroke="#713F12" strokeWidth={2} />;
      }); })}
      <rect x={-8} y={160} width={16} height={30} fill="#713F12" />
    </g>
  ),
  amoeba: (
    <g>
      <path d="M-150 -20 Q-140 -140 -40 -110 Q30 -170 120 -90 Q190 -20 140 60 Q150 150 40 130 Q-60 170 -110 100 Q-200 70 -150 -20 Z" fill="#E0F2FE" stroke="#0369A1" strokeWidth={2.5} />
      <circle cx={-10} cy={0} r={34} fill="#0C4A6E" opacity={0.8} />
      <circle cx={70} cy={-50} r={16} fill="none" stroke="#0369A1" strokeWidth={2} />
      {[[-80, 60], [40, 70], [90, 20]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={8} fill="#BAE6FD" stroke="#0369A1" />)}
    </g>
  ),
  hydra: (
    <g>
      <path d="M-30 170 Q-46 30 -40 -110 Q0 -130 40 -110 Q46 30 30 170 Z" fill="#FDE68A" stroke="#92400E" strokeWidth={2.5} />
      {[-36, -18, 0, 18, 36].map((x, i) => <path key={i} d={`M${x} -115 Q${x * 3} -160 ${x * 4 + (i - 2) * 10} -190`} fill="none" stroke="#92400E" strokeWidth={6} strokeLinecap="round" />)}
      <path d="M40 30 Q110 0 130 -50 L140 -40 Q120 20 42 60 Z" fill="#FDE68A" stroke="#92400E" strokeWidth={2} />
      {[0, 1].map(i => <path key={i} d={`M${130 + i * 8} -48 q${10 + i * 6} -26 ${18 + i * 8} -36`} fill="none" stroke="#92400E" strokeWidth={4} strokeLinecap="round" />)}
    </g>
  ),
  tapeworm: (
    <g>
      <circle cx={-170} cy={-140} r={10} fill="#FEF3C7" stroke={INK} strokeWidth={2} />
      <path d={`M-165 -132 ${Array.from({ length: 14 }, (_, i) => `Q${-140 + i * 25} ${-110 + i * 18 + (i % 2 ? 20 : -20)} ${-130 + i * 25} ${-110 + i * 20}`).join(' ')}`} fill="none" stroke="#E7D3B0" strokeWidth={26} strokeLinecap="round" />
      <path d={`M-165 -132 ${Array.from({ length: 14 }, (_, i) => `Q${-140 + i * 25} ${-110 + i * 18 + (i % 2 ? 20 : -20)} ${-130 + i * 25} ${-110 + i * 20}`).join(' ')}`} fill="none" stroke="#92400E" strokeWidth={26} strokeDasharray="2 14" />
    </g>
  ),
  ascaris: (
    <g>
      <path d="M-170 60 C-100 -120 0 160 80 -40 S170 -80 170 -60" fill="none" stroke="#FBCFE8" strokeWidth={22} strokeLinecap="round" />
      <path d="M-170 60 C-100 -120 0 160 80 -40 S170 -80 170 -60" fill="none" stroke="#9D174D" strokeWidth={1.5} />
    </g>
  ),
  earthworm: (
    <g>
      <path d="M-170 40 C-90 -100 0 120 90 -20 S170 -40 170 -10" fill="none" stroke="#C2410C" strokeWidth={30} strokeLinecap="round" />
      <path d="M-170 40 C-90 -100 0 120 90 -20 S170 -40 170 -10" fill="none" stroke="#7C2D12" strokeWidth={30} strokeDasharray="1.5 9" />
      <path d="M-120 -30 C-110 -48 -96 -58 -84 -64" fill="none" stroke="#FB923C" strokeWidth={34} />
    </g>
  ),
  butterfly: (
    <g>
      <path d="M-6 -20 Q-150 -170 -160 -40 Q-150 30 -6 0 Z M6 -20 Q150 -170 160 -40 Q150 30 6 0 Z" fill="#FDBA74" stroke={INK} strokeWidth={2.5} />
      <path d="M-6 10 Q-120 30 -110 120 Q-40 120 -6 30 Z M6 10 Q120 30 110 120 Q40 120 6 30 Z" fill="#FB923C" stroke={INK} strokeWidth={2.5} />
      <ellipse cx={0} cy={20} rx={10} ry={80} fill="#1F2937" />
      <circle cx={0} cy={-68} r={12} fill="#1F2937" />
      <path d="M-4 -78 Q-30 -130 -40 -140 M4 -78 Q30 -130 40 -140" fill="none" stroke="#1F2937" strokeWidth={3} />
      {[-1, 1].map(s => [0, 1, 2].map(i => <path key={`${s}${i}`} d={`M${s * 8} ${10 + i * 20} l${s * 30} ${10 + i * 6} l${s * 10} 20`} fill="none" stroke="#1F2937" strokeWidth={2.5} />))}
    </g>
  ),
  snail: (
    <g>
      <path d="M-170 110 Q-60 80 120 110 Q160 115 170 90 L150 70 Q60 70 -120 90 Z" fill="#D6C3A3" stroke={INK} strokeWidth={2.5} />
      <path d="M140 75 q10 -60 20 -80 M150 75 q20 -50 40 -60" fill="none" stroke={INK} strokeWidth={3} />
      <circle cx={-20} cy={0} r={110} fill="#B45309" stroke={INK} strokeWidth={2.5} />
      <path d="M-20 0 m0 -80 a80 80 0 1 1 -1 0 m1 20 a60 60 0 1 0 1 0 m-1 20 a40 40 0 1 1 -1 0 m1 20 a20 20 0 1 0 1 0" fill="none" stroke="#78350F" strokeWidth={4} />
    </g>
  ),
  starfish: (
    <g>
      <path d={Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 60 : 175; return `${i ? 'L' : 'M'}${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`; }).join(' ') + ' Z'} fill="#F97316" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      {Array.from({ length: 40 }, (_, i) => { const a = -Math.PI / 2 + ((i % 5) * 2 * Math.PI) / 5, r = 30 + Math.floor(i / 5) * 17; return <circle key={i} cx={r * Math.cos(a)} cy={r * Math.sin(a)} r={4} fill="#FED7AA" />; })}
    </g>
  ),
};

/** Longitudinal section of a bisexual flower (like Hibiscus or Datura), with the chosen part outlined in red. */
function Flower({ part }: { part: FlowerPart }) {
  const hl = (k: FlowerPart) => (k === part ? { stroke: HL, strokeWidth: 5 } : { stroke: INK, strokeWidth: 2 });
  return (
    <g>
      <line x1={0} x2={0} y1={150} y2={210} stroke="#15803D" strokeWidth={10} />
      <path d="M-40 150 Q0 175 40 150 Q20 130 -20 130 Z" fill="#86EFAC" {...hl('thalamus')} />
      <path d="M-40 140 Q-90 110 -100 60 Q-60 100 -30 130 Z M40 140 Q90 110 100 60 Q60 100 30 130 Z" fill="#4ADE80" {...hl('sepal')} />
      <path d="M-30 130 Q-180 60 -150 -120 Q-80 -40 -20 120 Z M30 130 Q180 60 150 -120 Q80 -40 20 120 Z" fill="#FDA4AF" {...hl('petal')} />
      <ellipse cx={0} cy={105} rx={26} ry={24} fill="#BBF7D0" {...hl('ovary')} />
      {[-8, 8].map(x => <ellipse key={x} cx={x} cy={105} rx={5} ry={7} fill="#FEF9C3" stroke="#65A30D" />)}
      <path d="M-5 82 V-60 M5 82 V-60" fill="none" {...hl('style')} />
      <path d="M-22 -60 Q0 -95 22 -60 Q0 -70 -22 -60 Z" fill="#FDE047" {...hl('stigma')} />
      {[-1, 1].map(s => [0, 1].map(i => (
        <g key={`${s}${i}`}>
          <path d={`M${s * 18} 110 Q${s * (40 + i * 18)} ${20 - i * 30} ${s * (46 + i * 22)} ${-30 - i * 30}`} fill="none" {...hl('filament')} />
          <ellipse cx={s * (46 + i * 22)} cy={-40 - i * 30} rx={9} ry={14} fill="#FACC15" {...hl('anther')} />
        </g>
      )))}
    </g>
  );
}

/** A soaked gram seed: the whole seed with hilum and micropyle, and opened to show the cotyledons and embryo axis. */
function Seed({ part }: { part: SeedPart }) {
  const hl = (k: SeedPart) => (k === part ? { stroke: HL, strokeWidth: 5 } : { stroke: INK, strokeWidth: 2 });
  return (
    <g>
      <g transform="translate(-200 0)">
        <path d="M-60 -90 Q60 -110 80 0 Q60 110 -60 90 Q-110 0 -60 -90 Z" fill="#D6A15F" {...hl('coat')} />
        <ellipse cx={-80} cy={0} rx={6} ry={18} fill="#78350F" {...hl('hilum')} />
        <circle cx={-82} cy={-26} r={4} fill="#1F2937" {...hl('micropyle')} />
        <text className="lb-sm" x={0} y={130} textAnchor="middle">whole seed</text>
      </g>
      <g transform="translate(120 0)">
        <path d="M-120 -100 Q-20 -120 -10 0 Q-20 120 -120 100 Q-160 0 -120 -100 Z" fill="#FEF3C7" {...hl('cotyledon')} />
        <path d="M120 -100 Q20 -120 10 0 Q20 120 120 100 Q160 0 120 -100 Z" fill="#FEF3C7" {...hl('cotyledon')} />
        <path d="M-6 -10 Q4 -40 0 -70 L10 -76 Q14 -40 6 -10 Z" fill="#86EFAC" {...hl('plumule')} />
        <path d="M-6 -6 Q-12 40 -2 80 L8 80 Q4 40 6 -6 Z" fill="#FDE68A" {...hl('radicle')} />
        <text className="lb-sm" x={0} y={130} textAnchor="middle">opened: two cotyledons</text>
      </g>
    </g>
  );
}

export default function SpecimensView({ params: p, conceal }: ViewProps<SpecimensParams>) {
  const s = SPECIMENS[p.specimen];
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.scenario === 'classify' ? s.name : p.scenario === 'flower' ? 'Section of a flower' : 'Dicot seed'}>
      {p.scenario === 'classify' && (
        <>
          <g transform="translate(300 250)">{DRAW[p.specimen]}</g>
          <text className="lb-lbl" x={40} y={50}>{conceal ? 'Specimen: identify and classify it' : s.name}</text>
          {!conceal && (
            <foreignObject x={600} y={110} width={370} height={330}>
              <div style={{ fontSize: 16, lineHeight: 1.5, color: INK, fontWeight: 600 }}>
                <div>Kingdom: {s.kingdom}</div><div>Group: {s.group}</div>
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontWeight: 500 }}>{s.features.map(f => <li key={f}>{f}</li>)}</ul>
              </div>
            </foreignObject>
          )}
        </>
      )}
      {p.scenario === 'flower' && (
        <>
          <g transform="translate(300 250)"><Flower part={p.flowerPart} /></g>
          <text className="lb-lbl" x={40} y={50}>A bisexual flower, cut lengthwise</text>
          <foreignObject x={600} y={130} width={370} height={300}>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: INK, fontWeight: 600 }}>
              {conceal ? 'Name the part outlined in red.' : <><div>{FLOWER[p.flowerPart].name} · {FLOWER[p.flowerPart].whorl}</div><div style={{ fontWeight: 500, marginTop: 6 }}>{FLOWER[p.flowerPart].role}.</div></>}
            </div>
          </foreignObject>
        </>
      )}
      {p.scenario === 'seed' && (
        <>
          <g transform="translate(380 250)"><Seed part={p.seedPart} /></g>
          <text className="lb-lbl" x={40} y={50}>Soaked gram seed</text>
          <foreignObject x={680} y={150} width={300} height={260}>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: INK, fontWeight: 600 }}>
              {conceal ? 'Name the part outlined in red.' : <><div>{SEED[p.seedPart].name}</div><div style={{ fontWeight: 500, marginTop: 6 }}>{SEED[p.seedPart].role}.</div></>}
            </div>
          </foreignObject>
        </>
      )}
    </svg>
  );
}
