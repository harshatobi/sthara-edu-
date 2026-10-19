import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Circuit activities (CBSE Class XII Physics, activities A1-A4, A6, B1, B2).
 *
 * Inductor: on DC only its wire's resistance R counts; on 50 Hz AC its impedance
 *   is Z = √(R² + (2πfL)²). An iron core multiplies L, so Z (and the dimming of a
 *   bulb in series) grows a lot while R does not change.
 * Household circuit: lamps on separate switches are in parallel across 230 V, each
 *   drawing P/V; the fuse in the live wire melts when the total current exceeds
 *   its rating.
 * Multimeter, diode and LED: a diode conducts one way only; on the diode-test
 *   range it shows about 0.6 V forward (an LED about 1.8 V and glows) and
 *   "OL" (open) in reverse. A resistor reads the same both ways; a capacitor
 *   charges, so the reading climbs and then shows open.
 * A faulty circuit: an ammeter goes in series, a voltmeter in parallel.
 */

export type ComponentsParams = { mode: string; core: string; bulbs: number; heater: string; item: string; fault: string };

export const MAINS_V = 230, MAINS_F = 50;
export const COIL = { R: 18, Lair: 0.06, Liron: 1.2 };
export const LAMP_W = 60, HEATER_W = 1000, FUSE_A = 5;

export function impedance(core: string) {
  const L = core === 'iron' ? COIL.Liron : COIL.Lair, X = 2 * Math.PI * MAINS_F * L;
  return { R: COIL.R, X, Z: Math.sqrt(COIL.R ** 2 + X ** 2) };
}
export function household(p: Pick<ComponentsParams, 'bulbs' | 'heater'>) {
  const P = p.bulbs * LAMP_W + (p.heater === 'on' ? HEATER_W : 0), I = P / MAINS_V;
  return { P, I, blown: I > FUSE_A };
}

export const ITEMS: Record<string, { label: string; looks: string; forward: string; reverse: string }> = {
  diode: { label: 'Diode', looks: 'a small black cylinder with a silver band at one end (the cathode)', forward: 'about 0.6 V', reverse: 'OL (open)' },
  led: { label: 'LED', looks: 'a clear or coloured dome, one leg longer (the anode)', forward: 'about 1.8 V and it glows faintly', reverse: 'OL (open)' },
  resistor: { label: 'Resistor', looks: 'a small body with coloured bands, two identical leads', forward: 'its resistance, the same both ways', reverse: 'its resistance, the same both ways' },
  capacitor: { label: 'Capacitor', looks: 'a can or disc with a value in μF or pF printed on it', forward: 'a reading that climbs, then open', reverse: 'a reading that climbs, then open' },
};
export const FAULTS: Record<string, { label: string; fix: string }> = {
  'ammeter-parallel': { label: 'The ammeter is across the resistor', fix: 'Put the ammeter in series, so all the current passes through it.' },
  'voltmeter-series': { label: 'The voltmeter is in series', fix: 'Connect the voltmeter in parallel across the resistor.' },
  'meter-polarity': { label: 'The ammeter + terminal goes to the battery −', fix: 'Join + of each meter to the side nearer the battery\'s + terminal.' },
  'key-missing': { label: 'There is no key in the circuit', fix: 'Put a plug key in series with the battery, so the circuit is closed only while reading.' },
};

const SEMI = 'Semiconductor diode: I-V characteristics in forward and reverse bias';

