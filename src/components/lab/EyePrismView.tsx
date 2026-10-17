'use client';

import { correctingPower, SPECTRUM, traceColour, type EyeParams } from '@/lib/lab/engines/eyePrism';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

export default function EyePrismView(props: ViewProps<EyeParams>) {
  return props.params.scenario === 'prism' ? <Prism {...props} /> : <Eye {...props} />;
}

/**
 * The eye as a labelled diagram (not to scale): where the light focuses with
 * and without the correcting lens. The lens power itself is in the readings.
 */
function Eye({ params: p, conceal, runKey }: ViewProps<EyeParams>) {
  const k = useRun(runKey, conceal, 1200);
  const myopia = p.scenario === 'myopia', fixed = p.corrected === 'yes';
  const AX = 240, LENS = 430, RETINA = 710, GLASS = 320;
  const focusX = fixed ? RETINA : myopia ? 635 : 800;
  const heights = [-60, 0, 60];
  const rays = heights.map(h => {
    const pts: [number, number][] = [];
    if (myopia) {
      if (fixed) pts.push([60, AX + h * 0.75], [GLASS, AX + h * 0.75]);
      else pts.push([60, AX + h]);
    } else {
      pts.push([130, AX]);
      if (fixed) pts.push([GLASS, AX + h * 0.7]);
    }
    pts.push([LENS, AX + h]);
    return pts;
  });
  const after = (h: number): { solid: [number, number][]; dashed?: [number, number][] } => {
    const from: [number, number] = [LENS, AX + h];
    if (focusX <= RETINA) {
      // Meets at the focus, then spreads to the retina.
      const t = (RETINA - LENS) / (focusX - LENS);
      return { solid: [from, [focusX, AX], [LENS + (focusX - LENS) * t, AX + h * (1 - t)]] };
    }
    const t = (RETINA - LENS) / (focusX - LENS);
    const atRetina: [number, number] = [RETINA, AX + h * (1 - t)];
    return { solid: [from, atRetina], dashed: [atRetina, [focusX, AX]] };
  };
  const P = correctingPower(p);
  const line = (pts: [number, number][]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ');
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${myopia ? 'Short' : 'Long'}-sighted eye ${fixed ? 'with' : 'without'} its correcting lens`}>
      <ellipse cx={580} cy={AX} rx={150} ry={140} fill="#FFF7ED" stroke="#002147" strokeWidth={3} />
      <path d={`M${RETINA - 6} ${AX - 110} Q${RETINA + 22} ${AX} ${RETINA - 6} ${AX + 110}`} fill="none" stroke="#E11D48" strokeWidth={6} />
      <text className="lb-sm" x={RETINA + 26} y={AX - 96}>retina</text>
      <ellipse cx={LENS} cy={AX} rx={16} ry={74} className="lb-glass" />
      <text className="lb-sm" x={LENS} y={AX + 100} textAnchor="middle">eye lens</text>
      {myopia ? <text className="lb-sm" x={60} y={AX - 90}>light from a distant object</text> : <><circle cx={130} cy={AX} r={6} fill="#002147" /><text className="lb-sm" x={130} y={AX - 16} textAnchor="middle">book at 25 cm</text></>}
      {fixed && (myopia
        ? <path className="lb-glass" d={`M${GLASS - 14} ${AX - 80} L${GLASS + 14} ${AX - 80} Q${GLASS + 2} ${AX} ${GLASS + 14} ${AX + 80} L${GLASS - 14} ${AX + 80} Q${GLASS - 2} ${AX} ${GLASS - 14} ${AX - 80}Z`} />
        : <path className="lb-glass" d={`M${GLASS} ${AX - 80} Q${GLASS + 28} ${AX} ${GLASS} ${AX + 80} Q${GLASS - 28} ${AX} ${GLASS} ${AX - 80}Z`} />)}
      {fixed && <text className="lb-sm" x={GLASS} y={AX + 104} textAnchor="middle">{myopia ? 'concave' : 'convex'} lens {conceal ? '' : `(${P > 0 ? '+' : '−'}${fmt(Math.abs(P), 2)} D)`}</text>}
      {rays.map((pts, i) => <path key={`in${i}`} className="lb-ray" d={line(pts)} />)}
      {!conceal && heights.map((h, i) => {
        const a = after(h);
        return (
          <g key={`out${i}-${runKey}`} style={{ opacity: k }}>
            <path className="lb-ray" d={line(a.solid)} />
            {a.dashed && <path className="lb-ray lb-virtual" d={line(a.dashed)} />}
          </g>
        );
      })}
      {!conceal && <text className="lb-lbl" x={500} y={440} textAnchor="middle">{fixed ? 'Focused on the retina: clear' : myopia ? 'Focus falls in front of the retina: blurred' : 'Focus falls behind the retina: blurred'}</text>}
      <text className="lb-sm" x={960} y={470} textAnchor="end">Diagram, not to scale</text>
    </svg>
  );
}

type Pt = [number, number];
const rot = (v: Pt, a: number): Pt => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const crossZ = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const rad = (d: number) => (d * Math.PI) / 180;
const SPREAD = 6;
/** Trig differs in the last digits between server and browser; rounded coordinates hydrate cleanly. */
const q = (n: number) => Math.round(n * 100) / 100;

/** Rays through a 60° prism, from Snell's law at both faces; the fan is drawn 6× wider than life. */
function Prism({ params: p, conceal, runKey }: ViewProps<EyeParams>) {
  const k = useRun(runKey, conceal, 1200);
  const BL: Pt = [380, 380], BR: Pt = [620, 380], AP: Pt = [500, q(380 - 240 * Math.sin(Math.PI / 3))];
  const M1: Pt = [(BL[0] + AP[0]) / 2, (BL[1] + AP[1]) / 2];
  const nIn: Pt = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]; // into the prism through the left face (SVG y down)
  const nOut2: Pt = [Math.cos(-Math.PI / 6), Math.sin(-Math.PI / 6)]; // out through the right face
  const d0 = rot(nIn, -rad(p.i)); // incoming, rising towards the face
  const start: Pt = [M1[0] - d0[0] * 330, M1[1] - d0[1] * 330];

  const paths = SPECTRUM.map(c => {
    const tr = traceColour(c.n, p.i)!;
    const s1 = Math.sign(crossZ(nIn, d0)) || 1;
    const d1 = rot(nIn, s1 * rad(tr.r1));
    // Hit the right face: M1 + t d1 on the line AP → BR.
    const e: Pt = [BR[0] - AP[0], BR[1] - AP[1]];
    const t = crossZ([AP[0] - M1[0], AP[1] - M1[1]], e) / crossZ(d1, e);
    const M2: Pt = [M1[0] + d1[0] * t, M1[1] + d1[1] * t];
    const s2 = Math.sign(crossZ(nOut2, d1)) || 1;
    return { c, tr, M2, d2: rot(nOut2, s2 * rad(tr.e)), s2 };
  });
  const meanAngle = paths.reduce((s, x) => s + Math.atan2(x.d2[1], x.d2[0]), 0) / paths.length;
  const reach = 340 * k;

  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`White light entering a glass prism at ${p.i} degrees`}>
      <path d={`M${BL[0]} ${BL[1]} L${AP[0]} ${AP[1]} L${BR[0]} ${BR[1]} Z`} className="lb-glass" />
      <line x1={q(start[0])} y1={q(start[1])} x2={q(M1[0])} y2={q(M1[1])} stroke="#002147" strokeWidth={5} />
      <text className="lb-sm" x={q(start[0])} y={q(start[1] + 24)}>white light, {fmt(p.i, 0)}°</text>
      <line className="lb-axis" x1={q(M1[0] - nIn[0] * 70)} y1={q(M1[1] - nIn[1] * 70)} x2={q(M1[0] + nIn[0] * 40)} y2={q(M1[1] + nIn[1] * 40)} />
      {paths.map(x => <line key={x.c.name} x1={q(M1[0])} y1={q(M1[1])} x2={q(x.M2[0])} y2={q(x.M2[1])} stroke={conceal ? '#9AA6B8' : x.c.hex} strokeWidth={2} />)}
      {!conceal && paths.map(x => {
        const a = meanAngle + (Math.atan2(x.d2[1], x.d2[0]) - meanAngle) * SPREAD;
        return <line key={`o${x.c.name}-${runKey}`} x1={q(x.M2[0])} y1={q(x.M2[1])} x2={q(x.M2[0] + Math.cos(a) * reach)} y2={q(x.M2[1] + Math.sin(a) * reach)} stroke={x.c.hex} strokeWidth={4} />;
      })}
      {!conceal && k === 1 && paths.filter((_, i) => i % 2 === 0 || i === 6).map(x => {
        const a = meanAngle + (Math.atan2(x.d2[1], x.d2[0]) - meanAngle) * SPREAD;
        return <text key={`l${x.c.name}`} className="lb-sm" x={q(x.M2[0] + Math.cos(a) * (reach + 12))} y={q(x.M2[1] + Math.sin(a) * (reach + 12) + 4)}>{x.c.name} {fmt(x.tr.deviation, 2)}°</text>;
      })}
      <text className="lb-sm" x={960} y={470} textAnchor="end">Spread between the colours drawn {SPREAD}× wider than life; deviations are exact</text>
    </svg>
  );
}
