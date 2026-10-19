import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Electric field and potential (Class XII Physics, Electric Charges and Fields;
 * Electrostatic Potential and Capacitance). Point charges in air, k = 9 × 10⁹.
 *   One charge: E = kq/r², V = kq/r.
 *   Dipole (±q, 2a apart): on the axis E = kq[1/(r − a)² − 1/(r + a)²] → 2kp/r³ far away.
 *   Two like charges q₁, q₂ a distance d apart: the field is zero at the neutral
 *   point x = d/(1 + √(q₂/q₁)) from q₁.
 */

export type EfieldParams = { setup: string; q: number; q2: number; r: number };

export const K = 9e9;
export const SEP = 4; // cm between the two charges (dipole: 2a = 4 cm)

const uC = (x: number) => x * 1e-6, m = (cm: number) => cm / 100;
export const fieldPoint = (q: number, r: number) => (K * uC(q)) / m(r) ** 2;
export const potentialPoint = (q: number, r: number) => (K * uC(q)) / m(r);
/** Field on the dipole's axis at r cm from its centre. */
export function dipoleAxial(q: number, r: number) {
  const a = SEP / 2;
  return K * uC(q) * (1 / m(r - a) ** 2 - 1 / m(r + a) ** 2);
}
export const neutralPoint = (q1: number, q2: number, d = SEP * 3) => d / (1 + Math.sqrt(q2 / q1));

const NC = (x: number) => `${x >= 1e5 ? (x / 1e6).toFixed(2) + ' × 10⁶' : fmt(x, 0)} N/C`;
const FIELD = 'Electric field due to a point charge; field lines';
const DIPOLE = 'Electric dipole; field due to a dipole; torque on a dipole in a uniform field';
const POT = 'Electric potential and potential difference; potential due to a point charge, a dipole and a system of charges';

