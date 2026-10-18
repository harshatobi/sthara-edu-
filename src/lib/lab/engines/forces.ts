import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Force and the laws of motion (NCERT Class 9 Ch "Force and Laws of Motion").
 * push: a steady force on a block on a rough floor, F − μmg = ma (the block
 *   stays put while the push is no more than the friction it can take).
 * collide: two trolleys on a line, momentum conserved; they either stick
 *   together or bounce apart elastically. Velocities to the right are positive.
 */

export type ForcesParams = {
  scenario: 'push' | 'collide';
  m1: number; f: number; mu: number; t: number;
  m2: number; u1: number; u2: number; joins: 'stick' | 'bounce';
};

export const G = 9.8;

export interface PushResult { friction: number; moves: boolean; a: number; v: number; s: number; net: number }
export function solvePush(p: ForcesParams): PushResult {
  const maxFriction = p.mu * p.m1 * G;
  const moves = p.f > maxFriction + 1e-9;
  const friction = moves ? maxFriction : p.f;
  const a = moves ? (p.f - maxFriction) / p.m1 : 0;
  return { friction, moves, a, v: a * p.t, s: 0.5 * a * p.t * p.t, net: p.f - friction };
}

export interface CollideResult { v1: number; v2: number; pBefore: number; pAfter: number; keBefore: number; keAfter: number; meet: boolean }
export function solveCollide(p: ForcesParams): CollideResult {
  const { m1, m2, u1, u2 } = p;
  const pBefore = m1 * u1 + m2 * u2;
  let v1: number, v2: number;
  if (p.joins === 'stick') v1 = v2 = pBefore / (m1 + m2);
  else {
    v1 = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2);
    v2 = ((m2 - m1) * u2 + 2 * m1 * u1) / (m1 + m2);
  }
  return {
    v1, v2, pBefore, pAfter: m1 * v1 + m2 * v2,
    keBefore: 0.5 * m1 * u1 * u1 + 0.5 * m2 * u2 * u2, keAfter: 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2,
    // Trolley 1 starts on the left: they only meet if it closes the gap.
    meet: u1 > u2,
  };
}

const vel = (n: number) => `${n > 1e-9 ? '+' : n < -1e-9 ? '−' : ''}${fmt(Math.abs(n), 2)} m/s`;
const dir = (n: number) => (n > 1e-9 ? 'to the right' : n < -1e-9 ? 'to the left' : 'at rest');

