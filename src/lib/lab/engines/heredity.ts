import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Heredity (NCERT Class 10 "Heredity": Mendel's experiments with pea plants,
 * and sex determination in humans). A Punnett square of the parents' gametes;
 * every count and ratio is worked from the square, as exact fractions.
 */

export type Trait = 'height' | 'shape' | 'colour';
export type Geno = 'AA' | 'Aa' | 'aa';
export type DiGeno = 'RRYY' | 'RrYy' | 'rryy';
export type HeredityParams = { cross: 'mono' | 'di' | 'sex'; trait: Trait; p1: Geno; p2: Geno; d1: DiGeno; d2: DiGeno };

export const TRAITS: Record<Trait, { name: string; letter: string; dominant: string; recessive: string }> = {
  height: { name: 'Plant height', letter: 'T', dominant: 'Tall', recessive: 'Dwarf' },
  shape: { name: 'Seed shape', letter: 'R', dominant: 'Round', recessive: 'Wrinkled' },
  colour: { name: 'Seed colour', letter: 'Y', dominant: 'Yellow', recessive: 'Green' },
};

/** Writes AA/Aa/aa with the trait's own letter (TT, Tt, tt). */
export const spell = (g: string, letter: string) => g.replace(/A/g, letter.toUpperCase()).replace(/a/g, letter.toLowerCase());

const gametes = (g: string): string[] => {
  // One allele from each gene pair, every combination (Mendel's independent assortment).
  const pairs = g.match(/../g)!;
  return pairs.reduce<string[]>((acc, pair) => acc.flatMap(a => [a + pair[0], a + pair[1]]), ['']);
};

/** Sorts each gene pair dominant-first (aA → Aa, yR order kept by gene). */
const tidy = (g: string) => (g.match(/../g) ?? []).map(pair => [...pair].sort((x, y) => (x === x.toUpperCase() ? -1 : 0) - (y === y.toUpperCase() ? -1 : 0)).join('')).join('');

export interface Square { rows: string[]; cols: string[]; cells: string[][] }

export function square(a: string, b: string): Square {
  const rows = gametes(a), cols = gametes(b);
  // Rebuild each child gene by gene: one allele from each parent for each pair.
  const cells = rows.map(r => cols.map(c => tidy([...r].map((ch, i) => ch + c[i]).join(''))));
  return { rows, cols, cells };
}

export interface Tally { label: string; count: number }

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
export const ratio = (ns: number[]) => { const g = ns.reduce(gcd); return ns.map(n => n / g).join(' : '); };

export function solveHeredity(p: HeredityParams) {
  if (p.cross === 'sex') {
    const sq: Square = { rows: ['X', 'X'], cols: ['X', 'Y'], cells: [['XX', 'XY'], ['XX', 'XY']] };
    const girls = 2, boys = 2;
    return { sq, total: 4, phenotypes: [{ label: 'Girl (XX)', count: girls }, { label: 'Boy (XY)', count: boys }], genotypes: [{ label: 'XX', count: girls }, { label: 'XY', count: boys }] };
  }
  if (p.cross === 'mono') {
    const t = TRAITS[p.trait];
    const sq = square(p.p1, p.p2), flat = sq.cells.flat();
    const genotypes = (['AA', 'Aa', 'aa'] as Geno[]).map(g => ({ label: spell(g, t.letter), count: flat.filter(x => x === g).length })).filter(x => x.count);
    const dom = flat.filter(x => x.includes('A')).length;
    const phenotypes = [{ label: t.dominant, count: dom }, { label: t.recessive, count: flat.length - dom }].filter(x => x.count);
    return { sq: { rows: sq.rows.map(g => spell(g, t.letter)), cols: sq.cols.map(g => spell(g, t.letter)), cells: sq.cells.map(r => r.map(g => spell(g, t.letter))) }, total: flat.length, phenotypes, genotypes };
  }
  const sq = square(p.d1, p.d2), flat = sq.cells.flat();
  const ph = (g: string) => `${g.includes('R') ? 'Round' : 'Wrinkled'} ${g.includes('Y') ? 'yellow' : 'green'}`;
  const order = ['Round yellow', 'Round green', 'Wrinkled yellow', 'Wrinkled green'];
  const phenotypes = order.map(label => ({ label, count: flat.filter(g => ph(g) === label).length })).filter(x => x.count);
  const gen = new Map<string, number>();
  flat.forEach(g => gen.set(g, (gen.get(g) ?? 0) + 1));
  return { sq, total: flat.length, phenotypes, genotypes: [...gen].map(([label, count]) => ({ label, count })) };
}

const share = (n: number, total: number) => `${n} out of ${total}`;

