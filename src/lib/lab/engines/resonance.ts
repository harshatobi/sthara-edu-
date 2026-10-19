import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Resonance tube (CBSE Class XI Physics, experiment B10). A tube closed at the
 * bottom by water; a vibrating fork held over the open end. The air column
 * resonates (loud sound) when its length is a quarter wavelength, less the end
 * correction e ≈ 0.3D:  l₁ + e = λ/4, l₂ + e = 3λ/4.
 * Subtracting removes e: λ = 2(l₂ − l₁), so v = 2f(l₂ − l₁); and e = (l₂ − 3l₁)/2.
 * The speed of sound in air rises with temperature: v ≈ 331 + 0.61t m/s.
 */

export type ResonanceParams = { f: string; t: number; D: number };

export const FORKS = [288, 320, 384, 426.7, 480, 512];
export const speedAt = (tC: number) => 331.3 + 0.61 * tC;

export function solveResonance(p: ResonanceParams) {
  const f = Number(p.f), v = speedAt(p.t), lambda = (v / f) * 100, e = 0.3 * p.D;
  return { f, v, lambda, e, l1: lambda / 4 - e, l2: (3 * lambda) / 4 - e };
}

const cm = (x: number) => `${fmt(x, 1)} cm`;
const STANDING = 'Standing waves in strings and organ pipes; fundamental mode and harmonics';

const predictions: PredictionTemplate<ResonanceParams>[] = [
  {
    id: 'first', label: 'First resonance', topic: STANDING,
    build: p => {
      const s = solveResonance(p);
      const c = choices(cm(s.l1), [cm(s.lambda / 4), cm(s.lambda / 2), cm(s.l1 * 2)], 411);
      return { prompt: `A ${fmt(s.f, 1)} Hz fork over a tube ${fmt(p.D, 1)} cm wide, room at ${fmt(p.t, 0)} °C. At what air column length is the first loud sound?`, ...c, explain: `v = 331 + 0.61 × ${fmt(p.t, 0)} = ${fmt(s.v, 0)} m/s, λ = v/f = ${cm(s.lambda)}. l₁ = λ/4 − 0.3D = ${fmt(s.lambda / 4, 1)} − ${fmt(s.e, 1)} = ${cm(s.l1)}.` };
    },
  },
  {
    id: 'second', label: 'Second resonance', topic: STANDING,
    build: p => {
      const s = solveResonance(p);
      const c = choices(cm(s.l2), [cm(s.l1 * 2), cm(s.l1 * 3), cm(s.lambda)], 412);
      return { prompt: `The first resonance is at ${cm(s.l1)}. Where is the second?`, ...c, explain: `The second is at 3λ/4 − e: half a wavelength further, l₂ = l₁ + λ/2 = ${fmt(s.l1, 1)} + ${fmt(s.lambda / 2, 1)} = ${cm(s.l2)}. It is a little more than 3l₁ because of the end correction.` };
    },
  },
  {
    id: 'speed', label: 'Speed of sound from l₁ and l₂', topic: 'Transverse and longitudinal waves; speed of a travelling wave',
    build: p => {
      const s = solveResonance(p);
      const c = choices(`${fmt(s.v, 0)} m/s`, [`${fmt(4 * s.f * s.l1 / 100, 0)} m/s`, `${fmt(s.f * (s.l2 - s.l1) / 100, 0)} m/s`, '340 m/s, always'], 413);
      return { prompt: `l₁ = ${cm(s.l1)}, l₂ = ${cm(s.l2)} with a ${fmt(s.f, 1)} Hz fork. What is the speed of sound?`, ...c, explain: `v = 2f(l₂ − l₁) = 2 × ${fmt(s.f, 1)} × ${fmt((s.l2 - s.l1) / 100, 3)} = ${fmt(s.v, 0)} m/s. The end correction cancels out; 4fl₁ alone would come out too low.` };
    },
  },
  {
    id: 'warmer', label: 'On a hotter day', topic: 'Transverse and longitudinal waves; speed of a travelling wave',
    build: p => {
      const c = choices('Both resonance lengths get longer', ['They get shorter', 'They stay the same', 'Only the second one changes'], 414);
      return { prompt: `The room warms from ${fmt(p.t, 0)} °C to ${fmt(p.t + 15, 0)} °C. What happens to the resonance lengths?`, ...c, explain: `Sound travels faster in warmer air (${fmt(speedAt(p.t), 0)} → ${fmt(speedAt(p.t + 15), 0)} m/s). With the same fork, λ = v/f is longer, so both lengths grow.` };
    },
  },
];

export const resonance: LabEngine<ResonanceParams> = {
  id: 'resonance',
  title: 'Resonance tube',
  blurb: 'Lower the water until the air column booms, twice, and find the speed of sound and the end correction.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Waves'],
  params: [
    { kind: 'choice', key: 'f', label: 'Tuning fork', default: '480', options: FORKS.map(f => ({ value: String(f), label: `${f} Hz` })) },
    { kind: 'number', key: 't', label: 'Room temperature', unit: '°C', min: 10, max: 40, step: 1, default: 30 },
    { kind: 'number', key: 'D', label: 'Tube diameter', unit: 'cm', min: 2, max: 5, step: 0.1, default: 3.4 },
  ],
  readouts: p => {
    const s = solveResonance(p);
    return [{ label: 'Speed of sound', value: `${fmt(s.v, 1)} m/s` }, { label: 'λ', value: cm(s.lambda) }, { label: 'l₁', value: cm(s.l1) }, { label: 'l₂', value: cm(s.l2) }, { label: 'End correction', value: cm(s.e) }];
  },
  predictions,
};
