import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Optical bench (CBSE Class XII Physics, experiments B1-B4, activities B6 and B7).
 * Distances are magnitudes in cm, measured from the pole or optical centre.
 *
 * Concave mirror: 1/v + 1/u = 1/f (real object and image in front: f = uv/(u + v)).
 * Convex lens:    1/v + 1/u = 1/f in magnitudes for a real image (1/v − 1/u = 1/f with signs).
 * Convex mirror (with a convex lens): the lens alone forms an image I at v₁. The
 *   mirror is placed between them where the image coincides with the object
 *   (rays strike it normally): the mirror's centre of curvature is at I, so
 *   R = v₁ − x (x = lens to mirror) and f = R/2.
 * Concave lens (with a convex lens): the convex lens's image I₁ (at v₁) is the
 *   virtual object for the concave lens d further on; the final image moves out
 *   to v₂. With u' = v₁ − d and v' = v₂ − d: f = u'v'/(v' − u') (concave: negative).
 * Lenses in contact: 1/F = 1/f₁ + 1/f₂ (activity B7).
 */

export type BenchParams = { device: string; f: number; u: number; f2: number };

/** Real image distance for a converging element (concave mirror, convex lens). */
export const imageOf = (f: number, u: number) => (u * f) / (u - f);
export const combined = (f1: number, f2: number) => (f1 * f2) / (f1 + f2);

/** Everything a bench reading needs for the chosen set-up (cm). */
export interface BenchSolution { v: number; m: number; F: number; v1?: number; R?: number; x?: number; d?: number; v2?: number; uc?: number; vc?: number }

export function solveBench(p: BenchParams): BenchSolution {
  if (p.device === 'combo') { const F = combined(p.f, p.f2); return { F, v: imageOf(F, p.u), m: imageOf(F, p.u) / p.u }; }
  const v1 = imageOf(p.f, p.u);
  if (p.device === 'convex-mirror') { const R = 2 * p.f2; return { v1, R, x: v1 - R, F: p.f2, v: v1, m: v1 / p.u }; }
  if (p.device === 'concave-lens') {
    const uc = 0.5 * p.f2, d = v1 - uc, vc = 1 / (1 / uc - 1 / p.f2); // virtual object inside the focal length gives a real image
    return { v1, d, v2: d + vc, uc, vc, F: -p.f2, v: d + vc, m: v1 / p.u };
  }
  const v = imageOf(p.f, p.u);
  return { v, m: v / p.u, F: p.f };
}

const cm = (x: number) => `${fmt(x, 1)} cm`;
const MIRROR = 'Reflection; spherical mirrors; mirror formula';
const LENS = "Refraction at spherical surfaces; lenses; thin lens formula; lens maker's formula";
const MAG = 'Magnification; power of a lens; combination of thin lenses in contact';
const NAMES: Record<string, string> = { 'concave-mirror': 'concave mirror', 'convex-lens': 'convex lens', 'convex-mirror': 'convex mirror', 'concave-lens': 'concave lens', combo: 'pair of lenses in contact' };

