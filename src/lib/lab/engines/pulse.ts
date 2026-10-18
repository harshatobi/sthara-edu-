import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Pulse on a slinky (CBSE Class 9 practical: speed of a pulse propagated
 * through a stretched string / slinky). A slinky of mass per unit length μ
 * is stretched to length L with tension T; a pulse travels at v = √(T/μ)
 * and takes t = L/v to reach the far end, where a fixed end sends it back
 * inverted. A jerk sideways makes a transverse pulse, a push along it a
 * compression (longitudinal), like sound.
 */

export type PulseParams = { len: number; tension: number; kind: 'side' | 'push' };

/** Mass per unit length of the slinky (kg/m), a typical metal slinky stretched out. */
export const MU = 0.05;

export const speedOf = (p: PulseParams) => Math.sqrt(p.tension / MU);
export const travelTime = (p: PulseParams) => p.len / speedOf(p);

const ms = (v: number) => `${fmt(v, 2)} m/s`, s = (t: number) => `${fmt(t, 2)} s`;

const predictions: PredictionTemplate<PulseParams>[] = [
  {
    id: 'time-to-end', label: 'Time to reach the far end', topic: 'Characteristics: wavelength, frequency, time period, amplitude, intensity, speed',
    build: p => {
      const v = speedOf(p), t = travelTime(p);
      const c = choices(s(t), [s(t * 2), s(t / 2), s(v / p.len), s(p.len * v / 10)], 221);
      return { prompt: `The pulse travels at ${ms(v)} along a ${fmt(p.len, 1)} m slinky. How long until it reaches the far end?`, ...c, explain: `t = distance/speed = ${fmt(p.len, 1)}/${fmt(v, 2)} = ${s(t)}. There and back takes twice as long, ${s(2 * t)}.` };
    },
  },
  {
    id: 'tighter', label: 'Stretching it tighter', topic: 'Characteristics: wavelength, frequency, time period, amplitude, intensity, speed',
    build: p => {
      const v = speedOf(p), v4 = speedOf({ ...p, tension: p.tension * 4 });
      const c = choices(`It doubles, to ${ms(v4)}`, [`It is four times faster, ${ms(v * 4)}`, 'It does not change', `It halves, to ${ms(v / 2)}`], 222);
      return { prompt: 'If the tension in the slinky is made four times larger, what happens to the speed of the pulse?', ...c, explain: `v = √(T/μ): four times the tension gives √4 = 2 times the speed, ${ms(v)} → ${ms(v4)}.` };
    },
  },
  {
    id: 'reflection', label: 'What comes back from a fixed end', topic: 'Reflection of sound: echo, reverberation, echolocation',
    applies: p => p.kind === 'side',
    build: () => {
      const c = choices('The pulse comes back upside down', ['The pulse comes back the same way up', 'Nothing comes back', 'The pulse comes back twice as big'], 223);
      return { prompt: 'The far end is held fixed. What happens when the pulse reaches it?', ...c, explain: 'At a fixed end the pulse is reflected and inverted: a crest comes back as a trough. Some energy is lost, so it comes back a little smaller.' };
    },
  },
  {
    id: 'wave-kind', label: 'Transverse or longitudinal', topic: 'Propagation as a longitudinal wave through a medium',
    build: p => {
      const right = p.kind === 'side' ? 'Transverse: the coils move across the direction of the pulse' : 'Longitudinal: the coils move back and forth along the direction of the pulse';
      const c = choices(right, ['Transverse: the coils move across the direction of the pulse', 'Longitudinal: the coils move back and forth along the direction of the pulse', 'The coils travel with the pulse to the far end'], 224);
      return { prompt: p.kind === 'side' ? 'The end is jerked sideways. What kind of pulse is it?' : 'The end is pushed forward along the slinky. What kind of pulse is it?', ...c, explain: `${p.kind === 'side' ? 'A sideways jerk moves each coil at right angles to the travel: transverse.' : 'A push makes a compression that travels along: longitudinal, just like sound in air.'} The coils only move about their places; the energy travels, not the slinky.` };
    },
  },
];

export const pulse: LabEngine<PulseParams> = {
  id: 'pulse',
  title: 'Pulse on a slinky',
  blurb: 'Send a pulse along a stretched slinky, time it to the far end, and see it come back from a fixed end.',
  subject: 'Science',
  classes: [9],
  chapters: ['Sound'],
  params: [
    { kind: 'number', key: 'len', label: 'Stretched length', unit: 'm', min: 2, max: 8, step: 0.5, default: 4 },
    { kind: 'number', key: 'tension', label: 'Tension', unit: 'N', min: 0.2, max: 2, step: 0.1, default: 0.8 },
    { kind: 'choice', key: 'kind', label: 'Pulse', default: 'side', options: [{ value: 'side', label: 'Jerk sideways (transverse)' }, { value: 'push', label: 'Push along (longitudinal)' }] },
  ],
  readouts: p => [
    { label: 'Speed of the pulse', value: ms(speedOf(p)) },
    { label: 'Time to the far end', value: s(travelTime(p)) },
    { label: 'There and back', value: s(2 * travelTime(p)) },
  ],
  predictions,
};
