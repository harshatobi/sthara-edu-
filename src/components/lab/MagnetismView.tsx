'use client';

import { deflection, motorForce, solenoidPoles, wireField, type MagParams } from '@/lib/lab/engines/magnetism';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;
/** Trig differs in the last digits between server and browser; rounded coordinates hydrate cleanly. */
const q = (n: number) => Math.round(n * 100) / 100;

export default function MagnetismView(props: ViewProps<MagParams>) {
  const s = props.params.scenario;
  return s === 'wire' ? <Wire {...props} /> : s === 'solenoid' ? <Solenoid {...props} /> : s === 'motor' ? <Motor {...props} /> : <Induction {...props} />;
}

/** Arrowhead at (x, y) pointing along angle a (radians, SVG coordinates). */
const Head = ({ x, y, a, colour = '#2F6BFF', size = 12 }: { x: number; y: number; a: number; colour?: string; size?: number }) => (
  <path d={`M${q(x)} ${q(y)} l${q(-size * Math.cos(a - 0.45))} ${q(-size * Math.sin(a - 0.45))} M${q(x)} ${q(y)} l${q(-size * Math.cos(a + 0.45))} ${q(-size * Math.sin(a + 0.45))}`} stroke={colour} strokeWidth={3.5} fill="none" strokeLinecap="round" />
);

/** Looking along the wire: field rings, their sense, and a compass at the chosen distance. */
function Wire({ params: p, conceal }: ViewProps<MagParams>) {
  const r = wireField(p);
  const C: [number, number] = [320, 240];
  const acw = r.sense === 'anticlockwise';
  const R = 40 + p.r * 19; // compass distance in px
  const needleUp = acw; // to the right of the wire the field points up when the rings run anticlockwise
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Wire carrying ${p.current} amps ${p.flow === 'out' ? 'towards' : 'away from'} you`}>
      {[60, 110, 160, 210].map(rr => (
        <g key={rr}>
          <circle cx={C[0]} cy={C[1]} r={rr} fill="none" stroke="#2F6BFF" strokeWidth={2.5} strokeOpacity={0.75} />
          {!conceal && <Head x={C[0]} y={C[1] - rr} a={acw ? Math.PI : 0} />}
          {!conceal && <Head x={C[0]} y={C[1] + rr} a={acw ? 0 : Math.PI} />}
        </g>
      ))}
      <circle cx={C[0]} cy={C[1]} r={22} fill="#fff" stroke="#002147" strokeWidth={4} />
      {p.flow === 'out'
        ? <circle cx={C[0]} cy={C[1]} r={6} fill="#002147" />
        : <path d={`M${C[0] - 11} ${C[1] - 11} L${C[0] + 11} ${C[1] + 11} M${C[0] + 11} ${C[1] - 11} L${C[0] - 11} ${C[1] + 11}`} stroke="#002147" strokeWidth={4} />}
      <text className="lb-sm" x={C[0]} y={C[1] + 250} textAnchor="middle">current {p.flow === 'out' ? 'towards you (dot)' : 'away from you (cross)'} · {fmt(p.current, 1)} A</text>
      <g transform={`translate(${C[0] + R} ${C[1]})`}>
        <circle r={20} fill="#fff" stroke="#002147" strokeWidth={2} />
        {conceal
          ? <line x1={0} y1={-14} x2={0} y2={14} stroke="#9AA6B8" strokeWidth={5} />
          : <><line x1={0} y1={0} x2={0} y2={needleUp ? -15 : 15} stroke="#E11D48" strokeWidth={5} /><line x1={0} y1={0} x2={0} y2={needleUp ? 15 : -15} stroke="#9AA6B8" strokeWidth={5} /></>}
      </g>
      <text className="lb-sm" x={C[0] + R} y={C[1] + 40} textAnchor="middle">compass, {fmt(p.r, 1)} cm</text>
      {/* B against distance: 1/r */}
      {(() => {
        const x0 = 640, y0 = 380, w = 300, h = 220, bMax = wireField({ ...p, r: 1 }).B;
        const pts = Array.from({ length: 91 }, (_, i) => { const d = 1 + (9 * i) / 90; return [x0 + (w * (d - 1)) / 9, y0 - (h * wireField({ ...p, r: d }).B) / bMax] as const; });
        const here = [x0 + (w * (p.r - 1)) / 9, y0 - (h * r.B) / bMax];
        return (
          <g>
            <line className="lb-tick" x1={x0} x2={x0 + w} y1={y0} y2={y0} /><line className="lb-tick" x1={x0} x2={x0} y1={y0} y2={y0 - h - 10} />
            <path className="lb-curve" d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')} />
            <circle cx={here[0]} cy={here[1]} r={7} fill="#E11D48" />
            <text className="lb-sm" x={x0} y={y0 + 20}>1 cm</text><text className="lb-sm" x={x0 + w} y={y0 + 20} textAnchor="end">10 cm</text>
            <text className="lb-lbl" x={x0} y={y0 - h - 20}>Field strength vs distance</text>
            {!conceal && <text className="lb-sm" x={here[0] + 12} y={here[1] - 10}>{fmt(r.B * 1e6, 1)} μT</text>}
          </g>
        );
      })()}
    </svg>
  );
}

/** A coil seen from the side; the inset shows the current as seen from the near (left) end. */
function Solenoid({ params: p, conceal }: ViewProps<MagParams>) {
  const poles = solenoidPoles(p);
  const rightIsN = poles.right === 'N';
  const x0 = 330, x1 = 690, cy = 250;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Solenoid with current ${p.wind === 'cw' ? 'clockwise' : 'anticlockwise'} seen from the near end`}>
      {!conceal && [70, 110, 150].map(o => (
        <g key={o}>
          <path d={`M${x1} ${cy} C ${x1 + 160} ${cy - o * 1.3}, ${x0 - 160} ${cy - o * 1.3}, ${x0} ${cy}`} fill="none" stroke="#2F6BFF" strokeWidth={2} strokeOpacity={0.7} />
          <path d={`M${x1} ${cy} C ${x1 + 160} ${cy + o * 1.3}, ${x0 - 160} ${cy + o * 1.3}, ${x0} ${cy}`} fill="none" stroke="#2F6BFF" strokeWidth={2} strokeOpacity={0.7} />
          <Head x={500} y={cy - o * 0.98} a={rightIsN ? Math.PI : 0} />
          <Head x={500} y={cy + o * 0.98} a={rightIsN ? Math.PI : 0} />
        </g>
      ))}
      {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx={x0 + 15 + i * 30} cy={cy} rx={12} ry={56} fill="none" stroke="#B45309" strokeWidth={5} />)}
      {!conceal && [-24, 0, 24].map(dy => <g key={dy}><line x1={x0 + 10} x2={x1 - 10} y1={cy + dy} y2={cy + dy} stroke="#2F6BFF" strokeWidth={2.5} /><Head x={500} y={cy + dy} a={rightIsN ? 0 : Math.PI} /></g>)}
      <text className="lb-lbl" x={x0 - 30} y={cy + 6} textAnchor="end" style={{ fontSize: 30 }}>{conceal ? '?' : poles.left}</text>
      <text className="lb-lbl" x={x1 + 30} y={cy + 6} style={{ fontSize: 30 }}>{conceal ? '?' : poles.right}</text>
      <g transform="translate(120 100)">
        <circle r={46} fill="#fff" stroke="#B45309" strokeWidth={5} />
        <Head x={0} y={-46} a={p.wind === 'cw' ? 0 : Math.PI} colour="#B45309" size={14} />
        <Head x={0} y={46} a={p.wind === 'cw' ? Math.PI : 0} colour="#B45309" size={14} />
        <text className="lb-sm" y={74} textAnchor="middle">near end, seen face on:</text>
        <text className="lb-sm" y={92} textAnchor="middle">current {p.wind === 'cw' ? 'clockwise' : 'anticlockwise'}</text>
      </g>
      <text className="lb-sm" x={500} y={460} textAnchor="middle">{fmt(p.current, 1)} A · more turns or more current make it stronger</text>
    </svg>
  );
}

