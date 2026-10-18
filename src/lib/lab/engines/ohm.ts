import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Ohm's law bench (NCERT Class 10 "Electricity", Activity 11.1; CBSE practical
 * "dependence of potential difference across a resistor on the current"): a
 * battery of 1.5 V cells, a rheostat, an ammeter in series and a voltmeter
 * across a fixed resistor. V = IR, so the V-I graph is a straight line
 * through the origin whose slope is R.
 */

export type OhmParams = { r: number; cells: number; rheo: number };

export const CELL_V = 1.5;
export const RHEO_MAX = 20;

/** Current (A) and the voltage across the resistor (V) with the rheostat set to `rheo` ohms. */
export function solveOhm(p: OhmParams) {
  const emf = p.cells * CELL_V;
  const i = emf / (p.r + p.rheo);
  return { emf, i, v: i * p.r };
}

const A = (n: number) => `${fmt(n, 3)} A`, V = (n: number) => `${fmt(n, 2)} V`;

const predictions: PredictionTemplate<OhmParams>[] = [
  {
    id: 'current', label: 'Ammeter reading', topic: "Ohm's law",
    build: p => {
      const s = solveOhm(p), noRheo = s.emf / p.r;
      const c = choices(A(s.i), [A(noRheo), A(s.emf * p.r / 100), A(s.i * 2), A(p.r / s.emf)], 201);
      return { prompt: `${p.cells} cell${p.cells === 1 ? '' : 's'} (${V(s.emf)}), the resistor is ${fmt(p.r, 0)} Ω and the rheostat ${fmt(p.rheo, 0)} Ω. What does the ammeter read?`, ...c, explain: `The resistor and rheostat are in series: R = ${fmt(p.r, 0)} + ${fmt(p.rheo, 0)} = ${fmt(p.r + p.rheo, 0)} Ω, so I = V/R = ${fmt(s.emf, 1)}/${fmt(p.r + p.rheo, 0)} = ${A(s.i)}.` };
    },
  },
  {
    id: 'voltmeter', label: 'Voltmeter reading', topic: "Ohm's law",
    build: p => {
      const s = solveOhm(p);
      const c = choices(V(s.v), [V(s.emf), V(s.i * p.rheo), V(s.emf / 2), V(s.v * 2)], 202);
      return { prompt: 'What does the voltmeter across the resistor read?', ...c, explain: `V = IR = ${fmt(s.i, 3)} × ${fmt(p.r, 0)} = ${V(s.v)}. The rest of the ${V(s.emf)}, ${V(s.emf - s.v)}, is across the rheostat.` };
    },
  },
  {
    id: 'double-v', label: 'If the voltage doubles', topic: "Ohm's law",
    build: () => {
      const right = 'The current doubles';
      const c = choices(right, ['The current halves', 'The current stays the same', 'The current becomes four times'], 203);
      return { prompt: 'If the potential difference across the resistor is doubled, what happens to the current through it?', ...c, explain: 'For a resistor at constant temperature, V/I is constant (Ohm\'s law): I is directly proportional to V, so doubling V doubles I.' };
    },
  },
  {
    id: 'graph-shape', label: 'Shape of the V-I graph', topic: "Ohm's law",
    build: p => {
      const c = choices('A straight line through the origin', ['A curve that flattens out', 'A straight line that cuts the V axis above zero', 'A horizontal line'], 204);
      return { prompt: 'Plotting V against I for this resistor, what shape do you get?', ...c, explain: `V = IR with R fixed at ${fmt(p.r, 0)} Ω, so V/I is the same for every reading: a straight line through the origin with slope R.` };
    },
  },
  {
    id: 'slope', label: 'What the slope tells you', topic: 'Resistance, resistivity and factors affecting resistance',
    build: p => {
      const c = choices(`The resistance, ${fmt(p.r, 0)} Ω`, ['The current', 'The power', 'The resistivity of the wire'], 205);
      return { prompt: 'With V on the y-axis and I on the x-axis, the slope of the graph is…', ...c, explain: 'Slope = ΔV/ΔI = R. A steeper line means a bigger resistance.' };
    },
  },
];

export const ohm: LabEngine<OhmParams> = {
  id: 'ohm',
  title: "Ohm's law bench",
  blurb: 'Change the cells and the rheostat, read the ammeter and voltmeter, and plot V against I for a resistor.',
  subject: 'Science',
  classes: [10],
  chapters: ['Electricity'],
  params: [
    { kind: 'number', key: 'r', label: 'Resistor', unit: 'Ω', min: 1, max: 50, step: 1, default: 5 },
    { kind: 'number', key: 'cells', label: 'Cells (1.5 V each)', unit: '', min: 1, max: 4, step: 1, default: 2 },
    { kind: 'number', key: 'rheo', label: 'Rheostat', unit: 'Ω', min: 0, max: RHEO_MAX, step: 1, default: 0 },
  ],
  readouts: p => {
    const s = solveOhm(p);
    return [
      { label: 'Battery', value: V(s.emf) },
      { label: 'Ammeter', value: A(s.i) },
      { label: 'Voltmeter', value: V(s.v) },
      { label: 'V / I', value: `${fmt(s.v / s.i, 2)} Ω` },
    ];
  },
  predictions,
};
