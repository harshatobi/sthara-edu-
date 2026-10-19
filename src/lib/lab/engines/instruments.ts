import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Measuring instruments (CBSE Class XI Physics practicals A1-A4): Vernier
 * callipers, screw gauge and spherometer, each with a zero error.
 *
 * Vernier: main scale in mm (MSD 0.1 cm); 10 vernier divisions = 9 MSD, so the
 * least count is 1 MSD − 1 VSD = 0.01 cm. A reading is MSR + (coinciding VSD × LC).
 * Screw gauge: pitch 1 mm, 100 circular divisions, so LC = 0.01 mm. A reading is
 * PSR + (circular scale division × LC).
 * Spherometer: the same screw (LC 0.01 mm); legs on an equilateral triangle of
 * side l. With the sagitta h, the radius of curvature is R = l²/6h + h/2.
 *
 * The zero error is in divisions of the moving scale: positive when the zero of
 * the moving scale is past the main zero with the jaws closed. Corrected
 * reading = observed reading − zero error.
 */

export type InstrumentParams = { tool: string; len: number; dia: number; radius: number; zero: number };

export const VERNIER_LC = 0.01; // cm
export const SCREW_LC = 0.01; // mm
export const PITCH = 1; // mm
export const LEG = 4; // cm, spherometer leg separation

export interface InstrumentReading {
  /** Main scale (vernier, cm) or pitch scale (screw gauge and spherometer, mm). */
  main: number;
  /** Coinciding vernier division, or the circular scale division against the reference line. */
  div: number;
  /** Observed reading, before the zero correction (cm for the vernier, mm for the screw). */
  observed: number;
  zeroError: number;
  corrected: number;
  unit: 'cm' | 'mm';
  lc: number;
}

/** Splits an observed reading into what the scales show. */
export function scaleReading(observed: number, lc: number, mainStep: number, divs: number, zeroError: number, unit: 'cm' | 'mm'): InstrumentReading {
  const n = Math.round(observed / lc);
  const perMain = Math.round(mainStep / lc);
  const main = Math.floor(n / perMain) * mainStep, div = ((n % perMain) + perMain) % perMain;
  const obs = Number((n * lc).toFixed(4));
  return { main: Number(main.toFixed(4)), div: div % divs, observed: obs, zeroError, corrected: Number((obs - zeroError).toFixed(4)), unit, lc };
}

/** The sagitta (mm) of a surface of radius R cm under legs `LEG` cm apart: R = l²/6h + h/2 solved for h. */
export function sagitta(radiusCm: number, legCm = LEG): number {
  const R = radiusCm * 10, l = legCm * 10;
  // h² − 2Rh + l²/3 = 0 (from R = l²/6h + h/2), the small root.
  return R - Math.sqrt(R * R - (l * l) / 3);
}

export const radiusFrom = (hMm: number, legCm = LEG) => ((legCm * 10) ** 2 / (6 * hMm) + hMm / 2) / 10; // cm

export function solveInstrument(p: InstrumentParams): InstrumentReading & { truth: number; label: string } {
  if (p.tool === 'vernier') {
    const ze = p.zero * VERNIER_LC;
    return { ...scaleReading(p.len + ze, VERNIER_LC, 0.1, 10, ze, 'cm'), truth: p.len, label: 'Length' };
  }
  const ze = p.zero * SCREW_LC;
  if (p.tool === 'screw') return { ...scaleReading(p.dia + ze, SCREW_LC, PITCH, 100, ze, 'mm'), truth: p.dia, label: 'Diameter' };
  const h = sagitta(p.radius);
  return { ...scaleReading(h + ze, SCREW_LC, PITCH, 100, ze, 'mm'), truth: h, label: 'Sagitta h' };
}

const u = (x: number, unit: string, dp: number) => `${x.toFixed(dp)} ${unit}`;
const dpOf = (r: InstrumentReading) => (r.unit === 'cm' ? 2 : 2);
const NAMES: Record<string, string> = { vernier: 'Vernier callipers', screw: 'screw gauge', spherometer: 'spherometer' };

