import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Moving coil galvanometer (CBSE Class XII Physics, experiments A4 and A5).
 * The galvanometer has resistance G and figure of merit k (current per division);
 * its scale has N = 30 divisions each side, so full-scale current I_g = kN.
 *
 * Half-deflection: with a high resistance R in series, a cell E gives θ
 * divisions: θ = E / k(R + G). A shunt S across the galvanometer is adjusted until
 * the deflection halves; then G = RS/(R − S) (≈ S when R ≫ G), and k = E/(R + G)θ.
 * Conversion: a voltmeter of range V₀ needs R = V₀/I_g − G in series; an
 * ammeter of range I₀ needs a shunt S = I_g G/(I₀ − I_g) in parallel.
 */

export type GalvoParams = { mode: string; G: number; k: number; E: number; theta: number; volts: number; amps: number };

export const N = 30;
export const ig = (p: Pick<GalvoParams, 'k'>) => p.k * 1e-6 * N; // A

/** Series resistance (Ω) for θ divisions, and the shunt that halves it. */
export function halfDeflection(p: GalvoParams) {
  const R = p.E / (p.k * 1e-6 * p.theta) - p.G;
  const S = (R * p.G) / (R + p.G);
  return { R, S, Gcalc: (R * S) / (R - S) };
}
export const seriesFor = (p: GalvoParams) => p.volts / ig(p) - p.G;
export const shuntFor = (p: GalvoParams) => (ig(p) * p.G) / (p.amps - ig(p));

const ohm = (x: number) => (x >= 1000 ? `${fmt(x / 1000, 2)} kΩ` : x < 1 ? `${fmt(x, 4)} Ω` : `${fmt(x, 1)} Ω`);
const MCG = 'Moving coil galvanometer: current sensitivity, conversion to ammeter and voltmeter';

const predictions: PredictionTemplate<GalvoParams>[] = [
  {
    id: 'g-from-s', label: 'Galvanometer resistance', topic: MCG,
    applies: p => p.mode === 'half',
    build: p => {
      const h = halfDeflection(p);
      const c = choices(ohm(p.G), [ohm(h.S), ohm(h.R), ohm(2 * h.S)].filter(x => x !== ohm(p.G)), 441);
      return { prompt: `R = ${ohm(h.R)} gives ${p.theta} divisions; a shunt of ${ohm(h.S)} halves it. What is the galvanometer's resistance?`, ...c, explain: `G = RS/(R − S) = ${fmt(h.R, 0)} × ${fmt(h.S, 1)} / ${fmt(h.R - h.S, 0)} = ${ohm(p.G)}. Since R ≫ S, G ≈ S.` };
    },
  },
  {
    id: 'merit', label: 'Figure of merit', topic: MCG,
    applies: p => p.mode === 'half',
    build: p => {
      const h = halfDeflection(p);
      const c = choices(`${fmt(p.k, 1)} μA per division`, [`${fmt(p.k * 2, 1)} μA per division`, `${fmt(p.E / h.R / p.theta * 1e6 * 2, 1)} μA per division`, `${fmt(p.k / 2, 1)} μA per division`].filter((x, i, a) => a.indexOf(x) === i), 442);
      return { prompt: `A ${fmt(p.E, 1)} V cell, R = ${ohm(h.R)}, G = ${ohm(p.G)}, deflection ${p.theta} divisions. What is the figure of merit?`, ...c, explain: `k = E / ((R + G)θ) = ${fmt(p.E, 1)} / (${fmt(h.R + p.G, 0)} × ${p.theta}) = ${fmt(p.k, 1)} × 10⁻⁶ A per division.` };
    },
  },
  {
    id: 'series', label: 'Resistance for a voltmeter', topic: MCG,
    applies: p => p.mode === 'volt',
    build: p => {
      const R = seriesFor(p);
      const c = choices(`${ohm(R)} in series`, [`${ohm(R)} in parallel`, `${ohm(p.volts / ig(p))} in series`, `${ohm(shuntFor({ ...p, amps: 1 }))} in parallel`], 443);
      return { prompt: `G = ${ohm(p.G)}, full-scale current ${fmt(ig(p) * 1000, 2)} mA. What turns it into a 0-${fmt(p.volts, 0)} V voltmeter?`, ...c, explain: `At full scale V₀ = I_g(G + R), so R = V₀/I_g − G = ${fmt(p.volts, 0)}/${fmt(ig(p), 5)} − ${fmt(p.G, 0)} = ${ohm(R)}, in series. A voltmeter needs a high resistance.` };
    },
  },
  {
    id: 'shunt', label: 'Shunt for an ammeter', topic: MCG,
    applies: p => p.mode === 'amm',
    build: p => {
      const S = shuntFor(p);
      const c = choices(`${ohm(S)} in parallel`, [`${ohm(S)} in series`, `${ohm(seriesFor({ ...p, volts: 3 }))} in series`, `${ohm(S * 10)} in parallel`], 444);
      return { prompt: `G = ${ohm(p.G)}, full-scale current ${fmt(ig(p) * 1000, 2)} mA. What turns it into a 0-${fmt(p.amps, 1)} A ammeter?`, ...c, explain: `The shunt carries the rest: I_g G = (I₀ − I_g)S, so S = I_g G/(I₀ − I_g) = ${ohm(S)}, in parallel. An ammeter needs a very low resistance.` };
    },
  },
];

