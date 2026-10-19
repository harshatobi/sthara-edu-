import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Elasticity (CBSE Class XI Physics, experiment B1 and activity B6).
 *
 * Searle's apparatus: a wire of length L and radius r carries a load M; its
 * extension is Δl = MgL / (πr²Y), read on the micrometer screw (LC 0.01 mm).
 * Load against extension is a straight line within the elastic limit; its
 * slope gives Y = gL / (πr² · slope).
 * A loaded metre scale (a beam of width b and thickness d, I = bd³/12):
 * clamped at one end and loaded at the free end, it sags δ = WL³/3YI; resting
 * on two knife edges and loaded in the middle, δ = WL³/48YI. Both depressions
 * are proportional to the load.
 */

export type ElasticParams = { mode: string; material: string; L: number; d: number; M: number; support: string; W: number; span: number };

export const G = 9.8;
export const MATERIALS: Record<string, { label: string; Y: number }> = {
  steel: { label: 'Steel', Y: 2.0e11 },
  brass: { label: 'Brass', Y: 1.0e11 },
  copper: { label: 'Copper', Y: 1.2e11 },
};
/** A wooden metre scale: width, thickness (m) and Young's modulus. */
export const SCALE = { b: 0.03, d: 0.006, Y: 1.0e10 };

/** Extension (mm) of the wire under M kg. */
export function extensionMm(p: Pick<ElasticParams, 'material' | 'L' | 'd' | 'M'>) {
  const r = p.d / 2000, Y = MATERIALS[p.material]?.Y ?? 2e11;
  return ((p.M * G * p.L) / (Math.PI * r * r * Y)) * 1000;
}

/** Depression (mm) of the metre scale under W grams, over a span (cm). */
export function depressionMm(support: string, Wg: number, spanCm: number) {
  const I = (SCALE.b * SCALE.d ** 3) / 12, W = (Wg / 1000) * G, L = spanCm / 100;
  return ((W * L ** 3) / ((support === 'end' ? 3 : 48) * SCALE.Y * I)) * 1000;
}

const mm = (x: number) => `${fmt(x, 2)} mm`;
const YM = "Young's modulus, bulk modulus, shear modulus of rigidity, Poisson's ratio";

const predictions: PredictionTemplate<ElasticParams>[] = [
  {
    id: 'extension', label: 'Extension of the wire', topic: YM,
    applies: p => p.mode === 'searle',
    build: p => {
      const x = extensionMm(p);
      const c = choices(mm(x), [mm(x * 2), mm(x / 2), mm(x * 4)], 361);
      return { prompt: `A ${MATERIALS[p.material].label.toLowerCase()} wire ${fmt(p.L, 1)} m long, ${fmt(p.d, 2)} mm thick, carries ${fmt(p.M, 1)} kg. How much does it stretch?`, ...c, explain: `Δl = MgL/(πr²Y) = ${fmt(p.M, 1)} × ${G} × ${fmt(p.L, 1)} / (π × (${fmt(p.d / 2, 3)} × 10⁻³)² × ${(MATERIALS[p.material].Y / 1e11).toFixed(1)} × 10¹¹) = ${mm(x)}.` };
    },
  },
  {
    id: 'thinner', label: 'Half the diameter', topic: YM,
    applies: p => p.mode === 'searle',
    build: () => {
      const c = choices('Four times as much', ['Twice as much', 'The same', 'Half as much'], 362);
      return { prompt: 'A wire of the same material and length but half the diameter carries the same load. How much does it stretch?', ...c, explain: 'Δl ∝ 1/r²: half the radius means a quarter of the area, so four times the extension. Y itself does not change: it belongs to the material.' };
    },
  },
  {
    id: 'what-y', label: 'What Y depends on', topic: YM,
    applies: p => p.mode === 'searle',
    build: p => {
      const c = choices('Only the material of the wire', ['The length of the wire', 'The load on it', 'The diameter of the wire'], 363);
      return { prompt: 'Which of these does Young\'s modulus depend on?', ...c, explain: `Y = stress/strain is a property of the material (${MATERIALS[p.material].label.toLowerCase()} ≈ ${(MATERIALS[p.material].Y / 1e11).toFixed(1)} × 10¹¹ N/m²). A longer or thinner wire stretches more, but stress/strain stays the same.` };
    },
  },
  {
    id: 'graph', label: 'Load-extension graph', topic: 'Elasticity, stress-strain relationship, Hooke\'s law',
    applies: p => p.mode === 'searle',
    build: () => {
      const c = choices('A straight line through the origin, until the elastic limit', ['A curve from the start', 'A horizontal line', 'A straight line that never bends'], 364);
      return { prompt: 'What does the graph of load against extension look like?', ...c, explain: 'Within the elastic limit stress ∝ strain (Hooke\'s law), so the extension is proportional to the load. Past the elastic limit the line bends and the wire no longer returns to its length.' };
    },
  },
  {
    id: 'sag', label: 'How far the scale sags', topic: 'Applications of elastic behaviour of materials',
    applies: p => p.mode === 'beam',
    build: p => {
      const x = depressionMm(p.support, p.W, p.span);
      const other = depressionMm(p.support === 'end' ? 'middle' : 'end', p.W, p.span);
      const c = choices(mm(x), [mm(other), mm(x * 2), mm(x / 2)], 365);
      return { prompt: `A ${fmt(p.W, 0)} g load on the metre scale ${p.support === 'end' ? 'clamped at one end, load at the free end' : 'resting on two knife edges, load in the middle'}, span ${fmt(p.span, 0)} cm. How far does it sag?`, ...c, explain: `δ = WL³/(${p.support === 'end' ? 3 : 48}YI) with I = bd³/12 for the scale: ${mm(x)}.` };
    },
  },
  {
    id: 'end-vs-middle', label: 'End or middle', topic: 'Applications of elastic behaviour of materials',
    applies: p => p.mode === 'beam',
    build: () => {
      const c = choices('Clamped at one end: 16 times more', ['Both the same', 'Supported at both ends: 16 times more', 'Clamped at one end: twice as much'], 366);
      return { prompt: 'Same scale, same span, same load: which sags more?', ...c, explain: 'δ = WL³/3YI for a cantilever against WL³/48YI for a beam on two supports: 48/3 = 16 times more. That is why bridges are supported at both ends, and why beams are made deep (I ∝ d³).' };
    },
  },
];