const predictions: PredictionTemplate<EfieldParams>[] = [
  {
    id: 'field', label: 'Field at the point', topic: FIELD,
    applies: p => p.setup === 'single',
    build: p => {
      const E = fieldPoint(p.q, p.r);
      const c = choices(NC(E), [NC(E * 2), NC(E / 2), NC(potentialPoint(p.q, p.r))], 511);
      return { prompt: `A ${fmt(p.q, 1)} μC charge in air. What is the field ${fmt(p.r, 0)} cm away?`, ...c, explain: `E = kq/r² = 9 × 10⁹ × ${fmt(p.q, 1)} × 10⁻⁶ / (${fmt(p.r / 100, 2)})² = ${NC(E)}, pointing away from the charge.` };
    },
  },
  {
    id: 'double-r', label: 'Twice as far', topic: FIELD,
    applies: p => p.setup === 'single',
    build: () => {
      const c = choices('A quarter: E ∝ 1/r²', ['Half: E ∝ 1/r', 'The same', 'An eighth'], 512);
      return { prompt: 'At twice the distance from the charge, the field is…', ...c, explain: 'E = kq/r²: twice r gives a quarter of E. The field lines spread over four times the area, so they are a quarter as dense.' };
    },
  },
  {
    id: 'potential', label: 'Potential at the point', topic: POT,
    chapter: 'Electrostatic Potential and Capacitance',
    applies: p => p.setup === 'single',
    build: p => {
      const V = potentialPoint(p.q, p.r);
      const c = choices(`${fmt(V / 1000, 1)} kV`, [`${fmt(V / 500, 1)} kV`, `${fmt(fieldPoint(p.q, p.r) / 1000, 1)} kV`, `${fmt(V / 4000, 1)} kV`], 513);
      return { prompt: `What is the potential ${fmt(p.r, 0)} cm from the ${fmt(p.q, 1)} μC charge?`, ...c, explain: `V = kq/r = 9 × 10⁹ × ${fmt(p.q, 1)} × 10⁻⁶ / ${fmt(p.r / 100, 2)} = ${fmt(V / 1000, 1)} kV. It falls as 1/r, more slowly than the field.` };
    },
  },
  {
    id: 'equipotential', label: 'Equipotentials and field lines', topic: 'Equipotential surfaces; potential energy of a system of two point charges and of a dipole in an electrostatic field',
    chapter: 'Electrostatic Potential and Capacitance',
    build: () => {
      const c = choices('At right angles to the field lines', ['Along the field lines', 'At 45° to them', 'In no fixed direction'], 514);
      return { prompt: 'How do equipotential surfaces cross the field lines?', ...c, explain: 'Moving along an equipotential does no work, so there can be no field component along it: the field is always perpendicular to the equipotentials. Around a point charge they are spheres.' };
    },
  },
  {
    id: 'dipole-far', label: 'Dipole at twice the distance', topic: DIPOLE,
    applies: p => p.setup === 'dipole',
    build: p => {
      const E1 = dipoleAxial(p.q, p.r), E2 = dipoleAxial(p.q, p.r * 2);
      const c = choices(`About 1/8: ${NC(E2)}`, [`About 1/4: ${NC(E1 / 4)}`, `About 1/2: ${NC(E1 / 2)}`, 'The same'], 515);
      return { prompt: `On the axis of the dipole the field is ${NC(E1)} at ${fmt(p.r, 0)} cm. What is it at ${fmt(p.r * 2, 0)} cm?`, ...c, explain: 'Far from a dipole the fields of +q and −q nearly cancel; what is left is E = 2kp/r³, falling as 1/r³: twice as far, about an eighth.' };
    },
  },
  {
    id: 'neutral', label: 'Where the field is zero', topic: "Coulomb's law; forces between multiple charges; superposition principle and continuous charge distribution",
    applies: p => p.setup === 'like' && p.q !== p.q2,
    build: p => {
      const x = neutralPoint(p.q, p.q2), d = SEP * 3;
      const c = choices(`${fmt(x, 1)} cm from the ${fmt(p.q, 1)} μC charge`, [`${fmt(d / 2, 1)} cm from it (the middle)`, `${fmt(d - x, 1)} cm from the ${fmt(p.q, 1)} μC charge`, 'Nowhere between them'], 516);
      return { prompt: `Like charges of ${fmt(p.q, 1)} μC and ${fmt(p.q2, 1)} μC are ${d} cm apart. Where between them is the field zero?`, ...c, explain: `The fields are equal and opposite where kq₁/x² = kq₂/(d − x)², so x = d/(1 + √(q₂/q₁)) = ${fmt(x, 1)} cm: nearer the smaller charge.` };
    },
  },
];

export const efield: LabEngine<EfieldParams> = {
  id: 'efield',
  title: 'Electric field lines and potential',
  blurb: 'Field lines and equipotentials around a charge, a dipole and two like charges, with the field and potential at a point.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Electric Charges and Fields', 'Electrostatic Potential and Capacitance'],
  params: [
    { kind: 'choice', key: 'setup', label: 'Charges', default: 'single', options: [{ value: 'single', label: 'One charge' }, { value: 'dipole', label: 'Dipole (+q, −q)' }, { value: 'like', label: 'Two like charges' }] },
    { kind: 'number', key: 'q', label: 'Charge q', unit: 'μC', min: 0.5, max: 5, step: 0.5, default: 2 },
    { kind: 'number', key: 'q2', label: 'Second charge', unit: 'μC', min: 0.5, max: 5, step: 0.5, default: 1, show: p => p.setup === 'like' },
    { kind: 'number', key: 'r', label: 'Point at', unit: 'cm', min: 5, max: 40, step: 1, default: 10, show: p => p.setup !== 'like' },
  ],
  readouts: p => {
    if (p.setup === 'single') return [{ label: 'Field E', value: NC(fieldPoint(p.q, p.r)) }, { label: 'Potential V', value: `${fmt(potentialPoint(p.q, p.r) / 1000, 1)} kV` }];
    if (p.setup === 'dipole') return [{ label: 'Dipole moment', value: `${fmt(p.q * SEP / 100, 3)} × 10⁻⁶ C m` }, { label: 'Field on the axis', value: NC(dipoleAxial(p.q, p.r)) }];
    return [{ label: 'Neutral point', value: `${fmt(neutralPoint(p.q, p.q2), 1)} cm from q₁` }];
  },
  predictions,
};
