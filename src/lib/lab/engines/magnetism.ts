import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Magnetic effects of current, the motor and induction (NCERT Class 10).
 * Directions are worked out with vectors (x right, y up, z out of the page
 * towards the viewer), so every rule the textbook teaches falls out of the
 * same arithmetic:
 *   wire      B = μ₀I/2πr, circling the wire (right-hand thumb rule)
 *   solenoid  current seen clockwise from an end makes that end a south pole
 *   motor     F = I L × B (Fleming's left-hand rule), size BIL
 *   induction induced current opposes the change (Lenz): with this
 *             galvanometer, pushing a north pole in deflects it right.
 */

export type MagParams = {
  scenario: 'wire' | 'solenoid' | 'motor' | 'induction';
  current: number; r: number; flow: 'out' | 'in';
  wind: 'cw' | 'acw';
  dirI: 'lr' | 'rl'; field: 'down' | 'up'; b: number; len: number;
  pole: 'N' | 'S'; move: 'in' | 'out' | 'still'; speed: 'slow' | 'fast';
};

type V = [number, number, number];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const MU0 = 4 * Math.PI * 1e-7;

/** Field of a long straight wire (tesla) and its sense seen from above (looking down −z… i.e. from the viewer's side). */
export function wireField(p: MagParams) {
  const B = (MU0 * p.current) / (2 * Math.PI * (p.r / 100));
  // Field direction at a point to the right of the wire (+x) is ẑ_current × x̂.
  const at = cross([0, 0, p.flow === 'out' ? 1 : -1], [1, 0, 0]);
  // +y there means the lines run anticlockwise as seen by the viewer.
  return { B, sense: at[1] > 0 ? 'anticlockwise' as const : 'clockwise' as const };
}

/** Which end of the solenoid (looking at its left end) is north. */
export function solenoidPoles(p: MagParams) {
  // Seen from the left end: clockwise current makes that end S (the clock rule), so the right end is N.
  return p.wind === 'cw' ? { left: 'S' as const, right: 'N' as const } : { left: 'N' as const, right: 'S' as const };
}

/** Force on the rod: direction as a word and size BIL (newtons). */
export function motorForce(p: MagParams) {
  const I: V = [p.dirI === 'lr' ? 1 : -1, 0, 0];
  const B: V = [0, p.field === 'up' ? 1 : -1, 0];
  const F = cross(I, B);
  const word = F[2] > 0 ? 'Out of the magnet, towards you' : F[2] < 0 ? 'Into the magnet, away from you' : F[1] > 0 ? 'Up' : 'Down';
  return { word, size: p.b * p.current * p.len };
}

/** Galvanometer: −1 left, 0 none, +1 right; size 1 slow, 2 fast. */
export function deflection(p: MagParams): number {
  if (p.move === 'still') return 0;
  const sign = (p.pole === 'N' ? 1 : -1) * (p.move === 'in' ? 1 : -1);
  return sign * (p.speed === 'fast' ? 2 : 1);
}

const deflectWord = (d: number) => (d === 0 ? 'No deflection' : d > 0 ? 'Right' : 'Left');

const predictions: PredictionTemplate<MagParams>[] = [
  {
    id: 'wire-sense', label: 'Which way the field circles the wire',
    applies: p => p.scenario === 'wire',
    build: p => {
      const r = wireField(p);
      const c = choices(r.sense === 'clockwise' ? 'Clockwise' : 'Anticlockwise', ['Clockwise', 'Anticlockwise', 'Straight along the wire'], 81);
      return { prompt: `Current flows ${p.flow === 'out' ? 'out of the page, towards you' : 'into the page, away from you'}. Seen from where you sit, which way do the field lines go round?`, ...c, explain: `Right-hand thumb rule: point the thumb along the current (${p.flow === 'out' ? 'at yourself' : 'away from you'}); the fingers curl ${r.sense}.` };
    },
  },
  {
    id: 'wire-distance', label: 'Field twice as far away',
    applies: p => p.scenario === 'wire',
    build: p => {
      const r = wireField(p), far = wireField({ ...p, r: p.r * 2 });
      const c = choices('Half as strong', ['Half as strong', 'A quarter as strong', 'Twice as strong', 'The same'], 82);
      return { prompt: `The compass moves from ${fmt(p.r, 1)} cm to ${fmt(p.r * 2, 1)} cm from the wire. The field there is…`, ...c, explain: `B = μ₀I/(2πr): ${fmt(r.B * 1e6, 1)} μT at ${fmt(p.r, 1)} cm, ${fmt(far.B * 1e6, 1)} μT at ${fmt(p.r * 2, 1)} cm. Field falls as 1/distance.` };
    },
  },
  {
    id: 'solenoid-north', label: 'Which end is north',
    applies: p => p.scenario === 'solenoid',
    build: p => {
      const r = solenoidPoles(p);
      const c = choices(r.left === 'N' ? 'The end facing you' : 'The far end', ['The end facing you', 'The far end', 'Neither: it is not a magnet'], 83);
      return { prompt: `Looking at the near end, the current goes round ${p.wind === 'cw' ? 'clockwise' : 'anticlockwise'}. Which end becomes the north pole?`, ...c, explain: `Clock rule: current seen clockwise makes that face a south pole, anticlockwise a north pole. So the near end is ${r.left === 'N' ? 'north' : 'south'} and the far end ${r.right === 'N' ? 'north' : 'south'}.` };
    },
  },
  {
    id: 'motor-force', label: 'Which way the rod is pushed',
    applies: p => p.scenario === 'motor',
    build: p => {
      const r = motorForce(p);
      const c = choices(r.word, ['Out of the magnet, towards you', 'Into the magnet, away from you', 'Up', 'Down'], 84);
      return { prompt: `Current runs ${p.dirI === 'lr' ? 'left to right' : 'right to left'} through the rod; the field points ${p.field}. Which way is the rod pushed?`, ...c, explain: `Fleming's left-hand rule (F = IL × B): forefinger along the field (${p.field}), second finger along the current (${p.dirI === 'lr' ? 'right' : 'left'}), and the thumb points ${r.word.toLowerCase()}. Size BIL = ${fmt(p.b, 2)} × ${fmt(p.current, 1)} × ${fmt(p.len, 2)} = ${fmt(r.size, 3)} N.` };
    },
  },
  {
    id: 'induction-direction', label: 'Galvanometer deflection',
    applies: p => p.scenario === 'induction',
    build: p => {
      const d = deflection(p);
      const c = choices(deflectWord(d), ['Right', 'Left', 'No deflection'], 85);
      return {
        prompt: p.move === 'still' ? `The ${p.pole === 'N' ? 'north' : 'south'} pole is held still inside the coil. What does the galvanometer show?` : `The ${p.pole === 'N' ? 'north' : 'south'} pole is ${p.move === 'in' ? 'pushed into' : 'pulled out of'} the coil. Which way does the needle swing? (A north pole pushed in swings it right.)`, ...c,
        explain: p.move === 'still' ? 'A current is induced only while the magnetic field through the coil is changing. A still magnet: no change, no current.' : `${p.move === 'in' ? 'Pushing in' : 'Pulling out'} a ${p.pole === 'N' ? 'north' : 'south'} pole is ${d > 0 ? 'the same change as' : 'the opposite change to'} pushing in a north pole, so the needle swings ${d > 0 ? 'right' : 'left'}. ${p.speed === 'fast' ? 'Moving fast gives a bigger swing.' : 'Move it faster for a bigger swing.'}`,
      };
    },
  },
];

const on = (...s: MagParams['scenario'][]) => (p: MagParams) => s.includes(p.scenario);

export const magnetism: LabEngine<MagParams> = {
  id: 'magnetism',
  title: 'Magnetism, motors and induction',
  blurb: 'Field lines round a wire and a coil, the push on a current in a magnet, and current from a moving magnet.',
  subject: 'Science',
  classes: [10],
  chapters: ['Magnetic Effects of Electric Current', 'Motor, Electromagnetic Induction and Electric Generator'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Experiment', default: 'wire', options: [{ value: 'wire', label: 'Straight wire' }, { value: 'solenoid', label: 'Solenoid' }, { value: 'motor', label: 'Rod in a magnet (motor effect)' }, { value: 'induction', label: 'Magnet and coil (induction)' }] },
    { kind: 'number', key: 'current', label: 'Current', unit: 'A', min: 0.5, max: 10, step: 0.5, default: 4, show: on('wire', 'solenoid', 'motor') },
    { kind: 'choice', key: 'flow', label: 'Current flows', default: 'out', options: [{ value: 'out', label: 'Out of the page (towards you)' }, { value: 'in', label: 'Into the page (away from you)' }], show: on('wire') },
    { kind: 'number', key: 'r', label: 'Compass distance', unit: 'cm', min: 1, max: 10, step: 0.5, default: 2, show: on('wire') },
    { kind: 'choice', key: 'wind', label: 'Current seen from the near end', default: 'cw', options: [{ value: 'cw', label: 'Clockwise' }, { value: 'acw', label: 'Anticlockwise' }], show: on('solenoid') },
    { kind: 'choice', key: 'dirI', label: 'Current in the rod', default: 'lr', options: [{ value: 'lr', label: 'Left to right' }, { value: 'rl', label: 'Right to left' }], show: on('motor') },
    { kind: 'choice', key: 'field', label: 'Magnetic field', default: 'down', options: [{ value: 'down', label: 'Down (N pole on top)' }, { value: 'up', label: 'Up (N pole below)' }], show: on('motor') },
    { kind: 'number', key: 'b', label: 'Field strength', unit: 'T', min: 0.05, max: 1, step: 0.05, default: 0.2, show: on('motor') },
    { kind: 'number', key: 'len', label: 'Rod length in the field', unit: 'm', min: 0.05, max: 0.5, step: 0.05, default: 0.1, show: on('motor') },
    { kind: 'choice', key: 'pole', label: 'Pole facing the coil', default: 'N', options: [{ value: 'N', label: 'North' }, { value: 'S', label: 'South' }], show: on('induction') },
    { kind: 'choice', key: 'move', label: 'Magnet', default: 'in', options: [{ value: 'in', label: 'Pushed in' }, { value: 'out', label: 'Pulled out' }, { value: 'still', label: 'Held still' }], show: on('induction') },
    { kind: 'choice', key: 'speed', label: 'Speed', default: 'slow', options: [{ value: 'slow', label: 'Slowly' }, { value: 'fast', label: 'Quickly' }], show: on('induction') },
  ],
  readouts: p => {
    if (p.scenario === 'wire') { const r = wireField(p); return [{ label: 'Field at the compass', value: `${fmt(r.B * 1e6, 1)} μT` }, { label: 'Field lines', value: r.sense }]; }
    if (p.scenario === 'solenoid') { const r = solenoidPoles(p); return [{ label: 'Near end', value: r.left === 'N' ? 'North' : 'South' }, { label: 'Far end', value: r.right === 'N' ? 'North' : 'South' }]; }
    if (p.scenario === 'motor') { const r = motorForce(p); return [{ label: 'Force', value: `${fmt(r.size, 3)} N` }, { label: 'Direction', value: r.word }]; }
    const d = deflection(p);
    return [{ label: 'Galvanometer', value: d === 0 ? 'No deflection' : `${d > 0 ? 'Right' : 'Left'}, ${Math.abs(d) === 2 ? 'large' : 'small'}` }];
  },
  predictions,
};
