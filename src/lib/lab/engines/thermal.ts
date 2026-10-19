import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Heat (CBSE Class XI Physics, experiments B6 and B7, activities B1, B2, B3, B5).
 *
 * Cooling curve: hot water in a calorimeter loses heat faster the hotter it is
 *   than the room (Newton's law of cooling): T = Tₛ + (T₀ − Tₛ) e^(−kt). A lid
 *   slows it down, a fan speeds it up (activity B5: factors affecting heat loss).
 * Molten wax: it cools to its melting point, stays there while it solidifies
 *   (giving out latent heat), then cools again.
 * Method of mixtures: a hot solid dropped into water in a calorimeter; heat lost
 *   = heat gained: mₛcₛ(Tₕ − T) = (m_w c_w + m_c c_c)(T − T_w).
 * Bimetallic strip: brass expands more than iron, so on heating the strip bends
 *   with brass on the outside (towards the iron side).
 * Liquid in a flask: on heating the glass expands first and the level dips, then
 *   the liquid's larger expansion makes it rise.
 */

export type ThermalParams = { mode: string; T0: number; room: number; cover: string; solid: string; ms: number; mw: number; Tw: number; dT: number };

export const C_WATER = 4.2; // J/g K
export const CALORIMETER = { m: 60, c: 0.385 }; // copper calorimeter with stirrer, g and J/g K
export const HOT = 99; // the solid is heated in boiling water (°C at a little above sea level)
export const WAX_MP = 58;
export const SOLIDS: Record<string, { label: string; c: number }> = {
  aluminium: { label: 'Aluminium', c: 0.9 },
  copper: { label: 'Copper', c: 0.385 },
  brass: { label: 'Brass', c: 0.38 },
  iron: { label: 'Iron', c: 0.45 },
};
export const COVERS: Record<string, { label: string; k: number }> = {
  open: { label: 'Open, still air', k: 0.045 },
  lid: { label: 'With a lid', k: 0.025 },
  fan: { label: 'Open, fan on', k: 0.085 },
};
/** Water glass flask: apparent expansion of water against the glass (per K), and the initial dip. */
export const GAMMA_WATER = 2.1e-4, GAMMA_GLASS = 2.5e-5;

/** Temperature (°C) at t minutes on the cooling curve. */
export const coolAt = (p: Pick<ThermalParams, 'T0' | 'room' | 'cover'>, t: number) => p.room + (p.T0 - p.room) * Math.exp(-(COVERS[p.cover]?.k ?? 0.045) * t);

/** Molten wax: °C at t minutes (cools to the melting point, holds while it solidifies, then cools). */
export function waxAt(p: Pick<ThermalParams, 'T0' | 'room'>, t: number) {
  const k = 0.12, start = Math.max(p.T0, WAX_MP + 5);
  const tMelt = Math.log((start - p.room) / (WAX_MP - p.room)) / k, hold = 6;
  if (t <= tMelt) return p.room + (start - p.room) * Math.exp(-k * t);
  if (t <= tMelt + hold) return WAX_MP;
  return p.room + (WAX_MP - p.room) * Math.exp(-k * (t - tMelt - hold));
}

/** Final temperature in the method of mixtures. */
export function mixFinal(p: Pick<ThermalParams, 'solid' | 'ms' | 'mw' | 'Tw'>) {
  const cs = SOLIDS[p.solid]?.c ?? 0.9;
  const a = p.ms * cs, b = p.mw * C_WATER + CALORIMETER.m * CALORIMETER.c;
  return (a * HOT + b * p.Tw) / (a + b);
}

/** Specific heat (J/g K) worked back from the temperatures. */
export const specificHeat = (ms: number, mw: number, Tw: number, T: number, hot = HOT) => ((mw * C_WATER + CALORIMETER.m * CALORIMETER.c) * (T - Tw)) / (ms * (hot - T));

const C = (x: number) => `${fmt(x, 1)} °C`;
const HEAT = 'Heat transfer: conduction, convection and radiation; thermal conductivity';
const EXPANSION = 'Heat, temperature; thermal expansion of solids, liquids and gases; anomalous expansion of water';

const predictions: PredictionTemplate<ThermalParams>[] = [
  {
    id: 'after-10', label: 'Temperature after 10 minutes', topic: HEAT,
    applies: p => p.mode === 'cooling',
    build: p => {
      const T = coolAt(p, 10);
      const c = choices(C(T), [C(p.T0 - (p.T0 - p.room) / 2), C(p.T0 - 10), C(coolAt(p, 20))], 391);
      return { prompt: `Water at ${C(p.T0)} cools in a room at ${C(p.room)} (${COVERS[p.cover].label.toLowerCase()}). What does it read after 10 minutes?`, ...c, explain: `T = Tₛ + (T₀ − Tₛ)e^(−kt) with k = ${COVERS[p.cover].k}/min: ${fmt(p.room, 0)} + ${fmt(p.T0 - p.room, 0)} × e^(−${fmt(COVERS[p.cover].k * 10, 2)}) = ${C(T)}.` };
    },
  },
  {
    id: 'fastest', label: 'When it cools fastest', topic: HEAT,
    applies: p => p.mode === 'cooling',
    build: () => {
      const c = choices('At the start, when it is hottest', ['At the end, near room temperature', 'At the same rate throughout', 'Halfway through'], 392);
      return { prompt: 'When does the water lose temperature fastest?', ...c, explain: 'The rate of cooling is proportional to the difference between the water and the room. The curve is steepest at the start and flattens as the water nears room temperature.' };
    },
  },
  {
    id: 'cover', label: 'Lid or fan', topic: HEAT,
    applies: p => p.mode === 'cooling',
    build: () => {
      const c = choices('Fan on, no lid', ['With a lid', 'Open, still air', 'All the same'], 393);
      return { prompt: 'Which cools the water fastest?', ...c, explain: 'A fan carries the warm air and vapour away (forced convection and evaporation). A lid stops evaporation and convection from the surface, so the water cools slowest.' };
    },
  },
  {
    id: 'plateau', label: 'The flat part of the wax curve', topic: 'Change of state: latent heat capacity',
    applies: p => p.mode === 'wax',
    build: () => {
      const c = choices(`It stays at ${WAX_MP} °C while it solidifies`, ['It cools fastest', 'It heats up again', 'It boils'], 394);
      return { prompt: 'Molten wax is left to cool. What happens at its melting point?', ...c, explain: 'While the wax changes from liquid to solid it gives out latent heat, which balances what it loses to the room. Its temperature stays at the melting point until it has all solidified.' };
    },
  },
  {
    id: 'mix-final', label: 'Final temperature', topic: 'Specific heat capacity; Cp, Cv; calorimetry',
    applies: p => p.mode === 'mixtures',
    build: p => {
      const T = mixFinal(p);
      const c = choices(C(T), [C((HOT + p.Tw) / 2), C(p.Tw + 2), C(T + 8)], 395);
      return { prompt: `${fmt(p.ms, 0)} g of ${SOLIDS[p.solid].label.toLowerCase()} at ${HOT} °C is dropped into ${fmt(p.mw, 0)} g of water at ${C(p.Tw)} in a ${CALORIMETER.m} g copper calorimeter. What is the final temperature?`, ...c, explain: `Heat lost = heat gained: ${fmt(p.ms, 0)} × ${SOLIDS[p.solid].c} × (${HOT} − T) = (${fmt(p.mw, 0)} × ${C_WATER} + ${CALORIMETER.m} × ${CALORIMETER.c})(T − ${fmt(p.Tw, 1)}), so T = ${C(T)}.` };
    },
  },
  {
    id: 'mix-c', label: 'Specific heat from the readings', topic: 'Specific heat capacity; Cp, Cv; calorimetry',
    applies: p => p.mode === 'mixtures',
    build: p => {
      const T = mixFinal(p), cs = SOLIDS[p.solid].c;
      const c = choices(`${fmt(cs, 2)} J/g K`, [`${fmt(C_WATER, 2)} J/g K`, `${fmt(cs * 2, 2)} J/g K`, `${fmt(cs / 2, 2)} J/g K`], 396);
      return { prompt: `The mixture settles at ${C(T)}. What is the specific heat of the solid?`, ...c, explain: `cₛ = (m_w c_w + m_c c_c)(T − T_w) / mₛ(Tₕ − T) = ${fmt(p.mw * C_WATER + CALORIMETER.m * CALORIMETER.c, 1)} × ${fmt(T - p.Tw, 1)} / (${fmt(p.ms, 0)} × ${fmt(HOT - T, 1)}) = ${fmt(cs, 2)} J/g K.` };
    },
  },
  {
    id: 'bend', label: 'Which way the strip bends', topic: EXPANSION,
    applies: p => p.mode === 'bimetal',
    build: p => {
      const hot = p.dT > 0;
      const c = choices(hot ? 'Towards the iron side (brass outside)' : 'Towards the brass side (iron outside)', [hot ? 'Towards the brass side' : 'Towards the iron side', 'It stays straight', 'It gets shorter but stays straight'], 397);
      return { prompt: `A brass-iron strip is ${hot ? 'heated' : 'cooled'} by ${fmt(Math.abs(p.dT), 0)} °C. Which way does it bend?`, ...c, explain: `Brass expands about 1.5 times as much as iron (α ≈ 19 × 10⁻⁶ against 12 × 10⁻⁶ per K). ${hot ? 'Heated, the brass becomes longer, so it is on the outside of the curve.' : 'Cooled, the brass shrinks more, so it is on the inside.'} Thermostats and fire alarms use this.` };
    },
  },
  {
    id: 'dip', label: 'The level when heating starts', topic: EXPANSION,
    applies: p => p.mode === 'expansion',
    build: () => {
      const c = choices('It falls a little, then rises', ['It rises at once', 'It falls and keeps falling', 'It does not move'], 398);
      return { prompt: 'A flask full of coloured water with a fine tube is put into hot water. What does the level in the tube do?', ...c, explain: 'The glass is heated first and expands, so the flask holds more and the level dips. Then the water warms up; it expands about 8 times as much as glass, so the level rises well above where it started (apparent expansion).' };
    },
  },
];

export const thermal: LabEngine<ThermalParams> = {
  id: 'thermal',
  title: 'Heat: cooling, mixtures and expansion',
  blurb: 'Plot a cooling curve, watch molten wax hold at its melting point, find a specific heat by mixtures, and bend a bimetallic strip.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Thermal Properties of Matter'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'cooling', options: [{ value: 'cooling', label: 'Cooling curve' }, { value: 'wax', label: 'Molten wax' }, { value: 'mixtures', label: 'Method of mixtures' }, { value: 'bimetal', label: 'Bimetallic strip' }, { value: 'expansion', label: 'Liquid in a flask' }] },
    { kind: 'number', key: 'T0', label: 'Starting temperature', unit: '°C', min: 60, max: 95, step: 1, default: 85, show: p => p.mode === 'cooling' || p.mode === 'wax' },
    { kind: 'number', key: 'room', label: 'Room temperature', unit: '°C', min: 15, max: 35, step: 1, default: 28, show: p => p.mode === 'cooling' || p.mode === 'wax' },
    { kind: 'choice', key: 'cover', label: 'Calorimeter', default: 'open', options: Object.entries(COVERS).map(([value, c]) => ({ value, label: c.label })), show: p => p.mode === 'cooling' },
    { kind: 'choice', key: 'solid', label: 'Solid', default: 'aluminium', options: Object.entries(SOLIDS).map(([value, s]) => ({ value, label: s.label })), show: p => p.mode === 'mixtures' },
    { kind: 'number', key: 'ms', label: 'Solid mass', unit: 'g', min: 20, max: 200, step: 5, default: 100, show: p => p.mode === 'mixtures' },
    { kind: 'number', key: 'mw', label: 'Water mass', unit: 'g', min: 50, max: 200, step: 5, default: 100, show: p => p.mode === 'mixtures' },
    { kind: 'number', key: 'Tw', label: 'Water temperature', unit: '°C', min: 15, max: 35, step: 0.5, default: 25, show: p => p.mode === 'mixtures' },
    { kind: 'number', key: 'dT', label: 'Temperature change', unit: '°C', min: -60, max: 200, step: 10, default: 100, show: p => p.mode === 'bimetal' || p.mode === 'expansion' },
  ],
  check: p => (p.mode === 'wax' && p.T0 <= WAX_MP + 2 ? 'Start above the melting point, so the wax is liquid.' : p.room >= p.T0 - 10 ? 'Start at least 10 °C above the room.' : (p.mode === 'bimetal' || p.mode === 'expansion') && p.dT === 0 ? 'Change the temperature.' : null),
  readouts: p => {
    if (p.mode === 'cooling') return [0, 5, 10, 20].map(t => ({ label: `After ${t} min`, value: C(coolAt(p, t)) }));
    if (p.mode === 'wax') return [0, 5, 10, 15, 20].map(t => ({ label: `After ${t} min`, value: C(waxAt(p, t)) }));
    if (p.mode === 'mixtures') { const T = mixFinal(p); return [{ label: 'Final temperature', value: C(T) }, { label: 'Rise of the water', value: C(T - p.Tw) }, { label: 'Fall of the solid', value: C(HOT - T) }, { label: 'cₛ', value: `${SOLIDS[p.solid].c} J/g K` }]; }
    if (p.mode === 'bimetal') return [{ label: 'Bends towards', value: p.dT > 0 ? 'the iron side' : 'the brass side' }];
    return [{ label: 'Apparent expansion', value: `${fmt((GAMMA_WATER - GAMMA_GLASS) * p.dT * 100, 2)}% of the volume` }];
  },
  predictions,
};
