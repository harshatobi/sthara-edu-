import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * The human eye and the colourful world (NCERT Class 10).
 * myopia: far point F metres. A concave lens of f = −F puts a distant object's
 *   image at the far point, so P = −1/F dioptres.
 * hypermetropia: near point N metres. The lens must put an object at 25 cm
 *   (the normal near point) at N: 1/f = 1/v − 1/u with u = −0.25, v = −N, so
 *   P = 4 − 1/N dioptres (convex).
 * prism: a 60° crown-glass prism; each colour is traced exactly with Snell's
 *   law at both faces, so violet (largest n) bends most and red least.
 */

export type EyeParams = { scenario: 'myopia' | 'hypermetropia' | 'prism'; far: number; near: number; corrected: 'no' | 'yes'; i: number };

export const NORMAL_NEAR = 0.25;
export const PRISM_A = 60;

/** Refractive index of crown glass for each colour of the spectrum (approximate standard values). */
export const SPECTRUM: { name: string; hex: string; n: number }[] = [
  { name: 'Red', hex: '#DC2626', n: 1.513 },
  { name: 'Orange', hex: '#F97316', n: 1.514 },
  { name: 'Yellow', hex: '#EAB308', n: 1.517 },
  { name: 'Green', hex: '#16A34A', n: 1.519 },
  { name: 'Blue', hex: '#2563EB', n: 1.524 },
  { name: 'Indigo', hex: '#4F46E5', n: 1.528 },
  { name: 'Violet', hex: '#7C3AED', n: 1.532 },
];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Angles in degrees through the prism for one refractive index; null if it is totally reflected inside. */
export function traceColour(n: number, i: number) {
  const r1 = deg(Math.asin(Math.sin(rad(i)) / n));
  const r2 = PRISM_A - r1;
  const s = n * Math.sin(rad(r2));
  if (s > 1) return null;
  const e = deg(Math.asin(s));
  return { r1, r2, e, deviation: i + e - PRISM_A };
}

/** Lens power in dioptres that corrects the eye; positive = convex. */
export function correctingPower(p: EyeParams): number {
  return p.scenario === 'myopia' ? -1 / p.far : 1 / NORMAL_NEAR - 1 / p.near;
}

