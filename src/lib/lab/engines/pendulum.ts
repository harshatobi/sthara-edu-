import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Simple pendulum (CBSE Class 9 practical: verification of the law of
 * conservation of energy). A bob of mass m on a light string of length L is
 * released from rest at angle θ. Its lowest point is the reference: at angle
 * φ it is h = L(1 − cos φ) higher, so mgh_max = mgh + ½mv² all the way, and
 * with no air resistance it rises to the same height on the other side.
 * The period (small swings, T = 2π√(L/g)) is shown as a reading only: it is Class 11.
 */

export type PendulumParams = { len: number; angle: number; m: number };

export const G = 9.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Height above the lowest point (m) at angle φ (degrees). */
export const heightAt = (p: PendulumParams, phi: number) => (p.len / 100) * (1 - Math.cos(rad(phi)));

export function solvePendulum(p: PendulumParams) {
  const h = heightAt(p, p.angle), m = p.m / 1000;
  const pe = m * G * h;
  return { h, pe, vMax: Math.sqrt(2 * G * h), period: 2 * Math.PI * Math.sqrt(p.len / 100 / G) };
}

/** Angle (deg) at which PE and KE are equal: half the height. */
export const halfEnergyAngle = (p: PendulumParams) => (Math.acos(1 - (1 - Math.cos(rad(p.angle))) / 2) * 180) / Math.PI;

const cm = (m: number) => `${fmt(m * 100, 1)} cm`;
const ms = (v: number) => `${fmt(v, 2)} m/s`;

const predictions: PredictionTemplate<PendulumParams>[] = [
  {
    id: 'other-side', label: 'How high it swings on the other side', topic: 'Conservation of energy',
    build: p => {
      const s = solvePendulum(p);
      const c = choices(`${cm(s.h)}, the same height`, [`${cm(s.h / 2)}, half as high`, `${cm(s.h * 2)}, twice as high`, 'It stops at the bottom'], 211);
      return { prompt: `The bob is released ${cm(s.h)} above its lowest point. How high does it rise on the other side (no air resistance)?`, ...c, explain: `All its energy is potential at the top (mgh = ${fmt(s.pe * 1000, 1)} mJ). At the bottom it is all kinetic; on the other side it turns back into potential energy, so it rises to the same ${cm(s.h)}. In a real lab it falls a little short: air resistance takes some energy.` };
    },
  },
  {
    id: 'speed-bottom', label: 'Speed at the lowest point', topic: 'Kinetic and potential energy and their interconversion',
    build: p => {
      const s = solvePendulum(p);
      const c = choices(ms(s.vMax), [ms(G * s.h), ms(Math.sqrt(G * s.h)), ms(s.vMax * Math.sqrt(p.m / 100)), ms(0)], 212);
      return { prompt: 'How fast is the bob moving at the lowest point?', ...c, explain: `mgh = ½mv², so v = √(2gh) = √(2 × ${G} × ${fmt(s.h, 4)}) = ${ms(s.vMax)}. The mass cancels.` };
    },
  },
  {
    id: 'half-energy', label: 'Where PE equals KE', topic: 'Kinetic and potential energy and their interconversion',
    build: p => {
      const a = halfEnergyAngle(p), deg = (d: number) => `At ${fmt(d, 1)}° from the vertical`;
      const c = choices(deg(a), [deg(p.angle / 2), deg(p.angle * 0.75), 'At the lowest point'], 213);
      return { prompt: 'Where in the swing are its potential and kinetic energy equal?', ...c, explain: `PE = KE when the bob is at half its starting height, ${cm(solvePendulum(p).h / 2)}. That is at ${fmt(a, 1)}°, not half the angle, because height grows as 1 − cos φ.` };
    },
  },
  {
    id: 'mass-change', label: 'A heavier bob', topic: 'Conservation of energy',
    build: p => {
      const c = choices('The same speed at the bottom', ['A faster speed at the bottom', 'A slower speed at the bottom', 'It swings higher on the other side'], 214);
      return { prompt: `If the ${fmt(p.m, 0)} g bob is swapped for one twice as heavy, released from the same place…`, ...c, explain: 'Its energy doubles, but so does the mass to move: v = √(2gh) has no m in it. Speed and swing height do not change.' };
    },
  },
];

export const pendulum: LabEngine<PendulumParams> = {
  id: 'pendulum',
  title: 'Simple pendulum',
  blurb: 'Release the bob and watch potential energy turn into kinetic and back: it rises to the same height on the other side.',
  subject: 'Science',
  classes: [9],
  chapters: ['Work, Energy and Simple Machines'],
  params: [
    { kind: 'number', key: 'len', label: 'String length', unit: 'cm', min: 20, max: 150, step: 1, default: 80 },
    { kind: 'number', key: 'angle', label: 'Released at', unit: '°', min: 5, max: 60, step: 1, default: 30 },
    { kind: 'number', key: 'm', label: 'Bob mass', unit: 'g', min: 20, max: 500, step: 10, default: 100 },
  ],
  readouts: p => {
    const s = solvePendulum(p);
    return [
      { label: 'Height at release', value: cm(s.h) },
      { label: 'PE at release', value: `${fmt(s.pe * 1000, 1)} mJ` },
      { label: 'Speed at the bottom', value: ms(s.vMax) },
      { label: 'Period (small swings)', value: `${fmt(s.period, 2)} s` },
    ];
  },
  predictions,
};