export const galvanometer: LabEngine<GalvoParams> = {
  id: 'galvanometer',
  title: 'Galvanometer',
  blurb: 'Find its resistance by half deflection and its figure of merit, then turn it into a voltmeter or an ammeter of any range.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Moving Charges and Magnetism'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'half', options: [{ value: 'half', label: 'Half deflection' }, { value: 'volt', label: 'Convert to a voltmeter' }, { value: 'amm', label: 'Convert to an ammeter' }] },
    { kind: 'number', key: 'G', label: 'Galvanometer resistance', unit: 'Ω', min: 20, max: 150, step: 1, default: 60 },
    { kind: 'number', key: 'k', label: 'Figure of merit', unit: 'μA/div', min: 10, max: 60, step: 1, default: 25 },
    { kind: 'number', key: 'E', label: 'Cell', unit: 'V', min: 1.5, max: 2, step: 0.5, default: 2, show: p => p.mode === 'half' },
    { kind: 'number', key: 'theta', label: 'Deflection', unit: 'div', min: 10, max: 30, step: 2, default: 30, show: p => p.mode === 'half' },
    { kind: 'number', key: 'volts', label: 'Voltmeter range', unit: 'V', min: 1, max: 15, step: 1, default: 3, show: p => p.mode === 'volt' },
    { kind: 'number', key: 'amps', label: 'Ammeter range', unit: 'A', min: 0.1, max: 5, step: 0.1, default: 1, show: p => p.mode === 'amm' },
  ],
  check: p => (p.mode === 'amm' && p.amps <= ig(p) * 2 ? 'The ammeter range must be well above the galvanometer\'s full-scale current.' : p.mode === 'volt' && seriesFor(p) < p.G ? 'That range is too small for this galvanometer.' : null),
  readouts: p => {
    if (p.mode === 'half') { const h = halfDeflection(p); return [{ label: 'R for full deflection', value: ohm(h.R) }, { label: 'Shunt S to halve it', value: ohm(h.S) }, { label: 'G = RS/(R − S)', value: ohm(h.Gcalc) }, { label: 'Figure of merit', value: `${fmt(p.k, 1)} μA/div` }]; }
    return [{ label: 'Full-scale current I_g', value: `${fmt(ig(p) * 1000, 3)} mA` }, p.mode === 'volt' ? { label: 'Series resistance', value: ohm(seriesFor(p)) } : { label: 'Shunt', value: ohm(shuntFor(p)) }];
  },
  predictions,
};
