import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Metre bridge (CBSE Class XII Physics, experiments A2 and A3): a Wheatstone
 * bridge with a 100 cm uniform wire. A known resistance R (from a resistance box)
 * in the left gap, the unknown X in the right; the jockey finds the null point at
 * l cm from the left end. Balance: R/X = l/(100 − l), so X = R(100 − l)/l.
 * A3: two wires in series (X₁ + X₂) or in parallel (X₁X₂/(X₁ + X₂)) in the right gap.
 * The null point is most sensitive near the middle, so R is chosen close to X.
 */

export type BridgeParams = { mode: string; R: number; X1: number; X2: number };

/** The resistance in the right gap. */
export function unknownOf(p: BridgeParams) {
  if (p.mode === 'series') return p.X1 + p.X2;
  if (p.mode === 'parallel') return (p.X1 * p.X2) / (p.X1 + p.X2);
  return p.X1;
}
/** Balance length (cm from the left end). */
export const balanceAt = (R: number, X: number) => (100 * R) / (R + X);

const ohm = (x: number) => `${fmt(x, 2)} Ω`;
const WB = "Kirchhoff's rules; Wheatstone bridge";

const predictions: PredictionTemplate<BridgeParams>[] = [
  {
    id: 'null', label: 'Where the null point is', topic: WB,
    build: p => {
      const X = unknownOf(p), l = balanceAt(p.R, X);
      const c = choices(`${fmt(l, 1)} cm`, [`${fmt(100 - l, 1)} cm`, '50.0 cm', `${fmt((100 * X) / (p.R + X) / 2, 1)} cm`].filter(x => x !== `${fmt(l, 1)} cm`), 431);
      return { prompt: `R = ${ohm(p.R)} in the left gap, ${ohm(X)} in the right. How far from the left end is the null point?`, ...c, explain: `At balance R/X = l/(100 − l), so l = 100R/(R + X) = 100 × ${fmt(p.R, 1)} / ${fmt(p.R + X, 2)} = ${fmt(l, 1)} cm.` };
    },
  },
  {
    id: 'x', label: 'The unknown from the balance length', topic: WB,
    build: p => {
      const X = unknownOf(p), l = balanceAt(p.R, X);
      const c = choices(ohm(X), [ohm((p.R * l) / (100 - l)), ohm(p.R), ohm(X * 2)].filter(x => x !== ohm(X)), 432);
      return { prompt: `With R = ${ohm(p.R)}, the null point is at ${fmt(l, 1)} cm. What is the resistance in the right gap?`, ...c, explain: `X = R(100 − l)/l = ${fmt(p.R, 1)} × ${fmt(100 - l, 1)} / ${fmt(l, 1)} = ${ohm(X)}.` };
    },
  },
  {
    id: 'combo', label: 'Series or parallel', topic: WB,
    applies: p => p.mode !== 'single',
    build: p => {
      const X = unknownOf(p), other = p.mode === 'series' ? (p.X1 * p.X2) / (p.X1 + p.X2) : p.X1 + p.X2;
      const c = choices(ohm(X), [ohm(other), ohm(Math.abs(p.X1 - p.X2)), ohm(p.X1)], 433);
      return { prompt: `${ohm(p.X1)} and ${ohm(p.X2)} are joined in ${p.mode} in the right gap. What resistance should the bridge give?`, ...c, explain: p.mode === 'series' ? `In series the resistances add: ${ohm(p.X1)} + ${ohm(p.X2)} = ${ohm(X)}.` : `In parallel 1/R = 1/R₁ + 1/R₂, so R = R₁R₂/(R₁ + R₂) = ${ohm(X)}, less than either.` };
    },
  },
  {
    id: 'middle', label: 'Why choose R near X', topic: WB,
    build: () => {
      const c = choices('The null point falls near the middle, where the reading is most accurate', ['To make the current larger', 'The bridge does not balance otherwise', 'To heat the wire less'], 434);
      return { prompt: 'Why is R chosen so that the null point is near the middle of the wire?', ...c, explain: 'The percentage error in X depends on 1/l + 1/(100 − l), which is smallest at l = 50 cm. Near the middle the end resistances (where the wire joins the copper strips) matter least too.' };
    },
  },
];

export const bridge: LabEngine<BridgeParams> = {
  id: 'bridge',
  title: 'Metre bridge',
  blurb: 'Slide the jockey to the null point and find an unknown resistance; check the laws of series and parallel combination.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Current Electricity'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Right gap', default: 'single', options: [{ value: 'single', label: 'One wire' }, { value: 'series', label: 'Two in series' }, { value: 'parallel', label: 'Two in parallel' }] },
    { kind: 'number', key: 'R', label: 'Resistance box R', unit: 'Ω', min: 1, max: 20, step: 1, default: 4 },
    { kind: 'number', key: 'X1', label: 'Wire X₁', unit: 'Ω', min: 0.5, max: 15, step: 0.1, default: 3.6 },
    { kind: 'number', key: 'X2', label: 'Wire X₂', unit: 'Ω', min: 0.5, max: 15, step: 0.1, default: 5.2, show: p => p.mode !== 'single' },
  ],
  check: p => { const l = balanceAt(p.R, unknownOf(p)); return l < 10 || l > 90 ? 'The null point would be too near an end: choose R closer to the unknown.' : null; },
  readouts: p => {
    const X = unknownOf(p), l = balanceAt(p.R, X);
    return [{ label: 'Null point l', value: `${fmt(l, 1)} cm` }, { label: '100 − l', value: `${fmt(100 - l, 1)} cm` }, { label: 'Unknown X', value: ohm(X) }];
  },
  predictions,
};
