import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Semiconductor devices (CBSE Class XII Physics, experiment B9, activity B3, and
 * the rectifier in theory).
 *
 * p-n junction diode: forward current I = Iₛ(e^(V/ηV_T) − 1), negligible until the
 *   cut-in voltage (about 0.6-0.7 V for silicon, 0.2-0.3 V for germanium) and then
 *   rising steeply. Reverse biased only a tiny saturation current flows (μA),
 *   rising slightly with the voltage (leakage), up to breakdown.
 * LDR: light frees electrons across the band gap, so its resistance falls as the
 *   light gets brighter. Intensity ∝ 1/d², and R ∝ (intensity)^(−0.7) ∝ d^1.4.
 * Rectifier: a diode passes only one half of each AC cycle (half wave, output
 *   ripple at 50 Hz, average V_m/π); a bridge or centre-tap passes both (full
 *   wave, ripple at 100 Hz, average 2V_m/π).
 */

export type DiodeParams = { mode: string; material: string; bias: string; V: number; d: number; wave: string; Vm: number };

const VT = 0.02585;
export const DIODES: Record<string, { label: string; Is: number; eta: number; leak0: number; leak: number; cutIn: number }> = {
  si: { label: 'Silicon', Is: 5e-9, eta: 1.9, leak0: 0.2e-6, leak: 0.03e-6, cutIn: 0.65 },
  ge: { label: 'Germanium', Is: 2e-6, eta: 1.5, leak0: 8e-6, leak: 0.6e-6, cutIn: 0.25 },
};
export const LDR = { R10: 1000, gamma: 1.4, E: 6 };

/** Diode current (A): forward V ≥ 0, reverse as a positive reverse voltage. */
export function diodeCurrent(material: string, bias: string, V: number) {
  const d = DIODES[material] ?? DIODES.si;
  if (bias === 'reverse') return -(d.leak0 + d.leak * V);
  return d.Is * (Math.exp(V / (d.eta * VT)) - 1);
}
export const ldrResistance = (dCm: number) => LDR.R10 * (dCm / 10) ** LDR.gamma;
export const rectified = (wave: string, Vm: number) => ({ dc: (wave === 'full' ? 2 : 1) * Vm / Math.PI, ripple: wave === 'full' ? 100 : 50 });

const SEMI = 'Semiconductor diode: I-V characteristics in forward and reverse bias';
const mA = (a: number) => (Math.abs(a) < 1e-3 ? `${fmt(a * 1e6, 2)} μA` : `${fmt(a * 1000, 2)} mA`);

const predictions: PredictionTemplate<DiodeParams>[] = [
  {
    id: 'cut-in', label: 'Cut-in voltage', topic: SEMI,
    applies: p => p.mode === 'iv',
    build: p => {
      const d = DIODES[p.material];
      const c = choices(`About ${fmt(d.cutIn, 2)} V`, p.material === 'si' ? ['About 0.25 V', 'About 0 V', 'About 5 V'] : ['About 0.65 V', 'About 0 V', 'About 5 V'], 491);
      return { prompt: `From what forward voltage does a ${d.label.toLowerCase()} diode start to conduct noticeably?`, ...c, explain: `Below the cut-in (knee) voltage the potential barrier stops most charge carriers; the current is tiny. Beyond it, I rises exponentially. Silicon ≈ 0.6-0.7 V, germanium ≈ 0.2-0.3 V.` };
    },
  },
  {
    id: 'forward-i', label: 'Forward current', topic: SEMI,
    applies: p => p.mode === 'iv' && p.bias === 'forward' && p.V <= 0.9 && diodeCurrent(p.material, 'forward', p.V) >= 1e-6,
    build: p => {
      const I = diodeCurrent(p.material, 'forward', p.V);
      const c = choices(mA(I), [mA(I * 10), mA(I / 10), mA(p.V / 100)], 492);
      return { prompt: `${fmt(p.V, 2)} V forward across the ${DIODES[p.material].label.toLowerCase()} diode. Roughly what current flows?`, ...c, explain: `I = Iₛ(e^(V/ηV_T) − 1) ≈ ${mA(I)}. Every extra ~0.1 V multiplies the current several times: the graph rises steeply after the knee.` };
    },
  },
  {
    id: 'reverse', label: 'In reverse bias', topic: SEMI,
    applies: p => p.mode === 'iv' && p.bias === 'reverse',
    build: p => {
      const I = -diodeCurrent(p.material, 'reverse', p.V);
      const c = choices(`A few microamperes: ${mA(I)}`, ['Several milliamperes', 'Exactly zero', 'Grows like the forward current'], 493);
      return { prompt: `${fmt(p.V, 0)} V in reverse across the diode. What current flows?`, ...c, explain: 'Reverse bias widens the depletion layer; only the minority carriers cross, giving a tiny saturation current that hardly changes with voltage (until breakdown). That is why a microammeter is used for the reverse readings.' };
    },
  },
  {
    id: 'ldr', label: 'Moving the lamp away', topic: 'Energy bands in conductors, semiconductors and insulators',
    applies: p => p.mode === 'ldr',
    build: p => {
      const R = ldrResistance(p.d), R2 = ldrResistance(p.d * 2);
      const c = choices(`It rises, about ${fmt(R2 / R, 1)} times`, ['It falls', 'It stays the same', 'It doubles exactly'], 494);
      return { prompt: `The lamp is moved from ${fmt(p.d, 0)} cm to ${fmt(p.d * 2, 0)} cm from the LDR. What happens to its resistance?`, ...c, explain: `Twice the distance gives a quarter of the light (I ∝ 1/d²). Fewer photons free fewer electrons across the band gap, so R rises: ${fmt(R, 0)} Ω → ${fmt(R2, 0)} Ω and the current falls.` };
    },
  },
  {
    id: 'rect-dc', label: 'Average output', topic: 'Junction diode as a rectifier',
    applies: p => p.mode === 'rectifier',
    build: p => {
      const r = rectified(p.wave, p.Vm), other = rectified(p.wave === 'full' ? 'half' : 'full', p.Vm);
      const c = choices(`${fmt(r.dc, 2)} V`, [`${fmt(other.dc, 2)} V`, `${fmt(p.Vm, 2)} V`, `${fmt(p.Vm / Math.SQRT2, 2)} V`], 495);
      return { prompt: `A ${p.wave}-wave rectifier on ${fmt(p.Vm, 0)} V peak AC (no filter). What does a DC voltmeter on the output read?`, ...c, explain: `${p.wave === 'full' ? 'Both halves of each cycle pass: V_dc = 2V_m/π' : 'Only one half of each cycle passes: V_dc = V_m/π'} = ${fmt(r.dc, 2)} V. The ripple is at ${r.ripple} Hz.` };
    },
  },
  {
    id: 'ripple', label: 'Ripple frequency', topic: 'Junction diode as a rectifier',
    applies: p => p.mode === 'rectifier',
    build: p => {
      const r = rectified(p.wave, p.Vm);
      const c = choices(`${r.ripple} Hz`, [`${r.ripple === 50 ? 100 : 50} Hz`, '0 Hz', '25 Hz'], 496);
      return { prompt: `On 50 Hz mains, what is the frequency of the ${p.wave}-wave output pulses?`, ...c, explain: p.wave === 'full' ? 'Each cycle gives two pulses, so 100 per second.' : 'Each cycle gives one pulse, so 50 per second.' };
    },
  },
];

