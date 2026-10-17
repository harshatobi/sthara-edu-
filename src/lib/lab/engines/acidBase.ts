import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Acid–base titration (NCERT Class 10 Ch "Acids, Bases and Salts"; the pH
 * scale, indicators and neutralisation). The flask holds one of four
 * solutions; the burette holds the strong partner (NaOH for an acid, HCl for
 * a base). pH comes from solving the full charge balance for [H⁺] at 25 °C,
 * so it is right everywhere on the curve, not only at the textbook landmarks.
 * Only these reagents exist: nothing outside the school practical list can be set up.
 */

export type Analyte = 'hcl' | 'ch3cooh' | 'naoh' | 'nh3';
export type Indicator = 'phenolphthalein' | 'methyl_orange' | 'litmus' | 'universal';
export type TitrationParams = { analyte: Analyte; ca: number; va: number; ct: number; indicator: Indicator };

const KW = 1e-14;
const KA_ACETIC = 1.8e-5;
const KB_AMMONIA = 1.8e-5;

export const ANALYTE: Record<Analyte, { label: string; formula: string; acid: boolean; strong: boolean; titrant: string }> = {
  hcl: { label: 'Hydrochloric acid', formula: 'HCl', acid: true, strong: true, titrant: 'NaOH' },
  ch3cooh: { label: 'Acetic acid (vinegar)', formula: 'CH₃COOH', acid: true, strong: false, titrant: 'NaOH' },
  naoh: { label: 'Sodium hydroxide', formula: 'NaOH', acid: false, strong: true, titrant: 'HCl' },
  nh3: { label: 'Ammonia solution', formula: 'NH₄OH', acid: false, strong: false, titrant: 'HCl' },
};

export const INDICATOR_LABEL: Record<Indicator, string> = {
  phenolphthalein: 'Phenolphthalein', methyl_orange: 'Methyl orange', litmus: 'Litmus', universal: 'Universal indicator',
};

/** Volume of titrant (mL) that exactly neutralises the flask. */
export const equivalenceVolume = (p: TitrationParams) => (p.ca * p.va) / p.ct;

