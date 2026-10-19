import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Sonometer (CBSE Class XI Physics, experiments B8 and B9; Class XII experiment A6).
 *
 * A wire under tension T (a hanger of M kg, T = Mg) with mass per unit length μ
 * vibrates in its fundamental mode between two bridges l apart at
 *   f = (1/2l) √(T/μ).
 * B8: at constant tension, the resonant length for each tuning fork: f ∝ 1/l, so
 *     f·l is constant and f against 1/l is a straight line.
 * B9: for one fork, the length for each tension: l ∝ √T, so l² against T is a line.
 * XII A6: an iron wire over an electromagnet fed from the AC mains is pulled twice
 *     every cycle, so it resonates at 2ν; the mains frequency is ν = (1/4l)√(T/μ).
 */

export type SonometerParams = { mode: string; f: string; M: number; wire: string };

export const G = 9.8;
export const MAINS = 50;
export const FORKS = [256, 288, 320, 341.3, 384, 426.7, 480, 512];
/** Steel wires: mass per unit length (kg/m). */
export const WIRES: Record<string, { label: string; mu: number }> = {
  thin: { label: 'Steel, 0.4 mm', mu: 7800 * Math.PI * 0.0002 ** 2 },
  thick: { label: 'Steel, 0.6 mm', mu: 7800 * Math.PI * 0.0003 ** 2 },
};

const muOf = (wire: string) => WIRES[wire]?.mu ?? WIRES.thin.mu;
/** Resonant length (cm) for a frequency (Hz) under M kg. */
export const lengthFor = (f: number, M: number, wire: string) => (1 / (2 * f)) * Math.sqrt((M * G) / muOf(wire)) * 100;
/** The frequency the wire is driven at: the fork's, or twice the mains. */
export const drive = (p: SonometerParams) => (p.mode === 'mains' ? 2 * MAINS : Number(p.f));

const cm = (x: number) => `${fmt(x, 1)} cm`;
const STANDING = 'Standing waves in strings and organ pipes; fundamental mode and harmonics';

const predictions: PredictionTemplate<SonometerParams>[] = [
  {
    id: 'length', label: 'Resonant length', topic: STANDING,
    applies: p => p.mode !== 'mains',
    build: p => {
      const l = lengthFor(Number(p.f), p.M, p.wire);
      const c = choices(cm(l), [cm(l * 2), cm(l / 2), cm(lengthFor(Number(p.f), p.M * 2, p.wire))], 401);
      return { prompt: `A ${fmt(Number(p.f), 1)} Hz fork, ${fmt(p.M, 1)} kg on the hanger, ${WIRES[p.wire].label.toLowerCase()} wire. At what length does the paper rider fly off?`, ...c, explain: `l = (1/2f)√(T/μ) = (1/${fmt(2 * Number(p.f), 0)})√(${fmt(p.M * G, 1)}/${muOf(p.wire).toExponential(2)}) = ${cm(l)}.` };
    },
  },
  {
    id: 'higher-fork', label: 'A higher fork', topic: STANDING,
    applies: p => p.mode === 'fork',
    build: p => {
      const c = choices('Shorter: f·l stays the same', ['Longer', 'The same length', 'Twice as long'], 402);
      return { prompt: `The ${fmt(Number(p.f), 1)} Hz fork is changed for one of ${fmt(Number(p.f) * 2, 1)} Hz, same tension. How long must the wire be now?`, ...c, explain: `f ∝ 1/l at constant tension: twice the frequency needs half the length, ${cm(lengthFor(Number(p.f) * 2, p.M, p.wire))}. f against 1/l is a straight line through the origin.` };
    },
  },
  {
    id: 'four-t', label: 'Four times the tension', topic: 'Transverse and longitudinal waves; speed of a travelling wave',
    applies: p => p.mode === 'tension',
    build: p => {
      const c = choices('Twice as long', ['Four times as long', 'Half as long', 'The same'], 403);
      return { prompt: `Same ${fmt(Number(p.f), 1)} Hz fork, but four times the tension. What length resonates now?`, ...c, explain: `The wave speed v = √(T/μ) doubles when T is four times, and l = v/2f, so the length doubles: ${cm(lengthFor(Number(p.f), p.M, p.wire))} → ${cm(lengthFor(Number(p.f), p.M * 4, p.wire))}. l² ∝ T.` };
    },
  },
  {
    id: 'mains', label: 'Frequency of the mains', topic: 'Peak and RMS value of alternating current/voltage',
    chapter: 'Alternating Current',
    applies: p => p.mode === 'mains',
    build: p => {
      const l = lengthFor(2 * MAINS, p.M, p.wire);
      const c = choices(`${MAINS} Hz`, [`${2 * MAINS} Hz`, `${MAINS / 2} Hz`, '60 Hz'], 404);
      return { prompt: `The iron wire over the electromagnet resonates at ${cm(l)} with ${fmt(p.M, 1)} kg on the hanger. What is the mains frequency?`, ...c, explain: `The magnet pulls the iron wire on both halves of each cycle, so the wire vibrates at 2ν: 2ν = (1/2l)√(T/μ) = ${fmt(2 * MAINS, 0)} Hz, so ν = ${MAINS} Hz.` };
    },
  },
];

export const sonometer: LabEngine<SonometerParams> = {
  id: 'sonometer',
  title: 'Sonometer',
  blurb: 'Find the resonant length for each tuning fork and each tension, or let the AC mains drive an iron wire to measure its frequency.',
  subject: 'Physics',
  classes: [11, 12],
  chapters: ['Waves', 'Alternating Current'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'fork', options: [{ value: 'fork', label: 'Frequency and length' }, { value: 'tension', label: 'Length and tension' }, { value: 'mains', label: 'Frequency of AC mains' }] },
    { kind: 'choice', key: 'f', label: 'Tuning fork', default: '320', options: FORKS.map(f => ({ value: String(f), label: `${f} Hz` })), show: p => p.mode !== 'mains' },
    { kind: 'number', key: 'M', label: 'Load on the hanger', unit: 'kg', min: 1, max: 8, step: 0.5, default: 4 },
    { kind: 'choice', key: 'wire', label: 'Wire', default: 'thin', options: Object.entries(WIRES).map(([value, w]) => ({ value, label: w.label })) },
  ],
  check: p => {
    const l = lengthFor(drive(p), p.M, p.wire);
    return l < 8 || l > 100 ? 'The resonant length would fall outside the 100 cm sonometer.' : null;
  },
  readouts: p => {
    const f = drive(p), l = lengthFor(f, p.M, p.wire);
    return [
      { label: 'Wire vibrates at', value: `${fmt(f, 1)} Hz` },
      { label: 'Tension', value: `${fmt(p.M * G, 1)} N` },
      { label: 'Resonant length', value: cm(l) },
      { label: 'Wave speed √(T/μ)', value: `${fmt(Math.sqrt((p.M * G) / muOf(p.wire)), 0)} m/s` },
    ];
  },
  predictions,
};
