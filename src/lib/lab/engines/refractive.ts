import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Refractive index (CBSE Class XII Physics, experiments B6, B7, B8 and activity B4).
 *
 * Travelling microscope (B6): focus on a mark (R₁), put the slab on it and refocus
 *   on the mark seen through the glass (R₂), then on powder on the top (R₃).
 *   Real depth R₃ − R₁, apparent depth R₃ − R₂, n = real/apparent.
 * Lens and plane mirror (B7): a convex lens on a mirror, with a needle above, gives
 *   an image on the needle at its focal length f₁. A few drops of liquid under the
 *   lens form a plano-concave liquid lens; the pair has F. Then the liquid lens has
 *   1/f_l = 1/F − 1/f₁ and, with the lens surface radius R (spherometer),
 *   n = 1 + R/|f_l|.
 * Concave mirror and liquid (B8): the needle's image coincides with it at the
 *   centre of curvature, R. With liquid in the mirror the rays bend at the surface
 *   and the point comes down to R' = R/n, so n = R/R'.
 * Glass slab (activity B4): a ray at incidence i comes out parallel, shifted
 *   sideways by d = t sin(i − r)/cos r.
 */

export type RefractiveParams = { mode: string; n: number; t: number; f1: number; R: number; i: number };

/** Glass of the convex lens in B7 (equiconvex, so its surface radius R = 2(n_g − 1)f₁). */
export const N_GLASS = 1.5;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

export const apparentDepth = (t: number, n: number) => t / n;
export function liquidLens(f1: number, n: number) {
  const R = 2 * (N_GLASS - 1) * f1;
  const fl = -R / (n - 1); // plano-concave liquid lens
  const F = 1 / (1 / f1 + 1 / fl);
  return { R, fl, F };
}
export const mirrorLiquid = (R: number, n: number) => R / n;
export function lateralShift(t: number, n: number, i: number) {
  const r = deg(Math.asin(Math.sin(rad(i)) / n));
  return { r, d: (t * Math.sin(rad(i - r))) / Math.cos(rad(r)) };
}

const cm = (x: number, dp = 2) => `${fmt(x, dp)} cm`;
const REFRACTION = 'Refraction; total internal reflection and optical fibres';
const LENS = "Refraction at spherical surfaces; lenses; thin lens formula; lens maker's formula";

const predictions: PredictionTemplate<RefractiveParams>[] = [
  {
    id: 'apparent', label: 'Apparent depth', topic: REFRACTION,
    applies: p => p.mode === 'microscope',
    build: p => {
      const a = apparentDepth(p.t, p.n);
      const c = choices(cm(a, 3), [cm(p.t * p.n, 3), cm(p.t, 3), cm(p.t - a, 3)], 481);
      return { prompt: `A slab ${cm(p.t)} thick, n = ${p.n}. Through it, how deep does the mark under it appear?`, ...c, explain: `Apparent depth = real depth / n = ${fmt(p.t, 2)} / ${p.n} = ${cm(a, 3)}. The mark seems raised by ${cm(p.t - a, 3)}, so the microscope must be raised that much to refocus.` };
    },
  },
  {
    id: 'n-microscope', label: 'n from the three readings', topic: REFRACTION,
    applies: p => p.mode === 'microscope',
    build: p => {
      const R1 = 5, R3 = R1 + p.t, R2 = R3 - apparentDepth(p.t, p.n);
      const c = choices(String(p.n), [fmt((R3 - R1) / (R2 - R1), 2), fmt((R2 - R1) / (R3 - R1), 2), fmt(p.n + 0.1, 2)], 482);
      return { prompt: `Readings: mark ${cm(R1, 3)}, mark through the slab ${cm(R2, 3)}, top of the slab ${cm(R3, 3)}. What is n?`, ...c, explain: `n = real/apparent = (R₃ − R₁)/(R₃ − R₂) = ${fmt(R3 - R1, 3)} / ${fmt(R3 - R2, 3)} = ${p.n}.` };
    },
  },
  {
    id: 'liquid-lens', label: 'Refractive index of the liquid (lens)', topic: LENS,
    applies: p => p.mode === 'lens-liquid',
    build: p => {
      const s = liquidLens(p.f1, p.n);
      const c = choices(String(p.n), [fmt(1 + s.R / Math.abs(s.F), 2), fmt(s.F / p.f1, 2), fmt(p.n - 0.15, 2)], 483);
      return { prompt: `The lens alone gives f₁ = ${cm(p.f1, 1)}; with the liquid, F = ${cm(s.F, 1)}; its surface radius is R = ${cm(s.R, 1)}. What is the liquid's refractive index?`, ...c, explain: `1/f_l = 1/F − 1/f₁ gives f_l = ${cm(s.fl, 1)} (a plano-concave liquid lens). For it, 1/f_l = (n − 1)(−1/R), so n = 1 + R/|f_l| = 1 + ${fmt(s.R, 1)}/${fmt(Math.abs(s.fl), 1)} = ${fmt(1 + s.R / Math.abs(s.fl), 2)}.` };
    },
  },
  {
    id: 'liquid-longer', label: 'Adding the liquid', topic: LENS,
    applies: p => p.mode === 'lens-liquid',
    build: () => {
      const c = choices('The needle must be raised: the focal length gets longer', ['It must be lowered', 'It stays where it was', 'No image can be found any more'], 484);
      return { prompt: 'With liquid under the lens, where must the needle go to coincide with its image again?', ...c, explain: 'The liquid forms a weak diverging (plano-concave) lens. In contact with the convex lens it reduces the total power, so the combination\'s focal length is longer than the lens\'s alone.' };
    },
  },
  {
    id: 'mirror-liquid', label: 'Liquid in the concave mirror', topic: REFRACTION,
    applies: p => p.mode === 'mirror-liquid',
    build: p => {
      const r = mirrorLiquid(p.R, p.n);
      const c = choices(cm(r, 1), [cm(p.R * p.n, 1), cm(p.R, 1), cm(p.R / 2, 1)], 485);
      return { prompt: `The needle coincides with its image ${cm(p.R, 1)} above the mirror. A little liquid of n = ${p.n} is poured in. Where does it coincide now?`, ...c, explain: `The liquid bends the rays, so they strike the mirror normally from a nearer point: R' = R/n = ${fmt(p.R, 1)}/${p.n} = ${cm(r, 1)}. Then n = R/R'.` };
    },
  },
  {
    id: 'shift', label: 'Lateral shift through the slab', topic: REFRACTION,
    applies: p => p.mode === 'slab',
    build: p => {
      const s = lateralShift(p.t, p.n, p.i);
      const c = choices(cm(s.d), [cm(p.t * Math.sin(rad(p.i))), '0 cm: it goes straight on', cm(s.d * 2)], 486);
      return { prompt: `A ray hits a ${cm(p.t, 1)} slab (n = ${p.n}) at ${fmt(p.i, 0)}°. How far is the emergent ray shifted sideways?`, ...c, explain: `r = sin⁻¹(sin ${fmt(p.i, 0)}°/${p.n}) = ${fmt(s.r, 1)}°, d = t sin(i − r)/cos r = ${cm(s.d)}. It comes out parallel to the incident ray.` };
    },
  },
];

