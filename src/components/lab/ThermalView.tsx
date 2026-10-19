'use client';

import { coolAt, GAMMA_GLASS, GAMMA_WATER, HOT, mixFinal, waxAt, WAX_MP, type ThermalParams } from '@/lib/lab/engines/thermal';
import { fmt } from '@/lib/lab/types';
import { Graph } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function ThermalView({ params: p, conceal, runKey }: ViewProps<ThermalParams>) {
  const k = useRun(runKey, conceal, 4000);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Heat: ${p.mode}`}>
      {p.mode === 'cooling' || p.mode === 'wax' ? <Curve p={p} k={k} conceal={conceal} />
        : p.mode === 'mixtures' ? <Mixtures p={p} k={k} conceal={conceal} />
        : p.mode === 'bimetal' ? <Bimetal p={p} k={k} conceal={conceal} />
        : <Flask p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Thermometer({ x, y, T, max = 100 }: { x: number; y: number; T: number; max?: number }) {
  const h = 260, fill = Math.max(0, Math.min(1, T / max)) * h;
  return (
    <g>
      <rect x={x - 9} y={y} width={18} height={h + 10} rx={9} fill="#fff" stroke="#002147" strokeWidth={2} />
      <circle cx={x} cy={y + h + 24} r={18} fill="#E11D48" stroke="#002147" strokeWidth={2} />
      <rect x={x - 4} y={y + h - fill + 6} width={8} height={fill + 10} fill="#E11D48" />
      {[0, 25, 50, 75, 100].map(t => <g key={t}><line x1={x + 9} x2={x + 18} y1={y + h - (t / max) * h + 6} y2={y + h - (t / max) * h + 6} stroke="#002147" /><text className="lb-sm" x={x + 22} y={y + h - (t / max) * h + 10}>{t}</text></g>)}
    </g>
  );
}

function Curve({ p, k, conceal }: { p: ThermalParams; k: number; conceal: boolean }) {
  const tMax = 30, at = (t: number) => (p.mode === 'wax' ? waxAt(p, t) : coolAt(p, t));
  const now = conceal ? 0 : k * tMax;
  const pts = Array.from({ length: 16 }, (_, i) => i * 2).filter(t => t <= now).map(t => ({ x: t, y: at(t) }));
  return (
    <g>
      <rect x={90} y={170} width={140} height={190} rx={10} fill={p.mode === 'wax' ? '#FDF3D7' : '#DCEBFF'} stroke="#002147" strokeWidth={2} />
      {p.cover === 'lid' && p.mode === 'cooling' && <rect x={80} y={160} width={160} height={14} rx={4} fill="#9AA6B8" />}
      {p.cover === 'fan' && p.mode === 'cooling' && <text className="lb-sm" x={250} y={200}>fan →</text>}
      <Thermometer x={160} y={40} T={at(now)} />
      <text className="lb-lbl" x={60} y={420}>{p.mode === 'wax' ? 'Molten wax' : 'Hot water'} · room {fmt(p.room, 0)} °C</text>
      {!conceal && <text className="lb-sm" x={60} y={446}>t = {fmt(now, 0)} min · {fmt(at(now), 1)} °C</text>}
      <Graph x={430} y={50} w={500} h={330} xLabel="time (min)" yLabel="temperature (°C)" xMax={tMax} yMax={100} points={pts}
        line={{ path: Array.from({ length: 61 }, (_, i) => i / 2).map(t => ({ x: t, y: at(t) })) }} hideLine={conceal || k < 1} />
      {p.mode === 'wax' && !conceal && k >= 1 && <text className="lb-sm" x={440} y={380 - (WAX_MP / 100) * 330 - 8}>melting point {WAX_MP} °C: latent heat given out</text>}
    </g>
  );
}

function Mixtures({ p, k, conceal }: { p: ThermalParams; k: number; conceal: boolean }) {
  const T = mixFinal(p), dropped = !conceal && k > 0.3, settle = dropped ? Math.min(1, (k - 0.3) / 0.6) : 0;
  const Tnow = p.Tw + (T - p.Tw) * settle;
  return (
    <g>
      <rect x={60} y={200} width={160} height={160} rx={10} fill="#DCEBFF" stroke="#002147" strokeWidth={2} />
      <text className="lb-sm" x={140} y={380} textAnchor="middle">boiling water, {HOT} °C</text>
      {!dropped && <rect x={115} y={250} width={50} height={50} rx={6} fill="#B45309" />}
      <rect x={380} y={200} width={170} height={170} rx={10} fill="#F2D6B3" stroke="#002147" strokeWidth={2} />
      <rect x={392} y={230} width={146} height={128} rx={6} fill="#DCEBFF" />
      {dropped && <rect x={440} y={300} width={50} height={50} rx={6} fill="#B45309" />}
      <text className="lb-sm" x={465} y={392} textAnchor="middle">copper calorimeter + {fmt(p.mw, 0)} g water</text>
      <Thermometer x={600} y={60} T={Tnow} />
      <text className="lb-lbl" x={60} y={60}>{fmt(p.ms, 0)} g of the solid, heated to {HOT} °C, into water at {fmt(p.Tw, 1)} °C</text>
      {!conceal && k >= 1 && <text className="lb-lbl" x={700} y={200} fill="#E11D48">Settles at {fmt(T, 1)} °C</text>}
      <text className="lb-sm" x={700} y={240}>heat lost by the solid</text>
      <text className="lb-sm" x={700} y={262}>= heat gained by water + calorimeter</text>
    </g>
  );
}

function Bimetal({ p, k, conceal }: { p: ThermalParams; k: number; conceal: boolean }) {
  const bend = conceal ? 0 : (p.dT / 200) * k; // −0.3 … 1
  const x0 = 200, y0 = 240, L = 520, curve = bend * 160;
  const path = (off: number) => `M${x0} ${y0 + off} Q ${x0 + L / 2} ${y0 + off - curve * 0.1} ${x0 + L} ${y0 + off - curve}`;
  return (
    <g>
      <rect x={x0 - 60} y={y0 - 40} width={60} height={80} fill="#9AA6B8" />
      <path d={path(-9)} fill="none" stroke="#B45309" strokeWidth={16} />
      <path d={path(9)} fill="none" stroke="#556378" strokeWidth={16} />
      <text className="lb-sm" x={x0 + 10} y={y0 - 24}>brass</text>
      <text className="lb-sm" x={x0 + 10} y={y0 + 40}>iron</text>
      {p.dT > 0 && <path d={`M${x0 + 200} 440 q 20 -40 0 -70 q -20 -30 0 -60`} fill="none" stroke="#F59E0B" strokeWidth={6} opacity={k} />}
      <text className="lb-lbl" x={60} y={60}>{p.dT > 0 ? `Heated by ${fmt(p.dT, 0)} °C` : `Cooled by ${fmt(-p.dT, 0)} °C`}</text>
      {!conceal && k >= 1 && <text className="lb-lbl" x={60} y={92} fill="#E11D48">Bends towards the {p.dT > 0 ? 'iron' : 'brass'} side</text>}
    </g>
  );
}

function Flask({ p, k, conceal }: { p: ThermalParams; k: number; conceal: boolean }) {
  // Dip while the glass warms (first 25% of the run), then the water's expansion takes over.
  const t = conceal ? 0 : k;
  const final = (GAMMA_WATER - GAMMA_GLASS) * p.dT * 6000, dip = GAMMA_GLASS * Math.abs(p.dT) * 6000 * Math.sign(p.dT);
  const level = t < 0.25 ? -dip * (t / 0.25) : -dip + (final + dip) * ((t - 0.25) / 0.75);
  const base = 260;
  return (
    <g>
      <rect x={160} y={300} width={300} height={140} fill="#FDE7D9" opacity={p.dT > 0 ? 0.9 : 0.3} />
      <circle cx={310} cy={330} r={90} fill="#DCEBFF" stroke="#002147" strokeWidth={2} />
      <rect x={302} y={60} width={16} height={190} fill="#fff" stroke="#002147" strokeWidth={1.5} />
      <rect x={304} y={Math.max(62, base - level)} width={12} height={330 - Math.max(62, base - level)} fill="#2F6BFF" opacity={0.7} />
      <line className="lb-eq" x1={280} x2={360} y1={base} y2={base} />
      <text className="lb-sm" x={366} y={base + 4}>starting level</text>
      <text className="lb-lbl" x={540} y={120}>Flask in water {p.dT > 0 ? `${fmt(p.dT, 0)} °C hotter` : `${fmt(-p.dT, 0)} °C colder`}</text>
      {!conceal && <text className="lb-sm" x={540} y={150}>{t < 0.25 && t > 0 ? 'the glass expands first: the level dips' : 'the water expands about 8 times as much as glass'}</text>}
    </g>
  );
}
