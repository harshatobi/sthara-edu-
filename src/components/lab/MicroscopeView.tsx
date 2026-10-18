'use client';

import { useId, type ReactNode } from 'react';
import { optics, SLIDES, suits, type MicroscopeParams, type SlideKey } from '@/lib/lab/engines/microscope';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const R = 200; // field radius, px
const CX = 330, CY = 245;

/** Strokes stay the same width on screen at every magnification. */
const ns = { vectorEffect: 'non-scaling-stroke' as const };

/**
 * One tile of each slide, in micrometres. Tissues and cells repeat; organisms
 * are drawn once at the centre. Colours follow the usual stains: safranin
 * pink-red for plant walls, methylene blue for cheek cells.
 */
function tile(slide: SlideKey): { w: number; h: number; body: ReactNode } | null {
  switch (slide) {
    case 'onion':
      return {
        w: 500, h: 160, body: (
          <g>
            {[[0, 0], [250, 0], [-125, 80], [125, 80], [375, 80]].map(([x, y], i) => (
              <g key={i}>
                <rect x={x} y={y} width={250} height={80} fill="#FBE4EC" stroke="#BE185D" strokeWidth={2.2} style={ns} />
                <ellipse cx={x + (i % 2 ? 60 : 190)} cy={y + 40} rx={14} ry={10} fill="#9D174D" />
              </g>
            ))}
          </g>
        ),
      };
    case 'cheek':
      return {
        w: 180, h: 160, body: (
          <g>
            {[[45, 40, 0], [130, 60, 40], [80, 125, -25]].map(([x, y, rot], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`}>
                <path d="M-30 -18 Q-6 -34 22 -22 Q36 -4 26 18 Q4 34 -22 24 Q-36 6 -30 -18 Z" fill="#DBEAFE" stroke="#1D4ED8" strokeWidth={1.4} style={ns} />
                <circle r={5} fill="#1E3A8A" />
              </g>
            ))}
          </g>
        ),
      };
    case 'parenchyma':
      return {
        w: 120, h: 104, body: (
          <g>
            {[[30, 26], [90, 26], [0, 78], [60, 78], [120, 78], [30, 130], [90, 130]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={27} fill="#FCE7F3" stroke="#BE185D" strokeWidth={1.6} style={ns} />
            ))}
          </g>
        ),
      };
    case 'collenchyma':
      return {
        w: 80, h: 70, body: (
          <g>
            {[[0, 0], [40, 0], [20, 35], [60, 35], [-20, 35], [0, 70], [40, 70]].map(([x, y], i) => (
              <g key={i}>
                <path d={`M${x - 18} ${y} L${x - 9} ${y - 16} L${x + 9} ${y - 16} L${x + 18} ${y} L${x + 9} ${y + 16} L${x - 9} ${y + 16} Z`} fill="#FCE7F3" stroke="#BE185D" strokeWidth={1.4} style={ns} />
                {[[-9, -16], [9, -16], [18, 0], [9, 16], [-9, 16], [-18, 0]].map(([dx, dy], j) => <circle key={j} cx={x + dx} cy={y + dy} r={4} fill="#BE185D" />)}
              </g>
            ))}
          </g>
        ),
      };
    case 'sclerenchyma':
      return {
        w: 50, h: 44, body: (
          <g>
            {[[0, 0], [25, 0], [12.5, 22], [37.5, 22], [-12.5, 22], [0, 44], [25, 44]].map(([x, y], i) => (
              <g key={i}>
                <path d={`M${x - 12.5} ${y} L${x - 6} ${y - 11} L${x + 6} ${y - 11} L${x + 12.5} ${y} L${x + 6} ${y + 11} L${x - 6} ${y + 11} Z`} fill="#BE123C" />
                <circle cx={x} cy={y} r={2.6} fill="#FFF1F2" />
              </g>
            ))}
          </g>
        ),
      };
    case 'striated':
      return {
        w: 300, h: 66, body: (
          <g>
            <rect x={0} y={4} width={300} height={58} rx={20} fill="#FECACA" stroke="#B91C1C" strokeWidth={1.2} style={ns} />
            {Array.from({ length: 50 }, (_, i) => <rect key={i} x={i * 6} y={4} width={3} height={58} fill="#DC2626" opacity={0.45} />)}
            {[40, 140, 230].map(x => <ellipse key={x} cx={x} cy={10} rx={10} ry={3.5} fill="#7F1D1D" />)}
          </g>
        ),
      };
    case 'smooth':
      return {
        w: 170, h: 30, body: (
          <g>
            <path d="M0 15 Q75 1 150 15 Q75 29 0 15 Z" fill="#FECDD3" stroke="#BE123C" strokeWidth={1.2} style={ns} />
            <ellipse cx={75} cy={15} rx={10} ry={3} fill="#881337" />
          </g>
        ),
      };
    case 'cardiac':
      return {
        w: 220, h: 90, body: (
          <g>
            <path d="M0 20 H110 L150 60 H220 M110 20 H220" fill="none" stroke="#FCA5A5" strokeWidth={22} />
            {Array.from({ length: 36 }, (_, i) => <line key={i} x1={i * 6} x2={i * 6} y1={10} y2={30} stroke="#DC2626" opacity={0.3} />)}
            {[100, 205].map(x => <line key={x} x1={x} x2={x} y1={8} y2={32} stroke="#7F1D1D" strokeWidth={2.5} style={ns} />)}
            {[50, 165].map(x => <ellipse key={x} cx={x} cy={20} rx={7} ry={4} fill="#7F1D1D" />)}
          </g>
        ),
      };
    case 'stomata':
      return {
        w: 120, h: 100, body: (
          <g>
            <path d="M0 0 q15 10 30 0 t30 0 t30 0 t30 0 M0 50 q15 10 30 0 t30 0 t30 0 t30 0 M0 100 q15 10 30 0 t30 0 t30 0 t30 0 M0 0 q-8 12 0 25 t0 25 t0 25 t0 25 M60 0 q-8 12 0 25 t0 25 t0 25 t0 25" fill="none" stroke="#BE185D" strokeWidth={1.2} style={ns} />
            <g transform="translate(92 50)">
              <path d="M-4 -18 Q-16 0 -4 18 Q-10 0 -4 -18 Z M4 -18 Q16 0 4 18 Q10 0 4 -18 Z" fill="#86EFAC" stroke="#15803D" strokeWidth={1.4} style={ns} />
              <ellipse rx={3} ry={11} fill="#F8FAFC" />
              {[-12, -4, 4, 12].map(dy => <circle key={dy} cx={-9} cy={dy} r={1.6} fill="#15803D" />)}
              {[-12, -4, 4, 12].map(dy => <circle key={`r${dy}`} cx={9} cy={dy} r={1.6} fill="#15803D" />)}
            </g>
          </g>
        ),
      };
    case 'yeast':
      return {
        w: 60, h: 48, body: (
          <g>
            {[[10, 12], [40, 30], [20, 38]].map(([x, y], i) => (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={4} ry={3.2} fill="#FEF3C7" stroke="#92400E" strokeWidth={1} style={ns} />
                <circle cx={x + 4.6} cy={y - 2} r={1.7} fill="#FEF3C7" stroke="#92400E" strokeWidth={1} style={ns} />
              </g>
            ))}
          </g>
        ),
      };
    default:
      return null;
  }
}

/** Organisms drawn once, centred, in micrometres. */
function organism(slide: SlideKey): ReactNode {
  if (slide === 'amoeba') {
    const cell = (x: number, stage: 0 | 1 | 2) => (
      <g transform={`translate(${x} 0)`}>
        {stage < 2 ? (
          <path d="M-190 -40 Q-150 -170 -20 -150 Q80 -200 160 -100 Q220 0 140 90 Q60 190 -60 150 Q-200 120 -190 -40 Z" fill="#E0F2FE" stroke="#0369A1" strokeWidth={1.6} style={ns} />
        ) : (
          <>
            <path d="M-200 -20 Q-170 -150 -40 -130 Q20 -60 -20 40 Q-60 150 -150 120 Q-230 80 -200 -20 Z" fill="#E0F2FE" stroke="#0369A1" strokeWidth={1.6} style={ns} />
            <path d="M200 20 Q170 150 40 130 Q-20 60 20 -40 Q60 -150 150 -120 Q230 -80 200 20 Z" fill="#E0F2FE" stroke="#0369A1" strokeWidth={1.6} style={ns} />
          </>
        )}
        {stage === 0 && <circle r={40} fill="#0C4A6E" opacity={0.75} />}
        {stage === 1 && <><ellipse cx={-50} rx={34} ry={30} fill="#0C4A6E" opacity={0.75} /><ellipse cx={50} rx={34} ry={30} fill="#0C4A6E" opacity={0.75} /></>}
        {stage === 2 && <><circle cx={-110} cy={10} r={32} fill="#0C4A6E" opacity={0.75} /><circle cx={110} cy={-10} r={32} fill="#0C4A6E" opacity={0.75} /></>}
        <circle cx={60} cy={-60} r={16} fill="none" stroke="#0369A1" strokeWidth={1} style={ns} />
      </g>
    );
    return <g>{cell(-600, 0)}{cell(0, 1)}{cell(600, 2)}</g>;
  }
  if (slide === 'hydra') {
    // About 3 mm long, the mouth and tentacles at the top, a bud on the right side.
    return (
      <g>
        <path d="M-150 1400 Q-220 300 -180 -900 Q0 -1000 180 -900 Q220 300 150 1400 Z" fill="#FDE68A" stroke="#92400E" strokeWidth={1.6} style={ns} />
        {[-160, -80, 0, 80, 160].map((x, i) => <path key={i} d={`M${x} -950 Q${x * 3} -1300 ${x * 4 + (i - 2) * 60} -1550`} fill="none" stroke="#92400E" strokeWidth={60} strokeLinecap="round" opacity={0.85} />)}
        <path d="M190 200 Q420 120 520 -150 Q560 -200 600 -150 Q540 120 210 380 Z" fill="#FDE68A" stroke="#92400E" strokeWidth={1.6} style={ns} />
        {[0, 1, 2].map(i => <path key={i} d={`M${560 + i * 20} -170 q${20 + i * 15} -120 ${50 + i * 25} -160`} fill="none" stroke="#92400E" strokeWidth={30} strokeLinecap="round" />)}
      </g>
    );
  }
  if (slide === 'mould') {
    const stalk = (x: number, h: number) => (
      <g key={x}>
        <line x1={x} x2={x} y1={300} y2={300 - h} stroke="#475569" strokeWidth={1.6} style={ns} />
        <circle cx={x} cy={300 - h - 50} r={50} fill="#111827" />
        {[-20, 10, -5, 25].map((d, i) => <circle key={i} cx={x + d} cy={300 - h - 50 + (i * 13) % 30 - 15} r={4} fill="#4B5563" />)}
      </g>
    );
    return (
      <g>
        <path d="M-900 300 Q-400 260 0 300 T900 300 M-700 300 Q-650 360 -600 330 M300 300 Q360 350 420 320" fill="none" stroke="#475569" strokeWidth={1.6} style={ns} />
        {[-600, -300, -60, 250, 520].map((x, i) => stalk(x, 300 + ((i * 97) % 250)))}
      </g>
    );
  }
  return null;
}

/** The eyepiece view: a round field, the slide at true scale for this objective, and the optics beside it. */
export default function MicroscopeView({ params: p, conceal }: ViewProps<MicroscopeParams>) {
  const id = useId().replace(/:/g, '');
  const o = optics(p), s = SLIDES[p.slide];
  const pxPerUm = (2 * R) / (o.fov * 1000);
  const t = tile(p.slide), org = organism(p.slide);
  const fit = suits(p);
  const half = (o.fov * 1000) / 2;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label} at ${o.total} times`}>
      <defs>
        <clipPath id={`f-${id}`}><circle cx={CX} cy={CY} r={R} /></clipPath>
        {t && <pattern id={`p-${id}`} patternUnits="userSpaceOnUse" width={t.w} height={t.h}>{t.body}</pattern>}
      </defs>
      <circle cx={CX} cy={CY} r={R + 14} fill="#0F172A" />
      <g clipPath={`url(#f-${id})`}>
        <rect x={CX - R} y={CY - R} width={2 * R} height={2 * R} fill="#FFFDF7" />
        <g transform={`translate(${CX} ${CY}) scale(${pxPerUm})`}>
          {t && <rect x={-half} y={-half} width={2 * half} height={2 * half} fill={`url(#p-${id})`} />}
          {org}
        </g>
      </g>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0F172A" strokeWidth={3} />
      {/* Scale bar: a round number of micrometres about a fifth of the field */}
      {(() => {
        const target = o.fov * 1000 / 5, mag = 10 ** Math.floor(Math.log10(target)), um = [1, 2, 5, 10].map(m => m * mag).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
        return <g><line x1={CX - R + 30} x2={CX - R + 30 + um * pxPerUm} y1={CY + R - 24} y2={CY + R - 24} stroke="#0F172A" strokeWidth={5} /><text className="lb-sm" x={CX - R + 30} y={CY + R - 34}>{um >= 1000 ? `${um / 1000} mm` : `${um} µm`}</text></g>;
      })()}
      <text className="lb-lbl" x={40} y={40}>{conceal ? 'Unknown slide' : s.label}</text>
      <foreignObject x={590} y={70} width={380} height={380}>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: '#002147', fontWeight: 600 }}>
          <div>Eyepiece 10× · objective {p.objective}× · <b>{o.total}×</b></div>
          <div>Field of view {fmt(o.fov, 2)} mm</div>
          {fit !== 'good' && <div style={{ color: '#B45309', marginTop: 8 }}>{fit === 'too-big' ? 'Only part of it fits: use low power (4×).' : 'Too small to make out: switch to a stronger objective.'}</div>}
          {!conceal && <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontWeight: 500 }}>{s.features.map(f => <li key={f}>{f}</li>)}</ul>}
        </div>
      </foreignObject>
    </svg>
  );
}
