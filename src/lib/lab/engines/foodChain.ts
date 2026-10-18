import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Food chains (NCERT Class 10 "Our Environment"). Only about 10% of the energy
 * at one trophic level reaches the next (the 10 percent law); the rest is
 * used in life processes or lost as heat, which is why chains rarely have
 * more than four or five levels. Pesticides like DDT are not broken down or
 * excreted, so they build up at each level (biological magnification);
 * here the concentration rises tenfold per level.
 */

export type ChainKey = 'grassland' | 'pond';
export type FoodChainParams = { chain: ChainKey; levels: number; energy: number; pesticide: number };

export const CHAINS: Record<ChainKey, string[]> = {
  grassland: ['Grass', 'Grasshopper', 'Frog', 'Snake', 'Eagle'],
  pond: ['Phytoplankton', 'Zooplankton', 'Small fish', 'Big fish', 'Fish-eating bird'],
};

export const TRANSFER = 0.1;
export const MAGNIFY = 10;

export function solveChain(p: FoodChainParams) {
  const names = CHAINS[p.chain].slice(0, p.levels);
  return names.map((name, i) => ({ name, level: i + 1, energy: p.energy * TRANSFER ** i, pesticide: p.pesticide * MAGNIFY ** i }));
}

const kJ = (n: number) => `${fmt(n, n >= 10 ? 0 : n >= 1 ? 1 : 3)} kJ`;
const ppm = (n: number) => `${fmt(n, n >= 1 ? 1 : n >= 0.01 ? 3 : 5)} ppm`;

const predictions: PredictionTemplate<FoodChainParams>[] = [
  {
    id: 'top-energy', label: 'Energy reaching the top', topic: 'Ecosystem',
    build: p => {
      const s = solveChain(p), top = s[s.length - 1];
      const c = choices(kJ(top.energy), [kJ(p.energy * 0.1), kJ(p.energy * 0.5 ** (p.levels - 1)), kJ(p.energy / p.levels), kJ(top.energy / 10)], 351);
      return { prompt: `The ${s[0].name.toLowerCase()} store ${kJ(p.energy)}. How much of it reaches the ${top.name.toLowerCase()} at level ${top.level}?`, ...c, explain: `About 10% passes on at each step: ${s.map(x => kJ(x.energy)).join(' → ')}.` };
    },
  },
  {
    id: 'most-pesticide', label: 'Who has the most pesticide', topic: 'Environmental problems',
    applies: p => p.pesticide > 0,
    build: p => {
      const s = solveChain(p), top = s[s.length - 1];
      const c = choices(top.name, s.map(x => x.name), 352);
      return { prompt: 'Which organism ends up with the highest concentration of the pesticide?', ...c, explain: `Biological magnification: the pesticide is not broken down, so it builds up at each level, ${s.map(x => ppm(x.pesticide)).join(' → ')}. The top consumer, the ${top.name.toLowerCase()}, has the most.` };
    },
  },
  {
    id: 'short-chains', label: 'Why food chains are short', topic: 'Ecosystem',
    build: () => {
      const c = choices('So little energy is left after 4-5 levels that it cannot support another level', ['There are not enough kinds of animals', 'Top consumers have no predators', 'Plants cannot make enough food'], 353);
      return { prompt: 'Why do food chains usually have only three or four levels?', ...c, explain: 'With 10% passed on each time, the fifth level gets only 0.01% of what the producers trapped: too little to sustain another population.' };
    },
  },
];

export const foodChain: LabEngine<FoodChainParams> = {
  id: 'food-chain',
  title: 'Food chains and energy flow',
  blurb: 'Follow energy up a food chain with the 10 percent law, and watch a pesticide build up at every level.',
  subject: 'Science',
  classes: [10],
  chapters: ['Our Environment'],
  params: [
    { kind: 'choice', key: 'chain', label: 'Food chain', default: 'grassland', options: [{ value: 'grassland', label: 'Grassland' }, { value: 'pond', label: 'Pond' }] },
    { kind: 'number', key: 'levels', label: 'Trophic levels', unit: '', min: 3, max: 5, step: 1, default: 4 },
    { kind: 'number', key: 'energy', label: 'Energy in producers', unit: 'kJ', min: 1000, max: 100000, step: 1000, default: 10000 },
    { kind: 'number', key: 'pesticide', label: 'Pesticide in producers', unit: 'ppm', min: 0, max: 0.05, step: 0.001, default: 0.004 },
  ],
  readouts: p => solveChain(p).map(x => ({ label: `${x.level}. ${x.name}`, value: `${kJ(x.energy)} · ${ppm(x.pesticide)}` })),
  predictions,
};
