/**
 * Shapes for the 3D reaction bench: where each atom of a species sits and
 * which atoms are joined by a covalent bond. Distances are in ångströms and
 * bond angles are the accepted ones (water 104.5°, methane tetrahedral …).
 *
 * Ionic compounds are drawn as one formula unit with the ions touching and no
 * stick between them: a real crystal is a lattice, which this view does not
 * show yet. Every model has exactly the atoms its formula names (tested).
 */

export type Vec = [number, number, number];
export interface Model { atoms: { el: string; at: Vec }[]; bonds: [number, number][] }

export const ATOM_COLOUR: Record<string, string> = {
  H: '#E2E8F0', O: '#E11D48', C: '#334155', N: '#2F6BFF', Na: '#A855F7', Mg: '#94A3B8', Al: '#CBD5E1', S: '#EAB308', Cl: '#22C55E',
  Ca: '#F97316', Fe: '#B45309', Cu: '#C2410C', Zn: '#64748B', Ag: '#D1D5DB', Ba: '#14B8A6', Pb: '#475569', K: '#8B5CF6',
};

/** Drawn size of each atom (Å): smaller than the real atom so bonds stay visible, in the right order of size. */
export const ATOM_RADIUS: Record<string, number> = {
  H: 0.3, C: 0.42, N: 0.4, O: 0.4, S: 0.52, Cl: 0.5, Na: 0.58, Mg: 0.55, Al: 0.55, K: 0.68,
  Ca: 0.62, Fe: 0.56, Cu: 0.55, Zn: 0.55, Ag: 0.62, Ba: 0.72, Pb: 0.68,
};
export const radiusOf = (el: string) => ATOM_RADIUS[el] ?? 0.5;

const RAD = Math.PI / 180;
const one = (el: string): Model => ({ atoms: [{ el, at: [0, 0, 0] }], bonds: [] });
const shift = (m: Model, [dx, dy, dz]: Vec): Model => ({ atoms: m.atoms.map(a => ({ el: a.el, at: [a.at[0] + dx, a.at[1] + dy, a.at[2] + dz] as Vec })), bonds: m.bonds });
/** Turns a model to face the other way along x (so an O-H points outward on both sides of a cation). */
const flip = (m: Model): Model => ({ atoms: m.atoms.map(a => ({ el: a.el, at: [-a.at[0], a.at[1], -a.at[2]] as Vec })), bonds: m.bonds });
function merge(...parts: Model[]): Model {
  const out: Model = { atoms: [], bonds: [] };
  for (const p of parts) {
    const base = out.atoms.length;
    out.atoms.push(...p.atoms);
    out.bonds.push(...p.bonds.map(([a, b]) => [a + base, b + base] as [number, number]));
  }
  return out;
}
/** A central atom with outer atoms bonded to it, in the given directions. */
const around = (centre: string, outer: string, d: number, dirs: Vec[]): Model => ({
  atoms: [{ el: centre, at: [0, 0, 0] }, ...dirs.map(v => ({ el: outer, at: [v[0] * d, v[1] * d, v[2] * d] as Vec }))],
  bonds: dirs.map((_, i) => [0, i + 1] as [number, number]),
});
const diatomic = (el: string, d: number): Model => ({ atoms: [{ el, at: [-d / 2, 0, 0] }, { el, at: [d / 2, 0, 0] }], bonds: [[0, 1]] });
const bent = (centre: string, outer: string, d: number, angle: number): Model => {
  const h = (angle / 2) * RAD;
  return around(centre, outer, d, [[Math.sin(h), -Math.cos(h), 0], [-Math.sin(h), -Math.cos(h), 0]]);
};
const PLANAR: Vec[] = [0, 120, 240].map(a => [Math.cos(a * RAD), Math.sin(a * RAD), 0] as Vec);
const T = 1 / Math.sqrt(3);
const TETRA: Vec[] = [[T, T, T], [T, -T, -T], [-T, T, -T], [-T, -T, T]];
const planar = (centre: string, outer: string, d: number) => around(centre, outer, d, PLANAR);
const tetra = (centre: string, outer: string, d: number) => around(centre, outer, d, TETRA);
/** Two ions side by side, touching. */
const ionPair = (cation: string, anion: string): Model => {
  const d = radiusOf(cation) + radiusOf(anion);
  return { atoms: [{ el: cation, at: [-d / 2, 0, 0] }, { el: anion, at: [d / 2, 0, 0] }], bonds: [] };
};

