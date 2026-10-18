import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Ray optics bench: spherical mirrors and thin lenses, New Cartesian sign
 * convention as in NCERT Class 10 Ch "Light – Reflection and Refraction".
 * Distances in cm, measured from the pole / optical centre; light travels
 * left to right; the object stands on the left (u is negative).
 */

export type Device = 'convex_lens' | 'concave_lens' | 'concave_mirror' | 'convex_mirror';
export type OpticsParams = { device: Device; f: number; u: number; h: number };

export const DEVICE_LABEL: Record<Device, string> = {
  convex_lens: 'Convex lens', concave_lens: 'Concave lens', concave_mirror: 'Concave mirror', convex_mirror: 'Convex mirror',
};

export const isMirror = (d: Device) => d === 'concave_mirror' || d === 'convex_mirror';
export const isConverging = (d: Device) => d === 'convex_lens' || d === 'concave_mirror';

export type Pt = [number, number];
/** `out` = after the element (hidden while the class predicts); `virtual` = dashed back-extension to a virtual image. */
export interface RaySeg { from: Pt; to: Pt; out?: boolean; virtual?: boolean }

export interface OpticsResult {
  /** Signed focal length (cm). */
  f: number;
  /** Signed object distance (cm), always negative. */
  u: number;
  /** Object at the focus of a converging element: rays leave parallel, no image. */
  atInfinity: boolean;
  v: number;
  m: number;
  hi: number;
  real: boolean;
  erect: boolean;
  size: 'Magnified' | 'Same size' | 'Diminished' | 'Highly magnified';
  objectAt: string;
  imageAt: string;
  rays: RaySeg[];
  /** Half-width of the scene (cm) so the drawing fits object, image and both foci. */
  extent: number;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

function objectPosition(d: Device, f: number, uMag: number): string {
  if (!isConverging(d)) return isMirror(d) ? 'In front of the mirror' : 'In front of the lens';
  const twoF = isMirror(d) ? 'C' : '2F₁', F = isMirror(d) ? 'F' : 'F₁', O = isMirror(d) ? 'P' : 'O';
  if (near(uMag, 2 * f)) return `At ${twoF}`;
  if (uMag > 2 * f) return `Beyond ${twoF}`;
  if (near(uMag, f)) return `At ${F}`;
  if (uMag > f) return `Between ${F} and ${twoF}`;
  return `Between ${F} and ${O}`;
}

/** Every place the image can be, for this kind of element (used for options). */
export function imagePlaces(d: Device): string[] {
  switch (d) {
    case 'convex_lens': return ['Beyond 2F₂', 'At 2F₂', 'Between F₂ and 2F₂', 'At infinity', 'Same side as the object'];
    case 'concave_mirror': return ['Beyond C', 'At C', 'Between F and C', 'At infinity', 'Behind the mirror'];
    case 'concave_lens': return ['Between F₁ and O, same side as the object', 'Beyond 2F₂', 'At F₁', 'At infinity'];
    case 'convex_mirror': return ['Behind the mirror, between P and F', 'Between F and C', 'At F', 'At infinity'];
  }
}

function imagePosition(d: Device, fMag: number, v: number, real: boolean, atInfinity: boolean): string {
  if (atInfinity) return 'At infinity';
  if (d === 'concave_lens') return 'Between F₁ and O, same side as the object';
  if (d === 'convex_mirror') return 'Behind the mirror, between P and F';
  if (!real) return d === 'convex_lens' ? 'Same side as the object' : 'Behind the mirror';
  const a = Math.abs(v), mirror = isMirror(d);
  if (near(a, 2 * fMag)) return mirror ? 'At C' : 'At 2F₂';
  if (a > 2 * fMag) return mirror ? 'Beyond C' : 'Beyond 2F₂';
  return mirror ? 'Between F and C' : 'Between F₂ and 2F₂';
}

/** Lens: 1/v − 1/u = 1/f, m = v/u. Mirror: 1/v + 1/u = 1/f, m = −v/u. */
export function imageDistance(d: Device, f: number, u: number): number | null {
  const inv = isMirror(d) ? 1 / f - 1 / u : 1 / f + 1 / u;
  return Math.abs(inv) < 1e-12 ? null : 1 / inv;
}

export function solveOptics(p: OpticsParams): OpticsResult {
  const mirror = isMirror(p.device);
  // Concave mirror and concave lens both have f < 0 here (focus on the incoming side for the
  // mirror, the virtual focus for the lens); convex lens and convex mirror have f > 0.
  const f = p.device === 'convex_lens' || p.device === 'convex_mirror' ? p.f : -p.f;
  const u = -p.u;
  const vRaw = imageDistance(p.device, f, u);
  const atInfinity = vRaw === null;
  const v = vRaw ?? Infinity;
  const m = atInfinity ? Infinity : mirror ? -v / u : v / u;
  const real = !atInfinity && (mirror ? v < 0 : v > 0);
  const am = Math.abs(m);
  const size = atInfinity ? 'Highly magnified' : am > 1 + 1e-6 ? 'Magnified' : am < 1 - 1e-6 ? 'Diminished' : 'Same size';

  const finiteV = atInfinity ? 0 : Math.abs(v);
  const extent = Math.max(p.u, Math.min(finiteV, 4 * Math.max(p.u, 2 * p.f)), 2 * p.f) * 1.15 + 4;
  const yLimit = Math.max(p.h * 6, 12);

  const top: Pt = [u, p.h];
  const rays: RaySeg[] = [];
  const forward = mirror ? -1 : 1; // which way light leaves the element
  const xEnd = forward * extent;

  const extend = (from: Pt, dir: Pt): Pt => {
    const ts: number[] = [];
    if (Math.abs(dir[0]) > 1e-12) ts.push((xEnd - from[0]) / dir[0]);
    if (Math.abs(dir[1]) > 1e-12) ts.push(((dir[1] > 0 ? yLimit : -yLimit) - from[1]) / dir[1]);
    const t = Math.min(...ts.filter(x => x > 0), 1e6);
    return [from[0] + dir[0] * t, from[1] + dir[1] * t];
  };

  const hits: Pt[] = [[0, p.h], [0, 0]];
  for (const hit of hits) {
    rays.push({ from: top, to: hit });
    if (atInfinity) {
      // The parallel ray leaves through the focus (lens +f, concave mirror −f); the central ray goes
      // straight on through a lens, or reflects symmetrically at the pole. With u = f they come out parallel.
      const dir: Pt = hit[1] !== 0 ? [f, -p.h] : mirror ? [-p.u, -p.h] : [p.u, -p.h];
      rays.push({ from: hit, to: extend(hit, dir), out: true });
      continue;
    }
    const I: Pt = [v, m * p.h];
    if (real) {
      rays.push({ from: hit, to: extend(hit, [I[0] - hit[0], I[1] - hit[1]]), out: true });
    } else {
      rays.push({ from: hit, to: extend(hit, [hit[0] - I[0], hit[1] - I[1]]), out: true });
      rays.push({ from: hit, to: I, out: true, virtual: true });
    }
  }

  return {
    f, u, atInfinity, v, m, hi: atInfinity ? Infinity : m * p.h, real, erect: !atInfinity && m > 0, size,
    objectAt: objectPosition(p.device, p.f, p.u),
    imageAt: imagePosition(p.device, p.f, v, real, atInfinity),
    rays, extent,
  };
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), 1)}`;
const what = (d: Device) => (isMirror(d) ? 'mirror' : 'lens');

function working(p: OpticsParams, r: OpticsResult): string {
  if (r.atInfinity) return `The object is at the focus (u = ${signed(r.u)} cm, f = ${signed(r.f)} cm), so the rays leave parallel and the image forms at infinity.`;
  const formula = isMirror(p.device)
    ? `Mirror formula: 1/v + 1/u = 1/f → 1/v = 1/(${signed(r.f)}) − 1/(${signed(r.u)})`
    : `Lens formula: 1/v − 1/u = 1/f → 1/v = 1/(${signed(r.f)}) + 1/(${signed(r.u)})`;
  const mf = isMirror(p.device) ? `m = −v/u = ${signed(r.m)}` : `m = v/u = ${signed(r.m)}`;
  return `${formula}, so v = ${signed(r.v)} cm. ${mf}.`;
}

// Official topics: mirrors and lenses are separate lines in the syllabus.
const imageTopic = (p: OpticsParams) => (isMirror(p.device) ? 'Reflection of light by curved surfaces; images formed by spherical mirrors' : 'Refraction by spherical lenses; images formed by lenses');
const formulaTopic = (p: OpticsParams) => (isMirror(p.device) ? 'Mirror formula and magnification' : 'Lens formula; magnification; power of a lens');

const predictions: PredictionTemplate<OpticsParams>[] = [
  {
    id: 'image-position', label: 'Where the image forms', topic: imageTopic,
    build: p => {
      const r = solveOptics(p);
      const c = choices(r.imageAt, imagePlaces(p.device), 1);
      return { prompt: `The object is ${r.objectAt.charAt(0).toLowerCase()}${r.objectAt.slice(1)}. Where will the image form?`, ...c, explain: working(p, r) };
    },
  },
  {
    id: 'image-nature', label: 'Real or virtual, erect or inverted', topic: imageTopic,
    applies: p => !solveOptics(p).atInfinity,
    build: p => {
      const r = solveOptics(p);
      const right = `${r.real ? 'Real' : 'Virtual'} and ${r.erect ? 'erect' : 'inverted'}`;
      const c = choices(right, ['Real and inverted', 'Virtual and erect', 'Real and erect', 'Virtual and inverted'], 2);
      return { prompt: 'What kind of image will it be?', ...c, explain: `${working(p, r)} ${r.real ? 'v is on the far side of the light, so the image is real' : 'The rays only appear to meet, so the image is virtual'}; m is ${r.m > 0 ? 'positive (erect)' : 'negative (inverted)'}.` };
    },
  },
  {
    id: 'image-size', label: 'Bigger or smaller than the object', topic: imageTopic,
    applies: p => !solveOptics(p).atInfinity,
    build: p => {
      const r = solveOptics(p);
      const c = choices(r.size, ['Magnified', 'Same size', 'Diminished'], 3);
      return { prompt: 'Compared with the object, the image will be…', ...c, explain: `${working(p, r)} |m| = ${fmt(Math.abs(r.m), 2)}, so the image is ${r.size.toLowerCase()} (${fmt(Math.abs(r.hi), 1)} cm tall).` };
    },
  },
  {
    id: 'image-distance', label: 'Image distance v', topic: formulaTopic,
    applies: p => !solveOptics(p).atInfinity,
    build: p => {
      const r = solveOptics(p);
      const show = (v: number) => `v = ${signed(v)} cm`;
      // Distractors are the usual slips: the other element's formula, the sign of u dropped, a flipped sign.
      const wrongFormula = isMirror(p.device) ? imageDistance('convex_lens', r.f, r.u) : imageDistance('concave_mirror', r.f, r.u);
      const uPositive = imageDistance(p.device, r.f, -r.u);
      const ds = [wrongFormula, uPositive, -r.v, r.f].filter((x): x is number => x !== null && Number.isFinite(x)).map(show);
      const c = choices(show(r.v), ds, 4);
      return { prompt: `How far from the ${what(p.device)} will the image form (sign convention)?`, ...c, explain: working(p, r) };
    },
  },
  {
    id: 'magnification', label: 'Magnification m', topic: formulaTopic,
    applies: p => !solveOptics(p).atInfinity && Math.abs(solveOptics(p).m) > 1e-6,
    build: p => {
      const r = solveOptics(p);
      const show = (m: number) => `m = ${signed(m)}`;
      const c = choices(show(r.m), [show(-r.m), show(1 / r.m), show(-1 / r.m)], 5);
      return { prompt: 'What is the magnification?', ...c, explain: working(p, r) };
    },
  },
];

export const optics: LabEngine<OpticsParams> = {
  id: 'optics',
  title: 'Ray optics bench',
  blurb: 'Mirrors and lenses: move the object and watch where the image forms, with the rays drawn.',
  subject: 'Science',
  classes: [10],
  chapters: ['Light - Reflection and Refraction'],
  params: [
    { kind: 'choice', key: 'device', label: 'Element', default: 'convex_lens', options: (Object.keys(DEVICE_LABEL) as Device[]).map(value => ({ value, label: DEVICE_LABEL[value] })) },
    { kind: 'number', key: 'f', label: 'Focal length', unit: 'cm', min: 5, max: 40, step: 1, default: 10 },
    { kind: 'number', key: 'u', label: 'Object distance', unit: 'cm', min: 2, max: 100, step: 1, default: 15 },
    { kind: 'number', key: 'h', label: 'Object height', unit: 'cm', min: 1, max: 8, step: 0.5, default: 2 },
  ],
  readouts: p => {
    const r = solveOptics(p);
    if (r.atInfinity) return [{ label: 'Image', value: 'At infinity' }, { label: 'f', value: `${signed(r.f)} cm` }, { label: 'u', value: `${signed(r.u)} cm` }];
    return [
      { label: 'u', value: `${signed(r.u)} cm` },
      { label: 'f', value: `${signed(r.f)} cm` },
      { label: 'v', value: `${signed(r.v)} cm` },
      { label: 'm', value: signed(r.m) },
      { label: 'Image height', value: `${signed(r.hi)} cm` },
      { label: 'Image', value: `${r.real ? 'Real' : 'Virtual'}, ${r.erect ? 'erect' : 'inverted'}, ${r.size.toLowerCase()}` },
    ];
  },
  predictions,
};
