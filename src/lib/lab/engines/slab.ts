import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Refraction through a rectangular glass slab (CBSE Class 10 practical:
 * tracing the path of a ray through a glass slab for different angles of
 * incidence). Snell's law at each face, sin i = n sin r; the faces are
 * parallel, so the emergent ray is parallel to the incident one (e = i),
 * shifted sideways by d = t sin(i − r) / cos r.
 */

export type SlabParams = { i: number; n: number; t: number };

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

export function solveSlab(p: SlabParams) {
  const r = deg(Math.asin(Math.sin(rad(p.i)) / p.n));
  const shift = p.i === 0 ? 0 : (p.t * Math.sin(rad(p.i - r))) / Math.cos(rad(r));
  return { r, e: p.i, shift };
}

const d1 = (x: number) => `${fmt(x, 1)}°`;

const predictions: PredictionTemplate<SlabParams>[] = [
  {
    id: 'refraction-angle', label: 'Angle of refraction in the glass', topic: 'Refraction; laws of refraction; refractive index',
    applies: p => p.i > 0,
    build: p => {
      const s = solveSlab(p);
      const c = choices(d1(s.r), [d1(p.i), d1(p.i / p.n), d1(Math.min(89, deg(Math.asin(Math.min(1, Math.sin(rad(p.i)) * p.n * 0.9))))), d1(90 - p.i)], 251);
      return { prompt: `Light enters glass (n = ${fmt(p.n, 2)}) at ${d1(p.i)}. What is the angle of refraction?`, ...c, explain: `sin r = sin i / n = sin ${fmt(p.i, 0)}° / ${fmt(p.n, 2)} = ${fmt(Math.sin(rad(p.i)) / p.n, 3)}, so r = ${d1(s.r)}: smaller than i, the ray bends towards the normal.` };
    },
  },
  {
    id: 'emergent', label: 'Angle of emergence', topic: 'Refraction; laws of refraction; refractive index',
    applies: p => p.i > 0,
    build: p => {
      const s = solveSlab(p);
      const c = choices(`${d1(p.i)}, equal to the angle of incidence`, [`${d1(s.r)}, equal to the angle of refraction`, `${d1(90 - p.i)}`, `${d1(p.i * p.n > 89 ? 89 : p.i * p.n)}`], 252);
      return { prompt: 'At what angle does the ray come out of the far face?', ...c, explain: `The two faces are parallel, so the ray meets the far face at r = ${d1(s.r)} and leaves at e = i = ${d1(p.i)}: the emergent ray is parallel to the incident ray.` };
    },
  },
  {
    id: 'shift', label: 'Lateral displacement', topic: 'Refraction; laws of refraction; refractive index',
    applies: p => p.i > 0,
    build: p => {
      const s = solveSlab(p), mm = (x: number) => `${fmt(x * 10, 1)} mm`;
      const c = choices(mm(s.shift), [mm(0), mm(p.t), mm(s.shift * 2), mm(p.t * Math.sin(rad(p.i)))], 253);
      return { prompt: `By how much is the emergent ray shifted sideways from the incident ray's line (slab ${fmt(p.t, 1)} cm thick)?`, ...c, explain: `d = t sin(i − r) / cos r = ${fmt(p.t, 1)} × sin ${fmt(p.i - s.r, 1)}° / cos ${fmt(s.r, 1)}° = ${mm(s.shift)}. A thicker slab or a bigger angle gives a bigger shift.` };
    },
  },
  {
    id: 'normal-incidence', label: 'Light along the normal', topic: 'Refraction; laws of refraction; refractive index',
    applies: p => p.i === 0,
    build: () => {
      const c = choices('It goes straight through without bending', ['It bends towards the normal', 'It bends away from the normal', 'It is totally reflected'], 254);
      return { prompt: 'A ray hits the slab along the normal (i = 0°). What happens?', ...c, explain: 'sin r = sin 0 / n = 0, so r = 0: a ray along the normal passes straight through. It slows down in the glass but does not change direction.' };
    },
  },
];

export const slab: LabEngine<SlabParams> = {
  id: 'slab',
  title: 'Glass slab',
  blurb: 'Trace a ray through a rectangular glass slab: measure i, r and e, and see the emergent ray come out parallel but shifted.',
  subject: 'Science',
  classes: [10],
  chapters: ['Light - Reflection and Refraction'],
  params: [
    { kind: 'number', key: 'i', label: 'Angle of incidence', unit: '°', min: 0, max: 75, step: 1, default: 40 },
    { kind: 'number', key: 'n', label: 'Refractive index', unit: '', min: 1.3, max: 1.9, step: 0.01, default: 1.5 },
    { kind: 'number', key: 't', label: 'Slab thickness', unit: 'cm', min: 2, max: 8, step: 0.5, default: 5 },
  ],
  readouts: p => {
    const s = solveSlab(p);
    return [
      { label: 'Angle of incidence i', value: d1(p.i) },
      { label: 'Angle of refraction r', value: d1(s.r) },
      { label: 'Angle of emergence e', value: d1(s.e) },
      { label: 'Lateral shift', value: `${fmt(s.shift * 10, 1)} mm` },
    ];
  },
  predictions,
};
