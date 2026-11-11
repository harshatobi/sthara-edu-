/**
 * What each reaction looks like on the lab bench, for the 3D bench view: the
 * apparatus and what the class would see change. Colours and observations
 * follow the NCERT Class 10 activities. Only reactions with something to see
 * are here; a colourless gas is never drawn as a coloured one.
 */

type Fade = [from: string, to: string];

export type BenchSpec = { before: string; pace?: string } & (
  | {
    kind: 'beaker';
    liquid: Fade;
    /** How see-through the liquid is before and after (0 clear, 1 opaque). */
    opacity: [number, number];
    solid?: 'nail' | 'granules' | 'lumps';
    /** The colour the part of the solid under the liquid turns. */
    coat?: string;
    bubbles?: boolean;
    steam?: boolean;
    /** A second solution poured in from a test tube, and the solid that forms. */
    pour?: boolean;
    precipitate?: string;
  }
  | { kind: 'tube'; solid: Fade; fumes?: string }
  | { kind: 'ribbon' }
  | { kind: 'burner' }
);

export const BENCHES: Record<string, BenchSpec> = {
  'fe-cuso4': {
    kind: 'beaker', before: 'An iron nail stands in blue copper sulphate solution.', pace: 'About 20 minutes in the lab; speeded up here.',
    liquid: ['#2E8BE6', '#A9D8A0'], opacity: [0.62, 0.5], solid: 'nail', coat: '#9A4A22',
  },
  'zn-h2so4': {
    kind: 'beaker', before: 'Zinc granules under dilute sulphuric acid.',
    liquid: ['#E6F1FF', '#E6F1FF'], opacity: [0.28, 0.28], solid: 'granules', bubbles: true,
  },
  'na2so4-bacl2': {
    kind: 'beaker', before: 'Sodium sulphate solution in the beaker, barium chloride solution in the test tube. Both are colourless.',
    liquid: ['#E6F1FF', '#F4F6F8'], opacity: [0.28, 0.42], pour: true, precipitate: '#FFFFFF',
  },
  'cao-h2o': {
    kind: 'beaker', before: 'Lumps of quicklime dropped into water.',
    liquid: ['#E6F1FF', '#F3F1E7'], opacity: [0.28, 0.88], solid: 'lumps', bubbles: true, steam: true,
  },
  feso4: { kind: 'tube', before: 'Green ferrous sulphate crystals in a dry boiling tube, over a flame.', solid: ['#8FCF9B', '#8B3A1E'] },
  pbno3: { kind: 'tube', before: 'White lead nitrate powder in a boiling tube, over a flame.', solid: ['#F4F4EE', '#E0B83A'], fumes: '#8A4B20' },
  'mg-o2': { kind: 'ribbon', before: 'A magnesium ribbon held in tongs over a watch glass.' },
  'ch4-o2': { kind: 'burner', before: 'Methane (natural gas) at the mouth of a burner.' },
};
