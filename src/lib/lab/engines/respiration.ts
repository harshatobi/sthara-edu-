import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Carbon dioxide given out in respiration (CBSE Class 10 practical; NCERT Lab
 * Manual). Germinating seeds in a stoppered flask with a small tube of KOH
 * solution; a bent delivery tube dips into a beaker of water. The seeds take
 * in O₂ and give out an equal volume of CO₂; the KOH absorbs the CO₂, so the
 * gas in the flask shrinks and water rises in the delivery tube.
 * Without KOH, the CO₂ replaces the O₂ and nothing rises; boiled (dead) seeds
 * don't respire at all.
 *
 * Model: 40 g of germinating seeds raise the water about 0.25 cm a minute in
 * a narrow tube at room temperature, up to the 15 cm available.
 */

export type RespirationParams = { seeds: 'germinating' | 'boiled'; koh: 'yes' | 'no'; minutes: number };

const RATE = 0.25, MAX_RISE = 15;

export function solveResp(p: RespirationParams) {
  const respiring = p.seeds === 'germinating';
  const rise = respiring && p.koh === 'yes' ? Math.min(MAX_RISE, RATE * p.minutes) : 0;
  return { respiring, rise };
}

const cm = (n: number) => `${fmt(n, 1)} cm`;

const predictions: PredictionTemplate<RespirationParams>[] = [
  {
    id: 'water-rises', label: 'Does the water rise?', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    build: p => {
      const s = solveResp(p);
      const right = s.rise > 0 ? `Yes, about ${cm(s.rise)} up the tube` : 'No: the level stays where it was';
      const c = choices(right, [`Yes, about ${cm(Math.min(MAX_RISE, RATE * p.minutes) || 3)} up the tube`, 'No: the level stays where it was', 'It is pushed down below the water surface'].filter((x, i, a) => a.indexOf(x) === i), 321);
      return { prompt: `${p.seeds === 'germinating' ? 'Germinating' : 'Boiled'} seeds, ${p.koh === 'yes' ? 'with' : 'without'} the KOH tube, left ${fmt(p.minutes, 0)} minutes. Does water rise in the delivery tube?`, ...c, explain: !s.respiring ? 'Boiled seeds are dead: no respiration, so no gas is used or made.' : p.koh === 'no' ? 'The seeds use oxygen but give out about the same volume of carbon dioxide, so the volume of gas hardly changes.' : `The seeds give out CO₂, which the KOH absorbs; the oxygen they use is not replaced, so the gas shrinks and water is pushed up the tube: ${cm(s.rise)}.` };
    },
  },
  {
    id: 'koh-role', label: 'Why the KOH is there', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    build: () => {
      const c = choices('To absorb the carbon dioxide the seeds give out', ['To give the seeds oxygen', 'To keep the seeds moist', 'To kill bacteria in the flask'], 322);
      return { prompt: 'What does the potassium hydroxide (KOH) do in this set-up?', ...c, explain: 'KOH absorbs carbon dioxide (2KOH + CO₂ → K₂CO₃ + H₂O). Taking the CO₂ away is what makes the gas volume fall, which shows CO₂ was being given out.' };
    },
  },
  {
    id: 'control', label: 'Why boiled seeds', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    build: () => {
      const c = choices('As a control: dead seeds do not respire, so any rise must come from respiration', ['Boiled seeds respire faster', 'To add water vapour to the flask', 'To absorb the oxygen'], 323);
      return { prompt: 'Why is a second flask set up with boiled seeds?', ...c, explain: 'Everything else is the same, so if the water rises only with live seeds, the change must be due to their respiration, not temperature or a leak.' };
    },
  },
];

export const respiration: LabEngine<RespirationParams> = {
  id: 'respiration',
  title: 'Respiration in seeds',
  blurb: 'Germinating seeds in a flask with KOH: watch the water rise in the delivery tube as carbon dioxide is absorbed.',
  subject: 'Science',
  classes: [10],
  chapters: ['Life Processes'],
  params: [
    { kind: 'choice', key: 'seeds', label: 'Seeds', default: 'germinating', options: [{ value: 'germinating', label: 'Germinating (alive)' }, { value: 'boiled', label: 'Boiled (dead)' }] },
    { kind: 'choice', key: 'koh', label: 'KOH tube', default: 'yes', options: [{ value: 'yes', label: 'With KOH' }, { value: 'no', label: 'Without KOH' }] },
    { kind: 'number', key: 'minutes', label: 'Time', unit: 'min', min: 0, max: 60, step: 5, default: 30 },
  ],
  readouts: p => {
    const s = solveResp(p);
    return [
      { label: 'Seeds respiring', value: s.respiring ? 'Yes' : 'No' },
      { label: 'Water rise in the tube', value: cm(s.rise) },
    ];
  },
  predictions,
};
