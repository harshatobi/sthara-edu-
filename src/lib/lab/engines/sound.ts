import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Sound (NCERT Class 9 Ch "Sound"): v = fλ, T = 1/f, and the echo: sound goes
 * to the wall and back, t = 2d/v. A distinct echo needs the reflected sound to
 * arrive at least 0.1 s after the original (the persistence of hearing), so
 * the wall must be at least v × 0.05 away (about 17 m in air).
 * Speeds are NCERT's table values.
 */

export type Medium = 'air0' | 'air25' | 'water' | 'steel';
export type SoundParams = { medium: Medium; f: number; d: number };

export const MEDIUM: Record<Medium, { label: string; v: number }> = {
  air0: { label: 'Air at 0 °C', v: 331 },
  air25: { label: 'Air at 25 °C', v: 346 },
  water: { label: 'Sea water', v: 1531 },
  steel: { label: 'Steel', v: 5960 },
};

export const PERSISTENCE_S = 0.1;

export function solveSound(p: SoundParams) {
  const v = MEDIUM[p.medium].v;
  const echo = (2 * p.d) / v;
  return { v, lambda: v / p.f, period: 1 / p.f, echo, distinct: echo >= PERSISTENCE_S - 1e-12, minDistance: (v * PERSISTENCE_S) / 2 };
}

const m = (n: number) => (n >= 1 ? `${fmt(n, 2)} m` : `${fmt(n * 100, 1)} cm`);
const s = (n: number) => (n >= 0.1 ? `${fmt(n, 2)} s` : `${fmt(n * 1000, 1)} ms`);

const predictions: PredictionTemplate<SoundParams>[] = [
  {
    id: 'wavelength', label: 'Wavelength', topic: 'Characteristics: wavelength, frequency, time period, amplitude, intensity, speed',
    build: p => {
      const r = solveSound(p);
      const c = choices(m(r.lambda), [m(r.v * p.f / 1e5), m(p.f / r.v), m(r.lambda * 2), m(r.lambda / 2)], 61);
      return { prompt: `A ${fmt(p.f, 0)} Hz note in ${MEDIUM[p.medium].label.toLowerCase()} (${r.v} m/s). What is its wavelength?`, ...c, explain: `v = fλ, so λ = v/f = ${r.v}/${fmt(p.f, 0)} = ${m(r.lambda)}.` };
    },
  },
  {
    id: 'double-f', label: 'If the frequency doubles', topic: 'Characteristics: wavelength, frequency, time period, amplitude, intensity, speed',
    build: p => {
      const c = choices('The wavelength halves', ['The wavelength halves', 'The wavelength doubles', 'The speed doubles', 'Nothing changes'], 62);
      const r = solveSound(p);
      return { prompt: `What happens if the note goes up to ${fmt(p.f * 2, 0)} Hz in the same medium?`, ...c, explain: `The medium sets the speed (${r.v} m/s), so λ = v/f: ${m(r.lambda)} becomes ${m(r.lambda / 2)}. A higher pitch means shorter waves, not faster ones.` };
    },
  },
  {
    id: 'echo-time', label: 'When the echo comes back', topic: 'Reflection of sound: echo, reverberation, echolocation',
    build: p => {
      const r = solveSound(p);
      const c = choices(s(r.echo), [s(p.d / r.v), s(r.echo * 2), s(r.v / p.d / 100), s(r.echo / 4)], 63);
      return { prompt: `You clap ${fmt(p.d, 0)} m from a wall. When do you hear the echo?`, ...c, explain: `The sound goes there and back: t = 2d/v = 2 × ${fmt(p.d, 0)}/${r.v} = ${s(r.echo)}.` };
    },
  },
  {
    id: 'distinct-echo', label: 'Is the echo heard separately?', topic: 'Reflection of sound: echo, reverberation, echolocation',
    build: p => {
      const r = solveSound(p);
      const c = choices(r.distinct ? 'Yes, a separate echo' : 'No, it merges with the clap', ['Yes, a separate echo', 'No, it merges with the clap'], 64);
      return { prompt: 'Will you hear the echo as a separate sound?', ...c, explain: `The ear keeps a sound for about 0.1 s. The echo arrives after ${s(r.echo)}, so ${r.distinct ? 'it is heard on its own' : 'it blends in'}. For a distinct echo in this medium the wall must be at least ${fmt(r.minDistance, 1)} m away.` };
    },
  },
];

export const sound: LabEngine<SoundParams> = {
  id: 'sound',
  title: 'Sound waves and echoes',
  blurb: 'Change the pitch and the medium: see the wavelength shrink and time an echo off a wall.',
  subject: 'Science',
  classes: [9],
  chapters: ['Sound'],
  params: [
    { kind: 'choice', key: 'medium', label: 'Medium', default: 'air25', options: (Object.keys(MEDIUM) as Medium[]).map(value => ({ value, label: `${MEDIUM[value].label} (${MEDIUM[value].v} m/s)` })) },
    { kind: 'number', key: 'f', label: 'Frequency', unit: 'Hz', min: 20, max: 2000, step: 10, default: 440 },
    { kind: 'number', key: 'd', label: 'Distance to the wall', unit: 'm', min: 2, max: 1000, step: 1, default: 173 },
  ],
  readouts: p => {
    const r = solveSound(p);
    return [
      { label: 'Speed', value: `${r.v} m/s` },
      { label: 'Wavelength', value: m(r.lambda) },
      { label: 'Period', value: s(r.period) },
      { label: 'Echo after', value: `${s(r.echo)}${r.distinct ? '' : ' (merges)'}` },
    ];
  },
  predictions,
};
