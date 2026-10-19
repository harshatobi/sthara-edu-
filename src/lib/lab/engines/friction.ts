import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Friction and the inclined plane (CBSE Class XI Physics, experiments A9 and
 * A10, activities A4 and A6).
 *
 * Limiting friction: a block on a horizontal board, pulled by a pan over a
 * pulley. It just starts to slide when the pull equals the limiting friction
 * F = μₛR, where R = (block + load) g. F against R is a straight line through the
 * origin of slope μₛ.
 * Rolling: a roller on the same board needs far less force (μᵣ ≈ μₛ/15).
 * Inclined plane: the downward force along the plane on a roller of mass m is
 * F = mg sin θ (no friction for a roller), so F against sin θ has slope mg.
 * Double inclined plane: a ball rolled down one side rises almost to the same
 * height on the other; a little energy goes to friction and sound.
 */

export type FrictionParams = { mode: string; m: number; load: number; surface: string; angle: number };

export const G = 9.8;
export const SURFACES: Record<string, { label: string; mu: number }> = {
  'wood-wood': { label: 'Wood on wood', mu: 0.42 },
  'wood-sunmica': { label: 'Wood on sunmica', mu: 0.28 },
  'wood-glass': { label: 'Wood on glass', mu: 0.2 },
};
/** Share of the energy a rolling ball keeps over the double incline (rolling losses). */
export const KEEP = 0.92;

const rad = (d: number) => (d * Math.PI) / 180;

/** Pan + weights (g) that just start the block sliding; normal reaction R (N); friction (N). */
export function limitingFriction(p: FrictionParams) {
  const mu = SURFACES[p.surface]?.mu ?? 0.4;
  const R = ((p.m + p.load) / 1000) * G;
  const F = mu * R;
  return { mu, R, F, pull: (F / G) * 1000 };
}

export const rollingPull = (p: FrictionParams) => limitingFriction(p).pull / 15;
/** Force down the plane (N) and the pan load (g wt) that holds the roller still. */
export const downForce = (mG: number, angle: number) => (mG / 1000) * G * Math.sin(rad(angle));

const N = (x: number) => `${fmt(x, 2)} N`;

const predictions: PredictionTemplate<FrictionParams>[] = [
  {
    id: 'pull', label: 'Load to start it sliding', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    applies: p => p.mode === 'slide',
    build: p => {
      const s = limitingFriction(p);
      const c = choices(`${fmt(s.pull, 0)} g wt`, [`${fmt(p.m + p.load, 0)} g wt`, `${fmt(s.pull / 2, 0)} g wt`, `${fmt(s.pull * 2, 0)} g wt`], 341);
      return { prompt: `The block and its load weigh ${fmt(p.m + p.load, 0)} g; μₛ = ${s.mu}. What pan load just starts it sliding?`, ...c, explain: `Limiting friction F = μₛR = ${s.mu} × ${fmt(s.R, 2)} N = ${N(s.F)}, which a pan of ${fmt(s.pull, 0)} g wt just overcomes.` };
    },
  },
  {
    id: 'double-r', label: 'Doubling the normal reaction', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    applies: p => p.mode === 'slide',
    build: () => {
      const c = choices('The limiting friction doubles', ['It stays the same', 'It halves', 'It becomes four times'], 342);
      return { prompt: 'The normal reaction is doubled by loading the block. What happens to the limiting friction?', ...c, explain: 'F = μₛR with μₛ fixed for the two surfaces: F is proportional to R, so the F-R graph is a straight line through the origin with slope μₛ.' };
    },
  },
  {
    id: 'slope', label: 'Slope of F against R', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    applies: p => p.mode === 'slide',
    build: p => {
      const s = limitingFriction(p);
      const c = choices(`μₛ = ${s.mu}`, [`g = ${G}`, `1/μₛ = ${fmt(1 / s.mu, 2)}`, 'The mass of the block'], 343);
      return { prompt: 'What does the slope of the limiting friction (F) against normal reaction (R) graph give?', ...c, explain: `F/R = μₛ, the coefficient of static friction: ${s.mu} for ${SURFACES[p.surface].label.toLowerCase()}.` };
    },
  },
  {
    id: 'rolling', label: 'Rolling versus sliding', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    applies: p => p.mode === 'roll',
    build: p => {
      const c = choices(`About ${fmt(rollingPull(p), 0)} g wt: far less`, [`About ${fmt(limitingFriction(p).pull, 0)} g wt: the same`, `About ${fmt(limitingFriction(p).pull * 2, 0)} g wt: more`, 'None at all'], 344);
      return { prompt: `Sliding this load needs ${fmt(limitingFriction(p).pull, 0)} g wt. What pan load keeps a roller of the same weight rolling?`, ...c, explain: 'A rolling body only deforms the surface a little at the point of contact; it does not drag across it, so rolling friction is much smaller than sliding friction. That is why wheels and ball bearings are used.' };
    },
  },
  {
    id: 'down-force', label: 'Force down the plane', topic: 'Unit vector; resolution of a vector in a plane, rectangular components',
    chapter: 'Motion in a Plane',
    applies: p => p.mode === 'incline',
    build: p => {
      const F = downForce(p.m, p.angle);
      const c = choices(N(F), [N((p.m / 1000) * G * Math.cos(rad(p.angle))), N((p.m / 1000) * G), N(F / 2)], 345);
      return { prompt: `A ${fmt(p.m, 0)} g roller rests on a plane at ${fmt(p.angle, 0)}°. What is the force pulling it down the plane?`, ...c, explain: `Resolve the weight: along the plane mg sin θ = ${fmt(p.m / 1000, 3)} × ${G} × sin ${fmt(p.angle, 0)}° = ${N(F)}; into the plane mg cos θ.` };
    },
  },
  {
    id: 'f-sin', label: 'Graph of F against sin θ', topic: 'Unit vector; resolution of a vector in a plane, rectangular components',
    chapter: 'Motion in a Plane',
    applies: p => p.mode === 'incline',
    build: p => {
      const c = choices(`A straight line through the origin of slope mg = ${N((p.m / 1000) * G)}`, ['A curve that flattens out', 'A horizontal line', 'A straight line of slope g'], 346);
      return { prompt: 'Plotting the downward force F against sin θ, what do you get?', ...c, explain: 'F = mg sin θ, so F is proportional to sin θ: a straight line through the origin whose slope is the roller\'s weight.' };
    },
  },
  {
    id: 'other-side', label: 'How high on the other side', topic: 'Conservative and non-conservative forces',
    chapter: 'Work, Energy and Power',
    applies: p => p.mode === 'double',
    build: () => {
      const c = choices(`A little lower: about ${fmt(KEEP * 20, 1)} cm`, ['Exactly 20 cm', 'Higher than 20 cm', 'About 10 cm'], 347);
      return { prompt: 'A ball is released 20 cm up one side of a double inclined plane. How high does it get on the other side?', ...c, explain: `Its potential energy turns into kinetic energy and back. Without losses it would reach the same 20 cm; rolling friction and air take a little, so it reaches about ${fmt(KEEP * 20, 1)} cm. Mechanical energy is conserved only when non-conservative forces do no work.` };
    },
  },
];

