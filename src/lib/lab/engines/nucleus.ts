import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * The nucleus (Class XII Physics, Nuclei; radioactivity is not in the 2026-27 syllabus).
 *   Size: R = R₀A^(1/3), R₀ = 1.2 fm, so the density is the same for every nucleus.
 *   Mass defect Δm = [Zm_p + (A − Z)m_n] − M; binding energy E_b = Δm c²
 *   (1 u = 931.5 MeV). Binding energy per nucleon rises to a peak near iron
 *   (≈ 8.8 MeV) and falls slowly for heavy nuclei: splitting a heavy nucleus
 *   (fission) or joining light ones (fusion) moves towards the peak and releases energy.
 */

export type NucleusParams = { nuclide: string };

export const MP = 1.007276, MN = 1.008665, U_MEV = 931.5, R0 = 1.2;
/** Nuclear masses (u, atomic mass less the electrons). */
export const NUCLIDES: Record<string, { label: string; Z: number; A: number; M: number }> = {
  h2: { label: 'Deuterium ²H', Z: 1, A: 2, M: 2.013553 },
  he4: { label: 'Helium-4', Z: 2, A: 4, M: 4.001506 },
  li7: { label: 'Lithium-7', Z: 3, A: 7, M: 7.014358 },
  c12: { label: 'Carbon-12', Z: 6, A: 12, M: 11.996709 },
  o16: { label: 'Oxygen-16', Z: 8, A: 16, M: 15.990526 },
  fe56: { label: 'Iron-56', Z: 26, A: 56, M: 55.920679 },
  u235: { label: 'Uranium-235', Z: 92, A: 235, M: 234.993454 },
  u238: { label: 'Uranium-238', Z: 92, A: 238, M: 238.000307 },
};

export function solveNucleus(key: string) {
  const n = NUCLIDES[key] ?? NUCLIDES.he4;
  const dm = n.Z * MP + (n.A - n.Z) * MN - n.M, Eb = dm * U_MEV;
  return { ...n, dm, Eb, perNucleon: Eb / n.A, R: R0 * Math.cbrt(n.A) };
}

const MeV = (x: number) => `${fmt(x, 2)} MeV`;

const predictions: PredictionTemplate<NucleusParams>[] = [
  {
    id: 'defect', label: 'Mass defect and binding energy', topic: 'Mass-energy relation, mass defect',
    build: p => {
      const s = solveNucleus(p.nuclide);
      const c = choices(MeV(s.Eb), [MeV(s.dm * 1000), MeV(s.Eb / s.A), MeV(s.M * U_MEV / 100)], 581);
      return { prompt: `${s.label}: ${s.Z} protons, ${s.A - s.Z} neutrons, nuclear mass ${fmt(s.M, 6)} u. What is its binding energy?`, ...c, explain: `Δm = ${s.Z} × ${MP} + ${s.A - s.Z} × ${MN} − ${fmt(s.M, 6)} = ${fmt(s.dm, 6)} u. E_b = Δm × 931.5 MeV = ${MeV(s.Eb)}.` };
    },
  },
  {
    id: 'per-nucleon', label: 'Binding energy per nucleon', topic: 'Binding energy per nucleon and its variation with mass number',
    build: p => {
      const s = solveNucleus(p.nuclide);
      const c = choices(MeV(s.perNucleon), [MeV(s.Eb), MeV(s.perNucleon * 2), MeV(8.8)].filter(x => x !== MeV(s.perNucleon)), 582);
      return { prompt: `What is the binding energy per nucleon of ${s.label}?`, ...c, explain: `${MeV(s.Eb)} shared over ${s.A} nucleons = ${MeV(s.perNucleon)}. The curve peaks near iron-56 (about 8.8 MeV): the most tightly bound nuclei.` };
    },
  },
  {
    id: 'size', label: 'Radius of the nucleus', topic: 'Composition and size of the nucleus; nuclear force',
    build: p => {
      const s = solveNucleus(p.nuclide);
      const c = choices(`${fmt(s.R, 2)} fm`, [`${fmt(R0 * s.A, 1)} fm`, `${fmt(R0 * Math.sqrt(s.A), 2)} fm`, `${fmt(R0, 2)} fm`], 583);
      return { prompt: `About how big is the ${s.label} nucleus?`, ...c, explain: `R = R₀A^(1/3) = 1.2 × ${s.A}^(1/3) = ${fmt(s.R, 2)} fm (1 fm = 10⁻¹⁵ m). Volume ∝ A, so every nucleus has about the same density, about 2.3 × 10¹⁷ kg/m³.` };
    },
  },
  {
    id: 'why-energy', label: 'Why fission and fusion release energy', topic: 'Nuclear fission and fusion',
    build: p => {
      const heavy = solveNucleus(p.nuclide).A > 56;
      const c = choices(heavy ? 'Splitting it gives nuclei nearer iron, more tightly bound' : 'Joining light nuclei gives nuclei nearer iron, more tightly bound', ['Mass is created in the process', 'The neutrons carry in extra energy', 'Both lose binding energy'], 584);
      return { prompt: `Why can ${heavy ? 'splitting' : 'fusing'} nuclei like ${solveNucleus(p.nuclide).label} release energy?`, ...c, explain: 'The binding energy per nucleon is highest near iron. Moving towards it (fission of heavy nuclei, fusion of light ones) makes the products more tightly bound; the extra binding energy is released, about 200 MeV per uranium fission.' };
    },
  },
];

export const nucleus: LabEngine<NucleusParams> = {
  id: 'nucleus',
  title: 'Nucleus: binding energy',
  blurb: 'Work out the mass defect and binding energy of a nucleus, and see why fission and fusion both release energy.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Nuclei'],
  params: [
    { kind: 'choice', key: 'nuclide', label: 'Nucleus', default: 'he4', options: Object.entries(NUCLIDES).map(([value, n]) => ({ value, label: n.label })) },
  ],
  readouts: p => {
    const s = solveNucleus(p.nuclide);
    return [{ label: 'Mass defect', value: `${fmt(s.dm, 5)} u` }, { label: 'Binding energy', value: MeV(s.Eb) }, { label: 'Per nucleon', value: MeV(s.perNucleon) }, { label: 'Radius', value: `${fmt(s.R, 2)} fm` }];
  },
  predictions,
};
