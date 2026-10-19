import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Projectile motion (CBSE Class XI Physics, activity A5, and the theory of
 * Motion in a Plane). Launched from the ground at speed u and angle θ, with no
 * air resistance: the horizontal velocity u cos θ stays the same and the
 * vertical one changes at g.
 *   time of flight T = 2u sin θ / g, maximum height H = u² sin²θ / 2g,
 *   range R = u² sin 2θ / g (greatest at 45°; θ and 90° − θ give the same range).
 */

export type ProjectileParams = { u: number; angle: number };

export const G = 9.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function solveProjectile(p: ProjectileParams) {
  const a = rad(p.angle);
  return {
    T: (2 * p.u * Math.sin(a)) / G,
    H: (p.u * Math.sin(a)) ** 2 / (2 * G),
    R: (p.u * p.u * Math.sin(2 * a)) / G,
    ux: p.u * Math.cos(a),
    uy: p.u * Math.sin(a),
  };
}

export const rangeAt = (u: number, angle: number) => (u * u * Math.sin(2 * rad(angle))) / G;

const m = (x: number) => `${fmt(x, 1)} m`;
const TOPIC = 'Motion in a plane with uniform velocity and uniform acceleration: projectile motion';

const predictions: PredictionTemplate<ProjectileParams>[] = [
  {
    id: 'range', label: 'Range', topic: TOPIC,
    build: p => {
      const s = solveProjectile(p);
      const c = choices(m(s.R), [m((p.u * p.u) / G), m(s.R / 2), m(s.ux * s.T / 2)], 351);
      return { prompt: `Launched at ${fmt(p.u, 0)} m/s and ${fmt(p.angle, 0)}°, how far does it land?`, ...c, explain: `R = u² sin 2θ / g = ${fmt(p.u, 0)}² × sin ${fmt(2 * p.angle, 0)}° / ${G} = ${m(s.R)}.` };
    },
  },
  {
    id: 'best-angle', label: 'Angle for the longest range', topic: TOPIC,
    build: () => {
      const c = choices('45°', ['30°', '60°', '90°'], 352);
      return { prompt: 'At the same launch speed, which angle gives the longest range?', ...c, explain: 'R = u² sin 2θ / g is largest when sin 2θ = 1, that is 2θ = 90°, θ = 45°.' };
    },
  },
  {
    id: 'complement', label: 'Complementary angle', topic: TOPIC,
    applies: p => p.angle !== 45,
    build: p => {
      const c = choices(`The same range, ${m(solveProjectile(p).R)}`, ['A longer range', 'A shorter range', 'Half the range'], 353);
      return { prompt: `It is launched at ${fmt(90 - p.angle, 0)}° instead of ${fmt(p.angle, 0)}°, same speed. How far does it go?`, ...c, explain: `sin 2(90° − θ) = sin(180° − 2θ) = sin 2θ, so the ranges are equal. The higher one stays in the air longer and goes higher.` };
    },
  },
  {
    id: 'height', label: 'Maximum height', topic: TOPIC,
    build: p => {
      const s = solveProjectile(p);
      const c = choices(m(s.H), [m(s.H * 2), m((p.u * p.u) / (2 * G)), m(s.R / 2)], 354);
      return { prompt: 'How high does it rise?', ...c, explain: `At the top the vertical velocity is zero: H = (u sin θ)² / 2g = ${fmt(s.uy, 2)}² / ${fmt(2 * G, 1)} = ${m(s.H)}.` };
    },
  },
  {
    id: 'top-speed', label: 'Speed at the top', topic: TOPIC,
    build: p => {
      const s = solveProjectile(p);
      const c = choices(`${fmt(s.ux, 1)} m/s`, ['0 m/s', `${fmt(p.u, 1)} m/s`, `${fmt(s.uy, 1)} m/s`], 355);
      return { prompt: 'What is its speed at the highest point?', ...c, explain: `Only the vertical velocity becomes zero at the top; the horizontal velocity u cos θ = ${fmt(s.ux, 1)} m/s never changes (no air resistance).` };
    },
  },
  {
    id: 'flight', label: 'Time of flight', topic: TOPIC,
    build: p => {
      const s = solveProjectile(p);
      const c = choices(`${fmt(s.T, 2)} s`, [`${fmt(s.T / 2, 2)} s`, `${fmt(p.u / G, 2)} s`, `${fmt(s.T * 2, 2)} s`], 356);
      return { prompt: 'How long is it in the air?', ...c, explain: `T = 2u sin θ / g = 2 × ${fmt(s.uy, 2)} / ${G} = ${fmt(s.T, 2)} s: up for half, down for half.` };
    },
  },
];

export const projectile: LabEngine<ProjectileParams> = {
  id: 'projectile',
  title: 'Projectile motion',
  blurb: 'Launch at any angle and speed: trace the parabola, compare complementary angles and find the angle for the longest range.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Motion in a Plane'],
  params: [
    { kind: 'number', key: 'u', label: 'Launch speed', unit: 'm/s', min: 2, max: 30, step: 1, default: 12 },
    { kind: 'number', key: 'angle', label: 'Launch angle', unit: '°', min: 5, max: 85, step: 1, default: 30 },
  ],
  readouts: p => {
    const s = solveProjectile(p);
    return [{ label: 'Range', value: m(s.R) }, { label: 'Maximum height', value: m(s.H) }, { label: 'Time of flight', value: `${fmt(s.T, 2)} s` }, { label: 'u cos θ', value: `${fmt(s.ux, 2)} m/s` }];
  },
  predictions,
};
