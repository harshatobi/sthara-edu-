import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Beam balance and moments (CBSE Class XI Physics, experiment A5 and activity A2).
 *
 * Beam balance: equal arms, so the pans balance when the masses are equal; the
 * object's mass is the sum of the standard weights that balance it, to the
 * smallest weight in the box (10 mg).
 * Metre scale: balanced on a knife edge at its centre of gravity (50 cm), an
 * unknown mass m at d₁ from the edge is balanced by a known mass M at d₂ on the
 * other side. Moments: m·d₁ = M·d₂, so m = M·d₂/d₁.
 */

export type BalanceParams = { mode: string; m: number; known: number; d1: number };

/** A school weight box, in grams (heaviest first). */
export const WEIGHT_BOX = [100, 50, 20, 20, 10, 5, 2, 2, 1, 0.5, 0.2, 0.2, 0.1, 0.05, 0.02, 0.02, 0.01];

/** The standard weights that balance a mass (greedy, which is how the box is used): grams, heaviest first. */
export function weightsFor(mass: number): number[] {
  let left = Math.round(mass * 100);
  const out: number[] = [];
  for (const w of WEIGHT_BOX) {
    const c = Math.round(w * 100);
    if (c <= left) { out.push(w); left -= c; }
  }
  return out;
}

/** d₂ (cm) for balance on the metre scale. */
export const balanceDistance = (p: BalanceParams) => (p.m * p.d1) / p.known;

export function solveBalance(p: BalanceParams) {
  const w = weightsFor(p.m);
  return { weights: w, total: Number(w.reduce((s, x) => s + x, 0).toFixed(2)), d2: balanceDistance(p) };
}

const g = (x: number) => (x >= 1 ? `${fmt(x, 2)} g` : `${fmt(x * 1000, 0)} mg`);

const predictions: PredictionTemplate<BalanceParams>[] = [
  {
    id: 'weights', label: 'Weights that balance it', topic: 'Need for measurement: units of measurement, systems of units',
    applies: p => p.mode === 'beam',
    build: p => {
      const s = solveBalance(p);
      const right = s.weights.map(g).join(' + ');
      const alt = (ws: number[]) => ws.map(g).join(' + ');
      const c = choices(right, [alt([...s.weights.slice(0, -1)]), alt([...s.weights, 0.01]), alt(s.weights.map(x => (x === 20 ? 10 : x)))].filter(x => x !== right && x), 311);
      return { prompt: `The object is ${g(p.m)}. Which weights from the box balance it?`, ...c, explain: `Start with the heaviest weight that doesn't tip the pan and work down: ${right} = ${g(s.total)}.` };
    },
  },
  {
    id: 'pan-down', label: 'Which pan goes down', topic: 'Need for measurement: units of measurement, systems of units',
    applies: p => p.mode === 'beam' && p.m >= 2,
    build: p => {
      const s = solveBalance(p), short = s.total - s.weights[s.weights.length - 1];
      const c = choices('The object pan goes down', ['The weights pan goes down', 'The beam stays level', 'The pointer swings equally both ways'], 312);
      return { prompt: `With ${g(short)} of weights on the right pan and the ${g(p.m)} object on the left, what happens?`, ...c, explain: `${g(p.m)} is more than ${g(short)}, so the object side is heavier and its pan goes down; add the ${g(s.weights[s.weights.length - 1])} weight to balance.` };
    },
  },
  {
    id: 'distance', label: 'Where the known mass balances', topic: 'Equilibrium of rigid bodies; rigid body rotation and equations of rotational motion; comparison with linear motion',
    chapter: 'System of Particles and Rotational Motion',
    applies: p => p.mode === 'moments' && balanceDistance(p) <= 48,
    build: p => {
      const d2 = balanceDistance(p);
      const c = choices(`${fmt(d2, 1)} cm`, [`${fmt(p.d1, 1)} cm`, `${fmt(p.known * p.d1 / p.m, 1)} cm`, `${fmt(d2 * 2, 1)} cm`], 313);
      return { prompt: `An unknown ${fmt(p.m, 0)} g hangs ${fmt(p.d1, 0)} cm left of the knife edge. Where must the ${fmt(p.known, 0)} g mass hang on the right?`, ...c, explain: `Clockwise and anticlockwise moments are equal: ${fmt(p.m, 0)} × ${fmt(p.d1, 0)} = ${fmt(p.known, 0)} × d₂, so d₂ = ${fmt(d2, 1)} cm.` };
    },
  },
  {
    id: 'unknown', label: 'The unknown mass', topic: 'Moment of a force, torque, angular momentum; conservation of angular momentum and applications',
    chapter: 'System of Particles and Rotational Motion',
    applies: p => p.mode === 'moments' && balanceDistance(p) <= 48,
    build: p => {
      const d2 = balanceDistance(p);
      const c = choices(`${fmt(p.m, 0)} g`, [`${fmt(p.known * p.d1 / d2, 0)} g`, `${fmt(p.known, 0)} g`, `${fmt(p.m * 2, 0)} g`].filter(x => x !== `${fmt(p.m, 0)} g`), 314);
      return { prompt: `The ${fmt(p.known, 0)} g mass balances at ${fmt(d2, 1)} cm on the right; the unknown hangs at ${fmt(p.d1, 0)} cm on the left. What is the unknown mass?`, ...c, explain: `m = M·d₂/d₁ = ${fmt(p.known, 0)} × ${fmt(d2, 1)} / ${fmt(p.d1, 0)} = ${fmt(p.m, 0)} g.` };
    },
  },
];

export const balance: LabEngine<BalanceParams> = {
  id: 'balance',
  title: 'Beam balance and moments',
  blurb: 'Balance an object with the weight box, or balance a metre scale on a knife edge to find a mass by moments.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Units and Measurements', 'System of Particles and Rotational Motion'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Set-up', default: 'beam', options: [{ value: 'beam', label: 'Beam balance' }, { value: 'moments', label: 'Metre scale on a knife edge' }] },
    { kind: 'number', key: 'm', label: 'Object mass', unit: 'g', min: 1, max: 200, step: 0.01, default: 37.46 },
    { kind: 'number', key: 'known', label: 'Known mass', unit: 'g', min: 20, max: 200, step: 10, default: 100, show: p => p.mode === 'moments' },
    { kind: 'number', key: 'd1', label: 'Unknown at', unit: 'cm left', min: 5, max: 45, step: 1, default: 30, show: p => p.mode === 'moments' },
  ],
  check: p => (p.mode === 'moments' && balanceDistance(p) > 48 ? 'The known mass would have to hang past the end of the scale.' : null),
  readouts: p => {
    const s = solveBalance(p);
    return p.mode === 'beam'
      ? [{ label: 'Weights', value: s.weights.map(g).join(' + ') }, { label: 'Mass', value: g(s.total) }]
      : [{ label: 'Unknown × d₁', value: `${fmt(p.m * p.d1, 0)} g cm` }, { label: 'Known at d₂', value: `${fmt(s.d2, 1)} cm` }, { label: 'Known × d₂', value: `${fmt(p.known * s.d2, 0)} g cm` }];
  },
  predictions,
};
