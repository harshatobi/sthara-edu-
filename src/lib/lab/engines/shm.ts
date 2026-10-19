import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Oscillations (CBSE Class XI Physics, experiments A7, A8, B2 and activity A7).
 *
 * Simple pendulum, small swings: T = 2π√(L/g), L the effective length (string
 * plus bob radius). The bob's mass does not appear: bobs of the same size and
 * different masses swing with the same period. L ∝ T², and the second's
 * pendulum (T = 2 s) is L = g/π² ≈ 99.3 cm.
 * Damping: air resistance takes energy, so the amplitude dies away; energy ∝ A²
 * falls exponentially: A² = A₀² e^(−t/τ). A heavier bob of the same size loses a
 * smaller share of its energy each swing, so τ grows with the mass.
 * Loaded spring: Hooke's law F = kx, so extension x = mg/k and the load-extension
 * graph is a straight line of slope 1/k; it oscillates with T = 2π√(m/k).
 */

export type ShmParams = { mode: string; L: number; m: number; k: number };

export const G = 9.8;
export const SECONDS_L = (G / Math.PI ** 2) * 100; // cm

export const periodPendulum = (Lcm: number) => 2 * Math.PI * Math.sqrt(Lcm / 100 / G);
export const periodSpring = (mG: number, k: number) => 2 * Math.PI * Math.sqrt(mG / 1000 / k);
export const extension = (mG: number, k: number) => ((mG / 1000) * G / k) * 100; // cm
/** Energy time constant (s) for a bob of this mass (same size bob, school lab air). */
export const tauOf = (mG: number) => 40 * Math.sqrt(mG / 50);

const s2 = (t: number) => `${fmt(t, 2)} s`;

const predictions: PredictionTemplate<ShmParams>[] = [
  {
    id: 'period', label: 'Time period', topic: 'Simple pendulum: derivation of the time period',
    applies: p => p.mode === 'pendulum' || p.mode === 'mass',
    build: p => {
      const T = periodPendulum(p.L);
      const c = choices(s2(T), [s2(T * 2), s2(T / 2), s2(2 * Math.PI * (p.L / 100) / G)], 331);
      return { prompt: `What is the time period of a ${fmt(p.L, 0)} cm pendulum?`, ...c, explain: `T = 2π√(L/g) = 2π√(${fmt(p.L / 100, 2)}/${G}) = ${s2(T)}.` };
    },
  },
  {
    id: 'four-l', label: 'Four times the length', topic: 'Simple pendulum: derivation of the time period',
    applies: p => p.mode === 'pendulum',
    build: p => {
      const c = choices('It doubles', ['It becomes four times', 'It halves', 'It stays the same'], 332);
      return { prompt: `The length is made four times (${fmt(p.L, 0)} → ${fmt(p.L * 4, 0)} cm). What happens to the period?`, ...c, explain: `T ∝ √L, so 4 times the length gives √4 = 2 times the period: ${s2(periodPendulum(p.L))} → ${s2(periodPendulum(p.L * 4))}.` };
    },
  },
  {
    id: 'seconds', label: "The second's pendulum", topic: 'Simple pendulum: derivation of the time period',
    applies: p => p.mode === 'pendulum',
    build: () => {
      const c = choices(`${fmt(SECONDS_L, 1)} cm`, ['50.0 cm', '24.8 cm', '200.0 cm'], 333);
      return { prompt: "From the L-T² graph, what length gives the second's pendulum (T = 2 s)?", ...c, explain: `A second's pendulum takes 1 s for each swing, so T = 2 s. L = gT²/4π² = ${G} × 4/(4π²) = ${fmt(SECONDS_L / 100, 3)} m = ${fmt(SECONDS_L, 1)} cm.` };
    },
  },
  {
    id: 'mass', label: 'A heavier bob', topic: 'Simple pendulum: derivation of the time period',
    applies: p => p.mode === 'mass',
    build: p => {
      const c = choices('The period stays the same', ['The period gets longer', 'The period gets shorter', 'The period doubles'], 334);
      return { prompt: `A bob of the same size but ${fmt(p.m * 2, 0)} g instead of ${fmt(p.m, 0)} g. What happens to the period?`, ...c, explain: `T = 2π√(L/g) has no mass in it: the extra weight is matched by the extra inertia. Both swing with T = ${s2(periodPendulum(p.L))}.` };
    },
  },
  {
    id: 'damped', label: 'Amplitude after a while', topic: 'Energy in SHM: kinetic and potential energies',
    applies: p => p.mode === 'damped',
    build: p => {
      const tau = tauOf(p.m), half = tau * Math.LN2;
      const c = choices(`About ${fmt(half, 0)} s`, [`About ${fmt(half / 2, 0)} s`, `About ${fmt(half * 2, 0)} s`, 'It never gets smaller'], 335);
      return { prompt: `The ${fmt(p.m, 0)} g bob swings with a 10 cm amplitude. When will the square of the amplitude (its energy) have halved?`, ...c, explain: `Energy ∝ A² falls as e^(−t/τ) with τ ≈ ${fmt(tau, 0)} s here, so it halves after τ ln 2 ≈ ${fmt(half, 0)} s. The graph of A² against t curves down the same way however long you wait.` };
    },
  },
  {
    id: 'extension', label: 'Extension of the spring', topic: 'Oscillations of a loaded spring: restoring force and force constant',
    applies: p => p.mode === 'spring',
    build: p => {
      const x = extension(p.m, p.k);
      const c = choices(`${fmt(x, 1)} cm`, [`${fmt(x * 2, 1)} cm`, `${fmt(x / G, 1)} cm`, `${fmt(p.m / p.k, 1)} cm`], 336);
      return { prompt: `A ${fmt(p.m, 0)} g load hangs on a spring of force constant ${fmt(p.k, 0)} N/m. How far does it stretch?`, ...c, explain: `At rest kx = mg, so x = mg/k = ${fmt(p.m / 1000, 3)} × ${G} / ${fmt(p.k, 0)} = ${fmt(x / 100, 3)} m = ${fmt(x, 1)} cm.` };
    },
  },
  {
    id: 'slope', label: 'What the slope of load-extension gives', topic: 'Oscillations of a loaded spring: restoring force and force constant',
    applies: p => p.mode === 'spring',
    build: p => {
      const c = choices('The force constant k', ['The acceleration due to gravity', 'The period of the spring', 'The mass of the spring'], 337);
      return { prompt: 'Plotting load (as a force, mg) against extension, what is the slope?', ...c, explain: `F = kx: a straight line through the origin whose slope is k, ${fmt(p.k, 0)} N/m here.` };
    },
  },
  {
    id: 'spring-period', label: 'Period of the loaded spring', topic: 'Oscillations of a loaded spring: restoring force and force constant',
    applies: p => p.mode === 'spring',
    build: p => {
      const T = periodSpring(p.m, p.k);
      const c = choices(s2(T), [s2(T * 2), s2(2 * Math.PI * Math.sqrt(p.k / (p.m / 1000)) / 100), s2(T / 2)], 338);
      return { prompt: 'Pulled down a little and let go, what is its period?', ...c, explain: `T = 2π√(m/k) = 2π√(${fmt(p.m / 1000, 3)}/${fmt(p.k, 0)}) = ${s2(T)}.` };
    },
  },
];