export const refractive: LabEngine<RefractiveParams> = {
  id: 'refractive',
  title: 'Refractive index of glass and liquids',
  blurb: 'Real and apparent depth with a travelling microscope, a liquid lens under a convex lens, liquid in a concave mirror, and the sideways shift through a slab.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Ray Optics and Optical Instruments'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Method', default: 'microscope', options: [{ value: 'microscope', label: 'Travelling microscope' }, { value: 'lens-liquid', label: 'Liquid: convex lens and plane mirror' }, { value: 'mirror-liquid', label: 'Liquid: concave mirror' }, { value: 'slab', label: 'Lateral shift through a slab' }] },
    { kind: 'number', key: 'n', label: 'Refractive index', unit: '', min: 1.3, max: 1.7, step: 0.01, default: 1.5 },
    { kind: 'number', key: 't', label: 'Slab thickness', unit: 'cm', min: 1, max: 6, step: 0.1, default: 3, show: p => p.mode === 'microscope' || p.mode === 'slab' },
    { kind: 'number', key: 'f1', label: 'Convex lens focal length', unit: 'cm', min: 10, max: 30, step: 1, default: 15, show: p => p.mode === 'lens-liquid' },
    { kind: 'number', key: 'R', label: 'Mirror radius of curvature', unit: 'cm', min: 20, max: 60, step: 1, default: 40, show: p => p.mode === 'mirror-liquid' },
    { kind: 'number', key: 'i', label: 'Angle of incidence', unit: '°', min: 10, max: 75, step: 1, default: 45, show: p => p.mode === 'slab' },
  ],
  readouts: p => {
    if (p.mode === 'microscope') return [{ label: 'Real depth', value: cm(p.t, 3) }, { label: 'Apparent depth', value: cm(apparentDepth(p.t, p.n), 3) }, { label: 'Raised by', value: cm(p.t - apparentDepth(p.t, p.n), 3) }];
    if (p.mode === 'lens-liquid') { const s = liquidLens(p.f1, p.n); return [{ label: 'Lens alone f₁', value: cm(s.R / (2 * (N_GLASS - 1)), 1) }, { label: 'With liquid F', value: cm(s.F, 1) }, { label: 'Liquid lens f_l', value: cm(s.fl, 1) }, { label: 'Surface radius R', value: cm(s.R, 1) }]; }
    if (p.mode === 'mirror-liquid') return [{ label: 'Without liquid R', value: cm(p.R, 1) }, { label: 'With liquid R\'', value: cm(mirrorLiquid(p.R, p.n), 1) }];
    const s = lateralShift(p.t, p.n, p.i);
    return [{ label: 'Angle of refraction', value: `${fmt(s.r, 1)}°` }, { label: 'Lateral shift', value: cm(s.d) }];
  },
  predictions,
};
