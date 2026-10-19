import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Resistivity of a wire (CBSE Class XII Physics, experiment A1 and activity A5).
 * A wire of length L and diameter d carries a current I (set with a rheostat);
 * the voltmeter across it reads V = IR. V against I is a straight line of slope
 * R, and the resistivity is ρ = RA/L = Rπd²/4L.
 * Along the wire the potential falls uniformly: the drop across a length x is
 * V(x) = I·ρx/A, proportional to x (the principle of the potentiometer).
 */

export type WireParams = { mode: string; material: string; L: number; d: number; I: number };

export const MATERIALS: Record<string, { label: string; rho: number }> = {
  nichrome: { label: 'Nichrome', rho: 1.1e-6 },
  manganin: { label: 'Manganin', rho: 4.8e-7 },
  constantan: { label: 'Constantan', rho: 4.9e-7 },
};

export function resistanceOf(p: Pick<WireParams, 'material' | 'L' | 'd'>) {
  const rho = MATERIALS[p.material]?.rho ?? 1.1e-6, A = (Math.PI * (p.d / 1000) ** 2) / 4;
  return { rho, A, R: (rho * (p.L / 100)) / A };
}

const ohm = (x: number) => `${fmt(x, 2)} Ω`;
const V = (x: number) => `${fmt(x, 2)} V`;
const RHO = 'Electrical energy and power; resistivity and conductivity; temperature dependence of resistance';

const predictions: PredictionTemplate<WireParams>[] = [
  {
    id: 'voltmeter', label: 'Voltmeter reading', topic: "Ohm's law; V-I characteristics (linear and non-linear)",
    applies: p => p.mode === 'vi',
    build: p => {
      const { R } = resistanceOf(p), v = p.I * R;
      const c = choices(V(v), [V(p.I / R), V(v * 2), V(p.I)], 421);
      return { prompt: `${ohm(R)} of ${MATERIALS[p.material].label.toLowerCase()} wire carries ${fmt(p.I, 2)} A. What does the voltmeter across it read?`, ...c, explain: `V = IR = ${fmt(p.I, 2)} × ${fmt(R, 2)} = ${V(v)}.` };
    },
  },
  {
    id: 'rho', label: 'Resistivity from R', topic: RHO,
    applies: p => p.mode === 'vi',
    build: p => {
      const { R, rho } = resistanceOf(p);
      const c = choices(`${(rho * 1e6).toFixed(2)} × 10⁻⁶ Ω m`, [`${(rho * 1e6 * 2).toFixed(2)} × 10⁻⁶ Ω m`, `${(rho * 1e6 / 4).toFixed(2)} × 10⁻⁶ Ω m`, `${(rho * 1e6 * 100).toFixed(2)} × 10⁻⁶ Ω m`], 422);
      return { prompt: `The slope of V-I gives R = ${ohm(R)} for ${fmt(p.L, 0)} cm of wire, ${fmt(p.d, 2)} mm in diameter. What is its resistivity?`, ...c, explain: `ρ = RA/L = R × πd²/4 / L = ${fmt(R, 2)} × π × (${fmt(p.d / 1000, 5)})²/4 / ${fmt(p.L / 100, 2)} = ${(rho * 1e6).toFixed(2)} × 10⁻⁶ Ω m.` };
    },
  },
  {
    id: 'double-l', label: 'Twice the length', topic: RHO,
    applies: p => p.mode === 'vi',
    build: () => {
      const c = choices('R doubles; ρ stays the same', ['R and ρ both double', 'R halves; ρ doubles', 'Both stay the same'], 423);
      return { prompt: 'A wire of the same material and thickness but twice as long: what happens to R and ρ?', ...c, explain: 'R = ρL/A grows with length, but ρ is a property of the material (at a fixed temperature), so it does not change.' };
    },
  },
  {
    id: 'drop', label: 'Potential drop along the wire', topic: 'Kirchhoff\'s rules; Wheatstone bridge',
    applies: p => p.mode === 'drop',
    build: p => {
      const { R } = resistanceOf(p), v = p.I * R, half = v / 2;
      const c = choices(V(half), [V(v), V(v / 4), V(half * 3)], 424);
      return { prompt: `The whole ${fmt(p.L, 0)} cm wire has ${V(v)} across it. What is the drop across the first ${fmt(p.L / 2, 0)} cm?`, ...c, explain: 'With a steady current the wire\'s resistance per cm is the same everywhere, so the potential falls evenly: V ∝ length. Half the length, half the drop. This is how a potentiometer compares voltages.' };
    },
  },
];

export const wire: LabEngine<WireParams> = {
  id: 'wire',
  title: 'Resistivity of a wire',
  blurb: 'Plot V against I for wires of different metals, work out the resistivity, and trace the potential falling along the wire.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Current Electricity'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'vi', options: [{ value: 'vi', label: 'V-I graph and resistivity' }, { value: 'drop', label: 'Potential drop along the wire' }] },
    { kind: 'choice', key: 'material', label: 'Wire', default: 'nichrome', options: Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label })) },
    { kind: 'number', key: 'L', label: 'Length', unit: 'cm', min: 20, max: 100, step: 5, default: 50 },
    { kind: 'number', key: 'd', label: 'Diameter', unit: 'mm', min: 0.2, max: 0.8, step: 0.01, default: 0.36 },
    { kind: 'number', key: 'I', label: 'Current', unit: 'A', min: 0.1, max: 1, step: 0.05, default: 0.4 },
  ],
  readouts: p => {
    const { R, rho } = resistanceOf(p);
    return [{ label: 'Resistance', value: ohm(R) }, { label: 'Voltmeter', value: V(p.I * R) }, { label: 'Resistivity', value: `${(rho * 1e6).toFixed(2)} × 10⁻⁶ Ω m` }, { label: 'Drop per 10 cm', value: V((p.I * R * 10) / p.L) }];
  },
  predictions,
};
