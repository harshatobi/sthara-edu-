import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Photosynthesis (NCERT Class 10 "Life Processes": Activities 5.1 and 5.2 and
 * the oxygen-bubble demonstration with Hydrilla).
 * bubbles: a Hydrilla sprig in water gives off oxygen bubbles. The rate is
 *   set by whichever factor is in shortest supply (limiting factors): light
 *   (intensity falls as 1/d² from the lamp), carbon dioxide (sodium hydrogen
 *   carbonate added to the water) and temperature (enzymes work best near
 *   30 °C and stop above about 45 °C).
 * starch: the iodine test on a leaf. Only green (chlorophyll) parts that got
 *   light make starch, and the plant must be destarched (kept in the dark)
 *   first so any starch found is new.
 */

export type PhotoParams = { scenario: 'bubbles' | 'starch'; dist: number; co2: number; temp: number; leaf: 'variegated' | 'covered' | 'dark' };

const MAX_RATE = 60; // bubbles per minute when nothing limits

export function lightFactor(dist: number) { return Math.min(1, (15 / dist) ** 2); }
export function co2Factor(co2: number) { return Math.min(1, 0.15 + co2 / 0.4); }
export function tempFactor(t: number) {
  if (t >= 45 || t <= 5) return 0;
  return t <= 30 ? (t - 5) / 25 : (45 - t) / 15;
}

export function solvePhoto(p: PhotoParams) {
  const f = { light: lightFactor(p.dist), co2: co2Factor(p.co2), temp: tempFactor(p.temp) };
  const limit = (Object.keys(f) as (keyof typeof f)[]).reduce((a, b) => (f[b] < f[a] ? b : a));
  return { rate: MAX_RATE * Math.min(f.light, f.co2, f.temp), factors: f, limit };
}

export const LIMIT_LABEL = { light: 'Light', co2: 'Carbon dioxide', temp: 'Temperature' };

/** Iodine on the leaf, per region: blue-black where starch formed, brown where not. */
export function starchResult(p: PhotoParams): { region: string; starch: boolean }[] {
  if (p.leaf === 'dark') return [{ region: 'Whole leaf (plant kept in the dark)', starch: false }];
  if (p.leaf === 'covered') return [{ region: 'Uncovered part', starch: true }, { region: 'Part covered with black paper', starch: false }];
  return [{ region: 'Green part', starch: true }, { region: 'White (yellow) part', starch: false }];
}

const bpm = (n: number) => `${fmt(n, 0)} bubbles a minute`;

