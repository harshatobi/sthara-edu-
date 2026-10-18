import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Work, energy and simple machines (NCERT Class 9).
 * drop: an object falls from rest, no air resistance. PE = mgh turns into
 *   KE = ½mv²; their sum stays the same all the way down.
 * lever: a light rigid bar in balance, effort × effort arm = load × load arm.
 *   Class 1: fulcrum between; class 2: load between (MA > 1); class 3: effort
 *   between (MA < 1).
 */

export type EnergyParams = {
  scenario: 'drop' | 'lever';
  m: number; h: number; g: '9.8' | '10';
  lever: '1' | '2' | '3'; load: number; loadArm: number; effortArm: number;
};

export const gOf = (p: EnergyParams) => Number(p.g);

/** Energies (J) and speed (m/s) when the object has fallen to height y (m). */
export function dropAt(p: EnergyParams, y: number) {
  const g = gOf(p), fallen = Math.max(0, p.h - Math.max(0, y));
  return { pe: p.m * g * Math.max(0, y), ke: p.m * g * fallen, v: Math.sqrt(2 * g * fallen), total: p.m * g * p.h };
}

/** Time to reach the ground (s). */
export const fallTime = (p: EnergyParams) => Math.sqrt((2 * p.h) / gOf(p));

export function solveLever(p: EnergyParams) {
  const effort = (p.load * p.loadArm) / p.effortArm;
  return { effort, ma: p.load / effort };
}

const J = (n: number) => `${fmt(n, n >= 100 ? 0 : 1)} J`;

const predictions: PredictionTemplate<EnergyParams>[] = [
  {
    id: 'pe-top', label: 'Potential energy at the top', topic: 'Kinetic and potential energy and their interconversion',
    applies: p => p.scenario === 'drop',
    build: p => {
      const g = gOf(p), pe = p.m * g * p.h;
      const c = choices(J(pe), [J(p.m * p.h), J(0.5 * p.m * g * p.h), J(p.m * g * p.h * p.h / 10), J(pe * 2)], 51);
      return { prompt: `A ${fmt(p.m, 1)} kg object is held ${fmt(p.h, 1)} m up. What is its potential energy? (g = ${p.g} m/s²)`, ...c, explain: `PE = mgh = ${fmt(p.m, 1)} × ${p.g} × ${fmt(p.h, 1)} = ${J(pe)}.` };
    },
  },
  {
    id: 'half-way', label: 'Energy half-way down', topic: 'Conservation of energy',
    applies: p => p.scenario === 'drop',
    build: p => {
      const r = dropAt(p, p.h / 2);
      const show = (pe: number, ke: number) => `PE ${J(pe)}, KE ${J(ke)}`;
      const c = choices(show(r.pe, r.ke), [show(r.total, r.total), show(r.total, 0), show(r.pe / 2, r.ke / 2), show(0, r.total)], 52);
      return { prompt: 'Half-way down, how is its energy shared?', ...c, explain: `At ${fmt(p.h / 2, 2)} m, PE = mgh = ${J(r.pe)} and the rest has become kinetic energy: ${J(r.ke)}. Total is still ${J(r.total)}: energy is conserved.` };
    },
  },
  {
    id: 'impact-speed', label: 'Speed on reaching the ground', topic: 'Kinetic and potential energy and their interconversion',
    applies: p => p.scenario === 'drop',
    build: p => {
      const g = gOf(p), v = Math.sqrt(2 * g * p.h);
      const ms = (n: number) => `${fmt(n, 2)} m/s`;
      const c = choices(ms(v), [ms(g * p.h), ms(Math.sqrt(g * p.h)), ms(2 * g * p.h / 10), ms(v * Math.sqrt(p.m))], 53);
      return { prompt: 'How fast is it going just before it hits the ground?', ...c, explain: `All the PE becomes KE: mgh = ½mv², so v = √(2gh) = √(2 × ${p.g} × ${fmt(p.h, 1)}) = ${ms(v)}. The mass cancels: a heavy and a light object land at the same speed.` };
    },
  },
  {
    id: 'effort', label: 'Effort needed on the lever', topic: 'Simple machines and mechanical advantage (pulley, inclined plane, lever)',
    applies: p => p.scenario === 'lever',
    build: p => {
      const r = solveLever(p), N = (n: number) => `${fmt(n, 1)} N`;
      const c = choices(N(r.effort), [N(p.load), N((p.load * p.effortArm) / p.loadArm), N(p.load / 2), N(p.load * p.loadArm)], 54);
      return { prompt: `What effort balances a ${fmt(p.load, 0)} N load ${fmt(p.loadArm, 2)} m from the fulcrum, pushing ${fmt(p.effortArm, 2)} m from it?`, ...c, explain: `Effort × effort arm = load × load arm, so effort = ${fmt(p.load, 0)} × ${fmt(p.loadArm, 2)} / ${fmt(p.effortArm, 2)} = ${N(r.effort)}. Mechanical advantage = load/effort = ${fmt(r.ma, 2)}.` };
    },
  },
  {
    id: 'advantage', label: 'Does the lever make it easier?', topic: 'Simple machines and mechanical advantage (pulley, inclined plane, lever)',
    applies: p => p.scenario === 'lever',
    build: p => {
      const r = solveLever(p);
      const right = r.ma > 1 + 1e-9 ? 'Yes: less effort than the load' : r.ma < 1 - 1e-9 ? 'No: more effort, but the load moves further' : 'Effort equals the load';
      const c = choices(right, ['Yes: less effort than the load', 'No: more effort, but the load moves further', 'Effort equals the load'], 55);
      return { prompt: `Is this class ${p.lever} lever a force multiplier?`, ...c, explain: `MA = ${fmt(r.ma, 2)}. ${p.lever === '2' ? 'In a class 2 lever (nutcracker, wheelbarrow) the load is between, so the effort arm is always longer: MA > 1.' : p.lever === '3' ? 'In a class 3 lever (tongs, forearm) the effort is between, so MA < 1: it gains speed and distance, not force.' : 'In a class 1 lever (see-saw, scissors) it depends which arm is longer.'}` };
    },
  },
];

