'use client';

import { outcome, SAMPLES, TESTS, type AcidPropsParams } from '@/lib/lab/engines/acidProps';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** A test tube of the sample with the test applied: a paper strip, zinc or carbonate, and a lime-water tube for CO₂. */
export default function AcidPropsView({ params: p, conceal, runKey }: ViewProps<AcidPropsParams>) {
  const o = outcome(p), s = SAMPLES[p.sample];
  const k = useRun(runKey, conceal, 2600);
  const shown = !conceal && k > 0.2;
  const paper = p.test === 'universal' || p.test === 'blue-litmus' || p.test === 'red-litmus';
  const start = p.test === 'blue-litmus' ? '#1E88E5' : p.test === 'red-litmus' ? '#E53935' : '#F3E3B0';
  const bubbles = shown && o.gas ? Array.from({ length: 14 }, (_, i) => ({ x: 222 + ((i * 37) % 56), y: 330 - ((i * 53 + k * 400) % 170), r: 3 + (i % 3) })) : [];
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label} tested with ${TESTS[p.test]}`}>
      {/* Test tube */}
      <path d="M200 120 V360 a50 50 0 0 0 100 0 V120" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
      <path d="M203 220 V360 a47 47 0 0 0 94 0 V220 Z" fill={p.sample === 'lemon' ? '#FFF6C2' : '#E3F0FF'} />
      <text className="lb-lbl" x={250} y={100} textAnchor="middle">{s.label}</text>
      {p.test === 'zinc' && [0, 1, 2].map(i => <rect key={i} x={220 + i * 22} y={390} width={16} height={12} rx={3} fill="#9AA6B8" />)}
      {(p.test === 'na2co3' || p.test === 'nahco3') && <ellipse cx={250} cy={386} rx={30} ry={7} fill="#FFFFFF" stroke="#9AA6B8" />}
      {bubbles.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="none" stroke="#2F6BFF" strokeWidth={1.5} />)}
      {/* Paper strip */}
      {paper && (
        <g>
          <rect x={420} y={150} width={60} height={200} rx={4} fill={start} stroke="#002147" strokeWidth={1.5} />
          <rect x={420} y={260} width={60} height={90} rx={4} fill={shown ? (o.colour ?? start) : start} />
          <circle cx={450} cy={300} r={14} fill="none" stroke="#002147" strokeDasharray="3 3" />
          <text className="lb-sm" x={450} y={380} textAnchor="middle">a drop here</text>
        </g>
      )}
      {/* Lime water for CO₂ */}
      {(p.test === 'na2co3' || p.test === 'nahco3') && (
        <g>
          <path d="M300 160 H560 V260" fill="none" stroke="#002147" strokeWidth={3} />
          <path d="M530 240 V380 a30 30 0 0 0 60 0 V240" fill="#F5F8FC" stroke="#002147" strokeWidth={3} />
          <path d="M533 300 V380 a27 27 0 0 0 54 0 V300 Z" fill={shown && o.gas === 'CO₂' ? '#E6E6E6' : '#EAF6FF'} />
          <text className="lb-sm" x={560} y={440} textAnchor="middle">lime water{shown && o.gas === 'CO₂' ? ': milky' : ''}</text>
        </g>
      )}
      {(p.test === 'zinc') && shown && o.gas && (
        <g><path d="M560 200 l20 -40 l20 40 Z" fill="#F59E0B" /><text className="lb-sm" x={580} y={230} textAnchor="middle">burning splint: pop!</text></g>
      )}
      <text className="lb-lbl" x={40} y={50}>{TESTS[p.test]}</text>
      <foreignObject x={640} y={120} width={330} height={260}>
        <div style={{ fontSize: 17, lineHeight: 1.45, color: '#002147', fontWeight: 600 }}>
          {conceal ? 'What will you observe?' : <>
            <div>{o.seen}.</div>
            {o.equation && <div style={{ marginTop: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 15 }}>{o.equation}</div>}
          </>}
        </div>
      </foreignObject>
    </svg>
  );
}
