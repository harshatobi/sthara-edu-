import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Circuit builder: an ideal cell (no internal resistance, as in NCERT Class 10
 * Ch "Electricity") driving two or three resistors in series, in parallel, or
 * R1 in series with R2 ‖ R3. Ohm's law, power and Joule heating.
 */

export type Topology = 'series' | 'parallel' | 'mixed';
export type CircuitParams = { topology: Topology; count: '2' | '3'; v: number; r1: number; r2: number; r3: number; t: number };

export interface Branch { name: string; r: number; i: number; v: number; p: number; heat: number }
export interface CircuitResult { req: number; i: number; p: number; branches: Branch[] }

export const TOPOLOGY_LABEL: Record<Topology, string> = { series: 'Series', parallel: 'Parallel', mixed: 'R1 then R2 ‖ R3' };

const par = (...rs: number[]) => 1 / rs.reduce((s, r) => s + 1 / r, 0);

export function solveCircuit(p: CircuitParams): CircuitResult {
  const rs = (p.count === '3' || p.topology === 'mixed' ? [p.r1, p.r2, p.r3] : [p.r1, p.r2]);
  const branch = (k: number, i: number): Branch => ({ name: `R${k + 1}`, r: rs[k], i, v: i * rs[k], p: i * i * rs[k], heat: i * i * rs[k] * p.t });
  let req: number, branches: Branch[];
  if (p.topology === 'series') {
    req = rs.reduce((s, r) => s + r, 0);
    const i = p.v / req;
    branches = rs.map((_, k) => branch(k, i));
  } else if (p.topology === 'parallel') {
    req = par(...rs);
    branches = rs.map((r, k) => branch(k, p.v / r));
  } else {
    const r23 = par(rs[1], rs[2]);
    req = rs[0] + r23;
    const i = p.v / req, v23 = i * r23;
    branches = [branch(0, i), branch(1, v23 / rs[1]), branch(2, v23 / rs[2])];
  }
  const i = p.v / req;
  return { req, i, p: p.v * i, branches };
}

const ohm = (n: number) => `${fmt(n, 2)} Ω`;
const amp = (n: number) => `${fmt(n, 3)} A`;

function reqWorking(p: CircuitParams, r: CircuitResult): string {
  const rs = r.branches.map(b => fmt(b.r, 2));
  if (p.topology === 'series') return `In series, R = ${rs.join(' + ')} = ${ohm(r.req)}.`;
  if (p.topology === 'parallel') return `In parallel, 1/R = ${rs.map(x => `1/${x}`).join(' + ')}, so R = ${ohm(r.req)}.`;
  return `R2 ‖ R3 = ${ohm(par(r.branches[1].r, r.branches[2].r))}; adding R1 in series gives R = ${ohm(r.req)}.`;
}

