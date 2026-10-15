import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Chemical reactions and equations (NCERT Class 10 Ch 1; moles from Class 9
 * "Atoms and Molecules"). Only the reactions in the textbook's activities
 * exist here: the teacher picks one, never types a formula. Coefficients come
 * from a real balancer (the null space of the element matrix, in exact
 * integers), masses from NCERT's atomic mass table.
 */

export const ATOMIC_MASS: Record<string, number> = {
  H: 1, C: 12, N: 14, O: 16, Na: 23, Mg: 24, Al: 27, S: 32, Cl: 35.5, K: 39, Ca: 40, Fe: 56, Cu: 63.5, Zn: 65, Ag: 108, Ba: 137, Pb: 207,
};

export type ReactionType = 'Combination' | 'Decomposition' | 'Displacement' | 'Double displacement' | 'Combustion' | 'Redox';

interface Reaction { key: string; label: string; reactants: string[]; products: string[]; type: ReactionType; condition?: string; observe: string }

export const REACTIONS: Reaction[] = [
  { key: 'h2-o2', label: 'Hydrogen burns in oxygen', reactants: ['H2', 'O2'], products: ['H2O'], type: 'Combination', observe: 'A pop and droplets of water.' },
  { key: 'mg-o2', label: 'Burning magnesium ribbon', reactants: ['Mg', 'O2'], products: ['MgO'], type: 'Combination', condition: 'heat', observe: 'A dazzling white flame; white powder (magnesium oxide) is left.' },
  { key: 'cao-h2o', label: 'Quicklime with water', reactants: ['CaO', 'H2O'], products: ['Ca(OH)2'], type: 'Combination', observe: 'Hissing, and the beaker gets hot: slaked lime forms.' },
  { key: 'caco3', label: 'Heating limestone', reactants: ['CaCO3'], products: ['CaO', 'CO2'], type: 'Decomposition', condition: 'heat', observe: 'Carbon dioxide is given off; quicklime is left.' },
  { key: 'pbno3', label: 'Heating lead nitrate', reactants: ['Pb(NO3)2'], products: ['PbO', 'NO2', 'O2'], type: 'Decomposition', condition: 'heat', observe: 'Brown fumes of nitrogen dioxide.' },
  { key: 'agcl', label: 'Silver chloride in sunlight', reactants: ['AgCl'], products: ['Ag', 'Cl2'], type: 'Decomposition', condition: 'sunlight', observe: 'The white solid turns grey.' },
  { key: 'h2o-elec', label: 'Electrolysis of water', reactants: ['H2O'], products: ['H2', 'O2'], type: 'Decomposition', condition: 'electricity', observe: 'Twice as much gas collects at the cathode as at the anode.' },
  { key: 'fe-cuso4', label: 'Iron nail in copper sulphate', reactants: ['Fe', 'CuSO4'], products: ['FeSO4', 'Cu'], type: 'Displacement', observe: 'The nail turns brown and the blue solution fades to green.' },
  { key: 'zn-h2so4', label: 'Zinc with dilute sulphuric acid', reactants: ['Zn', 'H2SO4'], products: ['ZnSO4', 'H2'], type: 'Displacement', observe: 'Bubbles of hydrogen.' },
  { key: 'na2so4-bacl2', label: 'Sodium sulphate with barium chloride', reactants: ['Na2SO4', 'BaCl2'], products: ['BaSO4', 'NaCl'], type: 'Double displacement', observe: 'A white precipitate of barium sulphate.' },
  { key: 'ch4-o2', label: 'Burning methane', reactants: ['CH4', 'O2'], products: ['CO2', 'H2O'], type: 'Combustion', observe: 'A blue flame, heat and light.' },
  { key: 'cuo-h2', label: 'Hydrogen over hot copper oxide', reactants: ['CuO', 'H2'], products: ['Cu', 'H2O'], type: 'Redox', condition: 'heat', observe: 'The black powder turns reddish-brown copper.' },
];

/** Atoms in a formula, with brackets: Ca(OH)2 → { Ca: 1, O: 2, H: 2 }. */
export function parseFormula(f: string): Record<string, number> {
  let i = 0;
  const group = (): Record<string, number> => {
    const out: Record<string, number> = {};
    const add = (el: string, n: number) => { out[el] = (out[el] ?? 0) + n; };
    while (i < f.length && f[i] !== ')') {
      if (f[i] === '(') {
        i++;
        const inner = group();
        if (f[i] !== ')') throw new Error(`Unclosed bracket in ${f}`);
        i++;
        const n = count();
        for (const [el, k] of Object.entries(inner)) add(el, k * n);
      } else {
        const m = /^[A-Z][a-z]?/.exec(f.slice(i));
        if (!m) throw new Error(`Bad formula ${f}`);
        i += m[0].length;
        add(m[0], count());
      }
    }
    return out;
  };
  const count = () => { const m = /^\d+/.exec(f.slice(i)); if (!m) return 1; i += m[0].length; return Number(m[0]); };
  const r = group();
  if (i !== f.length) throw new Error(`Bad formula ${f}`);
  return r;
}

