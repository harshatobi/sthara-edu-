import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REACTIONS, parseFormula } from './engines/reactions';
import { ATOM_COLOUR, ATOM_RADIUS, modelOf } from './molecules';

const species = [...new Set(REACTIONS.flatMap(r => [...r.reactants, ...r.products]))];

test('every species on the reaction bench has a 3D shape with exactly its formula\'s atoms', () => {
  for (const f of species) {
    const m = modelOf(f);
    assert.ok(m, `${f} has no shape`);
    const got: Record<string, number> = {};
    for (const a of m.atoms) got[a.el] = (got[a.el] ?? 0) + 1;
    assert.deepEqual(got, parseFormula(f), `${f} has the wrong atoms`);
  }
});

test('every atom drawn has a colour and a size, and bonds join real atoms', () => {
  for (const f of species) {
    const m = modelOf(f)!;
    for (const a of m.atoms) assert.ok(ATOM_COLOUR[a.el] && ATOM_RADIUS[a.el], `${a.el} in ${f}`);
    for (const [a, b] of m.bonds) assert.ok(a !== b && m.atoms[a] && m.atoms[b], `bad bond in ${f}`);
  }
});

test('shapes are centred and no two atoms sit on top of each other', () => {
  for (const f of species) {
    const m = modelOf(f)!;
    const c = [0, 1, 2].map(k => m.atoms.reduce((s, a) => s + a.at[k], 0) / m.atoms.length);
    assert.ok(c.every(v => Math.abs(v) < 1e-9), `${f} is off centre`);
    m.atoms.forEach((a, i) => m.atoms.slice(i + 1).forEach(b => assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1], a.at[2] - b.at[2]) > 0.6, `${f}: two atoms overlap`)));
  }
});

test('water is bent at 104.5° and methane is tetrahedral', () => {
  const angle = (f: string, i: number, j: number) => {
    const m = modelOf(f)!, o = m.atoms[0].at, u = m.atoms[i].at.map((v, k) => v - o[k]), w = m.atoms[j].at.map((v, k) => v - o[k]);
    return Math.acos(u.reduce((s, v, k) => s + v * w[k], 0) / (Math.hypot(...u) * Math.hypot(...w))) * 180 / Math.PI;
  };
  assert.ok(Math.abs(angle('H2O', 1, 2) - 104.5) < 0.01);
  assert.ok(Math.abs(angle('CH4', 1, 2) - 109.47) < 0.01);
  assert.ok(Math.abs(angle('CO2', 1, 2) - 180) < 0.01);
});