/** pH after adding `added` mL of titrant. */
export function phAt(p: TitrationParams, added: number): number {
  const a = ANALYTE[p.analyte];
  const total = (p.va + Math.max(0, added)) / 1000; // L
  const cA = (p.ca * p.va) / 1000 / total; // analyte, after dilution (mol/L)
  const cT = (p.ct * Math.max(0, added)) / 1000 / total; // titrant ion, after dilution

  // Charge balance: positive − negative charge as a function of [H+]; it falls as [H+] falls
  // (pH rises), so bisection on pH finds the single root.
  const imbalance = (h: number) => {
    const oh = KW / h;
    if (a.acid) {
      const anion = a.strong ? cA : (cA * KA_ACETIC) / (KA_ACETIC + h); // Cl⁻ or CH₃COO⁻
      return h + cT /* Na⁺ */ - oh - anion;
    }
    const cation = a.strong ? cA : (cA * h) / (h + KW / KB_AMMONIA); // Na⁺ or NH₄⁺
    return h + cation - oh - cT /* Cl⁻ */;
  };
  let lo = 0, hi = 14; // pH bounds
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (imbalance(10 ** -mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** A school burette holds 50 mL. */
export const BURETTE_ML = 50;

/** How far a run goes: twice the neutralising volume, or the whole burette if that comes first. */
export const maxVolume = (p: TitrationParams) => Math.min(2 * equivalenceVolume(p), BURETTE_ML);

/** The curve for drawing: pH at evenly spaced volumes up to the end of a run. */
export function curve(p: TitrationParams, points = 120): { v: number; ph: number }[] {
  const max = maxVolume(p);
  return Array.from({ length: points + 1 }, (_, k) => {
    const v = (max * k) / points;
    return { v, ph: phAt(p, v) };
  });
}


/** Indicator colour at a pH (standard school ranges). */
export function indicatorColour(ind: Indicator, ph: number): { name: string; hex: string } {
  switch (ind) {
    case 'phenolphthalein':
      return ph < 8.2 ? { name: 'Colourless', hex: '#F5F5F0' } : ph < 10 ? { name: 'Pink', hex: '#F472B6' } : { name: 'Deep pink', hex: '#DB2777' };
    case 'methyl_orange':
      return ph < 3.1 ? { name: 'Red', hex: '#DC2626' } : ph <= 4.4 ? { name: 'Orange', hex: '#F97316' } : { name: 'Yellow', hex: '#FACC15' };
    case 'litmus':
      return ph < 5 ? { name: 'Red', hex: '#DC2626' } : ph <= 8 ? { name: 'Purple', hex: '#9333EA' } : { name: 'Blue', hex: '#2563EB' };
    case 'universal': {
      const stops: [number, string, string][] = [
        [0, 'Red', '#DC2626'], [3, 'Orange', '#F97316'], [5, 'Yellow', '#FACC15'], [7, 'Green', '#22C55E'],
        [9, 'Blue', '#2563EB'], [11, 'Indigo', '#4F46E5'], [14, 'Violet', '#7C3AED'],
      ];
      const s = stops.reduce((best, x) => (Math.abs(ph - x[0]) < Math.abs(ph - best[0]) ? x : best));
      return { name: s[1], hex: s[2] };
    }
  }
}

export const phNature = (ph: number) => (ph < 6.95 ? 'Acidic' : ph > 7.05 ? 'Basic' : 'Neutral');

/** The indicator(s) whose change sits on the steep part of this titration. */
export function suitableIndicators(a: Analyte): Indicator[] {
  if (a === 'ch3cooh') return ['phenolphthalein'];
  if (a === 'nh3') return ['methyl_orange'];
  return ['phenolphthalein', 'methyl_orange'];
}

const salt = (a: Analyte) => ({ hcl: 'NaCl', ch3cooh: 'CH₃COONa', naoh: 'NaCl', nh3: 'NH₄Cl' })[a];

const predictions: PredictionTemplate<TitrationParams>[] = [
  {
    id: 'equivalence-volume', label: 'Volume needed to neutralise',
    build: p => {
      const a = ANALYTE[p.analyte], ve = equivalenceVolume(p);
      const ml = (n: number) => `${fmt(n, 1)} mL`;
      const c = choices(ml(ve), [ml(p.va), ml((p.ct * p.va) / p.ca), ml(ve / 2), ml(ve * 2)], 21);
      return {
        prompt: `How much ${fmt(p.ct, 2)} M ${a.titrant} will exactly neutralise the ${fmt(p.va, 0)} mL of ${fmt(p.ca, 2)} M ${a.formula}?`, ...c,
        explain: `Moles in the flask = ${fmt(p.ca, 2)} × ${fmt(p.va, 0)}/1000 = ${fmt((p.ca * p.va) / 1000, 5)} mol. They react 1 : 1, so V = ${fmt((p.ca * p.va) / 1000, 5)} / ${fmt(p.ct, 2)} = ${ml(ve)}.`,
      };
    },
  },
  {
    id: 'equivalence-ph', label: 'Acidic, neutral or basic at neutralisation',
    build: p => {
      const ph = phAt(p, equivalenceVolume(p)), n = phNature(ph);
      const c = choices(n, ['Acidic', 'Neutral', 'Basic'], 22);
      const a = ANALYTE[p.analyte];
      return {
        prompt: 'At the exact point of neutralisation, the solution will be…', ...c,
        explain: `pH there is ${fmt(ph, 2)}. The flask now holds ${salt(p.analyte)}${a.strong ? ', a salt of a strong acid and a strong base, so it is neutral.' : a.acid ? ', which comes from a weak acid, so the solution is slightly basic.' : ', which comes from a weak base, so the solution is slightly acidic.'}`,
      };
    },
  },
  {
    id: 'start-ph', label: 'pH before anything is added',
    build: p => {
      const ph = phAt(p, 0), a = ANALYTE[p.analyte];
      const show = (x: number) => `About ${fmt(x, 1)}`;
      const strongGuess = a.acid ? -Math.log10(p.ca) : 14 + Math.log10(p.ca);
      const ds = [7, 14 - ph, a.strong ? (a.acid ? ph + 2 : ph - 2) : strongGuess].map(show);
      const c = choices(show(ph), ds, 23);
      return {
        prompt: `What is the pH of the ${fmt(p.ca, 2)} M ${a.formula} before any ${a.titrant} is added?`, ...c,
        explain: a.strong
          ? `${a.formula} is fully ionised, so ${a.acid ? '[H⁺]' : '[OH⁻]'} = ${fmt(p.ca, 2)} M and pH = ${fmt(ph, 2)}.`
          : `${a.formula} is a weak ${a.acid ? 'acid' : 'base'}, only slightly ionised, so pH is ${fmt(ph, 2)}, nearer 7 than a strong ${a.acid ? 'acid' : 'base'} of the same strength (${fmt(strongGuess, 2)}).`,
      };
    },
  },
  {
    id: 'best-indicator', label: 'Which indicator to use',
    build: p => {
      const ok = suitableIndicators(p.analyte), right = INDICATOR_LABEL[ok[0]];
      const others = (['phenolphthalein', 'methyl_orange', 'litmus'] as Indicator[]).filter(i => !ok.includes(i)).map(i => INDICATOR_LABEL[i]);
      const c = choices(ok.length > 1 ? 'Either phenolphthalein or methyl orange' : right, [...others, ok.length > 1 ? 'Neither: use litmus' : 'Either phenolphthalein or methyl orange'], 24);
      const ph = phAt(p, equivalenceVolume(p));
      return {
        prompt: 'Which indicator shows the end point most sharply?', ...c,
        explain: `The pH jumps steeply around pH ${fmt(ph, 1)}. ${ok.length > 1 ? 'For a strong acid with a strong base the jump spans about pH 3–11, so both change on it.' : ok[0] === 'phenolphthalein' ? 'Phenolphthalein turns pink from pH 8.2, right on the jump; methyl orange would change too early.' : 'Methyl orange changes between pH 3.1 and 4.4, on the jump; phenolphthalein would change too early.'}`,
      };
    },
  },
  {
    id: 'colour-at-end', label: 'Indicator colour when done',
    build: p => {
      const end = phAt(p, maxVolume(p)), col = indicatorColour(p.indicator, end).name;
      const all = { phenolphthalein: ['Colourless', 'Pink', 'Deep pink'], methyl_orange: ['Red', 'Orange', 'Yellow'], litmus: ['Red', 'Purple', 'Blue'], universal: ['Red', 'Yellow', 'Green', 'Blue', 'Violet'] }[p.indicator];
      const c = choices(col, all, 25);
      return {
        prompt: `With ${INDICATOR_LABEL[p.indicator].toLowerCase()} in the flask, what colour will it be after ${fmt(maxVolume(p), 1)} mL of ${ANALYTE[p.analyte].titrant}?`, ...c,
        explain: `That is past the neutralising volume (${fmt(equivalenceVolume(p), 1)} mL), so the ${ANALYTE[p.analyte].titrant} is in excess: pH ${fmt(end, 1)}, and ${INDICATOR_LABEL[p.indicator].toLowerCase()} is ${col.toLowerCase()} there.`,
      };
    },
  },
];

export const acidBase: LabEngine<TitrationParams> = {
  id: 'acid-base',
  title: 'Acid–base titration',
  blurb: 'Add acid or alkali drop by drop: the pH curve draws itself and the indicator changes colour.',
  subject: 'Science',
  classes: [10],
  chapters: ['Acids, Bases and Salts'],
  params: [
    { kind: 'choice', key: 'analyte', label: 'In the flask', default: 'hcl', options: (Object.keys(ANALYTE) as Analyte[]).map(value => ({ value, label: `${ANALYTE[value].label} (${ANALYTE[value].formula})` })) },
    { kind: 'number', key: 'ca', label: 'Flask concentration', unit: 'M', min: 0.01, max: 1, step: 0.01, default: 0.1 },
    { kind: 'number', key: 'va', label: 'Flask volume', unit: 'mL', min: 5, max: 50, step: 1, default: 25 },
    { kind: 'number', key: 'ct', label: 'Burette concentration', unit: 'M', min: 0.01, max: 1, step: 0.01, default: 0.1 },
    { kind: 'choice', key: 'indicator', label: 'Indicator', default: 'phenolphthalein', options: (Object.keys(INDICATOR_LABEL) as Indicator[]).map(value => ({ value, label: INDICATOR_LABEL[value] })) },
  ],
  // A run must go well past neutralisation inside one 50 mL burette, so the excess shows.
  check: p => (equivalenceVolume(p) > 40 ? `That needs ${fmt(equivalenceVolume(p), 1)} mL to neutralise; one 50 mL burette must go well past that. Raise the burette concentration or use less in the flask.` : null),
  readouts: p => {
    const ve = equivalenceVolume(p), a = ANALYTE[p.analyte];
    return [
      { label: 'Burette', value: `${fmt(p.ct, 2)} M ${a.titrant}` },
      { label: 'Neutralises at', value: `${fmt(ve, 1)} mL` },
      { label: 'pH at start', value: fmt(phAt(p, 0), 2) },
      { label: 'pH at neutralisation', value: fmt(phAt(p, ve), 2) },
    ];
  },
  predictions,
};
