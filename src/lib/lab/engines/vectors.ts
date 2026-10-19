import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Parallelogram law of vectors (CBSE Class XI Physics, experiment A6), on
 * Gravesand's apparatus: weights P and Q hang over two pulleys and an unknown
 * weight W hangs from the knot between them. At rest the three forces balance,
 * so the resultant of P and Q is equal and opposite to W:
 *   W² = P² + Q² + 2PQ cos θ, θ = α + β, the angle between the P and Q strings.
 * Lami's theorem gives the angles each string makes with the vertical:
 *   P sin α = Q sin β.
 */

export type VectorParams = { P: number; Q: number; W: number };

const deg = (r: number) => (r * 180) / Math.PI, rad = (d: number) => (d * Math.PI) / 180;

export function solveVectors(p: VectorParams) {
  const cosT = (p.W * p.W - p.P * p.P - p.Q * p.Q) / (2 * p.P * p.Q);
  const theta = deg(Math.acos(Math.max(-1, Math.min(1, cosT))));
  // Horizontal balance: P sin α = Q sin β with α + β = θ.
  const t = rad(theta);
  const alpha = deg(Math.atan2(p.Q * Math.sin(t), p.P + p.Q * Math.cos(t)));
  return { theta, alpha, beta: theta - alpha };
}

/** The resultant of P and Q at angle θ (degrees). */
export const resultant = (P: number, Q: number, thetaDeg: number) => Math.sqrt(P * P + Q * Q + 2 * P * Q * Math.cos(rad(thetaDeg)));

const predictions: PredictionTemplate<VectorParams>[] = [
  {
    id: 'resultant', label: 'Resultant of P and Q', topic: 'Equality of vectors; multiplication of vectors by a real number; addition and subtraction of vectors',
    chapter: 'Motion in a Plane',
    build: p => {
      const s = solveVectors(p);
      const c = choices(`${fmt(p.W, 0)} g wt`, [`${fmt(p.P + p.Q, 0)} g wt`, `${fmt(Math.abs(p.P - p.Q), 0)} g wt`, `${fmt(Math.sqrt(p.P ** 2 + p.Q ** 2), 0)} g wt`].filter(x => x !== `${fmt(p.W, 0)} g wt`), 321);
      return { prompt: `P = ${fmt(p.P, 0)} g wt and Q = ${fmt(p.Q, 0)} g wt pull at ${fmt(s.theta, 0)}° to each other. What is their resultant?`, ...c, explain: `R = √(P² + Q² + 2PQ cos θ) = √(${fmt(p.P, 0)}² + ${fmt(p.Q, 0)}² + 2·${fmt(p.P, 0)}·${fmt(p.Q, 0)}·cos ${fmt(s.theta, 0)}°) = ${fmt(resultant(p.P, p.Q, s.theta), 0)} g wt, which is the weight it holds up.` };
    },
  },
  {
    id: 'balance', label: 'Why the knot stays still', topic: 'Equilibrium of concurrent forces',
    build: () => {
      const c = choices('The resultant of P and Q is equal and opposite to W', ['P + Q = W', 'P and Q cancel each other', 'The pulleys take the weight'], 322);
      return { prompt: 'The knot is at rest. Which statement is true?', ...c, explain: 'Three concurrent forces in equilibrium: any one is equal and opposite to the resultant of the other two. So the diagonal of the parallelogram on P and Q points straight up with length W.' };
    },
  },
  {
    id: 'heavier-side', label: 'Which string is nearer the vertical', topic: 'Equilibrium of concurrent forces',
    applies: p => Math.abs(p.P - p.Q) >= 20,
    build: p => {
      const s = solveVectors(p), big = p.P > p.Q ? 'P' : 'Q';
      const c = choices(`The ${big} string`, [`The ${big === 'P' ? 'Q' : 'P'} string`, 'Both make the same angle', 'Neither: both are horizontal'], 323);
      return { prompt: 'Which string hangs closer to the vertical?', ...c, explain: `Horizontally P sin α = Q sin β. The bigger force needs the smaller angle: α = ${fmt(s.alpha, 0)}°, β = ${fmt(s.beta, 0)}°.` };
    },
  },
  {
    id: 'too-heavy', label: 'If W were heavier than P + Q', topic: 'Equilibrium of concurrent forces',
    build: p => {
      const c = choices('The knot is pulled down and there is no balance', ['The strings become horizontal and balance', 'The angle between the strings becomes 180°', 'Nothing changes'], 324);
      return { prompt: `What happens if W is more than P + Q = ${fmt(p.P + p.Q, 0)} g wt?`, ...c, explain: 'The resultant of P and Q is at most P + Q (when they pull the same way, θ = 0). A heavier W can never be balanced: it falls.' };
    },
  },
];

export const vectors: LabEngine<VectorParams> = {
  id: 'vectors',
  title: 'Parallelogram law of vectors',
  blurb: 'Three weights on Gravesand\'s apparatus: the parallelogram on P and Q gives a diagonal equal to the unknown weight.',
  subject: 'Physics',
  classes: [11],
  chapters: ['Laws of Motion', 'Motion in a Plane'],
  params: [
    { kind: 'number', key: 'P', label: 'Weight P', unit: 'g wt', min: 50, max: 500, step: 10, default: 200 },
    { kind: 'number', key: 'Q', label: 'Weight Q', unit: 'g wt', min: 50, max: 500, step: 10, default: 250 },
    { kind: 'number', key: 'W', label: 'Unknown weight W', unit: 'g wt', min: 50, max: 900, step: 10, default: 350 },
  ],
  check: p => (p.W >= p.P + p.Q - 10 ? 'W must be less than P + Q, or the knot is pulled down.' : p.W <= Math.abs(p.P - p.Q) + 10 ? 'W must be more than the difference of P and Q, or the knot is pulled sideways up to a pulley.' : null),
  readouts: p => {
    const s = solveVectors(p);
    return [
      { label: 'Angle α (P string)', value: `${fmt(s.alpha, 1)}°` },
      { label: 'Angle β (Q string)', value: `${fmt(s.beta, 1)}°` },
      { label: 'θ = α + β', value: `${fmt(s.theta, 1)}°` },
      { label: 'Resultant of P and Q', value: `${fmt(resultant(p.P, p.Q, s.theta), 0)} g wt` },
    ];
  },
  predictions,
};