const SULPHATE = tetra('S', 'O', 1.49), NITRATE = planar('N', 'O', 1.25), CARBONATE = planar('C', 'O', 1.29);
const HYDROXIDE: Model = { atoms: [{ el: 'O', at: [0, 0, 0] }, { el: 'H', at: [0.96, 0, 0] }], bonds: [[0, 1]] };
/** How far a cation sits from the centre of a polyatomic ion (bond length + room for both atoms). */
const reach = (bond: number, cation: string) => bond + radiusOf('O') * 0.6 + radiusOf(cation);
const withCation = (cation: string, anion: Model, bond: number) => merge(shift(one(cation), [-reach(bond, cation), 0, 0]), anion);

const SHAPES: Record<string, () => Model> = {
  H2: () => diatomic('H', 0.74),
  O2: () => diatomic('O', 1.21),
  Cl2: () => diatomic('Cl', 1.99),
  H2O: () => bent('O', 'H', 0.96, 104.5),
  SO2: () => bent('S', 'O', 1.43, 119),
  NO2: () => bent('N', 'O', 1.2, 134),
  CO2: () => around('C', 'O', 1.16, [[1, 0, 0], [-1, 0, 0]]),
  SO3: () => planar('S', 'O', 1.42),
  CH4: () => tetra('C', 'H', 1.09),
  // Sulphuric acid: a sulphur with four oxygens around it, two of them carrying a hydrogen.
  H2SO4: () => {
    const m = tetra('S', 'O', 1.5);
    const h = (i: number) => ({ el: 'H', at: TETRA[i].map(v => v * 2.47) as Vec });
    return { atoms: [...m.atoms, h(0), h(1)], bonds: [...m.bonds, [1, 5], [2, 6]] };
  },
  Mg: () => one('Mg'), Fe: () => one('Fe'), Zn: () => one('Zn'), Cu: () => one('Cu'), Ag: () => one('Ag'),
  MgO: () => ionPair('Mg', 'O'), CaO: () => ionPair('Ca', 'O'), PbO: () => ionPair('Pb', 'O'), CuO: () => ionPair('Cu', 'O'),
  AgCl: () => ionPair('Ag', 'Cl'), NaCl: () => ionPair('Na', 'Cl'),
  BaCl2: () => { const d = radiusOf('Ba') + radiusOf('Cl'); return merge(shift(one('Cl'), [-d, 0, 0]), one('Ba'), shift(one('Cl'), [d, 0, 0])); },
  'Ca(OH)2': () => { const d = radiusOf('Ca') + radiusOf('O'); return merge(shift(flip(HYDROXIDE), [-d, 0, 0]), one('Ca'), shift(HYDROXIDE, [d, 0, 0])); },
  CaCO3: () => withCation('Ca', CARBONATE, 1.29),
  FeSO4: () => withCation('Fe', SULPHATE, 1.49),
  CuSO4: () => withCation('Cu', SULPHATE, 1.49),
  ZnSO4: () => withCation('Zn', SULPHATE, 1.49),
  BaSO4: () => withCation('Ba', SULPHATE, 1.49),
  Na2SO4: () => { const d = reach(1.49, 'Na'); return merge(shift(one('Na'), [-d, 0, 0]), SULPHATE, shift(one('Na'), [d, 0, 0])); },
  'Pb(NO3)2': () => { const d = reach(1.25, 'Pb'); return merge(shift(NITRATE, [-d, 0, 0]), one('Pb'), shift(NITRATE, [d, 0, 0])); },
  // Ferric oxide: two iron ions held between three oxide ions.
  Fe2O3: () => {
    const d = radiusOf('Fe') + radiusOf('O'), x = d * 0.82, y = d * 0.57;
    return { atoms: [{ el: 'O', at: [-2 * x, y / 2, 0] }, { el: 'Fe', at: [-x, -y / 2, 0] }, { el: 'O', at: [0, y / 2, 0] }, { el: 'Fe', at: [x, -y / 2, 0] }, { el: 'O', at: [2 * x, y / 2, 0] }], bonds: [] };
  },
};

export const hasModel = (formula: string) => formula in SHAPES;

/** The species' shape, centred on its middle; null when it has not been modelled. */
export function modelOf(formula: string): Model | null {
  const make = SHAPES[formula];
  if (!make) return null;
  const m = make(), n = m.atoms.length;
  const c = m.atoms.reduce((s, a) => [s[0] + a.at[0] / n, s[1] + a.at[1] / n, s[2] + a.at[2] / n] as Vec, [0, 0, 0] as Vec);
  return shift(m, [-c[0], -c[1], -c[2]]);
}

/** Half the width and half the height of a model as drawn, to the outside of its atoms. */
export const halfSizeOf = (m: Model): [number, number] => [0, 1].map(k => Math.max(...m.atoms.map(a => Math.abs(a.at[k]) + radiusOf(a.el)))) as [number, number];
