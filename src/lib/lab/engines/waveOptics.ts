import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Wave optics (CBSE Class XII Physics, activity B5, and Young's double slit).
 * Double slit, slits d apart, screen D away: bright fringes where the path
 *   difference is nλ; fringe width β = λD/d, the same for every fringe.
 * Single slit of width a: the central maximum spreads to the first minima at
 *   sin θ = λ/a, so it is 2λD/a wide, twice the width of the other maxima;
 *   a narrower slit spreads it more.
 */

export type WaveOpticsParams = { mode: string; lambda: number; gap: number; D: number };

/** Fringe width (double slit) or central maximum width (single slit), mm. */
export function widthOf(p: WaveOpticsParams) {
  const lam = p.lambda * 1e-9, g = p.gap / 1000;
  return ((p.mode === 'single' ? 2 : 1) * lam * p.D) / g * 1000;
}
/** Intensity across the screen at y mm (0-1). */
export function intensityAt(p: WaveOpticsParams, yMm: number) {
  const lam = p.lambda * 1e-9, g = p.gap / 1000, th = (yMm / 1000) / p.D;
  if (p.mode === 'single') { const b = (Math.PI * g * th) / lam; return b === 0 ? 1 : (Math.sin(b) / b) ** 2; }
  const slitW = g / 5, b = (Math.PI * slitW * th) / lam, env = b === 0 ? 1 : (Math.sin(b) / b) ** 2;
  return env * Math.cos((Math.PI * g * th) / lam) ** 2;
}

/** Visible colour for a wavelength (nm). */
export function colourOf(nm: number) {
  const stops: [number, string][] = [[400, '#7C3AED'], [450, '#2563EB'], [495, '#06B6D4'], [530, '#22C55E'], [580, '#EAB308'], [610, '#F97316'], [650, '#EF4444'], [700, '#B91C1C']];
  return stops.reduce((best, s) => (Math.abs(s[0] - nm) < Math.abs(best[0] - nm) ? s : best))[1];
}

const mm = (x: number) => `${fmt(x, 2)} mm`;
const YDSE = "Interference; Young's double slit experiment; fringe width";
const SINGLE = 'Diffraction due to a single slit; width of central maximum';

const predictions: PredictionTemplate<WaveOpticsParams>[] = [
  {
    id: 'beta', label: 'Fringe width', topic: YDSE,
    applies: p => p.mode === 'double',
    build: p => {
      const b = widthOf(p);
      const c = choices(mm(b), [mm(b * 2), mm(b / 2), mm((p.gap * p.D) / (p.lambda * 1e-6) / 1000)], 501);
      return { prompt: `Light of ${fmt(p.lambda, 0)} nm, slits ${fmt(p.gap, 2)} mm apart, screen ${fmt(p.D, 1)} m away. What is the fringe width?`, ...c, explain: `β = λD/d = ${fmt(p.lambda, 0)} × 10⁻⁹ × ${fmt(p.D, 1)} / ${fmt(p.gap / 1000, 5)} = ${fmt(b / 1000, 6)} m = ${mm(b)}.` };
    },
  },
  {
    id: 'closer-slits', label: 'Slits closer together', topic: YDSE,
    applies: p => p.mode === 'double',
    build: () => {
      const c = choices('The fringes get wider: β doubles', ['They get narrower', 'They stay the same', 'They disappear'], 502);
      return { prompt: 'The slit separation is halved. What happens to the fringes?', ...c, explain: 'β = λD/d: half the separation gives twice the fringe width.' };
    },
  },
  {
    id: 'colour', label: 'Red light instead of blue', topic: YDSE,
    applies: p => p.mode === 'double',
    build: () => {
      const c = choices('Wider fringes', ['Narrower fringes', 'The same fringes', 'No fringes'], 503);
      return { prompt: 'The blue filter is changed for a red one. What happens to the fringes?', ...c, explain: 'Red light has the longer wavelength (about 650 nm against 450 nm). β ∝ λ, so the red fringes are wider.' };
    },
  },
  {
    id: 'central', label: 'Width of the central maximum', topic: SINGLE,
    applies: p => p.mode === 'single',
    build: p => {
      const w = widthOf(p);
      const c = choices(mm(w), [mm(w / 2), mm(w * 2), mm((p.lambda * 1e-6 * p.D) / p.gap * 1000 / 4)], 504);
      return { prompt: `${fmt(p.lambda, 0)} nm light through a slit ${fmt(p.gap, 2)} mm wide, screen ${fmt(p.D, 1)} m away. How wide is the central bright band?`, ...c, explain: `The first minima are at sin θ = λ/a either side, so the width is 2λD/a = ${mm(w)}: twice the width of each side band.` };
    },
  },
  {
    id: 'narrower', label: 'A narrower slit', topic: SINGLE,
    applies: p => p.mode === 'single',
    build: () => {
      const c = choices('The central band gets wider and dimmer', ['It gets narrower and brighter', 'It stays the same', 'It splits into two'], 505);
      return { prompt: 'The slit is made narrower. What happens to the central band?', ...c, explain: 'Width = 2λD/a: a smaller a spreads the light more. Less light gets through, so it is dimmer too.' };
    },
  },
];

export const waveOptics: LabEngine<WaveOpticsParams> = {
  id: 'wave-optics',
  title: "Young's double slit and diffraction",
  blurb: 'Interference fringes from two slits and the spread of light through one: change the colour, the gap and the screen distance.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Wave Optics'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Slits', default: 'double', options: [{ value: 'double', label: 'Double slit' }, { value: 'single', label: 'Single slit' }] },
    { kind: 'number', key: 'lambda', label: 'Wavelength', unit: 'nm', min: 400, max: 700, step: 10, default: 600 },
    { kind: 'number', key: 'gap', label: 'Slit separation / width', unit: 'mm', min: 0.05, max: 1, step: 0.01, default: 0.3 },
    { kind: 'number', key: 'D', label: 'Screen distance', unit: 'm', min: 0.5, max: 2.5, step: 0.1, default: 1.2 },
  ],
  readouts: p => [{ label: p.mode === 'double' ? 'Fringe width β' : 'Central maximum', value: mm(widthOf(p)) }, { label: 'Wavelength', value: `${fmt(p.lambda, 0)} nm` }],
  predictions,
};
