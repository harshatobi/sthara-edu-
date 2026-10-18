'use client';

import { ratio, solveHeredity, TRAITS, type HeredityParams } from '@/lib/lab/engines/heredity';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

/** Colour for an offspring box, by what it shows (concealed boxes stay blank). */
function look(p: HeredityParams, g: string): string {
  if (p.cross === 'sex') return g === 'XY' ? '#BFDBFE' : '#FBCFE8';
  if (p.cross === 'di') {
    const round = /R/.test(g), yellow = /Y/.test(g);
    return round && yellow ? '#FDE68A' : round ? '#BBF7D0' : yellow ? '#FEF3C7' : '#D1FAE5';
  }
  const L = TRAITS[p.trait].letter;
  return g.includes(L) ? '#DCEBFF' : '#F3E8FF';
}

/** The Punnett square, filled box by box as it runs, with the tallies beside it. */
export default function HeredityView({ params: p, conceal, runKey }: ViewProps<HeredityParams>) {
  const s = solveHeredity(p);
  const n = s.sq.rows.length, cell = n === 4 ? 70 : 110;
  const k = useRun(runKey, conceal, 3000);
  const filled = conceal ? 0 : Math.ceil(k * n * s.sq.cols.length);
  const x0 = 140, y0 = 110;
  const parents = p.cross === 'sex' ? 'Mother XX × Father XY' : p.cross === 'di' ? `${p.d1} × ${p.d2}` : `${s.sq.rows.join('')} × ${s.sq.cols.join('')}`;
  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Punnett square for ${parents}`}>
      <text className="lb-lbl" x={40} y={50}>{parents}</text>
      <text className="lb-sm" x={x0 + (cell * s.sq.cols.length) / 2} y={y0 - 34} textAnchor="middle">{p.cross === 'sex' ? 'sperm' : 'gametes of parent 2'}</text>
      <text className="lb-sm" x={x0 - 60} y={y0 + (cell * n) / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 60} ${y0 + (cell * n) / 2})`}>{p.cross === 'sex' ? 'eggs' : 'gametes of parent 1'}</text>
      {s.sq.cols.map((g, j) => <text key={`c${j}`} className="lb-lbl" x={x0 + j * cell + cell / 2} y={y0 - 10} textAnchor="middle">{g}</text>)}
      {s.sq.rows.map((g, i) => <text key={`r${i}`} className="lb-lbl" x={x0 - 14} y={y0 + i * cell + cell / 2 + 5} textAnchor="end">{g}</text>)}
      {s.sq.cells.map((row, i) => row.map((g, j) => {
        const shown = i * s.sq.cols.length + j < filled;
        return (
          <g key={`${i}-${j}`}>
            <rect x={x0 + j * cell} y={y0 + i * cell} width={cell} height={cell} fill={shown ? look(p, g) : '#fff'} stroke="#002147" strokeWidth={1.5} />
            {shown && <text x={x0 + j * cell + cell / 2} y={y0 + i * cell + cell / 2 + 6} textAnchor="middle" style={{ fontSize: n === 4 ? 15 : 22, fontWeight: 700, fill: '#002147' }}>{g}</text>}
          </g>
        );
      }))}
      {!conceal && filled >= n * s.sq.cols.length && (
        <foreignObject x={x0 + cell * s.sq.cols.length + 60} y={y0} width={360} height={300}>
          <div style={{ fontSize: 17, lineHeight: 1.55, color: '#002147', fontWeight: 600 }}>
            {s.phenotypes.map(x => <div key={x.label}>{x.label}: {x.count} of {s.total}</div>)}
            <div style={{ marginTop: 10 }}>Ratio {ratio(s.phenotypes.map(x => x.count))}</div>
            {p.cross === 'mono' && <div style={{ marginTop: 10, fontWeight: 500 }}>{TRAITS[p.trait].letter} ({TRAITS[p.trait].dominant.toLowerCase()}) is dominant over {TRAITS[p.trait].letter.toLowerCase()} ({TRAITS[p.trait].recessive.toLowerCase()}).</div>}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
