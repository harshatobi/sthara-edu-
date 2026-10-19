import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Angle of minimum deviation (CBSE Class XII Physics, experiment B5). A ray
 * enters a prism of angle A at incidence i:
 *   sin i = n sin r₁, r₂ = A − r₁, sin e = n sin r₂, deviation δ = i + e − A.
 * δ falls, reaches a minimum δₘ when the ray passes symmetrically (i = e,
 * r₁ = r₂ = A/2), then rises again. Then n = sin((A + δₘ)/2) / sin(A/2).
 */

export type PrismParams = { n: number; A: number; i: number };

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

/** Emergence and deviation for incidence i, or null if the ray is totally reflected inside. */
export function deviationAt(n: number, A: number, i: number): { r1: number; r2: number; e: number; d: number } | null {
  const r1 = deg(Math.asin(Math.sin(rad(i)) / n)), r2 = A - r1;
  const s = n * Math.sin(rad(r2));
  if (s > 1 || r2 < 0) return null;
  const e = deg(Math.asin(s));
  return { r1, r2, e, d: i + e - A };
}
export const minDeviation = (n: number, A: number) => 2 * deg(Math.asin(n * Math.sin(rad(A / 2)))) - A;
export const iAtMin = (n: number, A: number) => (A + minDeviation(n, A)) / 2;
export const nFrom = (A: number, dm: number) => Math.sin(rad((A + dm) / 2)) / Math.sin(rad(A / 2));
/** The smallest incidence that still gets out of the far face. */
export function iMin(n: number, A: number) {
  for (let i = 0; i <= 90; i += 0.5) if (deviationAt(n, A, i)) return i;
  return 90;
}

const dg = (x: number) => `${fmt(x, 1)}°`;
const PRISM = 'Refraction through a prism';

const predictions: PredictionTemplate<PrismParams>[] = [
  {
    id: 'deviation', label: 'Angle of deviation', topic: PRISM,
    build: p => {
      const r = deviationAt(p.n, p.A, p.i)!;
      const c = choices(dg(r.d), [dg(r.e - p.A), dg(p.i - r.r1), dg(r.d + 10)], 471);
      return { prompt: `Light falls at ${dg(p.i)} on a ${dg(p.A)} prism of refractive index ${p.n}. What is the angle of deviation?`, ...c, explain: `r₁ = sin⁻¹(sin ${fmt(p.i, 0)}°/${p.n}) = ${dg(r.r1)}, r₂ = A − r₁ = ${dg(r.r2)}, e = sin⁻¹(${p.n} sin ${fmt(r.r2, 1)}°) = ${dg(r.e)}. δ = i + e − A = ${dg(r.d)}.` };
    },
  },
  {
    id: 'minimum', label: 'Minimum deviation', topic: PRISM,
    build: p => {
      const dm = minDeviation(p.n, p.A);
      const c = choices(dg(dm), [dg(dm + 8), dg(dm - 8), dg(p.A)], 472);
      return { prompt: `What is the smallest deviation this prism (A = ${dg(p.A)}, n = ${p.n}) can give?`, ...c, explain: `At minimum deviation the ray goes through symmetrically, r = A/2: sin((A + δₘ)/2) = n sin(A/2), so δₘ = 2 sin⁻¹(${p.n} × sin ${fmt(p.A / 2, 1)}°) − ${fmt(p.A, 0)}° = ${dg(dm)}.` };
    },
  },
  {
    id: 'shape', label: 'Shape of the i-δ graph', topic: PRISM,
    build: p => {
      const c = choices(`It falls to a minimum near i = ${dg(iAtMin(p.n, p.A))}, then rises`, ['A straight line rising from the origin', 'It keeps falling', 'It rises to a maximum, then falls'], 473);
      return { prompt: 'As the angle of incidence increases, what does the deviation do?', ...c, explain: 'δ = i + e − A: at small i the emergent ray grazes out (e large); at large i the incident ray grazes in. In between, at i = e, δ is least. The graph is a U.' };
    },
  },
  {
    id: 'n', label: 'Refractive index from δₘ', topic: PRISM,
    build: p => {
      const dm = minDeviation(p.n, p.A);
      const c = choices(String(p.n), [fmt(Math.sin(rad(p.A + dm)) / Math.sin(rad(p.A)), 2), fmt((p.A + dm) / p.A, 2), fmt(p.n + 0.1, 2)], 474);
      return { prompt: `From the graph δₘ = ${dg(dm)} for A = ${dg(p.A)}. What is the refractive index of the glass?`, ...c, explain: `n = sin((A + δₘ)/2) / sin(A/2) = sin ${fmt((p.A + dm) / 2, 2)}° / sin ${fmt(p.A / 2, 1)}° = ${fmt(nFrom(p.A, dm), 3)}.` };
    },
  },
];

export const prismDev: LabEngine<PrismParams> = {
  id: 'prism-dev',
  title: 'Prism: angle of minimum deviation',
  blurb: 'Trace a ray through a prism at each angle of incidence and plot i against δ to find the minimum deviation and the refractive index.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Ray Optics and Optical Instruments'],
  params: [
    { kind: 'number', key: 'n', label: 'Refractive index', unit: '', min: 1.4, max: 1.7, step: 0.01, default: 1.52 },
    { kind: 'number', key: 'A', label: 'Angle of the prism', unit: '°', min: 45, max: 65, step: 1, default: 60 },
    { kind: 'number', key: 'i', label: 'Angle of incidence', unit: '°', min: 25, max: 75, step: 1, default: 40 },
  ],
  check: p => (deviationAt(p.n, p.A, p.i) ? null : `At ${p.i}° the ray is totally reflected at the second face: increase the angle of incidence.`),
  readouts: p => {
    const r = deviationAt(p.n, p.A, p.i)!;
    return [{ label: 'r₁', value: dg(r.r1) }, { label: 'r₂', value: dg(r.r2) }, { label: 'Emergence e', value: dg(r.e) }, { label: 'Deviation δ', value: dg(r.d) }, { label: 'Minimum δₘ', value: dg(minDeviation(p.n, p.A)) }];
  },
  predictions,
};
