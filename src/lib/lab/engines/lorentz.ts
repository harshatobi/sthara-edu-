import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * A charge in magnetic and electric fields (Class XII Physics, Moving Charges and
 * Magnetism). The magnetic force qv × B is perpendicular to the velocity, so it
 * does no work: the particle moves in a circle of radius r = mv/qB with period
 * T = 2πm/qB, independent of the speed. With an electric field E across B as
 * well (velocity selector), only particles with v = E/B go straight through.
 */

export type LorentzParams = { particle: string; v: number; B: number; mode: string; E: number };

export const PARTICLES: Record<string, { label: string; m: number; q: number }> = {
  electron: { label: 'Electron', m: 9.109e-31, q: -1.602e-19 },
  proton: { label: 'Proton', m: 1.673e-27, q: 1.602e-19 },
  alpha: { label: 'Alpha particle', m: 6.645e-27, q: 3.204e-19 },
};

/** v in 10⁵ m/s, B in mT. Radius in cm, period in s. */
export function circle(p: Pick<LorentzParams, 'particle' | 'v' | 'B'>) {
  const s = PARTICLES[p.particle] ?? PARTICLES.proton, v = p.v * 1e5, B = p.B / 1000, q = Math.abs(s.q);
  return { r: ((s.m * v) / (q * B)) * 100, T: (2 * Math.PI * s.m) / (q * B), F: q * v * B };
}
/** Speed (10⁵ m/s) that passes straight through a selector with E (kV/m) across B (mT). */
export const selectorSpeed = (E: number, B: number) => (E * 1000) / (B / 1000) / 1e5;

const len = (cm: number) => (cm >= 100 ? `${fmt(cm / 100, 2)} m` : cm >= 1 ? `${fmt(cm, 1)} cm` : `${fmt(cm * 10, 2)} mm`);
const time = (s: number) => (s < 1e-6 ? `${fmt(s * 1e9, 2)} ns` : `${fmt(s * 1e6, 2)} μs`);
const TOPIC = 'Force on a moving charge in uniform magnetic and electric fields';

const predictions: PredictionTemplate<LorentzParams>[] = [
  {
    id: 'radius', label: 'Radius of the circle', topic: TOPIC,
    applies: p => p.mode === 'circle',
    build: p => {
      const c0 = circle(p);
      const c = choices(len(c0.r), [len(c0.r * 2), len(c0.r / 2), len(c0.r * 4)], 531);
      return { prompt: `${PARTICLES[p.particle].label} at ${fmt(p.v, 1)} × 10⁵ m/s across a ${fmt(p.B, 0)} mT field. What is the radius of its path?`, ...c, explain: `qvB provides the centripetal force mv²/r, so r = mv/qB = ${len(c0.r)}.` };
    },
  },
  {
    id: 'faster', label: 'Twice as fast', topic: TOPIC,
    applies: p => p.mode === 'circle',
    build: p => {
      const c = choices('The radius doubles; the period stays the same', ['The radius doubles and so does the period', 'The radius halves', 'Nothing changes'], 532);
      return { prompt: 'The particle enters at twice the speed. What happens to the circle?', ...c, explain: `r = mv/qB ∝ v, but T = 2πr/v = 2πm/qB does not depend on v (${time(circle(p).T)} here). This is the principle of the cyclotron.` };
    },
  },
  {
    id: 'work', label: 'Work done by the magnetic force', topic: TOPIC,
    applies: p => p.mode === 'circle',
    build: () => {
      const c = choices('None: its speed stays the same', ['It speeds up', 'It slows down', 'It depends on the charge'], 533);
      return { prompt: 'Does the magnetic force change the particle\'s speed?', ...c, explain: 'The force qv × B is always at right angles to the velocity, so it does no work. It only turns the particle; its kinetic energy stays the same.' };
    },
  },
  {
    id: 'selector', label: 'Speed that goes straight', topic: TOPIC,
    applies: p => p.mode === 'selector',
    build: p => {
      const v = selectorSpeed(p.E, p.B);
      const c = choices(`${fmt(v, 2)} × 10⁵ m/s`, [`${fmt(v * 2, 2)} × 10⁵ m/s`, `${fmt(v / 2, 2)} × 10⁵ m/s`, `${fmt((p.B / 1000) / (p.E * 1000) / 1e5, 6)} × 10⁵ m/s`], 534);
      return { prompt: `E = ${fmt(p.E, 0)} kV/m and B = ${fmt(p.B, 0)} mT at right angles. Which speed passes straight through?`, ...c, explain: `Undeflected when qE = qvB, so v = E/B = ${fmt(p.E * 1000, 0)} / ${fmt(p.B / 1000, 3)} = ${fmt(v, 2)} × 10⁵ m/s, whatever the charge or mass.` };
    },
  },
];

export const lorentz: LabEngine<LorentzParams> = {
  id: 'lorentz',
  title: 'Charges in magnetic and electric fields',
  blurb: 'Send electrons, protons and alpha particles across a magnetic field, and pick out one speed with a velocity selector.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Moving Charges and Magnetism'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Fields', default: 'circle', options: [{ value: 'circle', label: 'Magnetic field only' }, { value: 'selector', label: 'Crossed E and B (velocity selector)' }] },
    { kind: 'choice', key: 'particle', label: 'Particle', default: 'proton', options: Object.entries(PARTICLES).map(([value, s]) => ({ value, label: s.label })) },
    { kind: 'number', key: 'v', label: 'Speed', unit: '× 10⁵ m/s', min: 0.5, max: 50, step: 0.5, default: 10 },
    { kind: 'number', key: 'B', label: 'Magnetic field', unit: 'mT', min: 1, max: 500, step: 1, default: 200 },
    { kind: 'number', key: 'E', label: 'Electric field', unit: 'kV/m', min: 1, max: 500, step: 1, default: 200, show: p => p.mode === 'selector' },
  ],
  readouts: p => {
    if (p.mode === 'selector') return [{ label: 'Passes straight at', value: `${fmt(selectorSpeed(p.E, p.B), 2)} × 10⁵ m/s` }, { label: 'This particle', value: Math.abs(p.v - selectorSpeed(p.E, p.B)) < 0.05 ? 'goes straight' : p.v > selectorSpeed(p.E, p.B) ? 'bends towards the magnetic force' : 'bends towards the electric force' }];
    const c0 = circle(p);
    return [{ label: 'Radius', value: len(c0.r) }, { label: 'Period', value: time(c0.T) }, { label: 'Force', value: `${c0.F.toExponential(2)} N` }];
  },
  predictions,
};
