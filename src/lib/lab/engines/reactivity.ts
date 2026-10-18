import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Reactivity series (CBSE Class 10 practical: the action of Zn, Fe, Cu and Al
 * on ZnSO₄, FeSO₄, CuSO₄ and Al₂(SO₄)₃ solutions, then arranging them in
 * decreasing order of reactivity). A metal displaces another from its salt
 * solution only if it is more reactive: Al > Zn > Fe > Cu.
 */

export type MetalKey = 'Al' | 'Zn' | 'Fe' | 'Cu';
export type ReactivityParams = { metal: MetalKey; salt: MetalKey };

export const ORDER: MetalKey[] = ['Al', 'Zn', 'Fe', 'Cu'];

export const METALS: Record<MetalKey, { name: string; salt: string; saltName: string; solution: string; solutionHex: string; deposit: string; depositHex: string }> = {
  Al: { name: 'Aluminium', salt: 'Al₂(SO₄)₃', saltName: 'aluminium sulphate', solution: 'colourless', solutionHex: '#F4F8FC', deposit: 'a white-grey coating of aluminium', depositHex: '#C8CDD3' },
  Zn: { name: 'Zinc', salt: 'ZnSO₄', saltName: 'zinc sulphate', solution: 'colourless', solutionHex: '#F4F8FC', deposit: 'a grey coating of zinc', depositHex: '#9AA3AD' },
  Fe: { name: 'Iron', salt: 'FeSO₄', saltName: 'ferrous sulphate', solution: 'pale green', solutionHex: '#CDEBC8', deposit: 'a dark grey-black coating of iron', depositHex: '#4B5563' },
  Cu: { name: 'Copper', salt: 'CuSO₄', saltName: 'copper sulphate', solution: 'blue', solutionHex: '#7EC3F2', deposit: 'a reddish-brown coating of copper', depositHex: '#B4532A' },
};

/** Balanced displacement equations (metal + salt → new salt + metal). */
const EQUATIONS: Partial<Record<`${MetalKey}-${MetalKey}`, string>> = {
  'Al-Zn': '2Al + 3ZnSO₄ → Al₂(SO₄)₃ + 3Zn',
  'Al-Fe': '2Al + 3FeSO₄ → Al₂(SO₄)₃ + 3Fe',
  'Al-Cu': '2Al + 3CuSO₄ → Al₂(SO₄)₃ + 3Cu',
  'Zn-Fe': 'Zn + FeSO₄ → ZnSO₄ + Fe',
  'Zn-Cu': 'Zn + CuSO₄ → ZnSO₄ + Cu',
  'Fe-Cu': 'Fe + CuSO₄ → FeSO₄ + Cu',
};

export function displaces(p: ReactivityParams): boolean {
  return ORDER.indexOf(p.metal) < ORDER.indexOf(p.salt);
}

export function result(p: ReactivityParams) {
  const m = METALS[p.metal], s = METALS[p.salt];
  if (p.metal === p.salt) return { reacts: false, seen: `No change: ${m.name.toLowerCase()} in its own salt solution`, endHex: s.solutionHex, equation: null as string | null };
  if (!displaces(p)) return { reacts: false, seen: `No change: ${m.name.toLowerCase()} is less reactive than ${s.name.toLowerCase()}`, endHex: s.solutionHex, equation: null };
  const end = METALS[p.metal];
  const colour = s.solution === end.solution ? `stays ${s.solution}` : `turns from ${s.solution} to ${end.solution}`;
  return { reacts: true, seen: `The solution ${colour}, and ${s.deposit} forms on the ${m.name.toLowerCase()}`, endHex: end.solutionHex, equation: EQUATIONS[`${p.metal}-${p.salt}`] ?? null };
}

const predictions: PredictionTemplate<ReactivityParams>[] = [
  {
    id: 'reacts', label: 'Does it react?', topic: 'Reactivity series',
    applies: p => p.metal !== p.salt,
    build: p => {
      const r = result(p), m = METALS[p.metal], s = METALS[p.salt];
      const c = choices(r.reacts ? `Yes: ${m.name.toLowerCase()} displaces ${s.name.toLowerCase()}` : 'No: nothing happens', [`Yes: ${m.name.toLowerCase()} displaces ${s.name.toLowerCase()}`, 'No: nothing happens'], 271);
      return { prompt: `A clean piece of ${m.name.toLowerCase()} is put in ${s.saltName} solution. Does a reaction take place?`, ...c, explain: `${r.reacts ? `${m.name} is more reactive than ${s.name.toLowerCase()}, so it displaces it.` : `${m.name} is less reactive than ${s.name.toLowerCase()}, so it cannot displace it.`} Order of reactivity: Al > Zn > Fe > Cu.` };
    },
  },
  {
    id: 'colour', label: 'Colour of the solution after', topic: 'Reactivity series',
    applies: p => displaces(p),
    build: p => {
      const r = result(p), endName = METALS[p.metal].solution, s = METALS[p.salt];
      const c = choices(endName, ['blue', 'pale green', 'colourless'], 272);
      return { prompt: `After some time, what colour is the ${s.saltName} solution (it started ${s.solution})?`, ...c, explain: `${r.seen}. ${r.equation ?? ''}`.trim() };
    },
  },
  {
    id: 'order', label: 'Decreasing order of reactivity', topic: 'Reactivity series',
    build: () => {
      const right = 'Al > Zn > Fe > Cu';
      const c = choices(right, ['Zn > Al > Fe > Cu', 'Cu > Fe > Zn > Al', 'Al > Fe > Zn > Cu'], 273);
      return { prompt: 'From all sixteen tubes, arrange Al, Zn, Fe and Cu in decreasing order of reactivity.', ...c, explain: 'Aluminium displaces all three others; zinc displaces iron and copper; iron displaces only copper; copper displaces none. So Al > Zn > Fe > Cu.' };
    },
  },
];

export const reactivity: LabEngine<ReactivityParams> = {
  id: 'reactivity',
  title: 'Reactivity series',
  blurb: 'Put zinc, iron, copper and aluminium in each other\'s salt solutions and work out which metal is most reactive.',
  subject: 'Science',
  classes: [10],
  chapters: ['Metals and Non-metals'],
  params: [
    { kind: 'choice', key: 'metal', label: 'Metal', default: 'Zn', options: ORDER.map(value => ({ value, label: METALS[value].name })) },
    { kind: 'choice', key: 'salt', label: 'Salt solution', default: 'Cu', options: ORDER.map(value => ({ value, label: `${METALS[value].salt} (${METALS[value].saltName})` })) },
  ],
  readouts: p => {
    const r = result(p);
    return [{ label: 'Observation', value: r.seen }, ...(r.equation ? [{ label: 'Equation', value: r.equation }] : [])];
  },
  predictions,
};
