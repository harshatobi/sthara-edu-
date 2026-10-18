import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Acids and bases bench (CBSE Class 10 practicals 1A, 1B and 8): the pH of
 * common dilute samples with universal indicator, and how dilute HCl, NaOH
 * and ethanoic acid behave with litmus, zinc and carbonates. Results are the
 * textbook ones (NCERT Ch 2 and Ch 4 activities), held as data: each test's
 * observation and equation for each sample.
 */

export type Sample = 'hcl' | 'naoh' | 'ethanoic' | 'lemon' | 'water' | 'nahco3';
export type Test = 'universal' | 'blue-litmus' | 'red-litmus' | 'zinc' | 'na2co3' | 'nahco3' | 'odour' | 'water-mix';
export type AcidPropsParams = { sample: Sample; test: Test };

export const SAMPLES: Record<Sample, { label: string; formula: string; ph: number; kind: 'acid' | 'base' | 'neutral' }> = {
  hcl: { label: 'Dilute hydrochloric acid', formula: 'HCl', ph: 1, kind: 'acid' },
  naoh: { label: 'Dilute sodium hydroxide', formula: 'NaOH', ph: 13, kind: 'base' },
  ethanoic: { label: 'Dilute ethanoic (acetic) acid', formula: 'CH₃COOH', ph: 3, kind: 'acid' },
  lemon: { label: 'Lemon juice', formula: 'citric acid', ph: 2.5, kind: 'acid' },
  water: { label: 'Distilled water', formula: 'H₂O', ph: 7, kind: 'neutral' },
  nahco3: { label: 'Dilute sodium hydrogen carbonate', formula: 'NaHCO₃', ph: 8.3, kind: 'base' },
};

export const TESTS: Record<Test, string> = {
  universal: 'pH paper / universal indicator',
  'blue-litmus': 'Blue litmus',
  'red-litmus': 'Red litmus',
  zinc: 'Zinc granules (warm for NaOH)',
  na2co3: 'Solid sodium carbonate',
  nahco3: 'Sodium hydrogen carbonate',
  odour: 'Smell (waft gently)',
  'water-mix': 'Mix with water',
};

/** Universal indicator colour for a pH (the standard chart). */
export function universalColour(ph: number): { name: string; hex: string } {
  if (ph < 2.5) return { name: 'Red', hex: '#E53935' };
  if (ph < 4.5) return { name: 'Orange', hex: '#FB8C00' };
  if (ph < 6.5) return { name: 'Yellow', hex: '#FDD835' };
  if (ph < 7.5) return { name: 'Green', hex: '#43A047' };
  if (ph < 9.5) return { name: 'Blue', hex: '#1E88E5' };
  if (ph < 11.5) return { name: 'Dark blue', hex: '#3949AB' };
  return { name: 'Violet', hex: '#7B1FA2' };
}

export interface Outcome { seen: string; gas: 'H₂' | 'CO₂' | null; equation: string | null; colour?: string }