export const shm: LabEngine<ShmParams> = {
  id: 'shm',
  title: 'Pendulum and loaded spring',
  blurb: 'Time a pendulum to plot L against T², find the second\'s pendulum, compare bobs, watch damping, and stretch a spring.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Oscillations'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'pendulum', options: [{ value: 'pendulum', label: 'Pendulum: L and T' }, { value: 'mass', label: 'Pendulum: bob mass' }, { value: 'damped', label: 'Pendulum: damping' }, { value: 'spring', label: 'Loaded spring' }] },
    { kind: 'number', key: 'L', label: 'Effective length', unit: 'cm', min: 20, max: 150, step: 1, default: 80, show: p => p.mode !== 'spring' },
    { kind: 'number', key: 'm', label: 'Mass', unit: 'g', min: 20, max: 500, step: 10, default: 100 },
    { kind: 'number', key: 'k', label: 'Spring constant', unit: 'N/m', min: 5, max: 60, step: 1, default: 20, show: p => p.mode === 'spring' },
  ],
  readouts: p => p.mode === 'spring'
    ? [{ label: 'Extension', value: `${fmt(extension(p.m, p.k), 1)} cm` }, { label: 'Load (mg)', value: `${fmt((p.m / 1000) * G, 3)} N` }, { label: 'Period', value: s2(periodSpring(p.m, p.k)) }]
    : [
      { label: 'Period T', value: s2(periodPendulum(p.L)) },
      { label: 'T²', value: `${fmt(periodPendulum(p.L) ** 2, 3)} s²` },
      { label: 'L / T²', value: `${fmt(p.L / periodPendulum(p.L) ** 2, 1)} cm/s²` },
      ...(p.mode === 'damped' ? [{ label: 'Energy halves in', value: `${fmt(tauOf(p.m) * Math.LN2, 0)} s` }] : []),
    ],
  predictions,
};
