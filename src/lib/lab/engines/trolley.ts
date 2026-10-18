import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Trolley, pulley and hanging masses (CBSE Class 9 practical: verification of
 * Newton's second law). Friction is compensated (the runway is tilted just
 * enough), so the only unbalanced force is the hanging weight mg, which
 * accelerates trolley and hanger together: a = mg / (M + m). Starting from
 * rest, the trolley covers d in t = √(2d/a). String tension = M·a.
 */

export type TrolleyParams = { trolley: number; hang: number; dist: number };

export const G = 9.8;

export function solveTrolley(p: TrolleyParams) {
  const M = p.trolley / 1000, m = p.hang / 1000;
  const force = m * G, a = force / (M + m);
  return { force, a, time: Math.sqrt((2 * p.dist) / a), tension: M * a, vEnd: Math.sqrt(2 * a * p.dist) };
}

const mss = (a: number) => `${fmt(a, 2)} m/s²`, N = (f: number) => `${fmt(f, 3)} N`;

const predictions: PredictionTemplate<TrolleyParams>[] = [
  {
    id: 'acceleration', label: 'Acceleration of the trolley', topic: "Newton's first, second and third laws of motion",
    build: p => {
      const s = solveTrolley(p), M = p.trolley / 1000;
      const c = choices(mss(s.a), [mss(s.force / M), mss(G), mss(s.force / (p.hang / 1000)), mss(s.a * 2)], 231);
      return { prompt: `A ${fmt(p.hang, 0)} g hanger pulls a ${fmt(p.trolley, 0)} g trolley (friction compensated). What is the acceleration?`, ...c, explain: `The hanging weight mg = ${N(s.force)} accelerates both masses: a = F/(M + m) = ${fmt(s.force, 3)}/${fmt((p.trolley + p.hang) / 1000, 3)} = ${mss(s.a)}.` };
    },
  },
  {
    id: 'time', label: 'Time to cover the distance', topic: "Newton's first, second and third laws of motion",
    build: p => {
      const s = solveTrolley(p), sec = (t: number) => `${fmt(t, 2)} s`;
      const c = choices(sec(s.time), [sec(p.dist / s.a), sec(Math.sqrt(p.dist / s.a)), sec(s.time * 2), sec(2 * p.dist / s.a)], 232);
      return { prompt: `Starting from rest, how long does the trolley take to travel ${fmt(p.dist, 2)} m?`, ...c, explain: `From rest, s = ½at², so t = √(2s/a) = √(2 × ${fmt(p.dist, 2)}/${fmt(s.a, 3)}) = ${sec(s.time)}.` };
    },
  },
  {
    id: 'double-hang', label: 'Doubling the hanging mass', topic: "Newton's first, second and third laws of motion",
    build: p => {
      const a1 = solveTrolley(p).a, a2 = solveTrolley({ ...p, hang: p.hang * 2 }).a;
      const right = `Rises to ${mss(a2)}, a little less than double`;
      const c = choices(right, [`Exactly doubles to ${mss(a1 * 2)}`, 'Stays the same', `Halves to ${mss(a1 / 2)}`], 233);
      return { prompt: `The hanging mass is doubled to ${fmt(p.hang * 2, 0)} g. What happens to the acceleration (now ${mss(a1)})?`, ...c, explain: `The force doubles, but the mass being accelerated also grows (M + 2m instead of M + m), so a goes from ${mss(a1)} to ${mss(a2)}. To keep the total mass fixed, the lab moves masses from the trolley to the hanger.` };
    },
  },
  {
    id: 'tension', label: 'Tension in the string', topic: "Newton's first, second and third laws of motion",
    build: p => {
      const s = solveTrolley(p);
      const c = choices(N(s.tension), [N(s.force), N(0), N(s.force + s.tension)], 234);
      return { prompt: 'What is the tension in the string while it moves?', ...c, explain: `The string is all that pulls the trolley, so T = M·a = ${fmt(p.trolley / 1000, 3)} × ${fmt(s.a, 3)} = ${N(s.tension)}: less than the hanging weight ${N(s.force)}, because the hanger is accelerating too.` };
    },
  },
];

export const trolley: LabEngine<TrolleyParams> = {
  id: 'trolley',
  title: 'Trolley and pulley',
  blurb: "A hanging mass pulls a trolley along a runway: force, mass and acceleration, Newton's second law.",
  subject: 'Science',
  classes: [9],
  chapters: ['Force and Laws of Motion'],
  params: [
    { kind: 'number', key: 'trolley', label: 'Trolley mass', unit: 'g', min: 200, max: 2000, step: 50, default: 500 },
    { kind: 'number', key: 'hang', label: 'Hanging mass', unit: 'g', min: 10, max: 300, step: 10, default: 50 },
    { kind: 'number', key: 'dist', label: 'Distance timed', unit: 'm', min: 0.5, max: 2, step: 0.1, default: 1 },
  ],
  readouts: p => {
    const s = solveTrolley(p);
    return [
      { label: 'Pulling force (mg)', value: N(s.force) },
      { label: 'Acceleration', value: mss(s.a) },
      { label: 'Time for the distance', value: `${fmt(s.time, 2)} s` },
      { label: 'String tension', value: N(s.tension) },
    ];
  },
  predictions,
};
