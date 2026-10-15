import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Uniformly accelerated motion in a straight line (NCERT Class 9 Ch "Motion"):
 * v = u + at, s = ut + ½at², v² = u² + 2as. A braking car stops at rest and
 * stays there; it does not reverse, which is what the textbook's braking
 * problems mean.
 */

export type MotionParams = { u: number; a: number; t: number };

export interface MotionState { t: number; v: number; s: number }

/** When a braking car comes to rest (null if it never does within the run). */
export function stopTime(p: MotionParams): number | null {
  if (p.a >= 0) return p.u === 0 && p.a === 0 ? 0 : null;
  return -p.u / p.a;
}

/** Position and velocity at time t (s), holding still once stopped. */
export function stateAt(p: MotionParams, t: number): MotionState {
  const ts = stopTime(p);
  const tt = ts !== null && p.a < 0 ? Math.min(t, ts) : t;
  return { t, v: p.u + p.a * tt, s: p.u * tt + 0.5 * p.a * tt * tt };
}

/** Points for the distance–time and velocity–time graphs. */
export function samples(p: MotionParams, n = 80): MotionState[] {
  return Array.from({ length: n + 1 }, (_, k) => stateAt(p, (p.t * k) / n));
}

const ms = (n: number) => `${fmt(n, 2)} m/s`;
const m = (n: number) => `${fmt(n, 2)} m`;

function working(p: MotionParams): string {
  const end = stateAt(p, p.t), ts = stopTime(p);
  if (ts !== null && p.a < 0 && ts < p.t) {
    return `It stops after t = −u/a = ${fmt(p.u, 2)}/${fmt(-p.a, 2)} = ${fmt(ts, 2)} s, having gone s = u²/(2|a|) = ${m(end.s)}; then it stays at rest.`;
  }
  return `v = u + at = ${fmt(p.u, 2)} + (${fmt(p.a, 2)} × ${fmt(p.t, 1)}) = ${ms(end.v)}; s = ut + ½at² = ${m(end.s)}.`;
}

function graphShape(p: MotionParams): string {
  if (p.a > 0) return 'A straight line sloping up';
  if (p.a < 0) return p.u === 0 ? 'Flat along the time axis (it never moves)' : 'A straight line sloping down';
  return p.u === 0 ? 'Flat along the time axis (it never moves)' : 'A flat line above the time axis';
}

const predictions: PredictionTemplate<MotionParams>[] = [
  {
    id: 'final-velocity', label: 'Speed at the end',
    build: p => {
      const end = stateAt(p, p.t);
      // The last two always differ from the answer, so even a car that never moves gets real options.
      const c = choices(ms(end.v), [ms(p.u + p.a), ms(p.a * p.t), ms(Math.abs(p.u - p.a * p.t)), ms(p.u), ms(end.v + p.t), ms(end.v + 2 * p.t)], 31);
      return { prompt: `It starts at ${ms(p.u)} with an acceleration of ${fmt(p.a, 2)} m/s². How fast is it going after ${fmt(p.t, 1)} s?`, ...c, explain: working(p) };
    },
  },
  {
    id: 'distance', label: 'Distance covered',
    applies: p => stateAt(p, p.t).s > 0,
    build: p => {
      const s = stateAt(p, p.t).s;
      const c = choices(m(s), [m(p.u * p.t), m(0.5 * Math.abs(p.a) * p.t * p.t), m(p.u * p.t + Math.abs(p.a) * p.t * p.t), m(s * 2)], 32);
      return { prompt: `How far does it travel in ${fmt(p.t, 1)} s?`, ...c, explain: working(p) };
    },
  },
  {
    id: 'vt-shape', label: 'Shape of the velocity–time graph',
    build: p => {
      const c = choices(graphShape(p), ['A straight line sloping up', 'A straight line sloping down', 'A flat line above the time axis', 'A curve getting steeper'], 33);
      return {
        prompt: 'What will the velocity–time graph look like?', ...c,
        explain: `The slope of a velocity–time graph is the acceleration: ${fmt(p.a, 2)} m/s², constant, so it is a straight line${p.a === 0 ? ' with no slope' : ''}.${stopTime(p) !== null && p.a < 0 && (stopTime(p) as number) < p.t ? ' Once the car stops, the line runs along v = 0.' : ''}`,
      };
    },
  },
  {
    id: 'stopping', label: 'Stopping time and distance',
    applies: p => p.a < 0 && p.u > 0 && (stopTime(p) as number) <= p.t,
    build: p => {
      const ts = stopTime(p) as number, d = (p.u * p.u) / (2 * -p.a);
      const show = (t: number, s: number) => `${fmt(t, 2)} s, ${m(s)}`;
      const c = choices(show(ts, d), [show(ts, d * 2), show(ts * 2, d), show(p.u * -p.a, d), show(ts, p.u * ts)], 34);
      return { prompt: `The brakes give ${fmt(p.a, 2)} m/s². How long, and how far, does it take to stop?`, ...c, explain: `t = u/|a| = ${fmt(ts, 2)} s; from v² = u² + 2as with v = 0, s = u²/(2|a|) = ${m(d)}. Double the speed and the stopping distance is four times as long.` };
    },
  },
];

export const motion: LabEngine<MotionParams> = {
  id: 'motion',
  title: 'Motion and graphs',
  blurb: 'A car speeds up or brakes: watch the distance–time and velocity–time graphs draw as it moves.',
  subject: 'Science',
  classes: [9],
  chapters: ['Motion'],
  params: [
    { kind: 'number', key: 'u', label: 'Starting speed', unit: 'm/s', min: 0, max: 30, step: 0.5, default: 5 },
    { kind: 'number', key: 'a', label: 'Acceleration', unit: 'm/s²', min: -6, max: 6, step: 0.5, default: 1 },
    { kind: 'number', key: 't', label: 'Time', unit: 's', min: 1, max: 20, step: 1, default: 5 },
  ],
  readouts: p => {
    const end = stateAt(p, p.t), ts = stopTime(p);
    return [
      { label: 'Final speed', value: ms(end.v) },
      { label: 'Distance', value: m(end.s) },
      { label: 'Average speed', value: ms(end.s / p.t) },
      ...(ts !== null && p.a < 0 && ts <= p.t ? [{ label: 'Stops after', value: `${fmt(ts, 2)} s` }] : []),
    ];
  },
  predictions,
};
