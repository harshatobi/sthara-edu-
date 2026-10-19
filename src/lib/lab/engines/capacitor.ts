import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Capacitors (Class XII Physics, Electrostatic Potential and Capacitance).
 *   Series: 1/C = 1/C₁ + 1/C₂ (same charge on each); parallel: C = C₁ + C₂ (same voltage).
 *   Energy stored U = ½CV².
 *   Parallel plates: C = Kε₀A/d. A dielectric slab multiplies C by K: with the
 *   battery still connected V stays and Q grows K times; disconnected, Q stays
 *   and V falls to V/K.
 */

export type CapacitorParams = { mode: string; C1: number; C2: number; V: number; A: number; d: number; K: number };

export const EPS0 = 8.854e-12;

export function combo(p: Pick<CapacitorParams, 'mode' | 'C1' | 'C2'>) {
  return p.mode === 'series' ? (p.C1 * p.C2) / (p.C1 + p.C2) : p.C1 + p.C2;
}
/** Parallel-plate capacitance (pF) for A cm², d mm, dielectric K. */
export const plateC = (A: number, d: number, K: number) => (K * EPS0 * (A / 1e4)) / (d / 1000) * 1e12;

const uF = (x: number) => `${fmt(x, 2)} μF`;
const COMBO = 'Capacitors and capacitance; series and parallel combination';
const PLATE = 'Parallel plate capacitor with and without dielectric; energy stored in a capacitor';

const predictions: PredictionTemplate<CapacitorParams>[] = [
  {
    id: 'equivalent', label: 'Equivalent capacitance', topic: COMBO,
    applies: p => p.mode !== 'plate',
    build: p => {
      const C = combo(p), other = combo({ ...p, mode: p.mode === 'series' ? 'parallel' : 'series' });
      const c = choices(uF(C), [uF(other), uF((p.C1 + p.C2) / 2), uF(Math.max(p.C1, p.C2))].filter(x => x !== uF(C)), 521);
      return { prompt: `${uF(p.C1)} and ${uF(p.C2)} in ${p.mode}. What is the equivalent capacitance?`, ...c, explain: p.mode === 'series' ? `1/C = 1/${fmt(p.C1, 1)} + 1/${fmt(p.C2, 1)}, C = ${uF(C)}: less than the smaller one.` : `In parallel they add: C = ${fmt(p.C1, 1)} + ${fmt(p.C2, 1)} = ${uF(C)}.` };
    },
  },
  {
    id: 'energy', label: 'Energy stored', topic: PLATE,
    applies: p => p.mode !== 'plate',
    build: p => {
      const C = combo(p), U = 0.5 * C * 1e-6 * p.V ** 2;
      // Small energies in μJ, so a low voltage never rounds every option to 0.
      const J = (x: number) => (U >= 1e-3 ? `${fmt(x * 1000, 2)} mJ` : `${fmt(x * 1e6, 2)} μJ`);
      const c = choices(J(U), [J(U * 2), J(C * 1e-6 * p.V), J(U / 2)], 522);
      return { prompt: `The pair (${uF(C)}) is charged to ${fmt(p.V, 0)} V. How much energy does it store?`, ...c, explain: `U = ½CV² = ½ × ${fmt(C, 2)} × 10⁻⁶ × ${fmt(p.V, 0)}² = ${J(U)}.` };
    },
  },
  {
    id: 'series-v', label: 'Voltage across each in series', topic: COMBO,
    applies: p => p.mode === 'series' && p.C1 !== p.C2,
    build: p => {
      const V1 = (p.V * p.C2) / (p.C1 + p.C2);
      const c = choices(`${fmt(V1, 2)} V`, [`${fmt(p.V - V1, 2)} V`, `${fmt(p.V / 2, 2)} V`, `${fmt(p.V, 2)} V`], 523);
      return { prompt: `${fmt(p.V, 0)} V across ${uF(p.C1)} and ${uF(p.C2)} in series. What is the voltage across the ${uF(p.C1)}?`, ...c, explain: `Both carry the same charge Q = CV, so V ∝ 1/C: V₁ = V × C₂/(C₁ + C₂) = ${fmt(V1, 2)} V. The smaller capacitor takes the larger share.` };
    },
  },
  {
    id: 'plate', label: 'Capacitance of the plates', topic: PLATE,
    applies: p => p.mode === 'plate',
    build: p => {
      const C = plateC(p.A, p.d, p.K);
      const c = choices(`${fmt(C, 1)} pF`, [`${fmt(C / p.K, 1)} pF`, `${fmt(C * 2, 1)} pF`, `${fmt(C / 10, 1)} pF`].filter(x => x !== `${fmt(C, 1)} pF`), 524);
      return { prompt: `Plates of ${fmt(p.A, 0)} cm², ${fmt(p.d, 1)} mm apart, ${p.K === 1 ? 'air between them' : `a dielectric of K = ${p.K} between them`}. What is the capacitance?`, ...c, explain: `C = Kε₀A/d = ${p.K} × 8.85 × 10⁻¹² × ${fmt(p.A / 1e4, 4)} / ${fmt(p.d / 1000, 4)} = ${fmt(C, 1)} pF.` };
    },
  },
  {
    id: 'dielectric', label: 'Slipping in a dielectric (battery removed)', topic: 'Dielectrics and electric polarisation',
    applies: p => p.mode === 'plate' && p.K > 1,
    build: p => {
      const c = choices(`V falls to 1/${p.K}; Q stays the same`, [`Q rises ${p.K} times; V stays the same`, 'Both stay the same', `V rises ${p.K} times`], 525);
      return { prompt: `The air capacitor is charged and the battery removed; then a slab of K = ${p.K} fills the gap. What happens?`, ...c, explain: `Isolated, the charge cannot change. C becomes K times, so V = Q/C falls to 1/K: the dielectric is polarised and its bound charges weaken the field inside. (With the battery connected, V would stay and Q grow K times.)` };
    },
  },
];