const predictions: PredictionTemplate<ForcesParams>[] = [
  {
    id: 'will-it-move', label: 'Does the block move?', topic: 'Force of friction',
    applies: p => p.scenario === 'push',
    build: p => {
      const r = solvePush(p), max = p.mu * p.m1 * G;
      const c = choices(r.moves ? 'Yes, it speeds up' : 'No, friction holds it', ['Yes, it speeds up', 'No, friction holds it', 'It moves at a steady speed'], 41);
      return {
        prompt: `A ${fmt(p.f, 0)} N push on a ${fmt(p.m1, 1)} kg block (μ = ${fmt(p.mu, 2)}). Will it move?`, ...c,
        explain: `Friction can hold up to μmg = ${fmt(p.mu, 2)} × ${fmt(p.m1, 1)} × ${G} = ${fmt(max, 1)} N. The push is ${fmt(p.f, 0)} N, so ${r.moves ? `the unbalanced ${fmt(r.net, 1)} N accelerates it` : 'the forces balance and it stays at rest'}.`,
      };
    },
  },
  {
    id: 'acceleration', label: 'Acceleration of the block', topic: "Newton's first, second and third laws of motion",
    applies: p => p.scenario === 'push' && solvePush(p).moves,
    build: p => {
      const r = solvePush(p);
      const ac = (n: number) => `${fmt(n, 2)} m/s²`;
      const c = choices(ac(r.a), [ac(p.f / p.m1), ac(p.f * p.m1 / 100), ac(r.net / (p.m1 * G)), ac(r.a * 2)], 42);
      return { prompt: 'What is its acceleration?', ...c, explain: `a = (F − μmg)/m = (${fmt(p.f, 0)} − ${fmt(r.friction, 1)})/${fmt(p.m1, 1)} = ${ac(r.a)}. Without friction it would be F/m = ${ac(p.f / p.m1)}.` };
    },
  },
  {
    id: 'will-they-meet', label: 'Will the trolleys collide?', topic: "Newton's first, second and third laws of motion",
    applies: p => p.scenario === 'collide',
    build: p => {
      const r = solveCollide(p);
      const c = choices(r.meet ? 'Yes' : 'No, they never meet', ['Yes', 'No, they never meet'], 46);
      return { prompt: `Trolley 1 (on the left) moves at ${vel(p.u1)}, trolley 2 at ${vel(p.u2)}. Will they collide?`, ...c, explain: r.meet ? `Trolley 1 is closing the gap at ${fmt(p.u1 - p.u2, 2)} m/s, so they meet.` : `Trolley 1 is not catching up: trolley 2 moves ${p.u2 === p.u1 ? 'at the same velocity' : 'away faster'}, so the gap never closes.` };
    },
  },
  {
    id: 'after-collision', label: 'Speed after the collision', topic: "Newton's first, second and third laws of motion",
    applies: p => p.scenario === 'collide' && solveCollide(p).meet,
    build: p => {
      const r = solveCollide(p);
      const right = p.joins === 'stick' ? vel(r.v1) : `${vel(r.v1)} and ${vel(r.v2)}`;
      const wrong = p.joins === 'stick'
        ? [vel((p.u1 + p.u2) / 2), vel(p.u1 * p.m1 / p.m2), vel(-r.v1), vel(p.u1)]
        : [`${vel(r.v2)} and ${vel(r.v1)}`, `${vel(p.u2)} and ${vel(p.u1)}`, `${vel(r.pBefore / (p.m1 + p.m2))} and ${vel(r.pBefore / (p.m1 + p.m2))}`];
      const c = choices(right, wrong, 43);
      return {
        prompt: p.joins === 'stick' ? 'They stick together. How fast do they move off?' : 'They bounce apart. What are the two velocities after (trolley 1, trolley 2)?', ...c,
        explain: `Momentum before = ${fmt(p.m1, 1)}×${fmt(p.u1, 1)} + ${fmt(p.m2, 1)}×${fmt(p.u2, 1)} = ${fmt(r.pBefore, 2)} kg m/s, and it is the same after${p.joins === 'stick' ? `: v = ${fmt(r.pBefore, 2)}/${fmt(p.m1 + p.m2, 1)} = ${vel(r.v1)}` : ''}. ${p.joins === 'bounce' ? 'In a perfectly elastic bounce kinetic energy is kept too.' : `Kinetic energy falls from ${fmt(r.keBefore, 1)} J to ${fmt(r.keAfter, 1)} J (heat and sound).`}`,
      };
    },
  },
  {
    id: 'momentum-after', label: 'Total momentum after', topic: "Newton's first, second and third laws of motion",
    applies: p => p.scenario === 'collide' && solveCollide(p).meet,
    build: p => {
      const r = solveCollide(p);
      const kg = (n: number) => `${fmt(n, 2)} kg m/s`;
      const c = choices(kg(r.pAfter), [kg(0), kg(p.m1 * p.u1 + p.m2 * Math.abs(p.u2)), kg(r.pAfter / 2), kg((p.m1 + p.m2) * p.u1)].filter(x => x !== kg(r.pAfter)), 44);
      return { prompt: 'What is the total momentum of the two trolleys just after they collide?', ...c, explain: `Momentum is conserved: ${kg(r.pBefore)} before, ${kg(r.pAfter)} after. Leftward velocities count as negative.` };
    },
  },
  {
    id: 'which-way', label: 'Which way trolley 1 goes after', topic: "Newton's first, second and third laws of motion",
    applies: p => p.scenario === 'collide' && solveCollide(p).meet && p.joins === 'bounce',
    build: p => {
      const r = solveCollide(p);
      const d = dir(r.v1);
      const label = d === 'at rest' ? 'It stops dead' : d === 'to the right' ? 'Keeps going right' : 'Bounces back left';
      const c = choices(label, ['Keeps going right', 'Bounces back left', 'It stops dead'], 45);
      return { prompt: 'After they bounce, what does trolley 1 do?', ...c, explain: `v₁ = ((m₁ − m₂)u₁ + 2m₂u₂)/(m₁ + m₂) = ${vel(r.v1)}. ${p.m1 < p.m2 ? 'A lighter trolley hitting a heavier one bounces back.' : p.m1 === p.m2 ? 'Equal masses swap velocities.' : 'A heavier trolley carries on.'}` };
    },
  },
];