/** The motor effect: a rod across the gap of a magnet; the force is into or out of the screen. */
function Motor({ params: p, conceal, runKey }: ViewProps<MagParams>) {
  const r = motorForce(p);
  const k = useRun(runKey, conceal, 1600);
  const towards = r.word.startsWith('Out');
  const topN = p.field === 'down';
  const thick = 16 * (1 + (towards ? 0.6 : -0.45) * k);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rod carrying current ${p.dirI === 'lr' ? 'left to right' : 'right to left'} in a field pointing ${p.field}`}>
      <rect x={300} y={40} width={400} height={90} rx={8} fill={topN ? '#E11D48' : '#2F6BFF'} />
      <text className="lb-lbl" x={500} y={96} textAnchor="middle" style={{ fill: '#fff', fontSize: 30 }}>{topN ? 'N' : 'S'}</text>
      <rect x={300} y={350} width={400} height={90} rx={8} fill={topN ? '#2F6BFF' : '#E11D48'} />
      <text className="lb-lbl" x={500} y={406} textAnchor="middle" style={{ fill: '#fff', fontSize: 30 }}>{topN ? 'S' : 'N'}</text>
      {[360, 430, 500, 570, 640].map(x => <g key={x}><line x1={x} x2={x} y1={140} y2={340} stroke="#2F6BFF" strokeWidth={2} strokeDasharray="6 6" /><Head x={x} y={topN ? 330 : 150} a={topN ? Math.PI / 2 : -Math.PI / 2} /></g>)}
      <line x1={140} x2={860} y1={240} y2={240} stroke="#B45309" strokeWidth={thick} strokeLinecap="round" />
      <Head x={p.dirI === 'lr' ? 820 : 180} y={200} a={p.dirI === 'lr' ? 0 : Math.PI} colour="#002147" size={16} />
      <line x1={180} x2={820} y1={200} y2={200} stroke="#002147" strokeWidth={3} />
      <text className="lb-sm" x={500} y={190} textAnchor="middle">current {fmt(p.current, 1)} A</text>
      {!conceal && (
        <g transform="translate(900 240)">
          <circle r={30} fill="#fff" stroke="#E11D48" strokeWidth={4} />
          {towards ? <circle r={8} fill="#E11D48" /> : <path d="M-15 -15 L15 15 M15 -15 L-15 15" stroke="#E11D48" strokeWidth={5} />}
          <text className="lb-sm" y={52} textAnchor="middle">force</text>
          <text className="lb-sm" y={70} textAnchor="middle">{towards ? 'towards you' : 'away from you'}</text>
          <text className="lb-sm" y={88} textAnchor="middle">{fmt(r.size, 3)} N</text>
        </g>
      )}
    </svg>
  );
}

/** Magnet and coil with a galvanometer: the needle swings only while the magnet moves. */
function Induction({ params: p, conceal, runKey }: ViewProps<MagParams>) {
  const d = deflection(p);
  const k = useRun(runKey, conceal, p.speed === 'fast' ? 900 : 2200);
  const coilX0 = 520, coilX1 = 760;
  // Magnet's leading face position: out at 440, in at 600.
  const lead = p.move === 'still' ? 600 : p.move === 'in' ? 440 + 160 * k : 600 - 160 * k;
  const moving = k > 0 && k < 1 && p.move !== 'still';
  const angle = (moving ? d : 0) * 24;
  const ghost = !conceal && k === 1 && d !== 0;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.pole} pole ${p.move === 'still' ? 'held still in' : p.move === 'in' ? 'pushed into' : 'pulled out of'} a coil`}>
      {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={coilX0 + 15 + i * 27} cy={200} rx={11} ry={60} fill="none" stroke="#B45309" strokeWidth={5} />)}
      <g transform={`translate(${lead - 260} 0)`}>
        <rect x={0} y={178} width={130} height={44} fill={p.pole === 'N' ? '#2F6BFF' : '#E11D48'} />
        <rect x={130} y={178} width={130} height={44} fill={p.pole === 'N' ? '#E11D48' : '#2F6BFF'} />
        <text className="lb-lbl" x={65} y={207} textAnchor="middle" style={{ fill: '#fff' }}>{p.pole === 'N' ? 'S' : 'N'}</text>
        <text className="lb-lbl" x={195} y={207} textAnchor="middle" style={{ fill: '#fff' }}>{p.pole}</text>
      </g>
      <path d={`M${coilX0 + 10} 260 V 380 H 420 M${coilX1 - 10} 260 V 380 H 580`} fill="none" stroke="#002147" strokeWidth={3} />
      <g transform="translate(500 400)">
        <path d="M-80 0 A80 80 0 0 1 80 0" fill="#fff" stroke="#002147" strokeWidth={3} />
        {[-2, -1, 0, 1, 2].map(t => <line key={t} x1={q(Math.sin(t * 24 * Math.PI / 180) * 68)} y1={q(-Math.cos(t * 24 * Math.PI / 180) * 68)} x2={q(Math.sin(t * 24 * Math.PI / 180) * 78)} y2={q(-Math.cos(t * 24 * Math.PI / 180) * 78)} stroke="#002147" strokeWidth={2} />)}
        {ghost && <line x1={0} y1={0} x2={q(Math.sin(d * 24 * Math.PI / 180) * 64)} y2={q(-Math.cos(d * 24 * Math.PI / 180) * 64)} stroke="#E11D48" strokeWidth={3} strokeDasharray="5 5" />}
        <line x1={0} y1={0} x2={q(Math.sin(angle * Math.PI / 180) * 64)} y2={q(-Math.cos(angle * Math.PI / 180) * 64)} stroke="#E11D48" strokeWidth={4} />
        <circle r={6} fill="#002147" />
        <text className="lb-sm" y={22} textAnchor="middle">galvanometer</text>
      </g>
      <text className="lb-lbl" x={40} y={50}>{p.move === 'still' ? 'Magnet held still' : `${p.pole === 'N' ? 'North' : 'South'} pole ${p.move === 'in' ? 'pushed in' : 'pulled out'} ${p.speed === 'fast' ? 'quickly' : 'slowly'}`}</text>
      {ghost && <text className="lb-sm" x={600} y={420}>dashed: how far it swung</text>}
      {!conceal && k === 1 && d === 0 && <text className="lb-sm" x={600} y={420}>no change in the field: no current</text>}
    </svg>
  );
}