export const elastic: LabEngine<ElasticParams> = {
  id: 'elastic',
  title: "Young's modulus and a loaded beam",
  blurb: "Load a wire on Searle's apparatus and read the extension on the micrometer, or load a metre scale and measure how far it sags.",
  subject: 'Physics',
  classes: [11],
  chapters: ['Mechanical Properties of Solids'],
  params: [
    { kind: 'choice', key: 'mode', label: 'Experiment', default: 'searle', options: [{ value: 'searle', label: "Searle's apparatus" }, { value: 'beam', label: 'Loaded metre scale' }] },
    { kind: 'choice', key: 'material', label: 'Wire', default: 'steel', options: Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label })), show: p => p.mode === 'searle' },
    { kind: 'number', key: 'L', label: 'Wire length', unit: 'm', min: 1, max: 3, step: 0.1, default: 2, show: p => p.mode === 'searle' },
    { kind: 'number', key: 'd', label: 'Wire diameter', unit: 'mm', min: 0.3, max: 1.2, step: 0.01, default: 0.5, show: p => p.mode === 'searle' },
    { kind: 'number', key: 'M', label: 'Load', unit: 'kg', min: 0.5, max: 6, step: 0.5, default: 3, show: p => p.mode === 'searle' },
    { kind: 'choice', key: 'support', label: 'Scale', default: 'end', options: [{ value: 'end', label: 'Clamped at one end' }, { value: 'middle', label: 'On two knife edges' }], show: p => p.mode === 'beam' },
    { kind: 'number', key: 'W', label: 'Load', unit: 'g', min: 50, max: 500, step: 50, default: 200, show: p => p.mode === 'beam' },
    { kind: 'number', key: 'span', label: 'Span', unit: 'cm', min: 40, max: 90, step: 5, default: 70, show: p => p.mode === 'beam' },
  ],
  readouts: p => p.mode === 'searle'
    ? [{ label: 'Extension', value: mm(extensionMm(p)) }, { label: 'Stress', value: `${fmt((p.M * G) / (Math.PI * (p.d / 2000) ** 2) / 1e6, 1)} MN/m²` }, { label: 'Strain', value: `${(extensionMm(p) / 1000 / p.L).toExponential(2)}` }, { label: 'Y', value: `${(MATERIALS[p.material].Y / 1e11).toFixed(1)} × 10¹¹ N/m²` }]
    : [{ label: 'Depression', value: mm(depressionMm(p.support, p.W, p.span)) }, { label: 'Load', value: `${fmt((p.W / 1000) * G, 2)} N` }],
  predictions,
};