const isPush = (p: ForcesParams) => p.scenario === 'push';

export const forces: LabEngine<ForcesParams> = {
  id: 'forces',
  title: 'Forces and collisions',
  blurb: 'Push a block against friction, or crash two trolleys: F = ma and conservation of momentum, live.',
  subject: 'Science',
  classes: [9],
  chapters: ['Force and Laws of Motion'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'push', options: [{ value: 'push', label: 'Push a block' }, { value: 'collide', label: 'Two trolleys collide' }] },
    { kind: 'number', key: 'm1', label: 'Mass (block / trolley 1)', unit: 'kg', min: 0.5, max: 50, step: 0.5, default: 10 },
    { kind: 'number', key: 'f', label: 'Push', unit: 'N', min: 0, max: 300, step: 5, default: 50, show: isPush },
    { kind: 'number', key: 'mu', label: 'Friction coefficient μ', unit: '', min: 0, max: 0.8, step: 0.05, default: 0.2, show: isPush },
    { kind: 'number', key: 't', label: 'Push for', unit: 's', min: 1, max: 10, step: 1, default: 4, show: isPush },
    { kind: 'number', key: 'm2', label: 'Trolley 2 mass', unit: 'kg', min: 0.5, max: 50, step: 0.5, default: 5, show: p => !isPush(p) },
    { kind: 'number', key: 'u1', label: 'Trolley 1 velocity', unit: 'm/s', min: -10, max: 10, step: 0.5, default: 3, show: p => !isPush(p) },
    { kind: 'number', key: 'u2', label: 'Trolley 2 velocity', unit: 'm/s', min: -10, max: 10, step: 0.5, default: 0, show: p => !isPush(p) },
    { kind: 'choice', key: 'joins', label: 'When they meet', default: 'stick', options: [{ value: 'stick', label: 'They stick together' }, { value: 'bounce', label: 'They bounce apart' }], show: p => !isPush(p) },
  ],
  readouts: p => {
    if (p.scenario === 'push') {
      const r = solvePush(p);
      return [
        { label: 'Friction', value: `${fmt(r.friction, 1)} N` },
        { label: 'Unbalanced force', value: `${fmt(r.net, 1)} N` },
        { label: 'Acceleration', value: `${fmt(r.a, 2)} m/s²` },
        { label: `After ${fmt(p.t, 0)} s`, value: `${fmt(r.v, 2)} m/s, ${fmt(r.s, 2)} m` },
      ];
    }
    const r = solveCollide(p);
    if (!r.meet) return [{ label: 'Collision', value: 'They never meet: trolley 2 is not slower than trolley 1' }];
    return [
      { label: 'Momentum before', value: `${fmt(r.pBefore, 2)} kg m/s` },
      { label: 'Momentum after', value: `${fmt(r.pAfter, 2)} kg m/s` },
      { label: 'Trolley 1 after', value: vel(r.v1) },
      { label: 'Trolley 2 after', value: vel(r.v2) },
      { label: 'Kinetic energy', value: `${fmt(r.keBefore, 1)} J → ${fmt(r.keAfter, 1)} J` },
    ];
  },
  predictions,
};
