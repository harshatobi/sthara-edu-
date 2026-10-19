import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Bohr model of hydrogen (Class XII Physics, Atoms).
 *   Energy of the nth orbit Eₙ = −13.6/n² eV; radius rₙ = 0.529 n² Å;
 *   speed vₙ = 2.19 × 10⁶ / n m/s.
 * A jump from n₂ down to n₁ gives a photon of energy E = 13.6(1/n₁² − 1/n₂²) eV,
 * wavelength 1/λ = R(1/n₁² − 1/n₂²), R = 1.097 × 10⁷ m⁻¹.
 * Lyman (n₁ = 1, ultraviolet), Balmer (n₁ = 2, visible), Paschen (n₁ = 3, infrared)…
 */

export type BohrParams = { upper: number; lower: number };

export const RYD = 1.097e7;
export const energy = (n: number) => -13.6 / (n * n);
export const radius = (n: number) => 0.529 * n * n; // Å
export const speed = (n: number) => 2.19e6 / n;
export function transition(p: BohrParams) {
  const E = 13.6 * (1 / p.lower ** 2 - 1 / p.upper ** 2);
  return { E, lambda: 1e9 / (RYD * (1 / p.lower ** 2 - 1 / p.upper ** 2)) };
}
export const SERIES: Record<number, { name: string; region: string }> = {
  1: { name: 'Lyman', region: 'ultraviolet' }, 2: { name: 'Balmer', region: 'visible' }, 3: { name: 'Paschen', region: 'infrared' }, 4: { name: 'Brackett', region: 'infrared' }, 5: { name: 'Pfund', region: 'infrared' },
};

const BOHR = 'Bohr model of the hydrogen atom: radius, velocity and energy of the electron in the nth orbit';

const predictions: PredictionTemplate<BohrParams>[] = [
  {
    id: 'photon', label: 'Energy of the photon', topic: 'Hydrogen line spectra',
    build: p => {
      const t = transition(p);
      const c = choices(`${fmt(t.E, 2)} eV`, [`${fmt(-energy(p.upper), 2)} eV`, `${fmt(-energy(p.lower), 2)} eV`, `${fmt(13.6 * (1 / p.lower - 1 / p.upper), 2)} eV`], 571);
      return { prompt: `The electron drops from n = ${p.upper} to n = ${p.lower}. What energy does the photon carry?`, ...c, explain: `E = E${p.upper} − E${p.lower} = ${fmt(energy(p.upper), 2)} − (${fmt(energy(p.lower), 2)}) = ${fmt(t.E, 2)} eV.` };
    },
  },
  {
    id: 'lambda', label: 'Wavelength of the line', topic: 'Hydrogen line spectra',
    build: p => {
      const t = transition(p);
      const c = choices(`${fmt(t.lambda, 0)} nm`, [`${fmt(t.lambda * 2, 0)} nm`, `${fmt(t.lambda / 2, 0)} nm`, `${fmt(1240 * t.E, 0)} nm`], 572);
      return { prompt: `What is the wavelength of the n = ${p.upper} → ${p.lower} line?`, ...c, explain: `λ = hc/E = 1240/${fmt(t.E, 2)} = ${fmt(t.lambda, 0)} nm: the ${SERIES[p.lower].name} series (${SERIES[p.lower].region}).` };
    },
  },
  {
    id: 'series', label: 'Which series', topic: 'Hydrogen line spectra',
    build: p => {
      const s = SERIES[p.lower];
      const c = choices(`${s.name}, in the ${s.region}`, Object.values(SERIES).filter(x => x.name !== s.name).slice(0, 3).map(x => `${x.name}, in the ${x.region}`), 573);
      return { prompt: `Every line that ends on n = ${p.lower} belongs to which series?`, ...c, explain: `Transitions down to n = 1 make the Lyman series (UV), to n = 2 the Balmer (visible), to n = 3 the Paschen (IR). This one ends on ${p.lower}: ${s.name}.` };
    },
  },
  {
    id: 'radius', label: 'Radius of the orbit', topic: BOHR,
    build: p => {
      const c = choices(`${fmt(radius(p.upper), 2)} Å`, [`${fmt(0.529 * p.upper, 2)} Å`, `${fmt(radius(p.upper) * 2, 2)} Å`, '0.53 Å'], 574);
      return { prompt: `What is the radius of the n = ${p.upper} orbit?`, ...c, explain: `rₙ = 0.529 n² Å = 0.529 × ${p.upper * p.upper} = ${fmt(radius(p.upper), 2)} Å. The orbits spread out as n².` };
    },
  },
  {
    id: 'ionise', label: 'Energy to ionise from n', topic: BOHR,
    build: p => {
      const c = choices(`${fmt(-energy(p.lower), 2)} eV`, ['13.6 eV', `${fmt(transition(p).E, 2)} eV`, `${fmt(-energy(p.lower) * 2, 2)} eV`].filter(x => x !== `${fmt(-energy(p.lower), 2)} eV`), 575);
      return { prompt: `How much energy frees an electron from the n = ${p.lower} orbit?`, ...c, explain: `It must go from ${fmt(energy(p.lower), 2)} eV to 0, so it needs ${fmt(-energy(p.lower), 2)} eV. From the ground state it is 13.6 eV.` };
    },
  },
];

export const bohr: LabEngine<BohrParams> = {
  id: 'bohr',
  title: 'Bohr model and hydrogen spectrum',
  blurb: 'Drop the electron between orbits: the energy levels, the photon it gives out and the line it makes in the spectrum.',
  subject: 'Physics',
  classes: [12],
  chapters: ['Atoms'],
  params: [
    { kind: 'number', key: 'upper', label: 'From orbit', unit: 'n', min: 2, max: 7, step: 1, default: 3 },
    { kind: 'number', key: 'lower', label: 'To orbit', unit: 'n', min: 1, max: 5, step: 1, default: 2 },
  ],
  check: p => (p.lower >= p.upper ? 'The electron must drop to a lower orbit.' : null),
  readouts: p => {
    const t = transition(p);
    return [{ label: `E${p.upper}`, value: `${fmt(energy(p.upper), 2)} eV` }, { label: `E${p.lower}`, value: `${fmt(energy(p.lower), 2)} eV` }, { label: 'Photon', value: `${fmt(t.E, 2)} eV` }, { label: 'Wavelength', value: `${fmt(t.lambda, 0)} nm` }, { label: 'Series', value: SERIES[p.lower].name }];
  },
  predictions,
};
