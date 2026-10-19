import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Boyle's law (CBSE Class XI Physics, experiment B3). Air is trapped in a closed
 * tube of uniform bore; an open tube joined by rubber tubing holds mercury. When
 * the open limb's mercury is h cm higher than the closed limb's, the trapped air
 * is at P = H + h cm of mercury (H the atmospheric pressure); lower, h is negative.
 * The volume is proportional to the length l of the air column. At constant
 * temperature PV is constant, so P against V is a hyperbola and P against 1/V a
 * straight line through the origin.
 */

export type BoyleParams = { H: number; l0: number; h: number };

/** Air column length (cm) at a level difference h: P l = H l₀. */
export const columnAt = (p: Pick<BoyleParams, 'H' | 'l0'>, h: number) => (p.H * p.l0) / (p.H + h);

export function solveBoyle(p: BoyleParams) {
  const P = p.H + p.h, l = columnAt(p, p.h);
  return { P, l, PV: P * l };
}

const cm = (x: number) => `${fmt(x, 1)} cm`;
const STATE = 'Equation of state of a perfect gas; work done in compressing a gas';

const predictions: PredictionTemplate<BoyleParams>[] = [
  {
    id: 'pressure', label: 'Pressure of the trapped air', topic: STATE,
    build: p => {
      const s = solveBoyle(p);
      const c = choices(`${fmt(s.P, 1)} cm of mercury`, [`${fmt(p.H - p.h, 1)} cm of mercury`, `${fmt(p.H, 1)} cm of mercury`, `${fmt(Math.abs(p.h), 1)} cm of mercury`], 371);
      return { prompt: `The barometer reads ${fmt(p.H, 1)} cm; the open limb's mercury is ${fmt(Math.abs(p.h), 1)} cm ${p.h >= 0 ? 'above' : 'below'} the closed limb's. What is the pressure of the trapped air?`, ...c, explain: `P = H ${p.h >= 0 ? '+' : '−'} h = ${fmt(p.H, 1)} ${p.h >= 0 ? '+' : '−'} ${fmt(Math.abs(p.h), 1)} = ${fmt(s.P, 1)} cm of mercury.` };
    },
  },
  {
    id: 'length', label: 'Length of the air column', topic: STATE,
    build: p => {
      const s = solveBoyle(p);
      const c = choices(cm(s.l), [cm(p.l0 * (p.H + p.h) / p.H), cm(p.l0), cm(p.l0 - p.h / 4)], 372);
      return { prompt: `At atmospheric pressure the air column is ${cm(p.l0)}. How long is it at ${fmt(s.P, 1)} cm of mercury?`, ...c, explain: `PV is constant and V ∝ l: l = H l₀ / P = ${fmt(p.H, 1)} × ${fmt(p.l0, 1)} / ${fmt(s.P, 1)} = ${cm(s.l)}.` };
    },
  },
  {
    id: 'double-p', label: 'Doubling the pressure', topic: 'Isothermal, adiabatic, reversible, irreversible and cyclic processes',
    chapter: 'Thermodynamics',
    build: () => {
      const c = choices('The volume halves', ['The volume doubles', 'The volume stays the same', 'The volume becomes a quarter'], 373);
      return { prompt: 'Slowly, so the temperature stays the same, the pressure on the trapped air is doubled. What happens to its volume?', ...c, explain: 'An isothermal change of an ideal gas: PV = nRT is constant, so V ∝ 1/P. Done quickly the air warms up and the volume falls by less.' };
    },
  },
  {
    id: 'graph', label: 'P against 1/V', topic: STATE,
    build: () => {
      const c = choices('A straight line through the origin', ['A hyperbola', 'A horizontal line', 'A straight line with a negative slope'], 374);
      return { prompt: 'Plotting P against 1/V for the trapped air, what do you get?', ...c, explain: 'P = constant × (1/V): a straight line through the origin. P against V itself is a rectangular hyperbola.' };
    },
  },
];

export const boyle: LabEngine<BoyleParams> = {
  id: 'boyle',
  title: "Boyle's law",
  blurb: "Raise and lower the open limb: the trapped air shrinks as the pressure rises, and PV stays the same.",
  subject: 'Physics',
  classes: [11],
  chapters: ['Kinetic Theory', 'Thermodynamics'],
  params: [
    { kind: 'number', key: 'H', label: 'Atmospheric pressure', unit: 'cm Hg', min: 72, max: 77, step: 0.1, default: 76 },
    { kind: 'number', key: 'l0', label: 'Air column at H', unit: 'cm', min: 10, max: 30, step: 0.5, default: 20 },
    { kind: 'number', key: 'h', label: 'Open limb above closed', unit: 'cm', min: -30, max: 40, step: 1, default: 10 },
  ],
  readouts: p => {
    const s = solveBoyle(p);
    return [{ label: 'Pressure P', value: `${fmt(s.P, 1)} cm Hg` }, { label: 'Air column l', value: cm(s.l) }, { label: '1/l', value: `${fmt(1 / s.l, 4)} cm⁻¹` }, { label: 'P × l', value: `${fmt(s.PV, 0)} cm² Hg` }];
  },
  predictions,
};
