'use client';

import { COIL, FAULTS, FUSE_A, household, impedance, ITEMS, LAMP_W, MAINS_V, type ComponentsParams } from '@/lib/lab/engines/components';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function ComponentsView({ params: p, conceal, runKey }: ViewProps<ComponentsParams>) {
  const k = useRun(runKey, conceal, 2000);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Circuit activity: ${p.mode}`}>
      {p.mode === 'household' ? <Household p={p} conceal={conceal} />
        : p.mode === 'inductor' ? <Coil p={p} conceal={conceal} />
        : p.mode === 'faulty' ? <Faulty p={p} conceal={conceal} k={k} />
        : <Part p={p} conceal={conceal} k={k} />}
    </svg>
  );
}

function Bulb({ x, y, on, glow = 1 }: { x: number; y: number; on: boolean; glow?: number }) {
  return (
    <g>
      {on && <circle cx={x} cy={y} r={34} fill="#FDE68A" opacity={0.6 * glow} />}
      <circle cx={x} cy={y} r={20} fill={on ? '#FBBF24' : '#F2F5F9'} stroke="#002147" strokeWidth={2} />
      <path d={`M${x - 8} ${y + 4} l4 -8 l4 8 l4 -8 l4 8`} fill="none" stroke="#002147" strokeWidth={1.5} />
    </g>
  );
}

function Household({ p, conceal }: { p: ComponentsParams; conceal: boolean }) {
  const h = household(p), live = !h.blown || conceal;
  const xs = [380, 540, 700];
  return (
    <g>
      <path d="M80 120 H880 M80 360 H880" className="lb-wire" />
      <text className="lb-sm" x={60} y={114} textAnchor="end">L</text><text className="lb-sm" x={60} y={364} textAnchor="end">N</text>
      <rect x={160} y={106} width={80} height={28} rx={6} fill={live ? '#fff' : '#FDE7D9'} stroke="#002147" strokeWidth={2} />
      <path d={live ? 'M168 120 H232' : 'M168 120 H190 M210 120 H232'} stroke="#B45309" strokeWidth={2} />
      <text className="lb-sm" x={200} y={98} textAnchor="middle">fuse {FUSE_A} A</text>
      {xs.map((x, i) => {
        const on = i < p.bulbs && live;
        return (
          <g key={x}>
            <path d={`M${x} 120 V170 M${x} 200 V220 M${x} 280 V360`} className="lb-wire" />
            <line x1={x} y1={170} x2={i < p.bulbs ? x : x + 20} y2={200} stroke="#002147" strokeWidth={3} />
            <circle cx={x} cy={170} r={4} fill="#002147" />
            <Bulb x={x} y={250} on={on} />
            <text className="lb-sm" x={x + 30} y={190}>S{i + 1}</text>
          </g>
        );
      })}
      <g>
        <path d="M840 120 V200 M840 300 V360" className="lb-wire" />
        <rect x={815} y={200} width={50} height={100} rx={6} fill={p.heater === 'on' && live ? '#FCA5A5' : '#F2F5F9'} stroke="#002147" strokeWidth={2} />
        <text className="lb-sm" x={840} y={320} textAnchor="middle">heater</text>
      </g>
      <text className="lb-lbl" x={60} y={430}>{p.bulbs} × {LAMP_W} W lamp{p.heater === 'on' ? ' + 1000 W heater' : ''}, in parallel across {MAINS_V} V</text>
      {!conceal && <text className="lb-lbl" x={60} y={458} fill={h.blown ? '#E11D48' : undefined}>I = {fmt(h.I, 2)} A {h.blown ? `> ${FUSE_A} A: the fuse melts and everything goes off` : `within the ${FUSE_A} A fuse`}</text>}
    </g>
  );
}

function Coil({ p, conceal }: { p: ComponentsParams; conceal: boolean }) {
  const ac = impedance(p.core);
  const glowDC = 1, glowAC = Math.min(1, (COIL.R + 40) / (ac.Z + 40));
  const coil = (x: number) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => <ellipse key={i} cx={x + i * 14} cy={200} rx={9} ry={26} fill="none" stroke="#B45309" strokeWidth={3} />)}
      {p.core === 'iron' && <rect x={x - 12} y={192} width={122} height={16} fill="#556378" />}
    </g>
  );
  return (
    <g>
      {[{ x: 80, label: 'DC (battery)', glow: glowDC }, { x: 540, label: 'AC (50 Hz mains, stepped down)', glow: glowAC }].map(c => (
        <g key={c.x}>
          <rect x={c.x} y={120} width={360} height={200} rx={8} fill="none" stroke="#002147" strokeWidth={2} />
          {coil(c.x + 60)}
          <Bulb x={c.x + 290} y={200} on={!conceal} glow={c.glow} />
          <text className="lb-lbl" x={c.x} y={100}>{c.label}</text>
        </g>
      ))}
      {!conceal && <>
        <text className="lb-sm" x={80} y={360}>DC: only R = {COIL.R} Ω limits the current</text>
        <text className="lb-sm" x={540} y={360}>AC: Z = √(R² + (2πfL)²) = {fmt(ac.Z, 0)} Ω {p.core === 'iron' ? '(iron core: the lamp is dim)' : ''}</text>
      </>}
      <text className="lb-lbl" x={80} y={430}>{p.core === 'iron' ? 'Iron core in the coil' : 'Coil without a core'}</text>
    </g>
  );
}

function Part({ p, conceal, k }: { p: ComponentsParams; conceal: boolean; k: number }) {
  const it = ITEMS[p.item];
  const reversed = !conceal && k > 0.5;
  const shape = (x: number, y: number) => {
    if (p.item === 'diode') return <g><rect x={x - 50} y={y - 16} width={100} height={32} rx={14} fill="#1F2937" /><rect x={x + 26} y={y - 16} width={10} height={32} fill="#CBD5E1" /></g>;
    if (p.item === 'led') return <g><path d={`M${x - 24} ${y + 20} V${y - 10} a24 24 0 0 1 48 0 V${y + 20} Z`} fill={reversed ? '#FCA5A5' : '#EF4444'} opacity={0.85} /><line x1={x - 10} x2={x - 10} y1={y + 20} y2={y + 70} stroke="#556378" strokeWidth={3} /><line x1={x + 10} x2={x + 10} y1={y + 20} y2={y + 56} stroke="#556378" strokeWidth={3} /></g>;
    if (p.item === 'resistor') return <g><rect x={x - 50} y={y - 14} width={100} height={28} rx={12} fill="#E8D3B4" />{['#B45309', '#000', '#E11D48', '#D4AF37'].map((c, i) => <rect key={i} x={x - 32 + i * 18} y={y - 14} width={7} height={28} fill={c} />)}</g>;
    return <g><rect x={x - 26} y={y - 40} width={52} height={80} rx={8} fill="#2F6BFF" /><text className="lb-sm" x={x} y={y + 4} textAnchor="middle" fill="#fff">100μF</text></g>;
  };
  const reading = conceal ? '' : reversed ? it.reverse : it.forward;
  return (
    <g>
      {shape(300, 220)}
      <rect x={600} y={100} width={240} height={300} rx={18} fill="#FBBF24" stroke="#002147" strokeWidth={2} />
      <rect x={630} y={130} width={180} height={70} rx={6} fill="#E8F5E9" stroke="#002147" />
      <text className="lb-sm" x={720} y={172} textAnchor="middle">{reading.length > 18 ? reading.split(' ').slice(0, 3).join(' ') : reading}</text>
      <text className="lb-sm" x={720} y={240} textAnchor="middle">diode test range</text>
      <path d={`M300 ${250} C 400 360 560 380 640 330`} fill="none" stroke={reversed ? '#002147' : '#E11D48'} strokeWidth={3} />
      <path d={`M300 ${190} C 400 80 560 80 640 300`} fill="none" stroke={reversed ? '#E11D48' : '#002147'} strokeWidth={3} />
      <text className="lb-lbl" x={60} y={60}>{p.mode === 'identify' && conceal ? 'What is this component?' : `${it.label}: ${reversed ? 'leads reversed' : 'red (+) lead on the first terminal'}`}</text>
      {!conceal && <text className="lb-sm" x={60} y={440}>{it.looks}</text>}
    </g>
  );
}

function Faulty({ p, conceal, k }: { p: ComponentsParams; conceal: boolean; k: number }) {
  const fixed = !conceal && k >= 1;
  const f = FAULTS[p.fault];
  // A battery, key, resistor, ammeter and voltmeter. The fault is drawn until the fix is shown.
  const amInParallel = p.fault === 'ammeter-parallel' && !fixed;
  const vmInSeries = p.fault === 'voltmeter-series' && !fixed;
  const noKey = p.fault === 'key-missing' && !fixed;
  const flip = p.fault === 'meter-polarity' && !fixed;
  return (
    <g>
      <path d="M150 140 H400 M520 140 H850 V340 H150 V140" className="lb-wire" />
      <g transform="translate(230 326)"><line x1={0} x2={0} y1={0} y2={28} stroke="#002147" strokeWidth={3} /><line x1={12} x2={12} y1={7} y2={21} stroke="#002147" strokeWidth={5} /><text className="lb-sm" x={-10} y={-8}>+</text></g>
      {!noKey && <g><rect x={420} y={326} width={60} height={28} rx={4} fill="#F7F9FB" stroke="#002147" /><text className="lb-sm" x={450} y={345} textAnchor="middle">K</text></g>}
      <rect x={600} y={126} width={120} height={28} fill="#fff" stroke="#002147" strokeWidth={2} />
      <text className="lb-sm" x={660} y={118} textAnchor="middle">R</text>
      {/* Ammeter */}
      {amInParallel
        ? <g><path d="M600 140 V220 H640 M680 220 H720 V140" fill="none" stroke="#E11D48" strokeWidth={2} /><circle cx={660} cy={220} r={20} className="lb-meter" /><text className="lb-lbl" x={660} y={226} textAnchor="middle">A</text><line x1={400} x2={520} y1={140} y2={140} className="lb-wire" /></g>
        : <g><circle cx={460} cy={140} r={22} className="lb-meter" /><text className="lb-lbl" x={460} y={146} textAnchor="middle">A</text><text className="lb-sm" x={430} y={118}>{flip ? '−' : '+'}</text><text className="lb-sm" x={484} y={118}>{flip ? '+' : '−'}</text></g>}
      {/* Voltmeter */}
      {vmInSeries
        ? <g><circle cx={800} cy={240} r={22} className="lb-meter" /><text className="lb-lbl" x={800} y={246} textAnchor="middle">V</text></g>
        : <g><path d="M600 140 V60 H640 M680 60 H720 V140" fill="none" stroke="#2F6BFF" strokeWidth={2} /><circle cx={660} cy={60} r={20} className="lb-meter" /><text className="lb-lbl" x={660} y={66} textAnchor="middle">V</text></g>}
      <text className="lb-lbl" x={60} y={420} fill={fixed ? '#10B981' : '#E11D48'}>{fixed ? `Corrected: ${f.fix}` : `Fault: ${f.label}`}</text>
    </g>
  );
}