/** What happens: the textbook observation, the gas (if any) and the equation. */
export function outcome(p: AcidPropsParams): Outcome {
  const s = SAMPLES[p.sample], acid = s.kind === 'acid', base = s.kind === 'base';
  switch (p.test) {
    case 'universal': {
      const c = universalColour(s.ph);
      return { seen: `Turns ${c.name.toLowerCase()}: pH about ${fmt(s.ph, 1)} (${acid ? 'acidic' : base ? 'basic' : 'neutral'})`, gas: null, equation: null, colour: c.hex };
    }
    case 'blue-litmus':
      return acid ? { seen: 'Blue litmus turns red', gas: null, equation: null, colour: '#E53935' } : { seen: 'No change: stays blue', gas: null, equation: null, colour: '#1E88E5' };
    case 'red-litmus':
      return base ? { seen: 'Red litmus turns blue', gas: null, equation: null, colour: '#1E88E5' } : { seen: 'No change: stays red', gas: null, equation: null, colour: '#E53935' };
    case 'zinc':
      if (p.sample === 'hcl') return { seen: 'Bubbles of gas on the zinc; the gas burns with a pop', gas: 'H₂', equation: 'Zn + 2HCl → ZnCl₂ + H₂↑' };
      if (p.sample === 'naoh') return { seen: 'On warming, bubbles of gas; the gas burns with a pop', gas: 'H₂', equation: '2NaOH + Zn → Na₂ZnO₂ + H₂↑' };
      if (p.sample === 'ethanoic' || p.sample === 'lemon') return { seen: 'Slow bubbles of gas (a weak acid reacts slowly)', gas: 'H₂', equation: p.sample === 'ethanoic' ? 'Zn + 2CH₃COOH → (CH₃COO)₂Zn + H₂↑' : null };
      return { seen: 'No reaction', gas: null, equation: null };
    case 'na2co3':
    case 'nahco3': {
      const carb = p.test === 'na2co3' ? 'Na₂CO₃' : 'NaHCO₃';
      if (p.sample === 'hcl') return { seen: 'Brisk effervescence; the gas turns lime water milky', gas: 'CO₂', equation: p.test === 'na2co3' ? 'Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂↑' : 'NaHCO₃ + HCl → NaCl + H₂O + CO₂↑' };
      if (p.sample === 'ethanoic') return { seen: 'Brisk effervescence; the gas turns lime water milky', gas: 'CO₂', equation: p.test === 'na2co3' ? '2CH₃COOH + Na₂CO₃ → 2CH₃COONa + H₂O + CO₂↑' : 'CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂↑' };
      if (p.sample === 'lemon') return { seen: 'Effervescence; the gas turns lime water milky', gas: 'CO₂', equation: null };
      return { seen: `No reaction with ${carb}`, gas: null, equation: null };
    }
    case 'odour':
      return { seen: p.sample === 'ethanoic' ? 'A sharp smell of vinegar' : p.sample === 'lemon' ? 'A smell of lemon' : 'No noticeable smell (never smell strong acids or bases directly)', gas: null, equation: null };
    case 'water-mix':
      return { seen: p.sample === 'water' ? 'It is water' : 'Mixes completely: one clear layer (soluble)', gas: null, equation: null };
  }
}

