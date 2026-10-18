import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Trolley released from rest down an inclined plane (CBSE Class 9 practical:
 * distance-time and velocity-time graphs using an inclined plane). With
 * free-running wheels, friction is neglected and the acceleration along the
 * plane is a = g sin θ, constant: s = ½at² (a parabola on the s-t graph),
 * v = at (a straight line through the origin on the v-t graph).
 */

export type InclineParams = { angle: number; len: number };

export const G = 9.8;
export const accel = (p: InclineParams) => G * Math.sin((p.angle * Math.PI) / 180);
export const timeToBottom = (p: InclineParams) => Math.sqrt((2 * p.len) / accel(p));
export const stateAt = (p: InclineParams, t: number) => {
  const a = accel(p), tt = Math.min(t, timeToBottom(p));
  return { s: 0.5 * a * tt * tt, v: a * tt };
};

const m = (n: number) => `${fmt(n, 2)} m`, mps = (n: number) => `${fmt(n, 2)} m/s`;

const predictions: PredictionTemplate<InclineParams>[] = [
  {
    id: 'double-time', label: 'Distance after twice the time', topic: 'Kinematic equations for constant acceleration by graphical method',
    applies: p => timeToBottom(p) >= 1,
    build: p => {
      const s1 = stateAt(p, 0.5).s, s2 = stateAt(p, 1).s;
      const c = choices(`${m(s2)}: four times as far`, [`${m(s1 * 2)}: twice as far`, `${m(s1 * 3)}: three times as far`, `${m(s1)}: the same`], 241);
      return { prompt: `In the first 0.5 s the trolley rolls ${m(s1)}. How far has it gone after 1 s?`, ...c, explain: `From rest with constant acceleration, s = ½at²: doubling t multiplies s by 4. s(1 s) = ½ × ${fmt(accel(p), 2)} × 1² = ${m(s2)}.` };
    },
  },
  {
    id: 'st-shape', label: 'Shape of the distance-time graph', topic: 'Graphical representation of straight-line motion (constant velocity and constant acceleration)',
    build: () => {
      const c = choices('A curve getting steeper (a parabola)', ['A straight line through the origin', 'A horizontal line', 'A curve getting flatter'], 242);
      return { prompt: 'What shape is the distance-time graph for the trolley rolling down?', ...c, explain: 's = ½at² grows faster and faster: the slope of an s-t graph is the speed, and the speed keeps increasing, so the curve gets steeper.' };
    },
  },
  {
    id: 'vt-shape', label: 'Shape of the velocity-time graph', topic: 'Graphical representation of straight-line motion (constant velocity and constant acceleration)',
    build: p => {
      const c = choices(`A straight line through the origin, slope ${fmt(accel(p), 2)} m/s²`, ['A curve getting steeper', 'A horizontal line', 'A straight line that cuts the v axis above zero'], 243);
      return { prompt: 'What shape is the velocity-time graph?', ...c, explain: `v = at with a constant: a straight line from the origin (it starts from rest) whose slope is the acceleration, g sin θ = ${fmt(accel(p), 2)} m/s².` };
    },
  },
  {
    id: 'speed-bottom', label: 'Speed at the bottom', topic: 'Kinematic equations for constant acceleration by graphical method',
    build: p => {
      const a = accel(p), v = Math.sqrt(2 * a * p.len);
      const c = choices(mps(v), [mps(a * p.len), mps(Math.sqrt(a * p.len)), mps(G * p.len / 10), mps(v * 2)], 244);
      return { prompt: `What is the trolley's speed at the bottom of the ${m(p.len)} plane?`, ...c, explain: `v² = u² + 2as = 0 + 2 × ${fmt(a, 2)} × ${fmt(p.len, 2)}, so v = ${mps(v)}. On the v-t graph that is the last point; the area under the line is the ${m(p.len)} travelled.` };
    },
  },
];

export const incline: LabEngine<InclineParams> = {
  id: 'incline',
  title: 'Inclined plane',
  blurb: 'A trolley rolls down a slope from rest: mark where it is every 0.2 s and plot distance-time and velocity-time graphs.',
  subject: 'Science',
  classes: [9],
  chapters: ['Motion'],
  params: [
    { kind: 'number', key: 'angle', label: 'Slope', unit: '°', min: 1, max: 15, step: 0.5, default: 3 },
    { kind: 'number', key: 'len', label: 'Length of the plane', unit: 'm', min: 0.5, max: 2.5, step: 0.1, default: 1.5 },
  ],
  readouts: p => {
    const T = timeToBottom(p);
    return [
      { label: 'Acceleration (g sin θ)', value: `${fmt(accel(p), 2)} m/s²` },
      { label: 'Time to the bottom', value: `${fmt(T, 2)} s` },
      { label: 'Speed at the bottom', value: mps(accel(p) * T) },
    ];
  },
  predictions,
};
