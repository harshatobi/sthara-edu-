'use client';

import { LEG, radiusFrom, solveInstrument, type InstrumentParams } from '@/lib/lab/engines/instruments';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';

const W = 1000, H = 480;
const HL = '#E11D48';

/** The scales magnified, read the way a student reads them; the matching division is marked. */
export default function InstrumentsView({ params: p, conceal }: ViewProps<InstrumentParams>) {
  const r = solveInstrument(p);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.tool} reading`}>
      {p.tool === 'vernier' ? <Vernier p={p} /> : p.tool === 'screw' ? <Screw p={p} /> : <Spherometer p={p} />}
      <text className="lb-lbl" x={40} y={455}>Least count {r.lc} {r.unit}{p.zero ? ` · zero error ${p.zero > 0 ? '+' : ''}${p.zero} div = ${r.zeroError.toFixed(2)} ${r.unit}` : ' · no zero error'}</text>
      {!conceal && <text className="lb-lbl" x={960} y={455} textAnchor="end" fill={HL}>{r.label} = {r.corrected.toFixed(2)} {r.unit}{p.tool === 'spherometer' ? ` · R = ${fmt(radiusFrom(r.corrected), 1)} cm` : ''}</text>}
    </svg>
  );
}

function Vernier({ p }: { p: InstrumentParams }) {
  const r = solveInstrument(p);
  const mm = 30; // px per mm on the magnified scale
  const zeroMm = r.observed * 10; // vernier zero, in mm from the main zero
  const from = Math.max(0, Math.floor(zeroMm) - 6), to = from + 26;
  const X = (vmm: number) => 110 + (vmm - from) * mm;
  return (
    <g>
      {/* The callipers, small: the object between the jaws */}
      <rect x={60} y={40} width={880} height={22} rx={4} fill="#E8EDF4" stroke="#002147" strokeWidth={1.5} />
      <rect x={60} y={62} width={22} height={70} fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <rect x={82} y={84} width={Math.min(600, p.len * 60)} height={30} rx={4} fill="#F59E0B" opacity={0.85} />
      <rect x={82 + Math.min(600, p.len * 60)} y={62} width={22} height={70} fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <text className="lb-sm" x={90} y={152}>object between the jaws (magnified below)</text>

      {/* Main scale */}
      <rect x={100} y={190} width={820} height={90} fill="#F7F9FB" stroke="#9AA6B8" />
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map(m => (
        <g key={`m${m}`}>
          <line x1={X(m)} x2={X(m)} y1={280} y2={m % 10 === 0 ? 220 : m % 5 === 0 ? 240 : 252} stroke="#002147" strokeWidth={m % 10 === 0 ? 2.5 : 1.5} />
          {m % 10 === 0 && <text className="lb-lbl" x={X(m)} y={212} textAnchor="middle">{m / 10}</text>}
        </g>
      ))}
      <text className="lb-sm" x={925} y={235}>cm</text>
      {/* Vernier scale: 10 divisions in 9 mm */}
      <rect x={X(zeroMm) - 14} y={280} width={9 * mm + 28} height={80} fill="#DCEBFF" stroke="#2F6BFF" />
      {Array.from({ length: 11 }, (_, i) => i).map(i => {
        const x = X(zeroMm + i * 0.9), on = i === r.div || (r.div === 0 && i === 10);
        return (
          <g key={`v${i}`}>
            <line x1={x} x2={x} y1={280} y2={i % 5 === 0 ? 318 : 304} stroke={on ? HL : '#002147'} strokeWidth={on ? 3.5 : 1.5} />
            {i % 5 === 0 && <text className="lb-sm" x={x} y={336} textAnchor="middle">{i}</text>}
          </g>
        );
      })}
      <text className="lb-sm" x={X(zeroMm)} y={378} textAnchor="middle">vernier zero</text>
      <text className="lb-sm" x={X(zeroMm + r.div * 0.9)} y={398} textAnchor="middle" fill={HL}>coincides</text>
    </g>
  );
}

function Screw({ p }: { p: InstrumentParams }) {
  const r = solveInstrument(p);
  const mm = 46;
  const edge = 120 + r.observed * mm; // thimble edge on the sleeve
  const visible = Math.floor(r.observed);
  return (
    <g>
      {/* Frame and anvil, small */}
      <path d="M60 60 H200 V100 H90 V170 H60 Z" fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <rect x={60} y={120} width={30} height={30} fill="#9AA6B8" />
      <rect x={90} y={128} width={Math.max(4, p.dia * 6)} height={14} fill="#F59E0B" />
      <text className="lb-sm" x={60} y={196}>wire between anvil and spindle</text>

      {/* Sleeve with the pitch scale (mm) */}
      <rect x={100} y={250} width={Math.max(edge - 100, 40)} height={60} fill="#F7F9FB" stroke="#9AA6B8" />
      <line x1={110} x2={Math.max(edge, 130)} y1={280} y2={280} stroke="#002147" strokeWidth={2} />
      {Array.from({ length: visible + 1 }, (_, i) => i).filter(i => 120 + i * mm < edge).map(i => (
        <g key={`p${i}`}>
          <line x1={120 + i * mm} x2={120 + i * mm} y1={280} y2={258} stroke="#002147" strokeWidth={2} />
          <text className="lb-sm" x={120 + i * mm} y={250} textAnchor="middle">{i}</text>
        </g>
      ))}
      {/* Thimble with the circular scale; the reference line reads division `div` */}
      <rect x={edge} y={200} width={260} height={160} rx={10} fill="#DCEBFF" stroke="#2F6BFF" strokeWidth={2} />
      {Array.from({ length: 11 }, (_, k) => k - 5).map(k => {
        const d = (r.div + k + 100) % 100, y = 280 + k * 14, on = k === 0;
        return (
          <g key={`c${k}`}>
            <line x1={edge} x2={edge + (d % 5 === 0 ? 44 : 26)} y1={y} y2={y} stroke={on ? HL : '#002147'} strokeWidth={on ? 3 : 1.5} />
            {d % 5 === 0 && <text className="lb-sm" x={edge + 52} y={y + 4}>{d}</text>}
          </g>
        );
      })}
      <text className="lb-sm" x={edge + 110} y={284} fill={HL}>← reference line</text>
      <text className="lb-sm" x={edge + 110} y={390}>pitch 1 mm · 100 divisions</text>
    </g>
  );
}

function Spherometer({ p }: { p: InstrumentParams }) {
  const r = solveInstrument(p);
  const cx = 300, base = 330, k = 18; // exaggerated curve so the bulge shows
  const R = 240;
  const h = Math.min(120, r.observed * k);
  return (
    <g>
      {/* Convex surface (exaggerated) */}
      <path d={`M${cx - R} ${base} Q ${cx} ${base - 2 * h} ${cx + R} ${base}`} fill="#DCEBFF" stroke="#2F6BFF" strokeWidth={3} />
      <line x1={cx - R - 20} x2={cx + R + 20} y1={base} y2={base} className="lb-axis" />
      {/* Legs on the surface and the central screw */}
      {[-1, 1].map(s => <line key={s} x1={cx + s * 150} x2={cx + s * 150} y1={130} y2={base - (h * (1 - (150 / R) ** 2))} stroke="#002147" strokeWidth={4} />)}
      <rect x={cx - 190} y={110} width={380} height={22} rx={5} fill="#C9D6E8" stroke="#002147" strokeWidth={1.5} />
      <line x1={cx} x2={cx} y1={70} y2={base - h} stroke="#E11D48" strokeWidth={5} />
      <ellipse cx={cx} cy={84} rx={80} ry={14} fill="#F7F9FB" stroke="#002147" strokeWidth={1.5} />
      <line x1={cx - 22} x2={cx + 22} y1={base - h} y2={base - h} className="lb-eq" />
      <text className="lb-sm" x={cx + 30} y={base - h + 4}>h (sagitta)</text>
      <text className="lb-sm" x={cx - 150} y={base + 26} textAnchor="middle">leg</text>
      <text className="lb-sm" x={cx + 150} y={base + 26} textAnchor="middle">leg</text>
      <text className="lb-sm" x={cx} y={base + 50} textAnchor="middle">legs {LEG} cm apart (l) · curve exaggerated</text>
      {/* The reading */}
      <g transform="translate(640 120)">
        <text className="lb-lbl" x={0} y={0}>Reading</text>
        <text className="lb-sm" x={0} y={34}>Pitch scale: {r.main.toFixed(0)} mm</text>
        <text className="lb-sm" x={0} y={60}>Circular scale: {r.div} div × 0.01 mm</text>
        <text className="lb-sm" x={0} y={86}>Observed: {r.observed.toFixed(2)} mm</text>
        <text className="lb-sm" x={0} y={124}>R = l²/6h + h/2</text>
      </g>
    </g>
  );
}