const predictions: PredictionTemplate<AcidPropsParams>[] = [
  {
    id: 'nature', label: 'Acidic, basic or neutral?', topic: 'Acids and bases in terms of furnishing H⁺ and OH⁻ ions',
    build: p => {
      const s = SAMPLES[p.sample], right = s.kind === 'acid' ? 'Acidic' : s.kind === 'base' ? 'Basic' : 'Neutral';
      const c = choices(right, ['Acidic', 'Basic', 'Neutral'], 260);
      return { prompt: `Is ${s.label.toLowerCase()} acidic, basic or neutral?`, ...c, explain: `${right}: pH about ${fmt(s.ph, 1)}. ${s.kind === 'acid' ? 'Acids give H⁺ ions in water.' : s.kind === 'base' ? 'Bases give OH⁻ ions in water.' : 'Pure water has equal, tiny amounts of H⁺ and OH⁻.'}` };
    },
  },
  {
    id: 'ph-colour', label: 'Universal indicator colour', topic: 'pH scale and the importance of pH in everyday life',
    applies: p => p.test === 'universal',
    build: p => {
      const s = SAMPLES[p.sample], c = universalColour(s.ph).name;
      const ch = choices(c, ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet'].filter(x => x !== c), 261);
      return { prompt: `A drop of ${s.label.toLowerCase()} on universal indicator paper turns it…`, ...ch, explain: `${s.label} has a pH of about ${fmt(s.ph, 1)}. ${s.ph < 7 ? 'Below 7 is acidic: red at pH 1-2 through orange and yellow' : s.ph > 7 ? 'Above 7 is basic: blue, then dark blue and violet for strong bases' : 'pH 7 is neutral: green'}.` };
    },
  },
  {
    id: 'litmus', label: 'Litmus test', topic: 'Identification using indicators',
    applies: p => p.test === 'blue-litmus' || p.test === 'red-litmus',
    build: p => {
      const o = outcome(p), s = SAMPLES[p.sample];
      const ch = choices(o.seen, ['Blue litmus turns red', 'Red litmus turns blue', 'No change: stays blue', 'No change: stays red'], 262);
      return { prompt: `${s.label} is put on ${TESTS[p.test].toLowerCase()} paper. What do you see?`, ...ch, explain: `Acids turn blue litmus red; bases turn red litmus blue; neutral solutions change neither. ${s.label} is ${s.kind}.` };
    },
  },
  {
    id: 'gas', label: 'Which gas is given off', topic: 'Chemical properties, examples and uses',
    applies: p => (p.test === 'zinc' || p.test === 'na2co3' || p.test === 'nahco3'),
    build: p => {
      const o = outcome(p);
      const right = o.gas === 'H₂' ? 'Hydrogen: it burns with a pop' : o.gas === 'CO₂' ? 'Carbon dioxide: it turns lime water milky' : 'No gas: there is no reaction';
      const ch = choices(right, ['Hydrogen: it burns with a pop', 'Carbon dioxide: it turns lime water milky', 'Oxygen: it relights a glowing splint', 'No gas: there is no reaction'], 263);
      return { prompt: `${SAMPLES[p.sample].label} with ${TESTS[p.test].toLowerCase()}: what gas comes off?`, ...ch, explain: `${o.seen}.${o.equation ? ` ${o.equation}.` : ''} Metals give hydrogen with acids; carbonates and hydrogen carbonates give carbon dioxide.` };
    },
  },
  {
    id: 'acetic-properties', label: 'Properties of ethanoic acid', chapter: 'Carbon and its Compounds', topic: 'Ethanol and ethanoic acid (properties and uses only)',
    applies: p => p.sample === 'ethanoic',
    build: p => {
      const o = outcome(p);
      const ch = choices(o.seen, ['A sharp smell of vinegar', 'Mixes completely: one clear layer (soluble)', 'Blue litmus turns red', 'Brisk effervescence; the gas turns lime water milky', 'No reaction'].filter((x, i, a) => a.indexOf(x) === i), 264);
      return { prompt: `Ethanoic acid: ${TESTS[p.test].toLowerCase()}. What do you observe?`, ...ch, explain: `${o.seen}.${o.equation ? ` ${o.equation}.` : ''} Ethanoic acid is the acid in vinegar (5-8%); it is a weak acid, so it reacts less vigorously than hydrochloric acid.` };
    },
  },
];

export const acidProps: LabEngine<AcidPropsParams> = {
  id: 'acid-props',
  title: 'Acids and bases bench',
  blurb: 'Test common samples with pH paper and litmus, and see how acids and bases react with zinc and carbonates.',
  subject: 'Science',
  classes: [10],
  chapters: ['Acids, Bases and Salts', 'Carbon and its Compounds'],
  params: [
    { kind: 'choice', key: 'sample', label: 'Sample', default: 'hcl', options: (Object.keys(SAMPLES) as Sample[]).map(value => ({ value, label: SAMPLES[value].label })) },
    { kind: 'choice', key: 'test', label: 'Test', default: 'universal', options: (Object.keys(TESTS) as Test[]).map(value => ({ value, label: TESTS[value] })) },
  ],
  readouts: p => {
    const o = outcome(p), s = SAMPLES[p.sample];
    return [
      { label: 'Sample', value: `${s.label} (${s.formula})` },
      { label: 'Observation', value: o.seen },
      ...(o.equation ? [{ label: 'Equation', value: o.equation }] : []),
    ];
  },
  predictions,
};
