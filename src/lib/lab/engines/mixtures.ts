import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Mixtures bench (CBSE Class 9 practicals 1 and 2; NCERT "Is Matter Around Us
 * Pure", now "Exploring Mixtures and their Separation").
 * classify: true solutions, suspensions and colloids told apart by
 *   transparency, filtration, stability on standing and the Tyndall effect.
 * separate: oil and water (separating funnel), the colours in black ink
 *   (paper chromatography), ammonium chloride from common salt (sublimation)
 *   and muddy water with alum (coagulation).
 * The observations are the textbook ones, held as data.
 */

export type Substance = 'salt' | 'sugar' | 'alum' | 'soil' | 'chalk' | 'sand' | 'starch' | 'albumin' | 'milk';
export type Property = 'transparency' | 'filtration' | 'stability' | 'tyndall';
export type Technique = 'funnel' | 'chromatography' | 'sublimation' | 'coagulation';
export type MixturesParams = { scenario: 'classify' | 'separate'; substance: Substance; property: Property; technique: Technique };

export type Kind = 'True solution' | 'Suspension' | 'Colloid';

export const SUBSTANCES: Record<Substance, { label: string; kind: Kind }> = {
  salt: { label: 'Common salt in water', kind: 'True solution' },
  sugar: { label: 'Sugar in water', kind: 'True solution' },
  alum: { label: 'Alum in water', kind: 'True solution' },
  soil: { label: 'Soil in water', kind: 'Suspension' },
  chalk: { label: 'Chalk powder in water', kind: 'Suspension' },
  sand: { label: 'Fine sand in water', kind: 'Suspension' },
  starch: { label: 'Starch in water', kind: 'Colloid' },
  albumin: { label: 'Egg albumin in water', kind: 'Colloid' },
  milk: { label: 'Milk in water', kind: 'Colloid' },
};

export const PROPERTIES: Record<Property, string> = {
  transparency: 'Transparency',
  filtration: 'Filtration',
  stability: 'Stability (left to stand)',
  tyndall: 'Tyndall effect (a beam of light)',
};

/** What each kind of mixture shows in each test. */
export const BEHAVIOUR: Record<Kind, Record<Property, string>> = {
  'True solution': {
    transparency: 'Transparent: you can see clearly through it',
    filtration: 'Passes through the filter paper completely; no residue',
    stability: 'Stable: nothing settles however long it stands',
    tyndall: 'No Tyndall effect: the beam is not visible inside',
  },
  Suspension: {
    transparency: 'Opaque or cloudy: you cannot see through it',
    filtration: 'The solid stays behind on the filter paper as a residue',
    stability: 'Unstable: the particles settle at the bottom on standing',
    tyndall: 'Scatters light: the beam is seen, but the mixture is too murky to see through',
  },
  Colloid: {
    transparency: 'Translucent: cloudy, but light passes through',
    filtration: 'Passes through filter paper; no residue (the particles are too small to be stopped)',
    stability: 'Stable: the particles do not settle',
    tyndall: 'Tyndall effect: the path of the beam is clearly visible',
  },
};

export const TECHNIQUES: Record<Technique, { label: string; mixture: string; apparatus: string; principle: string; result: string }> = {
  funnel: {
    label: 'Separating funnel', mixture: 'Oil and water', apparatus: 'a separating funnel',
    principle: 'The two liquids do not mix and have different densities, so they form two layers.',
    result: 'Water, the denser liquid, forms the lower layer and is run off first through the stopcock; the oil stays above.',
  },
  chromatography: {
    label: 'Paper chromatography', mixture: 'The colours in black ink', apparatus: 'a strip of filter paper standing in water',
    principle: 'The dyes in the ink dissolve in water to different extents and stick to the paper differently, so they climb at different speeds.',
    result: 'The black spot separates into bands of different colours; the most soluble dye rises highest.',
  },
  sublimation: {
    label: 'Sublimation', mixture: 'Ammonium chloride and common salt', apparatus: 'a china dish under an inverted funnel with a cotton plug, heated',
    principle: 'Ammonium chloride sublimes (turns straight from solid to vapour) on heating; common salt does not.',
    result: 'Ammonium chloride vapour cools and deposits as a white solid on the inside of the funnel; common salt stays in the dish.',
  },
  coagulation: {
    label: 'Coagulation', mixture: 'Muddy water, with alum added', apparatus: 'a beaker of muddy water stirred with alum (fitkari)',
    principle: 'Alum neutralises the charge on the tiny clay particles so they clump together into heavier flakes.',
    result: 'The clumps settle at the bottom and the water above becomes clear; it can then be decanted.',
  },
};

/** Ink dyes for the chromatogram: colour and how far each climbs relative to the solvent front (Rf). */
export const INK_DYES = [
  { colour: 'Yellow', hex: '#EAB308', rf: 0.82 },
  { colour: 'Red', hex: '#DC2626', rf: 0.58 },
  { colour: 'Blue', hex: '#2563EB', rf: 0.35 },
];

const predictions: PredictionTemplate<MixturesParams>[] = [
  {
    id: 'kind', label: 'Solution, suspension or colloid?', topic: 'Solutions, suspensions, colloids and their properties',
    applies: p => p.scenario === 'classify',
    build: p => {
      const s = SUBSTANCES[p.substance];
      const c = choices(s.kind, ['True solution', 'Suspension', 'Colloid'], 291);
      return { prompt: `${s.label}: what kind of mixture is it?`, ...c, explain: `${s.kind}. ${BEHAVIOUR[s.kind].transparency}; ${BEHAVIOUR[s.kind].filtration.toLowerCase()}; ${BEHAVIOUR[s.kind].tyndall.toLowerCase()}.` };
    },
  },
  {
    id: 'property', label: 'What the test shows', topic: 'Solutions, suspensions, colloids and their properties',
    applies: p => p.scenario === 'classify',
    build: p => {
      const s = SUBSTANCES[p.substance], right = BEHAVIOUR[s.kind][p.property];
      const others = (['True solution', 'Suspension', 'Colloid'] as Kind[]).map(k => BEHAVIOUR[k][p.property]);
      const c = choices(right, others, 292);
      return { prompt: `${s.label}: ${PROPERTIES[p.property].toLowerCase()}. What do you observe?`, ...c, explain: `It is a ${s.kind.toLowerCase()}: ${right.charAt(0).toLowerCase()}${right.slice(1)}.` };
    },
  },
  {
    id: 'technique', label: 'Which method separates it', topic: 'Separation techniques: crystallisation, distillation, paper chromatography, sublimation, centrifugation, coagulation',
    applies: p => p.scenario === 'separate',
    build: p => {
      const t = TECHNIQUES[p.technique];
      const c = choices(t.label, Object.values(TECHNIQUES).map(x => x.label), 293);
      return { prompt: `How would you separate: ${t.mixture.toLowerCase()}?`, ...c, explain: `${t.label}. ${t.principle}` };
    },
  },
  {
    id: 'outcome', label: 'What you see at the end', topic: 'Separation techniques: crystallisation, distillation, paper chromatography, sublimation, centrifugation, coagulation',
    applies: p => p.scenario === 'separate',
    build: p => {
      const t = TECHNIQUES[p.technique];
      const c = choices(t.result, Object.values(TECHNIQUES).map(x => x.result), 294);
      return { prompt: `${t.label} of ${t.mixture.toLowerCase()}: what do you see at the end?`, ...c, explain: `${t.result} ${t.principle}` };
    },
  },
  {
    id: 'top-dye', label: 'Which dye rises highest', topic: 'Separation techniques: crystallisation, distillation, paper chromatography, sublimation, centrifugation, coagulation',
    applies: p => p.scenario === 'separate' && p.technique === 'chromatography',
    build: () => {
      const top = INK_DYES.reduce((a, b) => (b.rf > a.rf ? b : a));
      const c = choices(top.colour, INK_DYES.map(d => d.colour), 295);
      return { prompt: 'In this ink, which colour band ends up highest on the paper?', ...c, explain: `${top.colour} (Rf ${top.rf}): it is the most soluble in water and least held by the paper, so it travels furthest with the solvent.` };
    },
  },
];

const classify = (p: MixturesParams) => p.scenario === 'classify';

export const mixtures: LabEngine<MixturesParams> = {
  id: 'mixtures',
  title: 'Mixtures bench',
  blurb: 'Tell true solutions, suspensions and colloids apart, and separate mixtures with a funnel, paper chromatography, sublimation and alum.',
  subject: 'Science',
  classes: [9],
  chapters: ['Exploring Mixtures and their Separation'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'classify', options: [{ value: 'classify', label: 'Solution, suspension or colloid' }, { value: 'separate', label: 'Separating mixtures' }] },
    { kind: 'choice', key: 'substance', label: 'Mixture', default: 'starch', options: (Object.keys(SUBSTANCES) as Substance[]).map(value => ({ value, label: SUBSTANCES[value].label })), show: classify },
    { kind: 'choice', key: 'property', label: 'Test', default: 'tyndall', options: (Object.keys(PROPERTIES) as Property[]).map(value => ({ value, label: PROPERTIES[value] })), show: classify },
    { kind: 'choice', key: 'technique', label: 'Method', default: 'chromatography', options: (Object.keys(TECHNIQUES) as Technique[]).map(value => ({ value, label: TECHNIQUES[value].label })), show: p => !classify(p) },
  ],
  readouts: p => {
    if (p.scenario === 'classify') {
      const s = SUBSTANCES[p.substance];
      return [{ label: 'Kind', value: s.kind }, { label: PROPERTIES[p.property], value: BEHAVIOUR[s.kind][p.property] }];
    }
    const t = TECHNIQUES[p.technique];
    return [{ label: 'Mixture', value: t.mixture }, { label: 'Why it works', value: t.principle }, { label: 'Result', value: t.result }];
  },
  predictions,
};