const predictions: PredictionTemplate<PhotoParams>[] = [
  {
    id: 'rate', label: 'Bubbles a minute', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    applies: p => p.scenario === 'bubbles',
    build: p => {
      const s = solvePhoto(p);
      const c = choices(bpm(s.rate), [bpm(MAX_RATE), bpm(s.rate * 2), bpm(s.rate / 2), bpm(MAX_RATE * s.factors.light * s.factors.co2 * Math.max(s.factors.temp, 0.1) * 0.5)], 311);
      return { prompt: `Lamp ${fmt(p.dist, 0)} cm away, ${fmt(p.co2, 2)} g of NaHCO₃ added, water at ${fmt(p.temp, 0)} °C. How fast does the Hydrilla give off bubbles?`, ...c, explain: `The slowest factor sets the rate: light ${fmt(s.factors.light * 100, 0)}%, CO₂ ${fmt(s.factors.co2 * 100, 0)}%, temperature ${fmt(s.factors.temp * 100, 0)}%. ${LIMIT_LABEL[s.limit]} is limiting, so about ${bpm(s.rate)} (of ${MAX_RATE} at best).` };
    },
  },
  {
    id: 'limiting', label: 'What is holding it back', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    applies: p => p.scenario === 'bubbles' && solvePhoto(p).rate < MAX_RATE - 0.5,
    build: p => {
      const s = solvePhoto(p);
      const c = choices(LIMIT_LABEL[s.limit], Object.values(LIMIT_LABEL), 312);
      return { prompt: 'Which factor is limiting the rate of photosynthesis here?', ...c, explain: `${LIMIT_LABEL[s.limit]} is in shortest supply (${fmt(s.factors[s.limit] * 100, 0)}% of what the plant could use). Improving the other two would not help until it is raised.` };
    },
  },
  {
    id: 'closer-lamp', label: 'Moving the lamp closer', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    applies: p => p.scenario === 'bubbles' && p.dist >= 20,
    build: p => {
      const a = solvePhoto(p).rate, b = solvePhoto({ ...p, dist: p.dist / 2 }).rate;
      const right = b > a + 0.5 ? `It rises to about ${bpm(b)}` : 'It hardly changes: light is not what is limiting';
      const c = choices(right, [`It rises to about ${bpm(b)}`, 'It hardly changes: light is not what is limiting', `It falls to about ${bpm(a / 2)}`].filter((x, i, arr) => arr.indexOf(x) === i), 313);
      return { prompt: `The lamp is moved from ${fmt(p.dist, 0)} cm to ${fmt(p.dist / 2, 0)} cm. What happens to the bubbling (now ${bpm(a)})?`, ...c, explain: `Half the distance gives four times the light. ${b > a + 0.5 ? `Light was limiting, so the rate goes up, until another factor takes over: ${bpm(b)}.` : `${LIMIT_LABEL[solvePhoto(p).limit]} is limiting, so more light changes little.`}` };
    },
  },
  {
    id: 'gas', label: 'Which gas is in the bubbles', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    applies: p => p.scenario === 'bubbles',
    build: () => {
      const c = choices('Oxygen: it relights a glowing splint', ['Carbon dioxide: it turns lime water milky', 'Hydrogen: it burns with a pop', 'Water vapour'], 314);
      return { prompt: 'The bubbles are collected in an inverted test tube. What gas is it?', ...c, explain: '6CO₂ + 12H₂O → C₆H₁₂O₆ + 6O₂ + 6H₂O (in sunlight, with chlorophyll). The oxygen relights a glowing splint.' };
    },
  },
  {
    id: 'starch', label: 'Iodine test on the leaf', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    applies: p => p.scenario === 'starch',
    build: p => {
      const r = starchResult(p), right = r.map(x => `${x.region}: ${x.starch ? 'blue-black' : 'brown'}`).join('; ');
      const flip = r.map(x => `${x.region}: ${x.starch ? 'brown' : 'blue-black'}`).join('; ');
      const all = r.map(x => `${x.region}: blue-black`).join('; ');
      const c = choices(right, [flip, all, r.map(x => `${x.region}: brown`).join('; ')].filter(x => x !== right), 315);
      return { prompt: p.leaf === 'dark' ? 'A plant is kept in the dark for 3 days, then a leaf is boiled in alcohol and tested with iodine. What colour does it turn?' : p.leaf === 'covered' ? 'A destarched plant has part of a leaf covered with black paper, then stands in sunlight. After boiling in alcohol, the leaf is tested with iodine. What do you see?' : 'A variegated leaf (green and white) from a plant in sunlight is boiled in alcohol and tested with iodine. What do you see?', ...c, explain: `Iodine turns starch blue-black. ${p.leaf === 'dark' ? 'In the dark the plant used up its stored starch and could make no more: no starch.' : p.leaf === 'covered' ? 'The covered part got no light, so it made no starch: light is needed.' : 'The white part has no chlorophyll, so it made no starch: chlorophyll is needed.'}` };
    },
  },
];

const bubbles = (p: PhotoParams) => p.scenario === 'bubbles';

export const photosynthesis: LabEngine<PhotoParams> = {
  id: 'photosynthesis',
  title: 'Photosynthesis',
  blurb: 'Count oxygen bubbles from a water plant as you change light, carbon dioxide and temperature, and test leaves for starch.',
  subject: 'Science',
  classes: [10],
  chapters: ['Life Processes'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'bubbles', options: [{ value: 'bubbles', label: 'Oxygen bubbles from Hydrilla' }, { value: 'starch', label: 'Starch test on a leaf' }] },
    { kind: 'number', key: 'dist', label: 'Lamp distance', unit: 'cm', min: 10, max: 80, step: 5, default: 30, show: bubbles },
    { kind: 'number', key: 'co2', label: 'NaHCO₃ added', unit: 'g', min: 0, max: 0.6, step: 0.05, default: 0.2, show: bubbles },
    { kind: 'number', key: 'temp', label: 'Water temperature', unit: '°C', min: 5, max: 50, step: 1, default: 25, show: bubbles },
    { kind: 'choice', key: 'leaf', label: 'Leaf', default: 'variegated', options: [{ value: 'variegated', label: 'Variegated leaf (green and white)' }, { value: 'covered', label: 'Leaf partly covered with black paper' }, { value: 'dark', label: 'Plant kept in the dark' }], show: p => !bubbles(p) },
  ],
  readouts: p => {
    if (p.scenario === 'starch') return starchResult(p).map(x => ({ label: x.region, value: x.starch ? 'Blue-black: starch' : 'Brown: no starch' }));
    const s = solvePhoto(p);
    return [
      { label: 'Rate', value: bpm(s.rate) },
      { label: 'Limiting factor', value: LIMIT_LABEL[s.limit] },
      { label: 'Light / CO₂ / temperature', value: `${fmt(s.factors.light * 100, 0)}% / ${fmt(s.factors.co2 * 100, 0)}% / ${fmt(s.factors.temp * 100, 0)}%` },
    ];
  },
  predictions,
};