const predictions: PredictionTemplate<HeredityParams>[] = [
  {
    id: 'dominant-share', label: 'How many show the dominant trait', topic: "Mendel's contribution: laws for inheritance of traits",
    applies: p => p.cross === 'mono',
    build: p => {
      const s = solveHeredity(p), t = TRAITS[p.trait];
      const dom = s.phenotypes.find(x => x.label === t.dominant)?.count ?? 0;
      const c = choices(share(dom, 4), [0, 1, 2, 3, 4].filter(n => n !== dom).map(n => share(n, 4)), 331);
      return { prompt: `${spell(p.p1, t.letter)} × ${spell(p.p2, t.letter)}: of every 4 offspring, how many are ${t.dominant.toLowerCase()}?`, ...c, explain: `The Punnett square gives ${s.genotypes.map(g => `${g.count} ${g.label}`).join(', ')}. Any plant with at least one ${t.letter} is ${t.dominant.toLowerCase()} (${t.letter} is dominant), so ${share(dom, 4)}.` };
    },
  },
  {
    id: 'genotype-ratio', label: 'Genotype ratio', topic: "Mendel's contribution: laws for inheritance of traits",
    applies: p => p.cross === 'mono' && solveHeredity(p).genotypes.length > 1,
    build: p => {
      const s = solveHeredity(p);
      const right = `${s.genotypes.map(g => g.label).join(' : ')} = ${ratio(s.genotypes.map(g => g.count))}`;
      const t = TRAITS[p.trait], L = t.letter;
      const pool = [`${L}${L} : ${L}${L.toLowerCase()} : ${L.toLowerCase()}${L.toLowerCase()} = 1 : 2 : 1`, `${L}${L} : ${L}${L.toLowerCase()} = 1 : 1`, `${L}${L.toLowerCase()} : ${L.toLowerCase()}${L.toLowerCase()} = 1 : 1`, `${L}${L} : ${L.toLowerCase()}${L.toLowerCase()} = 3 : 1`];
      const c = choices(right, pool, 332);
      return { prompt: `${spell(p.p1, L)} × ${spell(p.p2, L)}: what is the ratio of genotypes in the offspring?`, ...c, explain: `Counting the four boxes of the Punnett square: ${right}.` };
    },
  },
  {
    id: 'f2-ratio', label: 'Dihybrid phenotype ratio', topic: "Mendel's contribution: laws for inheritance of traits",
    applies: p => p.cross === 'di',
    build: p => {
      const s = solveHeredity(p);
      const right = `${s.phenotypes.map(x => x.label.toLowerCase()).join(' : ')} = ${ratio(s.phenotypes.map(x => x.count))}`;
      const c = choices(right, ['round yellow : round green : wrinkled yellow : wrinkled green = 9 : 3 : 3 : 1', 'round yellow : wrinkled green = 3 : 1', 'round yellow : round green : wrinkled yellow : wrinkled green = 1 : 1 : 1 : 1', 'round yellow = all'], 333);
      return { prompt: `${p.d1} × ${p.d2}: what ratio of seed types do you get?`, ...c, explain: `The ${s.total}-box square gives ${s.phenotypes.map(x => `${x.count} ${x.label.toLowerCase()}`).join(', ')}. ${p.d1 === 'RrYy' && p.d2 === 'RrYy' ? 'The 9 : 3 : 3 : 1 ratio shows the two traits are inherited independently.' : ''}`.trim() };
    },
  },
  {
    id: 'boy-chance', label: 'Chance of a boy', topic: 'Sex determination: brief introduction',
    applies: p => p.cross === 'sex',
    build: () => {
      const c = choices('1 in 2 (50%), decided by the father\'s sperm', ['1 in 2 (50%), decided by the mother\'s egg', '1 in 4 (25%)', '3 in 4 (75%)'], 334);
      return { prompt: 'What is the chance that a child is a boy, and which parent decides it?', ...c, explain: 'Every egg carries an X. Half the sperm carry X (girl, XX) and half carry Y (boy, XY), so the chance is 1 in 2 each time, and it depends on the sperm.' };
    },
  },
];

const mono = (p: HeredityParams) => p.cross === 'mono', di = (p: HeredityParams) => p.cross === 'di';
const GENO = (['AA', 'Aa', 'aa'] as Geno[]).map(value => ({ value, label: value === 'AA' ? 'Pure dominant (AA)' : value === 'Aa' ? 'Hybrid (Aa)' : 'Pure recessive (aa)' }));
const DIGENO = (['RRYY', 'RrYy', 'rryy'] as DiGeno[]).map(value => ({ value, label: value }));

export const heredity: LabEngine<HeredityParams> = {
  id: 'heredity',
  title: 'Heredity and Punnett squares',
  blurb: "Cross Mendel's pea plants (one trait or two) and see the ratios fall out of the Punnett square; and how a baby's sex is decided.",
  subject: 'Science',
  classes: [10],
  chapters: ['Heredity'],
  params: [
    { kind: 'choice', key: 'cross', label: 'Cross', default: 'mono', options: [{ value: 'mono', label: 'One trait (monohybrid)' }, { value: 'di', label: 'Two traits (dihybrid)' }, { value: 'sex', label: 'Sex determination' }] },
    { kind: 'choice', key: 'trait', label: 'Trait', default: 'height', options: (Object.keys(TRAITS) as Trait[]).map(value => ({ value, label: `${TRAITS[value].name} (${TRAITS[value].dominant} / ${TRAITS[value].recessive})` })), show: mono },
    { kind: 'choice', key: 'p1', label: 'Parent 1', default: 'Aa', options: GENO, show: mono },
    { kind: 'choice', key: 'p2', label: 'Parent 2', default: 'Aa', options: GENO, show: mono },
    { kind: 'choice', key: 'd1', label: 'Parent 1', default: 'RrYy', options: DIGENO, show: di },
    { kind: 'choice', key: 'd2', label: 'Parent 2', default: 'RrYy', options: DIGENO, show: di },
  ],
  readouts: p => {
    const s = solveHeredity(p);
    return [
      { label: 'Offspring types', value: s.phenotypes.map(x => `${x.label} ${x.count}`).join(', ') },
      { label: 'Phenotype ratio', value: ratio(s.phenotypes.map(x => x.count)) },
      { label: 'Genotypes', value: s.genotypes.map(x => `${x.label} ${x.count}`).join(', ') },
    ];
  },
  predictions,
};