export const diode: LabEngine<DiodeParams> = {
  id: 'diode',
  title: 'Diode, LDR and rectifier',
  blurb: 'Plot the I-V curve of a p-n junction in forward and reverse bias, watch an LDR as a lamp moves away, and rectify AC.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Semiconductor Electronics: Materials, Devices and Simple Circuits'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'iv', options: [{ value: 'iv', label: 'p-n junction I-V' }, { value: 'ldr', label: 'LDR and light' }, { value: 'rectifier', label: 'Rectifier' }] },
    { kind: 'choice', key: 'material', label: 'Diode', default: 'si', options: Object.entries(DIODES).map(([value, d]) => ({ value, label: d.label })), show: p => p.mode === 'iv' },
    { kind: 'choice', key: 'bias', label: 'Bias', default: 'forward', options: [{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }], show: p => p.mode === 'iv' },
    { kind: 'number', key: 'V', label: 'Voltage', unit: 'V', min: 0, max: 20, step: 0.05, default: 0.7, show: p => p.mode === 'iv' },
    { kind: 'number', key: 'd', label: 'Lamp distance', unit: 'cm', min: 10, max: 100, step: 5, default: 20, show: p => p.mode === 'ldr' },
    { kind: 'choice', key: 'wave', label: 'Rectifier', default: 'half', options: [{ value: 'half', label: 'Half wave' }, { value: 'full', label: 'Full wave' }], show: p => p.mode === 'rectifier' },
    { kind: 'number', key: 'Vm', label: 'Peak AC voltage', unit: 'V', min: 3, max: 24, step: 1, default: 12, show: p => p.mode === 'rectifier' },
  ],
  check: p => (p.mode === 'iv' && p.bias === 'forward' && p.V > 0.9 ? 'Keep the forward voltage below 0.9 V, or the diode overheats.' : null),
  readouts: p => {
    if (p.mode === 'ldr') { const R = ldrResistance(p.d); return [{ label: 'LDR resistance', value: `${fmt(R, 0)} Ω` }, { label: `Current (${LDR.E} V)`, value: mA(LDR.E / R) }]; }
    if (p.mode === 'rectifier') { const r = rectified(p.wave, p.Vm); return [{ label: 'Average output', value: `${fmt(r.dc, 2)} V` }, { label: 'Ripple', value: `${r.ripple} Hz` }]; }
    return [{ label: 'Current', value: mA(diodeCurrent(p.material, p.bias, p.V)) }, { label: 'Cut-in', value: `≈ ${DIODES[p.material].cutIn} V` }];
  },
  predictions,
};