export const friction: LabEngine<FrictionParams> = {
  id: 'friction',
  title: 'Friction and the inclined plane',
  blurb: 'Find limiting friction against normal reaction, compare rolling, resolve a roller\'s weight down an incline, and roll a ball over a double incline.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Laws of Motion', 'Motion in a Plane', 'Work, Energy and Power'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'slide', options: [{ value: 'slide', label: 'Limiting friction' }, { value: 'roll', label: 'Rolling friction' }, { value: 'incline', label: 'Roller on an incline' }, { value: 'double', label: 'Double inclined plane' }] },
    { kind: 'number', key: 'm', label: 'Block / roller', unit: 'g', min: 100, max: 1000, step: 10, default: 200 },
    { kind: 'number', key: 'load', label: 'Extra load on top', unit: 'g', min: 0, max: 1000, step: 50, default: 200, show: p => p.mode === 'slide' || p.mode === 'roll' },
    { kind: 'choice', key: 'surface', label: 'Surfaces', default: 'wood-wood', options: Object.entries(SURFACES).map(([value, s]) => ({ value, label: s.label })), show: p => p.mode === 'slide' || p.mode === 'roll' },
    { kind: 'number', key: 'angle', label: 'Angle of the plane', unit: '°', min: 5, max: 60, step: 1, default: 30, show: p => p.mode === 'incline' || p.mode === 'double' },
  ],
  readouts: p => {
    if (p.mode === 'incline') return [{ label: 'mg', value: N((p.m / 1000) * G) }, { label: 'sin θ', value: fmt(Math.sin(rad(p.angle)), 3) }, { label: 'Force down the plane', value: N(downForce(p.m, p.angle)) }, { label: 'Into the plane', value: N((p.m / 1000) * G * Math.cos(rad(p.angle))) }];
    if (p.mode === 'double') return [{ label: 'Released at', value: '20.0 cm' }, { label: 'Rises to', value: `${fmt(KEEP * 20, 1)} cm` }, { label: 'Energy kept', value: `${fmt(KEEP * 100, 0)}%` }];
    const s = limitingFriction(p);
    return [
      { label: 'Normal reaction R', value: N(s.R) },
      { label: 'μₛ', value: String(s.mu) },
      { label: p.mode === 'roll' ? 'Pan to keep it rolling' : 'Pan to start sliding', value: `${fmt(p.mode === 'roll' ? rollingPull(p) : s.pull, 0)} g wt` },
      { label: 'Limiting friction', value: N(s.F) },
    ];
  },
  predictions,
};
