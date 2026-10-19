'use client';

import { diodeCurrent, ldrResistance, LDR, rectified, type DiodeParams } from '@/lib/lab/engines/diode';
import { fmt } from '@/lib/lab/types';
import { Graph, niceMax } from './Graph';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function DiodeView({ params: p, conceal, runKey }: ViewProps<DiodeParams>) {
  const k = useRun(runKey, conceal, 3000);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Semiconductors: ${p.mode}`}>
      {p.mode === 'iv' ? <IV p={p} k={k} conceal={conceal} /> : p.mode === 'ldr' ? <Ldr p={p} conceal={conceal} /> : <Rectifier p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function IV({ p, k, conceal }: { p: DiodeParams; k: number; conceal: boolean }) {
  const fwd = p.bias === 'forward';
  const vMax = fwd ? 0.9 : 20;
  const at = (v: number) => Math.abs(diodeCurrent(p.material, p.bias, v)) * (fwd ? 1000 : 1e6); // mA forward, μA reverse
  const yMax = niceMax(at(vMax * (fwd ? 0.93 : 1)));
  const pts = Array.from({ length: 10 }, (_, i) => ((i + 1) * vMax * (fwd ? 0.93 : 1)) / 10).filter(v => v <= vMax * Math.max(0.1, k) + 1e-9);
  return (
    <g>
      {/* Circuit: battery, rheostat, diode, meters */}
      <path d="M80 120 H420 V320 H80 Z" className="lb-wire" />
      <g transform="translate(240 106)"><polygon points={fwd ? '0,0 0,28 26,14' : '26,0 26,28 0,14'} fill="#002147" /><line x1={fwd ? 26 : 0} x2={fwd ? 26 : 0} y1={0} y2={28} stroke="#002147" strokeWidth={4} /></g>
      <circle cx={340} cy={320} r={22} className="lb-meter" /><text className="lb-sm" x={340} y={325} textAnchor="middle">{fwd ? 'mA' : 'μA'}</text>
      <circle cx={250} cy={60} r={22} className="lb-meter" /><text className="lb-lbl" x={250} y={66} textAnchor="middle">V</text>
      <path d="M200 120 V60 H228 M272 60 H300 V120" fill="none" stroke="#2F6BFF" strokeWidth={2} />
      <text className="lb-sm" x={80} y={360}>{fwd ? 'forward: p side to +' : 'reverse: p side to −'}</text>
      <text className="lb-lbl" x={80} y={400}>{fmt(p.V, 2)} V → {conceal ? '?' : `${fmt(at(p.V), 2)} ${fwd ? 'mA' : 'μA'}`}</text>
      <Graph x={540} y={60} w={400} h={300} xLabel="V (V)" yLabel={fwd ? 'I (mA)' : 'I (μA, reverse)'} xMax={vMax} yMax={yMax}
        points={conceal ? [] : pts.map(v => ({ x: v, y: at(v) }))} line={{ path: Array.from({ length: 61 }, (_, i) => (i * vMax * (fwd ? 0.93 : 1)) / 60).map(v => ({ x: v, y: Math.min(yMax, at(v)) })) }} hideLine={conceal || k < 1} />
    </g>
  );
}

function Ldr({ p, conceal }: { p: DiodeParams; conceal: boolean }) {
  const R = ldrResistance(p.d), x = 120 + p.d * 4;
  const ds = [10, 20, 30, 40, 60, 80, 100];
  return (
    <g>
      <rect x={60} y={190} width={36} height={60} rx={8} fill="#556378" />
      <circle cx={78} cy={180} r={22} fill="#FBBF24" />
      {[1, 0.6, 0.3].map((o, i) => <circle key={i} cx={78} cy={180} r={30 + i * 26} fill="none" stroke="#FBBF24" strokeWidth={2} opacity={o * Math.min(1, 40 / p.d)} />)}
      <rect x={x - 20} y={170} width={40} height={40} rx={20} fill="#B45309" stroke="#002147" strokeWidth={2} />
      <path d={`M${x - 12} ${190} q 6 -10 12 0 t 12 0`} fill="none" stroke="#FDE68A" strokeWidth={2} />
      <line className="lb-axis" x1={96} x2={x - 20} y1={260} y2={260} />
      <text className="lb-sm" x={(96 + x) / 2} y={280} textAnchor="middle">{fmt(p.d, 0)} cm</text>
      <text className="lb-lbl" x={60} y={360}>LDR {conceal ? '?' : `${fmt(R, 0)} Ω`} · current {conceal ? '?' : `${fmt((LDR.E / R) * 1000, 2)} mA`}</text>
      <Graph x={600} y={60} w={340} h={300} xLabel="distance (cm)" yLabel="R (kΩ)" xMax={100} yMax={niceMax(ldrResistance(100) / 1000)}
        points={conceal ? [] : ds.map(d => ({ x: d, y: ldrResistance(d) / 1000 }))} line={{ path: Array.from({ length: 46 }, (_, i) => 10 + i * 2).map(d => ({ x: d, y: ldrResistance(d) / 1000 })) }} hideLine={conceal} />
    </g>
  );
}

function Rectifier({ p, k, conceal }: { p: DiodeParams; k: number; conceal: boolean }) {
  const r = rectified(p.wave, p.Vm), x0 = 80, w = 860, cycles = 3;
  const wave = (y0: number, amp: number, f: (s: number) => number) => Array.from({ length: 241 }, (_, i) => i / 240).map((t, i) => `${i ? 'L' : 'M'}${(x0 + t * w).toFixed(1)} ${(y0 - amp * f(Math.sin(2 * Math.PI * cycles * t))).toFixed(1)}`).join(' ');
  const out = (s: number) => (p.wave === 'full' ? Math.abs(s) : Math.max(0, s));
  return (
    <g>
      <text className="lb-lbl" x={x0} y={40}>Input: {fmt(p.Vm, 0)} V peak, 50 Hz</text>
      <line x1={x0} x2={x0 + w} y1={130} y2={130} className="lb-axis" />
      <path d={wave(130, 60, s => s)} className="lb-curve" />
      <text className="lb-lbl" x={x0} y={250}>Output ({p.wave} wave)</text>
      <line x1={x0} x2={x0 + w} y1={380} y2={380} className="lb-axis" />
      {!conceal && <path d={wave(380, 100, out)} fill="none" stroke="#E11D48" strokeWidth={3.5} strokeDasharray={`${3000 * k} 3000`} />}
      {!conceal && k >= 1 && <>
        <line className="lb-eq" x1={x0} x2={x0 + w} y1={380 - (100 * r.dc) / p.Vm} y2={380 - (100 * r.dc) / p.Vm} />
        <text className="lb-sm" x={x0 + w} y={380 - (100 * r.dc) / p.Vm - 8} textAnchor="end">average {fmt(r.dc, 2)} V · ripple {r.ripple} Hz</text>
      </>}
    </g>
  );
}