const D = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), 2)} D`;

const predictions: PredictionTemplate<EyeParams>[] = [
  {
    id: 'lens-type', label: 'Which lens corrects it', topic: 'Defects of vision and their corrections',
    applies: p => p.scenario !== 'prism',
    build: p => {
      const right = p.scenario === 'myopia' ? 'A concave (diverging) lens' : 'A convex (converging) lens';
      const c = choices(right, ['A concave (diverging) lens', 'A convex (converging) lens', 'A plane glass sheet'], 71);
      return {
        prompt: p.scenario === 'myopia' ? `This eye can't see clearly beyond ${fmt(p.far, 2)} m. Which lens corrects it?` : `This eye can't see clearly nearer than ${fmt(p.near * 100, 0)} cm. Which lens corrects it?`, ...c,
        explain: p.scenario === 'myopia'
          ? 'Short sight: the eye focuses distant light in front of the retina, so a diverging lens spreads the rays a little first.'
          : 'Long sight: the eye focuses near light behind the retina, so a converging lens bends the rays a little first.',
      };
    },
  },
  {
    id: 'lens-power', label: 'Power of the lens', topic: 'Defects of vision and their corrections',
    applies: p => p.scenario !== 'prism',
    build: p => {
      const P = correctingPower(p);
      const wrong = p.scenario === 'myopia' ? [D(-P), D(-p.far), D(-1 / (p.far * 100))] : [D(-P), D(1 / p.near), D(1 / p.near - 1 / NORMAL_NEAR - 1)];
      const c = choices(D(P), [...wrong, D(P * 2)], 72);
      return {
        prompt: 'What power of lens does this person need?', ...c,
        explain: p.scenario === 'myopia'
          ? `The lens must make a far object appear at the far point: f = −${fmt(p.far, 2)} m, so P = 1/f = ${D(P)}.`
          : `The lens must make an object at 25 cm appear at ${fmt(p.near * 100, 0)} cm: 1/f = 1/v − 1/u = 1/(−${fmt(p.near, 2)}) − 1/(−0.25), so P = ${D(P)}.`,
      };
    },
  },
  {
    id: 'where-focus', label: 'Where the uncorrected eye focuses', topic: 'Defects of vision and their corrections',
    applies: p => p.scenario !== 'prism',
    build: p => {
      const right = p.scenario === 'myopia' ? 'In front of the retina' : 'Behind the retina';
      const c = choices(right, ['In front of the retina', 'Behind the retina', 'On the retina'], 73);
      return { prompt: p.scenario === 'myopia' ? 'Without glasses, where does light from a distant tree focus?' : 'Without glasses, where does light from a book held at 25 cm focus?', ...c, explain: p.scenario === 'myopia' ? 'The eye lens is too strong for distant objects (or the eyeball too long), so the focus falls short of the retina and the tree looks blurred.' : 'The eye lens is too weak for near objects (or the eyeball too short), so the focus falls beyond the retina and the page looks blurred.' };
    },
  },
  {
    id: 'bends-most', label: 'Which colour bends most', topic: 'Dispersion of light',
    applies: p => p.scenario === 'prism',
    build: p => {
      const t = SPECTRUM.map(c => ({ c, t: traceColour(c.n, p.i)! }));
      const most = t.reduce((a, b) => (b.t.deviation > a.t.deviation ? b : a));
      const c = choices(most.c.name, ['Red', 'Green', 'Violet', 'All bend the same'], 74);
      return { prompt: 'White light enters the prism. Which colour is bent the most?', ...c, explain: `Glass slows violet the most (n = ${most.c.n}), so it deviates most: ${fmt(most.t.deviation, 2)}° against ${fmt(t[0].t.deviation, 2)}° for red. That spread is dispersion.` };
    },
  },
  {
    id: 'spread', label: 'Angle between red and violet', topic: 'Dispersion of light',
    applies: p => p.scenario === 'prism',
    build: p => {
      const red = traceColour(SPECTRUM[0].n, p.i)!, violet = traceColour(SPECTRUM[6].n, p.i)!;
      const spread = violet.deviation - red.deviation;
      const a = (n: number) => `About ${fmt(n, 1)}°`;
      const c = choices(a(spread), [a(spread * 10), a(red.deviation), a(0), a(spread / 4)].filter(x => x !== a(spread)), 75);
      return { prompt: `At ${fmt(p.i, 0)}° incidence, how far apart do red and violet come out?`, ...c, explain: `Red deviates ${fmt(red.deviation, 2)}°, violet ${fmt(violet.deviation, 2)}°: about ${fmt(spread, 2)}° apart. Small, which is why the spectrum only shows on a screen some distance away.` };
    },
  },
];

const isPrism = (p: EyeParams) => p.scenario === 'prism';

export const eyePrism: LabEngine<EyeParams> = {
  id: 'eye-prism',
  title: 'The eye and the prism',
  blurb: 'Correct short and long sight with the right lens, or split white light into its colours.',
  subject: 'Science',
  classes: [10],
  chapters: ['The Human Eye and the Colourful World'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'myopia', options: [{ value: 'myopia', label: 'Short sight (myopia)' }, { value: 'hypermetropia', label: 'Long sight (hypermetropia)' }, { value: 'prism', label: 'Prism and the spectrum' }] },
    { kind: 'number', key: 'far', label: 'Far point', unit: 'm', min: 0.5, max: 10, step: 0.1, default: 1.2, show: p => p.scenario === 'myopia' },
    { kind: 'number', key: 'near', label: 'Near point', unit: 'm', min: 0.3, max: 3, step: 0.05, default: 1, show: p => p.scenario === 'hypermetropia' },
    { kind: 'choice', key: 'corrected', label: 'Glasses', default: 'no', options: [{ value: 'no', label: 'Without glasses' }, { value: 'yes', label: 'With the correcting lens' }], show: p => !isPrism(p) },
    { kind: 'number', key: 'i', label: 'Angle of incidence', unit: '°', min: 40, max: 75, step: 1, default: 50, show: isPrism },
  ],
  readouts: p => {
    if (isPrism(p)) {
      return SPECTRUM.filter((_, k) => k === 0 || k === 2 || k === 4 || k === 6).map(c => ({ label: c.name, value: `deviates ${fmt(traceColour(c.n, p.i)!.deviation, 2)}°` }));
    }
    const P = correctingPower(p);
    return [
      { label: p.scenario === 'myopia' ? 'Far point' : 'Near point', value: p.scenario === 'myopia' ? `${fmt(p.far, 2)} m` : `${fmt(p.near * 100, 0)} cm` },
      { label: 'Correcting lens', value: `${P < 0 ? 'Concave' : 'Convex'}, f = ${fmt(100 / P, 1)} cm` },
      { label: 'Power', value: D(P) },
    ];
  },
  predictions,
};
