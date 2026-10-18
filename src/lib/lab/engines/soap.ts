import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Cleaning capacity of soap in soft and hard water (CBSE Class 10 practical;
 * NCERT Ch 4 Activity 4.11). Equal volumes of water, the same amount of soap
 * solution, shaken the same number of times: the calcium and magnesium salts
 * in hard water react with soap first, forming an insoluble scum, and only
 * the soap left over makes lather. Detergents don't form scum, so they lather
 * in hard water too.
 *
 * Model (10 mL of water): each 100 ppm of hardness (as CaCO₃) uses up 1 mL of
 * soap solution; every mL left over gives 0.8 cm of lather, up to 6 cm.
 */

export type SoapParams = { hardness: number; soap: number; cleaner: 'soap' | 'detergent' };

export const LATHER_PER_ML = 0.8;
export const LATHER_MAX = 6;

export function solveSoap(p: SoapParams) {
  const used = p.cleaner === 'soap' ? Math.min(p.soap, p.hardness / 100) : 0;
  const left = p.soap - used;
  return { used, lather: Math.min(LATHER_MAX, LATHER_PER_ML * left), scum: p.cleaner === 'soap' && p.hardness > 0 };
}

export const waterKind = (ppm: number) => (ppm <= 60 ? 'Soft' : ppm <= 180 ? 'Moderately hard' : 'Hard');

const cm = (n: number) => `${fmt(n, 1)} cm`;

const predictions: PredictionTemplate<SoapParams>[] = [
  {
    id: 'lather', label: 'Height of lather', topic: 'Soaps and detergents',
    build: p => {
      const s = solveSoap(p), soft = solveSoap({ ...p, hardness: 0 });
      const c = choices(cm(s.lather), [cm(soft.lather), cm(Math.max(0, s.lather / 2)), cm(Math.min(LATHER_MAX, s.lather + 2)), cm(0)], 281);
      return { prompt: `${p.soap} mL of ${p.cleaner} solution in water with ${fmt(p.hardness, 0)} ppm hardness, shaken 10 times. How much lather?`, ...c, explain: p.cleaner === 'soap' ? `The hardness uses up ${fmt(s.used, 1)} mL of the soap as scum; the ${fmt(p.soap - s.used, 1)} mL left lathers: ${cm(s.lather)}${s.lather >= LATHER_MAX ? ' (the tube is full)' : ''}.` : `Detergent does not react with calcium and magnesium salts, so all ${p.soap} mL lathers: ${cm(s.lather)}.` };
    },
  },
  {
    id: 'scum', label: 'Is there scum?', topic: 'Soaps and detergents',
    build: p => {
      const s = solveSoap(p);
      const right = s.scum ? 'Yes: a white curdy scum floats on the water' : 'No: the water stays clear under the lather';
      const c = choices(right, ['Yes: a white curdy scum floats on the water', 'No: the water stays clear under the lather'], 282);
      return { prompt: `${waterKind(p.hardness)} water (${fmt(p.hardness, 0)} ppm) with ${p.cleaner}: do you see scum?`, ...c, explain: s.scum ? 'Soap reacts with the calcium and magnesium ions of hard water to form insoluble calcium and magnesium salts of fatty acids: the scum.' : p.cleaner === 'detergent' ? 'Detergents are sulphonate or ammonium salts whose calcium and magnesium salts are soluble, so no scum forms.' : 'Soft water has no calcium or magnesium salts to react with the soap.' };
    },
  },
  {
    id: 'better', label: 'Where the soap cleans better', topic: 'Soaps and detergents',
    applies: p => p.cleaner === 'soap',
    build: () => {
      const c = choices('In soft (distilled) water', ['In hard water', 'The same in both', 'Neither: soap needs salt water'], 283);
      return { prompt: 'In which water does the same amount of soap clean better?', ...c, explain: 'In soft water all the soap makes lather and removes grease; in hard water part of it is wasted as scum, so you need more soap for the same cleaning.' };
    },
  },
];

export const soap: LabEngine<SoapParams> = {
  id: 'soap',
  title: 'Soap in hard and soft water',
  blurb: 'Shake the same soap in soft and hard water and compare the lather and the scum; then try a detergent.',
  subject: 'Science',
  classes: [10],
  chapters: ['Carbon and its Compounds'],
  params: [
    { kind: 'number', key: 'hardness', label: 'Water hardness (as CaCO₃)', unit: 'ppm', min: 0, max: 500, step: 10, default: 300 },
    { kind: 'number', key: 'soap', label: 'Soap solution added', unit: 'mL', min: 1, max: 10, step: 0.5, default: 5 },
    { kind: 'choice', key: 'cleaner', label: 'Cleaner', default: 'soap', options: [{ value: 'soap', label: 'Soap' }, { value: 'detergent', label: 'Detergent' }] },
  ],
  readouts: p => {
    const s = solveSoap(p);
    return [
      { label: 'Water', value: `${waterKind(p.hardness)} (${fmt(p.hardness, 0)} ppm)` },
      { label: 'Soap used up as scum', value: `${fmt(s.used, 1)} mL` },
      { label: 'Lather', value: cm(s.lather) },
    ];
  },
  predictions,
};