const predictions: PredictionTemplate<InstrumentParams>[] = [
  {
    id: 'least-count', label: 'Least count', topic: 'Determining the uncertainty in a result',
    build: p => {
      const right = p.tool === 'vernier' ? '0.01 cm' : '0.01 mm';
      const c = choices(right, p.tool === 'vernier' ? ['0.1 cm', '0.001 cm', '0.09 cm'] : ['0.1 mm', '1 mm', '0.001 mm'], 301);
      const explain = p.tool === 'vernier'
        ? '10 vernier divisions cover 9 main scale divisions of 1 mm, so 1 VSD = 0.9 mm and LC = 1 MSD − 1 VSD = 0.1 mm = 0.01 cm.'
        : `Least count = pitch / divisions on the circular scale = ${PITCH} mm / 100 = 0.01 mm.`;
      return { prompt: `What is the least count of this ${NAMES[p.tool]}?`, ...c, explain };
    },
  },
  {
    id: 'reading', label: 'Read the scales', topic: 'Significant figures',
    applies: p => p.zero === 0,
    build: p => {
      const r = solveInstrument(p), dp = dpOf(r);
      const step = p.tool === 'vernier' ? 0.1 : PITCH;
      const c = choices(u(r.observed, r.unit, dp), [u(r.main + r.div * step, r.unit, dp), u(r.main, r.unit, dp), u(r.main + r.div * r.lc * 10, r.unit, dp), u(r.observed + r.lc, r.unit, dp), u(r.observed + step, r.unit, dp)], 302);
      const what = p.tool === 'vernier' ? `main scale ${r.main.toFixed(1)} cm, vernier division ${r.div} coincides` : `pitch scale ${r.main.toFixed(0)} mm, circular scale at ${r.div}`;
      return { prompt: `The ${NAMES[p.tool]} shows ${what}. What is the reading?`, ...c, explain: `Reading = ${r.main.toFixed(p.tool === 'vernier' ? 1 : 0)} + ${r.div} × ${r.lc} = ${u(r.observed, r.unit, dp)}.` };
    },
  },
  {
    id: 'zero-correct', label: 'Correct for the zero error', topic: 'Determining the uncertainty in a result',
    applies: p => p.zero !== 0,
    build: p => {
      const r = solveInstrument(p), dp = dpOf(r);
      const c = choices(u(r.corrected, r.unit, dp), [u(r.observed + r.zeroError, r.unit, dp), u(r.observed, r.unit, dp), u(r.corrected - 2 * r.zeroError, r.unit, dp)], 303);
      const sign = p.zero > 0 ? 'positive' : 'negative';
      return { prompt: `Observed reading ${u(r.observed, r.unit, dp)}; with the jaws closed the zero error is ${p.zero > 0 ? '+' : ''}${p.zero} divisions (${sign}). What is the corrected reading?`, ...c, explain: `Zero error = ${p.zero} × ${r.lc} = ${r.zeroError.toFixed(2)} ${r.unit}. Corrected = observed − zero error = ${r.observed.toFixed(dp)} − (${r.zeroError.toFixed(2)}) = ${u(r.corrected, r.unit, dp)}.` };
    },
  },
  {
    id: 'radius', label: 'Radius of curvature', topic: 'Determining the uncertainty in a result',
    applies: p => p.tool === 'spherometer',
    build: p => {
      const h = solveInstrument(p).corrected, R = radiusFrom(h);
      const c = choices(`${fmt(R, 1)} cm`, [`${fmt(R / 2, 1)} cm`, `${fmt(LEG * LEG / h, 1)} cm`, `${fmt(R * 3, 1)} cm`], 304);
      return { prompt: `The legs are ${LEG} cm apart and the sagitta is ${h.toFixed(2)} mm. What is the radius of curvature?`, ...c, explain: `R = l²/6h + h/2 = (${LEG * 10} mm)²/(6 × ${h.toFixed(2)}) + ${h.toFixed(2)}/2 = ${fmt(R * 10, 0)} mm ≈ ${fmt(R, 1)} cm.` };
    },
  },
  {
    id: 'sig-figs', label: 'Significant figures', topic: 'Significant figures',
    build: p => {
      const r = solveInstrument(p), s = r.corrected.toFixed(2);
      const n = s.replace('.', '').replace(/^0+/, '').length;
      const c = choices(String(n), [String(n + 1), String(Math.max(1, n - 1)), String(n + 2)], 305);
      return { prompt: `How many significant figures does the reading ${s} ${r.unit} have?`, ...c, explain: `Leading zeros don't count; every digit read off the instrument does, including the last one at the least count: ${s} has ${n}.` };
    },
  },
];

export const instruments: LabEngine<InstrumentParams> = {
  id: 'instruments',
  title: 'Vernier, screw gauge and spherometer',
  blurb: 'Read the main and vernier (or circular) scales, find the least count and correct for the zero error.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Units and Measurements'],
  params: [
    { kind: 'choice', key: 'tool', label: 'Instrument', default: 'vernier', options: [{ value: 'vernier', label: 'Vernier callipers' }, { value: 'screw', label: 'Screw gauge' }, { value: 'spherometer', label: 'Spherometer' }] },
    { kind: 'number', key: 'len', label: 'Object length', unit: 'cm', min: 0.5, max: 9, step: 0.01, default: 2.47, show: p => p.tool === 'vernier' },
    { kind: 'number', key: 'dia', label: 'Wire or sheet', unit: 'mm', min: 0.1, max: 9, step: 0.01, default: 0.62, show: p => p.tool === 'screw' },
    { kind: 'number', key: 'radius', label: 'Surface radius', unit: 'cm', min: 10, max: 120, step: 1, default: 40, show: p => p.tool === 'spherometer' },
    { kind: 'number', key: 'zero', label: 'Zero error', unit: 'div', min: -6, max: 6, step: 1, default: 0 },
  ],
  readouts: p => {
    const r = solveInstrument(p);
    return [
      { label: 'Least count', value: `${r.lc} ${r.unit}` },
      { label: p.tool === 'vernier' ? 'Main scale' : 'Pitch scale', value: `${r.main.toFixed(p.tool === 'vernier' ? 1 : 0)} ${r.unit}` },
      { label: p.tool === 'vernier' ? 'Vernier division' : 'Circular division', value: String(r.div) },
      { label: 'Observed', value: u(r.observed, r.unit, 2) },
      { label: 'Zero error', value: u(r.zeroError, r.unit, 2) },
      { label: `${r.label} (corrected)`, value: u(r.corrected, r.unit, 2) },
      ...(p.tool === 'spherometer' ? [{ label: 'Radius R', value: `${fmt(radiusFrom(r.corrected), 1)} cm` }] : []),
    ];
  },
  predictions,
};