export const molarMass = (f: string) => Object.entries(parseFormula(f)).reduce((s, [el, n]) => s + ATOMIC_MASS[el] * n, 0);

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * Smallest whole-number coefficients (reactants then products), from the null
 * space of the element × species matrix. Exact: fractions are kept as integer
 * pairs (the matrices are a handful of small integers, far inside the safe range).
 */
export function balance(reactants: string[], products: string[]): number[] {
  const species = [...reactants, ...products];
  const atoms = species.map(parseFormula);
  const els = [...new Set(atoms.flatMap(a => Object.keys(a)))];
  type Q = [number, number];
  const norm = ([n, d]: Q): Q => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return [n / g, d / g]; };
  const sub = (a: Q, b: Q): Q => norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]);
  const mul = (a: Q, b: Q): Q => norm([a[0] * b[0], a[1] * b[1]]);
  const div = (a: Q, b: Q): Q => norm([a[0] * b[1], a[1] * b[0]]);
  // Rows: elements; columns: species (products negative).
  const M: Q[][] = els.map(el => species.map((_, j) => [(atoms[j][el] ?? 0) * (j < reactants.length ? 1 : -1), 1] as Q));
  const cols = species.length;
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < cols && row < M.length; c++) {
    const pr = M.findIndex((r, k) => k >= row && r[c][0] !== 0);
    if (pr < 0) continue;
    [M[row], M[pr]] = [M[pr], M[row]];
    const pv = M[row][c];
    M[row] = M[row].map(x => div(x, pv));
    for (let k = 0; k < M.length; k++) if (k !== row && M[k][c][0] !== 0) { const f = M[k][c]; M[k] = M[k].map((x, j) => sub(x, mul(f, M[row][j]))); }
    pivots.push(c);
    row++;
  }
  const free = [...Array(cols).keys()].filter(c => !pivots.includes(c));
  if (free.length !== 1) throw new Error('Equation does not balance to a single set of coefficients');
  const fc = free[0];
  const x: Q[] = Array(cols).fill([0, 1]);
  x[fc] = [1, 1];
  pivots.forEach((c, k) => { x[c] = norm([-M[k][fc][0], M[k][fc][1]]); });
  const lcm = x.reduce((l, [, d]) => (l * d) / gcd(l, d), 1);
  let ints = x.map(([n, d]) => (n * lcm) / d);
  const g = ints.reduce((a, b) => gcd(a, b));
  ints = ints.map(v => v / g);
  if (ints.some(v => v <= 0)) ints = ints.map(v => -v);
  if (ints.some(v => v <= 0)) throw new Error('No positive balance');
  return ints;
}

export type ReactionParams = { reaction: string; given: 'r0' | 'r1'; mass: number };

export function solveReaction(p: ReactionParams) {
  const rx = REACTIONS.find(r => r.key === p.reaction)!;
  const coef = balance(rx.reactants, rx.products);
  const nR = rx.reactants.length;
  // 'second reactant' falls back to the first when there is only one.
  const gi = p.given === 'r1' && nR > 1 ? 1 : 0;
  const molesGiven = p.mass / molarMass(rx.reactants[gi]);
  const amount = (j: number) => {
    const formula = j < nR ? rx.reactants[j] : rx.products[j - nR];
    const moles = (molesGiven * coef[j]) / coef[gi];
    return { formula, coef: coef[j], moles, mass: moles * molarMass(formula), side: j < nR ? 'reactant' as const : 'product' as const };
  };
  const all = coef.map((_, j) => amount(j));
  return { rx, coef, all, given: all[gi], reactants: all.slice(0, nR), products: all.slice(nR) };
}

/** Subscript digits for display: Ca(OH)2 → Ca(OH)₂. */
export const pretty = (f: string) => f.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);

export function equationText(p: ReactionParams, hide = false): string {
  const { rx, coef } = solveReaction(p);
  const term = (f: string, k: number) => `${hide ? '? ' : coef[k] > 1 ? `${coef[k]}` : ''}${pretty(f)}`;
  const nR = rx.reactants.length;
  return `${rx.reactants.map((f, k) => term(f, k)).join(' + ')} → ${rx.products.map((f, k) => term(f, k + nR)).join(' + ')}`;
}

const g = (n: number) => `${fmt(n, n >= 10 ? 1 : 2)} g`;

