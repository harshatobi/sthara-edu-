import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Fluids (CBSE Class XI Physics, experiments B4 and B5, activities B4 and B7).
 *
 * Capillary rise: water rises in a fine glass tube of radius r to
 *   h = 2T cos θ / (rρg), θ ≈ 0 for clean glass, so T = rhρg/2.
 *   Detergent lowers the surface tension, so the water rises less.
 * Terminal velocity: a steel ball falling through a viscous liquid soon moves
 *   at v = 2r²(ρ − σ)g / 9η (Stokes' law), timed between two marks; η = 2r²(ρ − σ)g / 9v.
 * Bernoulli: water flowing through a pipe speeds up where the pipe narrows
 *   (A₁v₁ = A₂v₂) and its pressure falls there: P₁ − P₂ = ½ρ(v₂² − v₁²),
 *   shown by the drop in a vertical tube's water level, Δh = (P₁ − P₂)/ρg.
 */

export type FluidParams = { mode: string; r: number; detergent: string; ball: number; liquid: string; v1: number; ratio: number };

export const G = 9.8;
export const RHO_WATER = 1000;
export const T_WATER = 0.072; // N/m at room temperature
export const T_DETERGENT = 0.035;
export const STEEL = 7800;
export const LIQUIDS: Record<string, { label: string; rho: number; eta: number }> = {
  glycerine: { label: 'Glycerine', rho: 1260, eta: 0.95 },
  castor: { label: 'Castor oil', rho: 960, eta: 0.65 },
};
/** Distance between the marks on the tall jar (cm). */
export const MARKS = 20;

/** Capillary rise (cm) in a tube of radius r mm. */
export const riseCm = (rMm: number, T: number) => ((2 * T) / ((rMm / 1000) * RHO_WATER * G)) * 100;
/** Terminal velocity (cm/s) of a steel ball of radius r mm. */
export function terminal(rMm: number, liquid: string) {
  const L = LIQUIDS[liquid] ?? LIQUIDS.glycerine, r = rMm / 1000;
  return ((2 * r * r * (STEEL - L.rho) * G) / (9 * L.eta)) * 100;
}
/** Level drop (cm) between the wide and the narrow part of the pipe. */
export function bernoulli(v1: number, ratio: number) {
  const v2 = v1 * ratio;
  const dP = 0.5 * RHO_WATER * (v2 * v2 - v1 * v1);
  return { v2, dP, dh: (dP / (RHO_WATER * G)) * 100 };
}

const cm = (x: number) => `${fmt(x, 1)} cm`;

const predictions: PredictionTemplate<FluidParams>[] = [
  {
    id: 'rise', label: 'How high the water rises', topic: 'Surface tension applied to drops, bubbles and capillary rise',
    applies: p => p.mode === 'capillary',
    build: p => {
      const T = p.detergent === 'yes' ? T_DETERGENT : T_WATER, h = riseCm(p.r, T);
      const c = choices(cm(h), [cm(h * 2), cm(h / 2), cm(riseCm(p.r * 2, T))], 381);
      return { prompt: `A clean glass tube of radius ${fmt(p.r, 2)} mm stands in ${p.detergent === 'yes' ? 'water with detergent' : 'water'}. How high does the water rise?`, ...c, explain: `h = 2T/(rρg) = 2 × ${T} / (${fmt(p.r / 1000, 5)} × 1000 × ${G}) = ${fmt(h / 100, 4)} m = ${cm(h)}.` };
    },
  },
  {
    id: 'thinner', label: 'A thinner tube', topic: 'Surface tension applied to drops, bubbles and capillary rise',
    applies: p => p.mode === 'capillary',
    build: () => {
      const c = choices('Twice as high', ['Half as high', 'The same height', 'Four times as high'], 382);
      return { prompt: 'A tube of half the radius: how high does the water rise now?', ...c, explain: 'h ∝ 1/r: half the radius, twice the height (Jurin\'s law).' };
    },
  },
  {
    id: 'detergent', label: 'Adding detergent', topic: 'Surface energy and surface tension, angle of contact, excess pressure across a curved surface',
    applies: p => p.mode === 'capillary',
    build: p => {
      const c = choices(`It rises less: ${cm(riseCm(p.r, T_DETERGENT))} instead of ${cm(riseCm(p.r, T_WATER))}`, ['It rises higher', 'It rises the same', 'It falls below the outside level'], 383);
      return { prompt: 'A little detergent is dissolved in the water. What happens to the capillary rise?', ...c, explain: `Detergent molecules gather at the surface and lower the surface tension (about ${T_WATER} → ${T_DETERGENT} N/m). h ∝ T, so the rise falls in the same ratio. That is also why detergent helps water wet greasy cloth.` };
    },
  },
  {
    id: 'terminal', label: 'Terminal velocity', topic: "Viscosity, Stokes' law, terminal velocity",
    applies: p => p.mode === 'viscosity',
    build: p => {
      const v = terminal(p.ball, p.liquid);
      const c = choices(`${fmt(v, 2)} cm/s`, [`${fmt(v * 2, 2)} cm/s`, `${fmt(v / 2, 2)} cm/s`, `${fmt(v * 4, 2)} cm/s`], 384);
      return { prompt: `A steel ball of radius ${fmt(p.ball, 2)} mm falls through ${LIQUIDS[p.liquid].label.toLowerCase()}. What is its terminal velocity?`, ...c, explain: `v = 2r²(ρ − σ)g / 9η = 2 × (${fmt(p.ball / 1000, 5)})² × (${STEEL} − ${LIQUIDS[p.liquid].rho}) × ${G} / (9 × ${LIQUIDS[p.liquid].eta}) = ${fmt(v / 100, 4)} m/s.` };
    },
  },
  {
    id: 'bigger-ball', label: 'A ball twice as wide', topic: "Viscosity, Stokes' law, terminal velocity",
    applies: p => p.mode === 'viscosity',
    build: () => {
      const c = choices('Four times as fast', ['Twice as fast', 'The same', 'Half as fast'], 385);
      return { prompt: 'A ball of twice the radius, same steel: how fast does it fall at terminal velocity?', ...c, explain: 'v ∝ r²: the weight grows as r³ but the viscous drag only as r·v, so doubling r makes v four times.' };
    },
  },
  {
    id: 'why-steady', label: 'Why the speed becomes steady', topic: "Viscosity, Stokes' law, terminal velocity",
    applies: p => p.mode === 'viscosity',
    build: () => {
      const c = choices('Viscous drag plus upthrust grows until it balances the weight', ['The ball runs out of energy', 'Gravity gets weaker lower down', 'The liquid stops moving'], 386);
      return { prompt: 'Why does the ball stop speeding up after the first few centimetres?', ...c, explain: 'Stokes\' drag 6πηrv grows with speed. At terminal velocity weight = upthrust + drag, the net force is zero and the ball falls at a steady speed. Time it only after that point.' };
    },
  },
  {
    id: 'drop', label: 'Where the pressure is lower', topic: "Bernoulli's theorem and simple applications (Torricelli's law, dynamic lift)",
    applies: p => p.mode === 'bernoulli',
    build: p => {
      const b = bernoulli(p.v1, p.ratio);
      const c = choices(`At the narrow part: its level is ${cm(b.dh)} lower`, ['At the wide part', 'The same everywhere', `At the narrow part: its level is ${cm(b.dh)} higher`], 387);
      return { prompt: `Water enters at ${fmt(p.v1, 1)} m/s; the narrow part has 1/${fmt(p.ratio, 1)} of the area. Which vertical tube shows lower pressure?`, ...c, explain: `A₁v₁ = A₂v₂ gives v₂ = ${fmt(b.v2, 2)} m/s. P + ½ρv² is constant along the flow, so P falls by ½ρ(v₂² − v₁²) = ${fmt(b.dP, 0)} Pa, a level drop of ${cm(b.dh)}.` };
    },
  },
];

export const fluids: LabEngine<FluidParams> = {
  id: 'fluids',
  title: 'Surface tension, viscosity and Bernoulli',
  blurb: 'Capillary rise in fine tubes (with and without detergent), a ball reaching terminal velocity in glycerine, and pressure falling where a pipe narrows.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Mechanical Properties of Fluids'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'capillary', options: [{ value: 'capillary', label: 'Capillary rise' }, { value: 'viscosity', label: 'Terminal velocity' }, { value: 'bernoulli', label: 'Flow through a narrow pipe' }] },
    { kind: 'number', key: 'r', label: 'Tube radius', unit: 'mm', min: 0.2, max: 1.2, step: 0.01, default: 0.4, show: p => p.mode === 'capillary' },
    { kind: 'choice', key: 'detergent', label: 'Detergent', default: 'no', options: [{ value: 'no', label: 'Pure water' }, { value: 'yes', label: 'With detergent' }], show: p => p.mode === 'capillary' },
    { kind: 'number', key: 'ball', label: 'Ball radius', unit: 'mm', min: 0.5, max: 2.5, step: 0.05, default: 1, show: p => p.mode === 'viscosity' },
    { kind: 'choice', key: 'liquid', label: 'Liquid', default: 'glycerine', options: Object.entries(LIQUIDS).map(([value, l]) => ({ value, label: l.label })), show: p => p.mode === 'viscosity' },
    { kind: 'number', key: 'v1', label: 'Speed in the wide part', unit: 'm/s', min: 0.2, max: 1.5, step: 0.1, default: 0.5, show: p => p.mode === 'bernoulli' },
    { kind: 'number', key: 'ratio', label: 'Wide : narrow area', unit: '', min: 1.5, max: 4, step: 0.5, default: 2, show: p => p.mode === 'bernoulli' },
  ],
  readouts: p => {
    if (p.mode === 'capillary') {
      const T = p.detergent === 'yes' ? T_DETERGENT : T_WATER;
      return [{ label: 'Rise h', value: cm(riseCm(p.r, T)) }, { label: 'Surface tension', value: `${T} N/m` }, { label: 'r × h', value: `${fmt(p.r / 10 * riseCm(p.r, T), 3)} cm²` }];
    }
    if (p.mode === 'viscosity') {
      const v = terminal(p.ball, p.liquid);
      return [{ label: 'Terminal velocity', value: `${fmt(v, 2)} cm/s` }, { label: `Time over ${MARKS} cm`, value: `${fmt(MARKS / v, 2)} s` }, { label: 'η', value: `${LIQUIDS[p.liquid].eta} Pa s` }];
    }
    const b = bernoulli(p.v1, p.ratio);
    return [{ label: 'Speed at the neck', value: `${fmt(b.v2, 2)} m/s` }, { label: 'Pressure drop', value: `${fmt(b.dP, 0)} Pa` }, { label: 'Level drop', value: cm(b.dh) }];
  },
  predictions,
};
