import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Osmosis (NCERT Class 9 "The Fundamental Unit of Life", Activity 5.4: raisins,
 * potato cups, a de-shelled egg). Water crosses the selectively permeable
 * membrane from where it is more concentrated (the weaker solution) to where
 * it is less (the stronger one). Model: the cell contents behave like a
 * 0.3 M sugar solution; the mass changes by 25% of the item for every 1 M
 * difference, approaching that change over about an hour.
 */

export type Item = 'raisin' | 'potato' | 'egg';
export type OsmosisParams = { item: Item; conc: number; minutes: number };

export const CELL_CONC = 0.3;
const PER_MOLAR = 0.25;
const TAU = 25; // minutes

export const ITEMS: Record<Item, { label: string; mass: number; swollen: string; shrunk: string }> = {
  raisin: { label: 'Raisin', mass: 0.5, swollen: 'swells and becomes plump', shrunk: 'shrivels further' },
  potato: { label: 'Potato strip', mass: 5, swollen: 'becomes firm and stiff (turgid)', shrunk: 'becomes soft and bendy (flaccid)' },
  egg: { label: 'De-shelled egg', mass: 60, swollen: 'swells', shrunk: 'shrinks' },
};

export function solveOsmosis(p: OsmosisParams) {
  const it = ITEMS[p.item];
  const share = PER_MOLAR * (CELL_CONC - p.conc) * (1 - Math.exp(-p.minutes / TAU));
  const end = it.mass * (1 + share);
  const dir = Math.abs(CELL_CONC - p.conc) < 1e-9 ? 'none' : p.conc < CELL_CONC ? 'in' : 'out';
  return { start: it.mass, end, change: end - it.mass, pct: share * 100, dir: dir as 'in' | 'out' | 'none' };
}

export const solutionKind = (c: number) => (Math.abs(c - CELL_CONC) < 1e-9 ? 'isotonic (same as the cell)' : c < CELL_CONC ? 'hypotonic (weaker than the cell)' : 'hypertonic (stronger than the cell)');

const g = (m: number) => `${fmt(m, m < 1 ? 3 : m < 10 ? 2 : 1)} g`;

const predictions: PredictionTemplate<OsmosisParams>[] = [
  {
    id: 'direction', label: 'Which way the water moves', topic: 'Permeability of cell membranes',
    build: p => {
      const s = solveOsmosis(p);
      const right = s.dir === 'in' ? 'Into the cells: it gains mass' : s.dir === 'out' ? 'Out of the cells: it loses mass' : 'No net movement: the mass stays the same';
      const c = choices(right, ['Into the cells: it gains mass', 'Out of the cells: it loses mass', 'No net movement: the mass stays the same'], 301);
      return { prompt: `A ${ITEMS[p.item].label.toLowerCase()} is placed in ${p.conc === 0 ? 'pure water' : `a ${fmt(p.conc, 2)} M sugar solution`}. What happens?`, ...c, explain: `The solution is ${solutionKind(p.conc)}. Water moves by osmosis from the weaker to the stronger solution across the cell membrane. ${s.dir === 'none' ? 'With equal concentrations there is no net flow.' : `So the ${ITEMS[p.item].label.toLowerCase()} ${s.dir === 'in' ? ITEMS[p.item].swollen : ITEMS[p.item].shrunk}.`}` };
    },
  },
  {
    id: 'mass-after', label: 'Mass after soaking', topic: 'Permeability of cell membranes',
    applies: p => p.minutes > 0,
    build: p => {
      const s = solveOsmosis(p);
      const c = choices(g(s.end), [g(s.start), g(s.start - s.change), g(s.start + 2 * s.change), g(s.start * (1 + Math.sign(s.change || 1) * 0.5))], 302);
      return { prompt: `It weighed ${g(s.start)}. What does it weigh after ${fmt(p.minutes, 0)} minutes?`, ...c, explain: `It ${s.change >= 0 ? 'gains' : 'loses'} ${fmt(Math.abs(s.pct), 1)}% of its mass: ${g(s.start)} → ${g(s.end)}. The change slows as it goes on, as the concentrations even out.` };
    },
  },
  {
    id: 'membrane', label: 'Why the membrane matters', topic: 'Permeability of cell membranes',
    build: () => {
      const c = choices('It lets water through but not the sugar', ['It lets everything through equally', 'It lets the sugar through but not water', 'It lets nothing through'], 303);
      return { prompt: 'Osmosis needs the cell membrane to be selectively permeable. That means…', ...c, explain: 'A selectively permeable membrane lets small molecules like water pass but holds back bigger dissolved ones like sugar, so only the water moves to even out the concentrations.' };
    },
  },
];

export const osmosis: LabEngine<OsmosisParams> = {
  id: 'osmosis',
  title: 'Osmosis',
  blurb: 'Soak raisins, potato strips or a de-shelled egg in water and sugar solutions, and weigh them as water moves in or out.',
  subject: 'Science',
  classes: [9],
  chapters: ['Cell'],
  params: [
    { kind: 'choice', key: 'item', label: 'Put in', default: 'potato', options: (Object.keys(ITEMS) as Item[]).map(value => ({ value, label: ITEMS[value].label })) },
    { kind: 'number', key: 'conc', label: 'Sugar solution', unit: 'M', min: 0, max: 1, step: 0.05, default: 0 },
    { kind: 'number', key: 'minutes', label: 'Time soaked', unit: 'min', min: 0, max: 120, step: 5, default: 60 },
  ],
  readouts: p => {
    const s = solveOsmosis(p);
    return [
      { label: 'Solution', value: solutionKind(p.conc) },
      { label: 'Mass before', value: g(s.start) },
      { label: 'Mass after', value: g(s.end) },
      { label: 'Change', value: `${s.pct >= 0 ? '+' : ''}${fmt(s.pct, 1)}%` },
    ];
  },
  predictions,
};