const predictions: PredictionTemplate<ReactionParams>[] = [
  {
    id: 'coefficient', label: 'A coefficient in the balanced equation',
    build: p => {
      const r = solveReaction(p);
      // Ask about the species with the largest coefficient: the interesting one.
      const target = r.all.reduce((a, b) => (b.coef > a.coef ? b : a));
      const c = choices(String(target.coef), ['1', '2', '3', '4', '5', '6'].filter(x => Math.abs(Number(x) - target.coef) <= 3), 91);
      return { prompt: `Balance it: ${equationText(p, true)}. What number goes in front of ${pretty(target.formula)}?`, ...c, explain: `${equationText(p)}. Count each element on both sides: ${Object.keys(parseFormula(r.rx.reactants.join(''))).map(el => `${el} ${r.reactants.reduce((s, x) => s + x.coef * (parseFormula(x.formula)[el] ?? 0), 0)}`).join(', ')} on each side.` };
    },
  },
  {
    id: 'type', label: 'Type of reaction',
    build: p => {
      const rx = REACTIONS.find(r => r.key === p.reaction)!;
      const c = choices(rx.type, ['Combination', 'Decomposition', 'Displacement', 'Double displacement', 'Combustion', 'Redox'], 92);
      return { prompt: `${rx.label}: what type of reaction is this?`, ...c, explain: `${equationText(p)}. ${{ Combination: 'Two or more substances join into one.', Decomposition: `One substance breaks down${rx.condition ? ` (by ${rx.condition})` : ''}.`, Displacement: 'A more reactive element pushes a less reactive one out of its compound.', 'Double displacement': 'Two compounds swap partners.', Combustion: 'A fuel burns in oxygen, giving heat and light.', Redox: 'One substance loses oxygen (reduced) while the other gains it (oxidised).' }[rx.type]} ${rx.observe}` };
    },
  },
  {
    id: 'product-mass', label: 'Mass of product formed',
    build: p => {
      const r = solveReaction(p), prod = r.products[0], gv = r.given;
      const wrongRatio = (gv.moles * molarMass(prod.formula));
      const c = choices(g(prod.mass), [g(wrongRatio === prod.mass ? prod.mass * 2 : wrongRatio), g(p.mass), g(prod.mass / 2), g((p.mass * molarMass(prod.formula)) / 100)], 93);
      return {
        prompt: `${g(p.mass)} of ${pretty(gv.formula)} reacts completely. What mass of ${pretty(prod.formula)} forms?`, ...c,
        explain: `${pretty(gv.formula)}: ${fmt(molarMass(gv.formula), 1)} g/mol, so ${g(p.mass)} is ${fmt(gv.moles, 4)} mol. The equation gives ${prod.coef} ${pretty(prod.formula)} for every ${gv.coef} ${pretty(gv.formula)}: ${fmt(prod.moles, 4)} mol × ${fmt(molarMass(prod.formula), 1)} g/mol = ${g(prod.mass)}.`,
      };
    },
  },
  {
    id: 'mass-conserved', label: 'Total mass after',
    applies: p => solveReaction(p).reactants.length > 1 || solveReaction(p).products.length > 1,
    build: p => {
      const r = solveReaction(p);
      const before = r.reactants.reduce((s, x) => s + x.mass, 0), after = r.products.reduce((s, x) => s + x.mass, 0);
      const c = choices(g(after), [g(p.mass), g(after * 1.5), g(r.products[0].mass), g(before / 2)], 94);
      return { prompt: `Using just enough of everything else, what is the total mass of all the products?`, ...c, explain: `Reactants: ${r.reactants.map(x => `${g(x.mass)} ${pretty(x.formula)}`).join(' + ')} = ${g(before)}. Products: ${r.products.map(x => `${g(x.mass)} ${pretty(x.formula)}`).join(' + ')} = ${g(after)}. Mass is neither created nor destroyed.` };
    },
  },
];

export const reactions: LabEngine<ReactionParams> = {
  id: 'reactions',
  title: 'Reaction bench',
  blurb: 'The reactions from the textbook activities: balance the equation, name the type, and work out the masses.',
  subject: 'Science',
  classes: [9, 10],
  chapters: ['Chemical Reactions and Equations', 'Atoms and Molecules'],
  params: [
    { kind: 'choice', key: 'reaction', label: 'Reaction', default: 'mg-o2', options: REACTIONS.map(r => ({ value: r.key, label: r.label })) },
    { kind: 'choice', key: 'given', label: 'Mass given for', default: 'r0', options: [{ value: 'r0', label: 'The first reactant' }, { value: 'r1', label: 'The second reactant' }], show: p => (REACTIONS.find(r => r.key === p.reaction)?.reactants.length ?? 1) > 1 },
    { kind: 'number', key: 'mass', label: 'Mass', unit: 'g', min: 0.1, max: 500, step: 0.1, default: 4.8 },
  ],
  readouts: p => {
    const r = solveReaction(p);
    return [
      { label: 'Balanced', value: equationText(p) },
      { label: 'Type', value: r.rx.type },
      ...r.all.map(x => ({ label: `${pretty(x.formula)} (${fmt(molarMass(x.formula), 1)} g/mol)`, value: `${fmt(x.moles, 4)} mol · ${g(x.mass)}` })),
    ];
  },
  predictions,
};
