import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Series LCR circuit (Class XII Physics, Alternating Current). On an AC supply
 * of V_rms at frequency f:
 *   X_L = 2πfL, X_C = 1/2πfC, Z = √(R² + (X_L − X_C)²), I = V/Z,
 *   phase φ = tan⁻¹((X_L − X_C)/R), power factor cos φ = R/Z, P = V I cos φ.
 * At resonance f₀ = 1/(2π√(LC)) the reactances cancel: Z = R, the current is
 * largest and in phase with the voltage. Peak values are √2 times the rms.
 */

export type LcrParams = { R: number; L: number; C: number; f: number; V: number };

export function solveLcr(p: LcrParams) {
  const L = p.L / 1000, C = p.C * 1e-6;
  const XL = 2 * Math.PI * p.f * L, XC = 1 / (2 * Math.PI * p.f * C);
  const Z = Math.sqrt(p.R ** 2 + (XL - XC) ** 2), I = p.V / Z;
  const phi = (Math.atan((XL - XC) / p.R) * 180) / Math.PI;
  return { XL, XC, Z, I, phi, pf: p.R / Z, P: p.V * I * (p.R / Z), f0: 1 / (2 * Math.PI * Math.sqrt(L * C)) };
}
export const currentAt = (p: LcrParams, f: number) => solveLcr({ ...p, f }).I;

const ohm = (x: number) => `${fmt(x, 1)} Ω`;
const A = (x: number) => `${fmt(x * 1000, 1)} mA`;
const RES = 'LCR series circuit (phasors only); resonance';

const predictions: PredictionTemplate<LcrParams>[] = [
  {
    id: 'impedance', label: 'Impedance', topic: 'Reactance and impedance',
    build: p => {
      const s = solveLcr(p);
      const c = choices(ohm(s.Z), [ohm(p.R + s.XL + s.XC), ohm(p.R), ohm(Math.abs(s.XL - s.XC))].filter(x => x !== ohm(s.Z)), 551);
      return { prompt: `R = ${ohm(p.R)}, X_L = ${ohm(s.XL)}, X_C = ${ohm(s.XC)} in series. What is the impedance?`, ...c, explain: `Z = √(R² + (X_L − X_C)²) = √(${fmt(p.R, 0)}² + ${fmt(s.XL - s.XC, 1)}²) = ${ohm(s.Z)}. The reactances partly cancel because their voltages are opposite in phase.` };
    },
  },
  {
    id: 'resonance', label: 'Resonant frequency', topic: RES,
    build: p => {
      const s = solveLcr(p);
      const c = choices(`${fmt(s.f0, 0)} Hz`, [`${fmt(s.f0 * 2 * Math.PI, 0)} Hz`, `${fmt(s.f0 / 2, 0)} Hz`, `${fmt(1 / Math.sqrt((p.L / 1000) * p.C * 1e-6), 0)} Hz`], 552);
      return { prompt: `L = ${fmt(p.L, 0)} mH, C = ${fmt(p.C, 1)} μF. At what frequency is the current largest?`, ...c, explain: `At resonance X_L = X_C: f₀ = 1/(2π√(LC)) = 1/(2π√(${fmt(p.L / 1000, 3)} × ${fmt(p.C, 1)} × 10⁻⁶)) = ${fmt(s.f0, 0)} Hz. There Z = R and I = V/R.` };
    },
  },
  {
    id: 'phase', label: 'Current leads or lags', topic: RES,
    applies: p => Math.abs(solveLcr(p).XL - solveLcr(p).XC) > 1,
    build: p => {
      const s = solveLcr(p), ind = s.XL > s.XC;
      const c = choices(`It ${ind ? 'lags' : 'leads'} the voltage by ${fmt(Math.abs(s.phi), 0)}°`, [`It ${ind ? 'leads' : 'lags'} the voltage by ${fmt(Math.abs(s.phi), 0)}°`, 'It is in phase with the voltage', 'It is 90° out of phase'], 553);
      return { prompt: `At ${fmt(p.f, 0)} Hz, how is the current related to the supply voltage?`, ...c, explain: `X_L ${ind ? '>' : '<'} X_C, so the circuit is ${ind ? 'inductive: the current lags' : 'capacitive: the current leads'}. tan φ = (X_L − X_C)/R gives φ = ${fmt(s.phi, 1)}°.` };
    },
  },
  {
    id: 'power', label: 'Average power', topic: 'Power in AC circuits; power factor; wattless current',
    build: p => {
      const s = solveLcr(p);
      const c = choices(`${fmt(s.P, 2)} W`, [`${fmt(p.V * s.I, 2)} W`, `${fmt(s.P * 2, 2)} W`, '0 W'], 554);
      return { prompt: `V = ${fmt(p.V, 0)} V rms, I = ${A(s.I)}, power factor ${fmt(s.pf, 2)}. What average power does the circuit take?`, ...c, explain: `P = V I cos φ = ${fmt(p.V, 0)} × ${fmt(s.I, 4)} × ${fmt(s.pf, 2)} = ${fmt(s.P, 2)} W, all of it in R. Pure L and C take no average power.` };
    },
  },
  {
    id: 'peak', label: 'Peak current', topic: 'Peak and RMS value of alternating current/voltage',
    build: p => {
      const s = solveLcr(p);
      const c = choices(A(s.I * Math.SQRT2), [A(s.I), A(s.I / Math.SQRT2), A(s.I * 2)], 555);
      return { prompt: `The ammeter reads ${A(s.I)} (rms). What is the peak current?`, ...c, explain: `I₀ = √2 × I_rms = 1.414 × ${A(s.I)} = ${A(s.I * Math.SQRT2)}. AC meters read rms values.` };
    },
  },
];

export const lcr: LabEngine<LcrParams> = {
  id: 'lcr',
  title: 'Series LCR circuit',
  blurb: 'Tune the frequency through resonance: watch the current peak, the phase flip and the power factor reach one.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Alternating Current'],
  params: [
    { kind: 'number', key: 'R', label: 'Resistance', unit: 'Ω', min: 10, max: 200, step: 5, default: 40 },
    { kind: 'number', key: 'L', label: 'Inductance', unit: 'mH', min: 10, max: 500, step: 10, default: 100 },
    { kind: 'number', key: 'C', label: 'Capacitance', unit: 'μF', min: 1, max: 100, step: 1, default: 20 },
    { kind: 'number', key: 'f', label: 'Frequency', unit: 'Hz', min: 10, max: 1000, step: 5, default: 50 },
    { kind: 'number', key: 'V', label: 'Supply', unit: 'V rms', min: 1, max: 230, step: 1, default: 10 },
  ],
  readouts: p => {
    const s = solveLcr(p);
    return [{ label: 'X_L', value: ohm(s.XL) }, { label: 'X_C', value: ohm(s.XC) }, { label: 'Z', value: ohm(s.Z) }, { label: 'Current (rms)', value: A(s.I) }, { label: 'Phase φ', value: `${fmt(s.phi, 1)}°` }, { label: 'Resonance', value: `${fmt(s.f0, 0)} Hz` }];
  },
  predictions,
};
