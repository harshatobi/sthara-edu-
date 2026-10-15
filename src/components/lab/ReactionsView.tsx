'use client';

import { equationText, parseFormula, pretty, solveReaction, type ReactionParams } from '@/lib/lab/engines/reactions';
import { fmt } from '@/lib/lab/types';
import type { ViewProps } from './types';
import { useRun } from './useRun';

const W = 1000, H = 480;

const ATOM_COLOUR: Record<string, string> = {
  H: '#E2E8F0', O: '#E11D48', C: '#334155', N: '#2F6BFF', Na: '#A855F7', Mg: '#94A3B8', Al: '#CBD5E1', S: '#EAB308', Cl: '#22C55E',
  Ca: '#F97316', Fe: '#B45309', Cu: '#C2410C', Zn: '#64748B', Ag: '#D1D5DB', Ba: '#14B8A6', Pb: '#475569', K: '#8B5CF6',
};

/** One molecule as a cluster of atoms, coloured by element. */
function Molecule({ formula, x, y }: { formula: string; x: number; y: number }) {
  const atoms = Object.entries(parseFormula(formula)).flatMap(([el, n]) => Array(n).fill(el) as string[]).slice(0, 9);
  const per = Math.ceil(Math.sqrt(atoms.length));
  return (
    <g>
      {atoms.map((el, i) => (
        <circle key={i} cx={x + (i % per) * 15 - ((per - 1) * 15) / 2} cy={y + Math.floor(i / per) * 15 - ((Math.ceil(atoms.length / per) - 1) * 15) / 2}
          r={9} fill={ATOM_COLOUR[el] ?? '#9AA6B8'} stroke="#002147" strokeWidth={1.2} />
      ))}
    </g>
  );
}

export default function ReactionsView({ params: p, conceal, runKey }: ViewProps<ReactionParams>) {
  const r = solveReaction(p);
  const k = useRun(runKey, conceal, 1400);
  // Molecule groups, laid out left (reactants) and right (products).
  const group = (list: typeof r.all, x0: number, x1: number, show: (j: number) => number) => {
    const slot = (x1 - x0) / list.length;
    return list.map((s, j) => {
      const count = show(j);
      // Room for the molecule's own height, so bigger molecules don't overlap when stacked.
      const n = Object.values(parseFormula(s.formula)).reduce((a, b) => a + b, 0);
      const gap = Math.max(34, Math.ceil(Math.min(n, 9) / Math.ceil(Math.sqrt(Math.min(n, 9)))) * 15 + 8);
      return (
        <g key={s.formula}>
          {Array.from({ length: count }, (_, m) => <Molecule key={m} formula={s.formula} x={x0 + slot * j + slot / 2} y={160 + (m - (count - 1) / 2) * gap} />)}
          <text className="lb-lbl" x={x0 + slot * j + slot / 2} y={270} textAnchor="middle">{conceal ? '' : count > 1 ? `${count}` : ''}{pretty(s.formula)}</text>
        </g>
      );
    });
  };
  const els = Object.keys(parseFormula(r.rx.reactants.join('')));
  const tally = (list: typeof r.all) => Object.fromEntries(els.map(el => [el, list.reduce((s, x) => s + x.coef * (parseFormula(x.formula)[el] ?? 0), 0)]));
  const left = tally(r.reactants), right = tally(r.products);
  const g = (n: number) => `${fmt(n, n >= 10 ? 1 : 2)} g`;

  return (
    <svg className="lab-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.rx.label}: ${equationText(p)}`}>
      <text className="lb-lbl" x={500} y={36} textAnchor="middle" style={{ fontSize: 24 }}>{equationText(p, conceal)}</text>
      {r.rx.condition && <text className="lb-sm" x={500} y={58} textAnchor="middle">({r.rx.condition})</text>}
      {group(r.reactants, 40, 440, j => (conceal ? 1 : r.reactants[j].coef))}
      <path d="M455 150 H535 M520 138 L536 150 L520 162" stroke="#002147" strokeWidth={4} fill="none" />
      <g style={{ opacity: conceal ? 0.25 : k }}>{group(r.products, 560, 960, j => (conceal ? 1 : r.products[j].coef))}</g>

      {!conceal && (
        <g>
          <text className="lb-sm" x={40} y={312}>Atoms</text>
          {els.map((el, i) => (
            <g key={el}>
              <circle cx={110 + i * 120} cy={308} r={8} fill={ATOM_COLOUR[el] ?? '#9AA6B8'} stroke="#002147" />
              <text className="lb-sm" x={124 + i * 120} y={312}>{el}: {left[el]} → {right[el]}</text>
            </g>
          ))}
          <text className="lb-sm" x={40} y={352}>Masses</text>
          <text className="lb-sm" x={110} y={352}>{r.reactants.map(x => `${g(x.mass)} ${pretty(x.formula)}`).join(' + ')}  →  {r.products.map(x => `${g(x.mass)} ${pretty(x.formula)}`).join(' + ')}</text>
          <text className="lb-sm" x={110} y={376}>Total {g(r.reactants.reduce((s, x) => s + x.mass, 0))} before, {g(r.products.reduce((s, x) => s + x.mass, 0))} after</text>
          {k === 1 && <text className="lb-lbl" x={40} y={430}>{r.rx.type}. {r.rx.observe}</text>}
        </g>
      )}
      {conceal && <text className="lb-sm" x={500} y={330} textAnchor="middle">{r.rx.label}: one of each shown, before balancing</text>}
      <text className="lb-sm" x={960} y={470} textAnchor="end">Atomic masses from the NCERT table</text>
    </svg>
  );
}