const predictions: PredictionTemplate<CircuitParams>[] = [
  {
    id: 'total-resistance', label: 'Total resistance',
    build: p => {
      const r = solveCircuit(p), rs = r.branches.map(b => b.r);
      const sum = rs.reduce((s, x) => s + x, 0);
      const c = choices(ohm(r.req), [ohm(sum), ohm(par(...rs)), ohm(sum / rs.length), ohm(Math.min(...rs))], 11);
      return { prompt: 'What is the total resistance of the circuit?', ...c, explain: reqWorking(p, r) };
    },
  },
  {
    id: 'total-current', label: 'Current from the cell',
    build: p => {
      const r = solveCircuit(p), rs = r.branches.map(b => b.r);
      const sum = rs.reduce((s, x) => s + x, 0);
      const c = choices(amp(r.i), [amp(p.v / sum), amp(p.v / par(...rs)), amp(p.v * r.req / 100), amp(p.v / rs[0])], 12);
      return { prompt: `How much current flows from the ${fmt(p.v, 1)} V cell?`, ...c, explain: `${reqWorking(p, r)} I = V/R = ${fmt(p.v, 1)}/${fmt(r.req, 2)} = ${amp(r.i)}.` };
    },
  },
  {
    id: 'most-power', label: 'Which resistor heats up most',
    applies: p => {
      const ps = solveCircuit(p).branches.map(b => b.p), top = Math.max(...ps);
      return ps.filter(x => Math.abs(x - top) < 1e-9 * Math.max(1, top)).length === 1;
    },
    build: p => {
      const r = solveCircuit(p);
      const best = r.branches.reduce((a, b) => (b.p > a.p ? b : a));
      const c = choices(best.name, r.branches.map(b => b.name), 13);
      return {
        prompt: 'Which resistor gives off the most heat each second?', ...c,
        explain: `P = I²R: ${r.branches.map(b => `${b.name} ${fmt(b.p, 2)} W`).join(', ')}. ${p.topology === 'series' ? 'Same current, so the biggest resistor wins.' : p.topology === 'parallel' ? 'Same voltage, so the smallest resistor draws the most current and wins.' : ''}`.trim(),
      };
    },
  },
  {
    id: 'same-for-all', label: 'What every resistor shares',
    applies: p => p.topology !== 'mixed',
    build: p => {
      const r = solveCircuit(p);
      const right = p.topology === 'series' ? 'The current through each' : 'The voltage across each';
      const c = choices(right, ['The current through each', 'The voltage across each', 'The power in each', 'Nothing is the same'], 14);
      return {
        prompt: 'What is the same for every resistor in this circuit?', ...c,
        explain: p.topology === 'series'
          ? `In series one current flows through everything: ${amp(r.i)}; the voltages split ${r.branches.map(b => `${fmt(b.v, 2)} V`).join(' + ')} = ${fmt(p.v, 1)} V.`
          : `In parallel each resistor sits across the cell: ${fmt(p.v, 1)} V each; the currents add ${r.branches.map(b => amp(b.i)).join(' + ')} = ${amp(r.i)}.`,
      };
    },
  },
  {
    id: 'heat-r1', label: 'Heat produced in R1',
    build: p => {
      const r = solveCircuit(p), b = r.branches[0];
      const j = (n: number) => `${fmt(n, n >= 100 ? 0 : 2)} J`;
      const c = choices(j(b.heat), [j(b.i * b.r * p.t), j(b.i * b.i * b.r), j(b.v * p.t), j(b.heat * 2)], 15);
      return { prompt: `How much heat does R1 produce in ${fmt(p.t, 0)} s?`, ...c, explain: `H = I²Rt = ${fmt(b.i, 3)}² × ${fmt(b.r, 2)} × ${fmt(p.t, 0)} = ${j(b.heat)}.` };
    },
  },
];

export const circuits: LabEngine<CircuitParams> = {
  id: 'circuits',
  title: 'Circuit builder',
  blurb: 'Resistors in series and parallel: current, voltage, power and heating, with meters on every part.',
  subject: 'Science',
  classes: [10],
  chapters: ['Electricity'],
  params: [
    { kind: 'choice', key: 'topology', label: 'Connection', default: 'series', options: (Object.keys(TOPOLOGY_LABEL) as Topology[]).map(value => ({ value, label: TOPOLOGY_LABEL[value] })) },
    { kind: 'choice', key: 'count', label: 'Resistors', default: '3', options: [{ value: '2', label: 'Two' }, { value: '3', label: 'Three' }] },
    { kind: 'number', key: 'v', label: 'Cell voltage', unit: 'V', min: 1, max: 24, step: 0.5, default: 6 },
    { kind: 'number', key: 'r1', label: 'R1', unit: 'Ω', min: 1, max: 100, step: 1, default: 5 },
    { kind: 'number', key: 'r2', label: 'R2', unit: 'Ω', min: 1, max: 100, step: 1, default: 10 },
    { kind: 'number', key: 'r3', label: 'R3', unit: 'Ω', min: 1, max: 100, step: 1, default: 30 },
    { kind: 'number', key: 't', label: 'Time switched on', unit: 's', min: 1, max: 600, step: 1, default: 60 },
  ],
  // R1 then R2 ‖ R3 needs all three.
  check: p => (p.topology === 'mixed' && p.count !== '3' ? 'The mixed circuit needs three resistors.' : null),
  readouts: p => {
    const r = solveCircuit(p);
    return [
      { label: 'Total resistance', value: ohm(r.req) },
      { label: 'Current from cell', value: amp(r.i) },
      { label: 'Total power', value: `${fmt(r.p, 2)} W` },
      ...r.branches.map(b => ({ label: b.name, value: `${amp(b.i)} · ${fmt(b.v, 2)} V · ${fmt(b.p, 2)} W` })),
    ];
  },
  predictions,
};