const isDrop = (p: EnergyParams) => p.scenario === 'drop';

export const energy: LabEngine<EnergyParams> = {
  id: 'energy',
  title: 'Energy and simple machines',
  blurb: 'Drop an object and watch potential energy turn into kinetic, or balance a load on a lever.',
  subject: 'Science',
  classes: [9],
  chapters: ['Work, Energy and Simple Machines'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'drop', options: [{ value: 'drop', label: 'Drop an object' }, { value: 'lever', label: 'Lever' }] },
    { kind: 'number', key: 'm', label: 'Mass', unit: 'kg', min: 0.1, max: 50, step: 0.1, default: 10, show: isDrop },
    { kind: 'number', key: 'h', label: 'Height', unit: 'm', min: 1, max: 80, step: 1, default: 6, show: isDrop },
    { kind: 'choice', key: 'g', label: 'g', default: '9.8', options: [{ value: '9.8', label: '9.8 m/s²' }, { value: '10', label: '10 m/s²' }], show: isDrop },
    { kind: 'choice', key: 'lever', label: 'Lever class', default: '1', options: [{ value: '1', label: 'Class 1: fulcrum in the middle' }, { value: '2', label: 'Class 2: load in the middle' }, { value: '3', label: 'Class 3: effort in the middle' }], show: p => !isDrop(p) },
    { kind: 'number', key: 'load', label: 'Load', unit: 'N', min: 10, max: 1000, step: 10, default: 200, show: p => !isDrop(p) },
    { kind: 'number', key: 'loadArm', label: 'Load arm', unit: 'm', min: 0.1, max: 3, step: 0.05, default: 0.5, show: p => !isDrop(p) },
    { kind: 'number', key: 'effortArm', label: 'Effort arm', unit: 'm', min: 0.1, max: 3, step: 0.05, default: 1.5, show: p => !isDrop(p) },
  ],
  // Arms measured from the fulcrum: a class 2 lever has the load nearer, a class 3 the effort nearer.
  check: p => {
    if (p.scenario !== 'lever') return null;
    if (p.lever === '2' && !(p.loadArm < p.effortArm)) return 'In a class 2 lever the load sits between fulcrum and effort, so the load arm must be shorter.';
    if (p.lever === '3' && !(p.effortArm < p.loadArm)) return 'In a class 3 lever the effort sits between fulcrum and load, so the effort arm must be shorter.';
    return null;
  },
  readouts: p => {
    if (p.scenario === 'lever') {
      const r = solveLever(p);
      return [{ label: 'Effort', value: `${fmt(r.effort, 1)} N` }, { label: 'Mechanical advantage', value: fmt(r.ma, 2) }, { label: 'Moments', value: `${fmt(p.load * p.loadArm, 1)} N m each side` }];
    }
    const r = dropAt(p, 0);
    return [
      { label: 'PE at the top', value: J(r.total) },
      { label: 'KE at the ground', value: J(r.ke) },
      { label: 'Speed at the ground', value: `${fmt(r.v, 2)} m/s` },
      { label: 'Time to fall', value: `${fmt(fallTime(p), 2)} s` },
    ];
  },
  predictions,
};
