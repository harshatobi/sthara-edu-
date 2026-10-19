'use client';

import { bernoulli, MARKS, riseCm, T_DETERGENT, T_WATER, terminal, type FluidParams } from '@/lib/lab/engines/fluids';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function FluidsView({ params: p, conceal, runKey }: ViewProps<FluidParams>) {
  const k = useRun(runKey, conceal, p.mode === 'viscosity' ? 6000 : 2500);
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fluids: ${p.mode}`}>
      {p.mode === 'capillary' ? <Capillary p={p} k={k} conceal={conceal} /> : p.mode === 'viscosity' ? <Falling p={p} k={k} conceal={conceal} /> : <Venturi p={p} k={k} conceal={conceal} />}
    </svg>
  );
}

function Capillary({ p, k, conceal }: { p: FluidParams; k: number; conceal: boolean }) {
  const surface = 360, pxCm = 30;
  const tubes = [p.r * 2, p.r, p.r / 2].filter(r => r >= 0.1);
  const T = p.detergent === 'yes' ? T_DETERGENT : T_WATER;
  return (
    <g>
      <rect x={80} y={surface} width={560} height={90} fill="#DCEBFF" stroke="#2F6BFF" strokeWidth={2} />
      {tubes.map((r, i) => {
        const h = conceal ? 0 : Math.min(300, riseCm(r, T) * pxCm * k), x = 170 + i * 170, w = Math.max(6, r * 22);
        return (
          <g key={i}>
            <rect x={x - w / 2 - 3} y={20} width={w + 6} height={surface + 60} fill="none" stroke="#002147" strokeWidth={2} />
            <rect x={x - w / 2} y={surface - h} width={w} height={h + 60} fill="#2F6BFF" opacity={0.55} />
            <path d={`M${x - w / 2} ${surface - h + 3} Q ${x} ${surface - h - 6} ${x + w / 2} ${surface - h + 3}`} fill="none" stroke="#2F6BFF" strokeWidth={2} />
            <text className="lb-sm" x={x} y={surface + 80} textAnchor="middle">r = {fmt(r, 2)} mm</text>
            {!conceal && <text className="lb-sm" x={x + w / 2 + 8} y={surface - h / 2}>{fmt(riseCm(r, T), 1)} cm</text>}
          </g>
        );
      })}
      <text className="lb-lbl" x={680} y={80}>{p.detergent === 'yes' ? 'Water with detergent' : 'Pure water'}</text>
      <text className="lb-sm" x={680} y={108}>T = {T} N/m · θ ≈ 0</text>
      <text className="lb-sm" x={680} y={134}>h = 2T / (rρg)</text>
      <text className="lb-sm" x={680} y={160}>thinner tube, higher rise</text>
    </g>
  );
}

function Falling({ p, k, conceal }: { p: FluidParams; k: number; conceal: boolean }) {
  const v = terminal(p.ball, p.liquid); // cm/s
  const top = 60, a = 100, b = a + MARKS * 14, bottom = 440, x = 260;
  // Accelerates over the first few cm, then steady; the run lasts 6 s of real time.
  const t = conceal ? 0 : k * 6, dist = Math.min((bottom - top) / 14, v * Math.max(0, t - 0.15));
  const y = top + 10 + dist * 14;
  const r = Math.max(4, p.ball * 5);
  return (
    <g>
      <rect x={x - 60} y={top} width={120} height={bottom - top} rx={8} fill="#FDF3D7" stroke="#002147" strokeWidth={2} />
      <line x1={x - 60} x2={x + 60} y1={a} y2={a} stroke="#E11D48" strokeWidth={2} />
      <line x1={x - 60} x2={x + 60} y1={b} y2={b} stroke="#E11D48" strokeWidth={2} />
      <text className="lb-sm" x={x + 70} y={a + 4}>mark A</text>
      <text className="lb-sm" x={x + 70} y={b + 4}>mark B ({MARKS} cm below)</text>
      <circle cx={x} cy={Math.min(bottom - r - 2, y)} r={r} fill="#556378" stroke="#002147" strokeWidth={1.5} />
      <text className="lb-lbl" x={520} y={90}>Steel ball, r = {fmt(p.ball, 2)} mm, in {p.liquid === 'castor' ? 'castor oil' : 'glycerine'}</text>
      {!conceal && <>
        <text className="lb-sm" x={520} y={124}>terminal velocity {fmt(v, 2)} cm/s</text>
        <text className="lb-sm" x={520} y={150}>time from A to B: {fmt(MARKS / v, 2)} s</text>
      </>}
      <text className="lb-sm" x={520} y={190}>v = 2r²(ρ − σ)g / 9η</text>
    </g>
  );
}

function Venturi({ p, k, conceal }: { p: FluidParams; k: number; conceal: boolean }) {
  const b = bernoulli(p.v1, p.ratio);
  const wide = 90, narrow = wide / p.ratio, cy = 340, x0 = 80, x1 = 900;
  const base = 120; // height of water in the wide tubes (px)
  const drop = conceal ? 0 : Math.min(base - 10, b.dh * 6 * k);
  const pipe = `M${x0} ${cy - wide / 2} H360 L440 ${cy - narrow / 2} H560 L640 ${cy - wide / 2} H${x1} V${cy + wide / 2} H640 L560 ${cy + narrow / 2} H440 L360 ${cy + wide / 2} H${x0} Z`;
  const tube = (x: number, top: number, pipeTop: number, label: string) => (
    <g>
      <rect x={x - 10} y={cy - 280} width={20} height={pipeTop - (cy - 280)} fill="none" stroke="#002147" strokeWidth={1.5} />
      <rect x={x - 8} y={top} width={16} height={pipeTop - top} fill="#2F6BFF" opacity={0.6} />
      <text className="lb-sm" x={x} y={cy + wide / 2 + 24} textAnchor="middle">{label}</text>
    </g>
  );
  return (
    <g>
      <path d={pipe} fill="#DCEBFF" stroke="#2F6BFF" strokeWidth={2} />
      {[0, 1, 2].map(i => <line key={i} className="lb-flow" x1={x0 + 10} x2={x1 - 10} y1={cy - 10 + i * 10} y2={cy - 10 + i * 10} style={{ animationDuration: `${1.4 / p.v1}s` }} />)}
      {tube(220, cy - wide / 2 - base, cy - wide / 2, `v₁ ${fmt(p.v1, 1)} m/s`)}
      {tube(500, cy - wide / 2 - base + drop, cy - narrow / 2, conceal ? 'narrow' : `v₂ ${fmt(b.v2, 2)} m/s`)}
      {tube(780, cy - wide / 2 - base + 4, cy - wide / 2, 'after')}
      {!conceal && <text className="lb-lbl" x={40} y={40}>Level {fmt(b.dh, 1)} cm lower at the neck: P₁ − P₂ = ½ρ(v₂² − v₁²) = {fmt(b.dP, 0)} Pa</text>}
    </g>
  );
}
