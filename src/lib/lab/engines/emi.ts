import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Electromagnetic induction (Class XII Physics). A bar magnet moves along the
 * axis of a coil of N turns. Faraday: the induced emf is ε = −N dΦ/dt, so it
 * grows with the number of turns and the speed of the magnet, and vanishes when
 * the magnet is still. Lenz: the induced current opposes the change, so the
 * coil's near face becomes the same pole as an approaching magnet (repelling it)
 * and the opposite pole of a receding one (attracting it).
 *
 * Model: the flux through the coil changes by B·A = 0.08 T × 4 cm² over the last
 * 5 cm of the approach, at the magnet's speed v: ε ≈ N·BA·v / 0.05 m.
 */

export type EmiParams = { motion: string; pole: string; N: number; v: number };

export const BA = 0.08 * 4e-4; // Wb, flux change from far away to the coil's face
export const RAMP = 0.05; // m

export function induced(p: EmiParams) {
  const moving = p.motion !== 'still';
  const emf = moving ? (p.N * BA * p.v) / RAMP : 0; // V
  // The near face of the coil: like pole when approaching, unlike when receding.
  const face = !moving ? 'none' : p.motion === 'in' ? p.pole : p.pole === 'N' ? 'S' : 'N';
  // Galvanometer swings right for an N face seen from the magnet's side (one convention, kept throughout).
  const swing = face === 'none' ? 0 : face === 'N' ? 1 : -1;
  return { emf, face, swing };
}

const mV = (v: number) => `${fmt(v * 1000, 1)} mV`;
const FARADAY = 'Electromagnetic induction; Faraday\'s laws; induced emf and current';

const predictions: PredictionTemplate<EmiParams>[] = [
  {
    id: 'face', label: 'Pole on the near face', topic: "Lenz's law",
    applies: p => p.motion !== 'still',
    build: p => {
      const r = induced(p);
      const c = choices(`${r.face === 'N' ? 'North' : 'South'}: it ${p.motion === 'in' ? 'repels the approaching magnet' : 'attracts the receding magnet'}`, [`${r.face === 'N' ? 'South' : 'North'}: it ${p.motion === 'in' ? 'attracts the magnet' : 'repels the magnet'}`, 'Neither: no current flows', 'It changes back and forth'], 541);
      return { prompt: `The ${p.pole} pole of a magnet is ${p.motion === 'in' ? 'pushed towards' : 'pulled away from'} the coil. What pole does the coil's near face become?`, ...c, explain: `Lenz's law: the induced current opposes the change that causes it. ${p.motion === 'in' ? 'An approaching pole is repelled by a like pole.' : 'A receding pole is held back by an unlike pole.'} You do work against this force, and that work becomes electrical energy.` };
    },
  },
  {
    id: 'emf', label: 'Size of the emf', topic: FARADAY,
    applies: p => p.motion !== 'still',
    build: p => {
      const r = induced(p);
      const c = choices(mV(r.emf), [mV(r.emf * 2), mV(r.emf / 2), mV(BA * p.v / RAMP)], 542);
      return { prompt: `${p.N} turns, magnet moving at ${fmt(p.v, 1)} m/s. Roughly what emf is induced?`, ...c, explain: `ε = N ΔΦ/Δt; the flux changes by ${(BA * 1e6).toFixed(0)} μWb in ${fmt(RAMP / p.v * 1000, 0)} ms: ε ≈ ${p.N} × ${(BA * 1e6).toFixed(0)} × 10⁻⁶ / ${fmt(RAMP / p.v, 3)} = ${mV(r.emf)}.` };
    },
  },
  {
    id: 'faster', label: 'Moving it faster', topic: FARADAY,
    build: () => {
      const c = choices('A bigger deflection, for a shorter time', ['The same deflection', 'A smaller deflection', 'No deflection'], 543);
      return { prompt: 'The magnet is pushed in twice as fast. What does the galvanometer do?', ...c, explain: 'The same flux change happens in half the time, so dΦ/dt and the emf are twice as large, but last half as long.' };
    },
  },
  {
    id: 'still', label: 'Magnet held still', topic: FARADAY,
    build: () => {
      const c = choices('No current: the flux is not changing', ['A steady current', 'The largest current', 'A current that slowly falls'], 544);
      return { prompt: 'The magnet is held still inside the coil. What does the galvanometer show?', ...c, explain: 'Only a changing flux induces an emf. A strong magnet at rest inside the coil gives a large but constant flux, so the emf is zero.' };
    },
  },
];

export const emi: LabEngine<EmiParams> = {
  id: 'emi',
  title: 'Electromagnetic induction',
  blurb: 'Push a magnet into a coil and pull it out: the galvanometer, the induced pole and Lenz\'s law.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Electromagnetic Induction'],
  params: [
    { kind: 'choice', key: 'motion', label: 'Magnet', default: 'in', options: [{ value: 'in', label: 'Pushed in' }, { value: 'out', label: 'Pulled out' }, { value: 'still', label: 'Held still' }] },
    { kind: 'choice', key: 'pole', label: 'Pole facing the coil', default: 'N', options: [{ value: 'N', label: 'North' }, { value: 'S', label: 'South' }] },
    { kind: 'number', key: 'N', label: 'Turns', unit: '', min: 50, max: 1000, step: 50, default: 200 },
    { kind: 'number', key: 'v', label: 'Speed of the magnet', unit: 'm/s', min: 0.1, max: 2, step: 0.1, default: 0.5 },
  ],
  readouts: p => {
    const r = induced(p);
    return [{ label: 'Induced emf', value: mV(r.emf) }, { label: 'Near face of the coil', value: r.face === 'none' ? 'no pole' : r.face === 'N' ? 'North' : 'South' }, { label: 'Galvanometer', value: r.swing === 0 ? 'zero' : r.swing > 0 ? 'swings right' : 'swings left' }];
  },
  predictions,
};
