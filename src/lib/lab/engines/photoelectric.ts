import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Photoelectric effect (Class XII Physics, Dual Nature of Radiation and Matter).
 * Einstein: each photon of energy hν = hc/λ gives one electron its energy;
 * K_max = hν − φ₀ (work function φ₀), and the stopping potential is V₀ = K_max/e.
 * No emission below the threshold frequency ν₀ = φ₀/h however bright the light;
 * brighter light gives more electrons (more current), not faster ones. V₀ against
 * ν is a straight line of slope h/e, cutting the axis at ν₀. The fastest
 * electrons have de Broglie wavelength λ = h/√(2mK).
 */

export type PhotoParams = { metal: string; lambda: number; intensity: number };

export const HC = 1240; // eV nm
export const H_EV = 4.136e-15; // eV s
export const METALS: Record<string, { label: string; phi: number }> = {
  cs: { label: 'Caesium', phi: 2.14 },
  k: { label: 'Potassium', phi: 2.3 },
  na: { label: 'Sodium', phi: 2.75 },
  zn: { label: 'Zinc', phi: 4.3 },
  cu: { label: 'Copper', phi: 4.7 },
};

export function solvePhoto(p: PhotoParams) {
  const phi = METALS[p.metal]?.phi ?? 2.3, E = HC / p.lambda, K = E - phi;
  const emits = K > 0;
  const deBroglie = emits ? 1.226 / Math.sqrt(K) : null; // nm, for electrons: λ = 1.226/√V nm
  return { phi, E, K: Math.max(0, K), V0: Math.max(0, K), emits, threshold: HC / phi, current: emits ? p.intensity : 0, deBroglie };
}

const eV = (x: number) => `${fmt(x, 2)} eV`;

const predictions: PredictionTemplate<PhotoParams>[] = [
  {
    id: 'kmax', label: 'Fastest electrons', topic: "Einstein's photoelectric equation: particle nature of light",
    applies: p => solvePhoto(p).emits,
    build: p => {
      const s = solvePhoto(p);
      const c = choices(eV(s.K), [eV(s.E), eV(s.phi), eV(s.E + s.phi)], 561);
      return { prompt: `${fmt(p.lambda, 0)} nm light on ${METALS[p.metal].label.toLowerCase()} (work function ${eV(s.phi)}). What is the maximum kinetic energy of the electrons?`, ...c, explain: `Photon energy hc/λ = 1240/${fmt(p.lambda, 0)} = ${eV(s.E)}. K_max = hν − φ₀ = ${fmt(s.E, 2)} − ${fmt(s.phi, 2)} = ${eV(s.K)}, so the stopping potential is ${fmt(s.V0, 2)} V.` };
    },
  },
  {
    id: 'threshold', label: 'Threshold wavelength', topic: 'Experimental study of the photoelectric effect',
    build: p => {
      const s = solvePhoto(p);
      const c = choices(`${fmt(s.threshold, 0)} nm`, [`${fmt(s.threshold / 2, 0)} nm`, `${fmt(s.threshold * 1.5, 0)} nm`, `${fmt(HC * s.phi, 0)} nm`], 562);
      return { prompt: `Above what wavelength does ${METALS[p.metal].label.toLowerCase()} give no photoelectrons at all?`, ...c, explain: `At threshold hc/λ₀ = φ₀, so λ₀ = 1240/${fmt(s.phi, 2)} = ${fmt(s.threshold, 0)} nm. Longer wavelengths have too little energy per photon.` };
    },
  },
  {
    id: 'brighter', label: 'Brighter light', topic: 'Dual nature of radiation; photoelectric effect; Hertz and Lenard\'s observations',
    build: p => {
      const s = solvePhoto(p);
      const right = s.emits ? 'More electrons (more current), same maximum energy' : 'Still no electrons: each photon has too little energy';
      const c = choices(right, [s.emits ? 'Faster electrons' : 'Electrons start to come out', 'Fewer electrons', s.emits ? 'More electrons and faster ones' : 'More current'], 563);
      return { prompt: `The ${fmt(p.lambda, 0)} nm lamp is made three times brighter. What changes?`, ...c, explain: s.emits ? 'Intensity is the number of photons per second. More photons free more electrons, but each photon still has the same energy hν, so K_max is unchanged.' : `Each ${fmt(p.lambda, 0)} nm photon brings only ${eV(s.E)}, less than the ${eV(s.phi)} needed. Brighter light only means more photons that are each too weak.` };
    },
  },
  {
    id: 'slope', label: 'Slope of V₀ against ν', topic: 'Experimental study of the photoelectric effect',
    build: () => {
      const c = choices('h/e, the same for every metal', ['h/e, different for each metal', 'The work function', 'e/h'], 564);
      return { prompt: 'Plotting the stopping potential V₀ against the frequency ν, what is the slope?', ...c, explain: 'eV₀ = hν − φ₀, so V₀ = (h/e)ν − φ₀/e: a straight line of slope h/e (Millikan measured h this way). Different metals give parallel lines cutting the axis at their own threshold.' };
    },
  },
  {
    id: 'debroglie', label: 'de Broglie wavelength of the electrons', topic: 'Matter waves; de Broglie relation',
    applies: p => solvePhoto(p).emits && solvePhoto(p).K > 0.1,
    build: p => {
      const s = solvePhoto(p);
      const c = choices(`${fmt(s.deBroglie!, 2)} nm`, [`${fmt(p.lambda, 0)} nm`, `${fmt(s.deBroglie! * 10, 1)} nm`, `${fmt(s.deBroglie! / 10, 3)} nm`], 565);
      return { prompt: `What is the de Broglie wavelength of the fastest electrons (${eV(s.K)})?`, ...c, explain: `λ = h/√(2mK) = 1.226/√${fmt(s.K, 2)} nm = ${fmt(s.deBroglie!, 2)} nm, far shorter than the light that freed them.` };
    },
  },
];

export const photoelectric: LabEngine<PhotoParams> = {
  id: 'photoelectric',
  title: 'Photoelectric effect',
  blurb: 'Shine light of any colour and brightness on a metal: threshold, stopping potential and Einstein\'s equation.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Dual Nature of Radiation and Matter'],
  params: [
    { kind: 'choice', key: 'metal', label: 'Metal', default: 'na', options: Object.entries(METALS).map(([value, m]) => ({ value, label: `${m.label} (${m.phi} eV)` })) },
    { kind: 'number', key: 'lambda', label: 'Wavelength', unit: 'nm', min: 150, max: 700, step: 10, default: 400 },
    { kind: 'number', key: 'intensity', label: 'Brightness', unit: '×', min: 1, max: 5, step: 1, default: 2 },
  ],
  readouts: p => {
    const s = solvePhoto(p);
    return [{ label: 'Photon energy', value: eV(s.E) }, { label: 'Work function', value: eV(s.phi) }, { label: 'K_max', value: s.emits ? eV(s.K) : 'no emission' }, { label: 'Stopping potential', value: s.emits ? `${fmt(s.V0, 2)} V` : '–' }, { label: 'Threshold', value: `${fmt(s.threshold, 0)} nm` }];
  },
  predictions,
};