const predictions: PredictionTemplate<ComponentsParams>[] = [
  {
    id: 'core', label: 'Putting in the iron core', topic: 'Reactance and impedance',
    chapter: 'Alternating Current',
    applies: p => p.mode === 'inductor',
    build: () => {
      const a = impedance('none'), b = impedance('iron');
      const c = choices(`AC impedance rises from ${fmt(a.Z, 0)} Ω to ${fmt(b.Z, 0)} Ω; DC resistance stays ${COIL.R} Ω`, [`Both stay ${COIL.R} Ω`, 'The DC resistance rises too', 'The impedance falls'], 451);
      return { prompt: 'An iron core is pushed into the coil. What happens to its DC resistance and its 50 Hz impedance?', ...c, explain: `The core multiplies the inductance (${COIL.Lair} H → ${COIL.Liron} H), so X_L = 2πfL rises and Z = √(R² + X_L²) with it. DC sees only the copper's resistance, which the core does not change. A bulb in series dims on AC.` };
    },
  },
  {
    id: 'fuse', label: 'Does the fuse blow', topic: 'Electrical energy and power; resistivity and conductivity; temperature dependence of resistance',
    chapter: 'Current Electricity',
    applies: p => p.mode === 'household',
    build: p => {
      const h = household(p);
      const c = choices(h.blown ? `Yes: ${fmt(h.I, 2)} A is more than ${FUSE_A} A` : `No: ${fmt(h.I, 2)} A is within ${FUSE_A} A`, [h.blown ? 'No, a fuse never blows on lamps' : `Yes: ${fmt(h.I, 2)} A is too much`, 'Only the first lamp lights', 'The lamps get dimmer instead'], 452);
      return { prompt: `${p.bulbs} lamp${p.bulbs === 1 ? '' : 's'} of ${LAMP_W} W${p.heater === 'on' ? ` and a ${HEATER_W} W heater` : ''} on a 230 V line with a ${FUSE_A} A fuse. Does the fuse blow?`, ...c, explain: `They are in parallel, so the currents add: I = P/V = ${fmt(h.P, 0)}/${MAINS_V} = ${fmt(h.I, 2)} A. The fuse melts above ${FUSE_A} A.` };
    },
  },
  {
    id: 'one-off', label: 'Switching one lamp off', topic: 'Electrical energy and power; resistivity and conductivity; temperature dependence of resistance',
    chapter: 'Current Electricity',
    applies: p => p.mode === 'household' && p.bulbs >= 2,
    build: () => {
      const c = choices('The others stay just as bright', ['All the lamps go off', 'The others get brighter', 'The others get dimmer'], 453);
      return { prompt: 'One of the lamps is switched off. What happens to the rest?', ...c, explain: 'Each lamp is on its own branch across the full 230 V. Switching one off breaks only its branch: the others keep the same voltage and brightness.' };
    },
  },
  {
    id: 'diode-test', label: 'Diode on the multimeter', topic: SEMI,
    chapter: 'Semiconductor Electronics: Materials, Devices and Simple Circuits',
    applies: p => p.mode === 'diode',
    build: p => {
      const it = ITEMS[p.item];
      const c = choices(`Forward: ${it.forward}; reverse: ${it.reverse}`, [`Forward: ${it.reverse}; reverse: ${it.forward}`, 'The same reading both ways', 'Open both ways'].filter(x => x !== `Forward: ${it.forward}; reverse: ${it.reverse}`), 454);
      return { prompt: `A ${it.label.toLowerCase()} is checked on the multimeter's diode range, then turned round. What does it show?`, ...c, explain: p.item === 'diode' || p.item === 'led' ? 'A p-n junction conducts only when forward biased (the meter\'s + lead on the anode). Reversed, the depletion layer widens and almost no current flows. A diode that conducts both ways (or neither) is faulty.' : `A ${it.label.toLowerCase()} has no junction, so it behaves the same both ways.` };
    },
  },
  {
    id: 'identify', label: 'Which component is it', topic: SEMI,
    chapter: 'Semiconductor Electronics: Materials, Devices and Simple Circuits',
    applies: p => p.mode === 'identify',
    build: p => {
      const it = ITEMS[p.item];
      const c = choices(it.label, Object.values(ITEMS).map(x => x.label).filter(x => x !== it.label), 455);
      return { prompt: `It is ${it.looks}. On the diode range it reads ${it.forward} one way and ${it.reverse} the other. What is it?`, ...c, explain: `${it.label}: ${it.looks}. ${p.item === 'diode' || p.item === 'led' ? 'It conducts one way only.' : 'It reads the same both ways.'}` };
    },
  },
  {
    id: 'fault', label: 'What is wrong', topic: "Ohm's law; V-I characteristics (linear and non-linear)",
    chapter: 'Current Electricity',
    applies: p => p.mode === 'faulty',
    build: p => {
      const f = FAULTS[p.fault];
      const c = choices(f.fix, Object.values(FAULTS).map(x => x.fix).filter(x => x !== f.fix), 456);
      return { prompt: `${f.label}. How should it be corrected?`, ...c, explain: `${f.fix} An ammeter has very low resistance, so across a component it would short it; a voltmeter has very high resistance, so in series it would stop the current.` };
    },
  },
];

export const components: LabEngine<ComponentsParams> = {
  id: 'components',
  title: 'Circuits and components',
  blurb: 'Identify components, test diodes and LEDs with a multimeter, compare a coil on AC and DC, wire a household circuit and correct a faulty one.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Current Electricity', 'Alternating Current', 'Semiconductor Electronics: Materials, Devices and Simple Circuits'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Activity', default: 'household', options: [{ value: 'household', label: 'Household circuit' }, { value: 'inductor', label: 'Coil on AC and DC' }, { value: 'identify', label: 'Identify a component' }, { value: 'diode', label: 'Multimeter: diode and LED' }, { value: 'faulty', label: 'Correct a faulty circuit' }] },
    { kind: 'choice', key: 'core', label: 'Core', default: 'none', options: [{ value: 'none', label: 'No core' }, { value: 'iron', label: 'Iron core' }], show: p => p.mode === 'inductor' },
    { kind: 'number', key: 'bulbs', label: 'Lamps switched on', unit: '', min: 0, max: 3, step: 1, default: 2, show: p => p.mode === 'household' },
    { kind: 'choice', key: 'heater', label: 'Heater', default: 'off', options: [{ value: 'off', label: 'Off' }, { value: 'on', label: `On (${HEATER_W} W)` }], show: p => p.mode === 'household' },
    { kind: 'choice', key: 'item', label: 'Component', default: 'diode', options: Object.entries(ITEMS).map(([value, i]) => ({ value, label: i.label })), show: p => p.mode === 'identify' || p.mode === 'diode' },
    { kind: 'choice', key: 'fault', label: 'Fault', default: 'ammeter-parallel', options: Object.entries(FAULTS).map(([value, f]) => ({ value, label: f.label })), show: p => p.mode === 'faulty' },
  ],
  readouts: p => {
    if (p.mode === 'inductor') { const z = impedance(p.core); return [{ label: 'DC resistance', value: `${COIL.R} Ω` }, { label: 'Reactance 2πfL', value: `${fmt(z.X, 0)} Ω` }, { label: 'AC impedance', value: `${fmt(z.Z, 0)} Ω` }]; }
    if (p.mode === 'household') { const h = household(p); return [{ label: 'Power', value: `${fmt(h.P, 0)} W` }, { label: 'Current in the fuse', value: `${fmt(h.I, 2)} A` }, { label: `Fuse (${FUSE_A} A)`, value: h.blown ? 'Blown' : 'Intact' }]; }
    if (p.mode === 'identify' || p.mode === 'diode') { const it = ITEMS[p.item]; return [{ label: 'Forward', value: it.forward }, { label: 'Reverse', value: it.reverse }]; }
    return [{ label: 'Fix', value: FAULTS[p.fault].fix }];
  },
  predictions,
};