export const capacitor: LabEngine<CapacitorParams> = {
  id: 'capacitor',
  title: 'Capacitors',
  blurb: 'Join capacitors in series and parallel, find the charge and energy, and slide a dielectric between parallel plates.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Electrostatic Potential and Capacitance'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Set-up', default: 'series', options: [{ value: 'series', label: 'Two in series' }, { value: 'parallel', label: 'Two in parallel' }, { value: 'plate', label: 'Parallel plates' }] },
    { kind: 'number', key: 'C1', label: 'C₁', unit: 'μF', min: 1, max: 20, step: 1, default: 6, show: p => p.mode !== 'plate' },
    { kind: 'number', key: 'C2', label: 'C₂', unit: 'μF', min: 1, max: 20, step: 1, default: 3, show: p => p.mode !== 'plate' },
    { kind: 'number', key: 'V', label: 'Battery', unit: 'V', min: 1, max: 100, step: 1, default: 12 },
    { kind: 'number', key: 'A', label: 'Plate area', unit: 'cm²', min: 10, max: 400, step: 10, default: 100, show: p => p.mode === 'plate' },
    { kind: 'number', key: 'd', label: 'Gap', unit: 'mm', min: 0.5, max: 10, step: 0.5, default: 1, show: p => p.mode === 'plate' },
    { kind: 'number', key: 'K', label: 'Dielectric constant', unit: '', min: 1, max: 10, step: 1, default: 1, show: p => p.mode === 'plate' },
  ],
  readouts: p => {
    if (p.mode === 'plate') { const C = plateC(p.A, p.d, p.K); return [{ label: 'C', value: `${fmt(C, 1)} pF` }, { label: 'Charge at V', value: `${fmt(C * p.V / 1000, 3)} nC` }, { label: 'Energy', value: `${fmt(0.5 * C * 1e-12 * p.V ** 2 * 1e9, 2)} nJ` }]; }
    const C = combo(p);
    return [{ label: 'Equivalent C', value: uF(C) }, { label: 'Charge Q = CV', value: `${fmt(C * p.V, 1)} μC` }, { label: 'Energy ½CV²', value: `${fmt(0.5 * C * p.V ** 2 / 1000, 3)} mJ` }];
  },
  predictions,
};