const predictions: PredictionTemplate<BenchParams>[] = [
  {
    id: 'v', label: 'Where the image forms', topic: p => (p.device === 'concave-mirror' ? MIRROR : LENS),
    applies: p => p.device === 'concave-mirror' || p.device === 'convex-lens',
    build: p => {
      const v = imageOf(p.f, p.u);
      const c = choices(cm(v), [cm(p.u), cm(p.f), cm((p.u * p.f) / (p.u + p.f))].filter(x => x !== cm(v)), 461);
      return { prompt: `A ${NAMES[p.device]} of focal length ${cm(p.f)}, the needle ${cm(p.u)} away. Where is the image?`, ...c, explain: `1/v = 1/f − 1/u = 1/${fmt(p.f, 0)} − 1/${fmt(p.u, 0)}, so v = uf/(u − f) = ${cm(v)} (real, ${p.device === 'concave-mirror' ? 'in front of the mirror' : 'on the other side of the lens'}).` };
    },
  },
  {
    id: 'nature', label: 'Size and nature of the image', topic: MAG,
    applies: p => p.device === 'concave-mirror' || p.device === 'convex-lens',
    build: p => {
      const m = imageOf(p.f, p.u) / p.u;
      const right = m > 1.02 ? 'Real, inverted, magnified' : m < 0.98 ? 'Real, inverted, diminished' : 'Real, inverted, the same size';
      const c = choices(right, ['Real, inverted, magnified', 'Real, inverted, diminished', 'Virtual, erect, magnified', 'Real, inverted, the same size'].filter(x => x !== right), 462);
      return { prompt: `The candle is ${cm(p.u)} from a ${NAMES[p.device]} of f = ${cm(p.f)}. What image is on the screen?`, ...c, explain: `m = v/u = ${fmt(imageOf(p.f, p.u), 1)}/${fmt(p.u, 0)} = ${fmt(m, 2)}. ${p.u > 2 * p.f ? 'Beyond 2F: smaller.' : p.u < 2 * p.f ? 'Between F and 2F: bigger.' : 'At 2F: same size.'}` };
    },
  },
  {
    id: 'u-equals-v', label: 'When u = v', topic: p => (p.device === 'concave-mirror' ? MIRROR : LENS),
    applies: p => p.device === 'concave-mirror' || p.device === 'convex-lens',
    build: p => {
      const c = choices(cm(2 * p.f), [cm(p.f), cm(p.f / 2), cm(4 * p.f)], 463);
      return { prompt: 'On the u-v graph, where do u and v come out equal?', ...c, explain: `u = v = 2f: put v = u in 1/u + 1/v = 1/f to get u = 2f = ${cm(2 * p.f)}. The line v = u cuts the u-v curve there, and its coordinates are 2f.` };
    },
  },
  {
    id: 'convex-mirror', label: 'Focal length of the convex mirror', topic: MIRROR,
    applies: p => p.device === 'convex-mirror',
    build: p => {
      const s = solveBench(p) as Required<BenchSolution>;
      const c = choices(cm(p.f2), [cm(s.R), cm(s.v1 - s.x / 2), cm(s.x)], 464);
      return { prompt: `The lens alone forms the image ${cm(s.v1)} away. With the convex mirror ${cm(s.x)} from the lens, the image falls back on the needle. What is the mirror's focal length?`, ...c, explain: `Rays meet the mirror normally, so its centre of curvature is where the lens's image was: R = ${fmt(s.v1, 1)} − ${fmt(s.x, 1)} = ${cm(s.R)}, f = R/2 = ${cm(p.f2)}.` };
    },
  },
  {
    id: 'concave-lens', label: 'Focal length of the concave lens', topic: LENS,
    applies: p => p.device === 'concave-lens',
    build: p => {
      const s = solveBench(p) as Required<BenchSolution>;
      const c = choices(`−${cm(p.f2)}`, [`+${cm(p.f2)}`, `−${cm(s.v2 - s.v1)}`, `−${cm(p.f2 / 2)}`], 465);
      return { prompt: `The convex lens's image is at ${cm(s.v1)}. With the concave lens ${cm(s.d)} from it, the image moves out to ${cm(s.v2)}. What is the concave lens's focal length?`, ...c, explain: `For the concave lens u = ${fmt(s.uc, 1)} cm (a virtual object) and v = ${fmt(s.vc, 1)} cm: f = uv/(u − v) = ${fmt(s.uc, 1)} × ${fmt(s.vc, 1)} / (${fmt(s.uc, 1)} − ${fmt(s.vc, 1)}) = −${cm(p.f2)}.` };
    },
  },
  {
    id: 'combo', label: 'Lenses in contact', topic: MAG,
    applies: p => p.device === 'combo',
    build: p => {
      const F = combined(p.f, p.f2);
      const c = choices(cm(F), [cm(p.f + p.f2), cm((p.f + p.f2) / 2), cm(Math.abs(p.f - p.f2) || 1)], 466);
      return { prompt: `Convex lenses of ${cm(p.f)} and ${cm(p.f2)} are put in contact. What is the focal length of the pair?`, ...c, explain: `1/F = 1/f₁ + 1/f₂, or the powers add: ${fmt(100 / p.f, 2)} D + ${fmt(100 / p.f2, 2)} D = ${fmt(100 / F, 2)} D, so F = ${cm(F)}, shorter than either.` };
    },
  },
];

export const lensBench: LabEngine<BenchParams> = {
  id: 'lens-bench',
  title: 'Optical bench: mirrors and lenses',
  blurb: 'Find u and v for a concave mirror and a convex lens, the focal length of a convex mirror and a concave lens with a convex lens, and lenses in contact.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Ray Optics and Optical Instruments'],
  params: [
    { kind: 'choice', key: 'device', label: 'On the bench', default: 'convex-lens', options: [{ value: 'concave-mirror', label: 'Concave mirror' }, { value: 'convex-lens', label: 'Convex lens' }, { value: 'convex-mirror', label: 'Convex mirror, with a convex lens' }, { value: 'concave-lens', label: 'Concave lens, with a convex lens' }, { value: 'combo', label: 'Two lenses in contact' }] },
    { kind: 'number', key: 'f', label: 'Focal length (convex lens or concave mirror)', unit: 'cm', min: 8, max: 30, step: 1, default: 15 },
    { kind: 'number', key: 'u', label: 'Object distance', unit: 'cm', min: 10, max: 100, step: 1, default: 25 },
    { kind: 'number', key: 'f2', label: 'Focal length of the other element', unit: 'cm', min: 5, max: 40, step: 1, default: 20, show: p => p.device === 'convex-mirror' || p.device === 'concave-lens' || p.device === 'combo' },
  ],
  check: p => {
    const f = p.device === 'combo' ? combined(p.f, p.f2) : p.f;
    if (p.u <= f * 1.15) return 'The object must be well beyond the focus for a real image on the bench.';
    const s = solveBench(p);
    if (s.v > 200 || (s.v2 ?? 0) > 200) return 'The image would fall beyond the 2 m bench.';
    if (p.device === 'concave-lens' && (s.d ?? 0) < 3) return 'The concave lens would have to sit on the convex lens: move the needle further out.';
    if (p.device === 'convex-mirror' && (s.x ?? 0) < 3) return 'The convex mirror would have to sit on the lens: use a weaker mirror or move the needle.';
    return null;
  },
  readouts: p => {
    const s = solveBench(p) as Required<BenchSolution>;
    if (p.device === 'convex-mirror') return [{ label: 'Lens image at', value: cm(s.v1) }, { label: 'Mirror from lens', value: cm(s.x) }, { label: 'R', value: cm(s.R) }, { label: 'f of the mirror', value: cm(p.f2) }];
    if (p.device === 'concave-lens') return [{ label: 'Convex lens image I₁', value: cm(s.v1) }, { label: 'Concave lens at', value: cm(s.d) }, { label: 'Final image I₂', value: cm(s.v2) }, { label: 'f of the concave lens', value: `−${cm(p.f2)}` }];
    return [{ label: 'Image distance v', value: cm(s.v) }, { label: 'Magnification', value: fmt(s.m, 2) }, { label: 'Focal length', value: cm(s.F) }, { label: 'Power', value: `${fmt(100 / s.F, 2)} D` }];
  },
  predictions,
};
