import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Specimen bench for the observation practicals:
 * classify: CBSE Class 9 #8, the specimens to identify, placed in NCERT's
 *   five kingdoms and the major plant divisions and animal phyla.
 * flower: Class 9 #7, the parts of a typical bisexual flower.
 * seed: Class 10 #14, the parts of the embryo of a dicot seed (pea, gram or
 *   red kidney bean).
 */

export type SpecimenKey = 'spirogyra' | 'mushroom' | 'moss' | 'fern' | 'pine' | 'amoeba' | 'hydra' | 'tapeworm' | 'ascaris' | 'earthworm' | 'butterfly' | 'snail' | 'starfish';
export type FlowerPart = 'sepal' | 'petal' | 'anther' | 'filament' | 'stigma' | 'style' | 'ovary' | 'thalamus';
export type SeedPart = 'coat' | 'hilum' | 'micropyle' | 'cotyledon' | 'plumule' | 'radicle';
export type SpecimensParams = { scenario: 'classify' | 'flower' | 'seed'; specimen: SpecimenKey; flowerPart: FlowerPart; seedPart: SeedPart };

export type Kingdom = 'Monera' | 'Protista' | 'Fungi' | 'Plantae' | 'Animalia';

export const SPECIMENS: Record<SpecimenKey, { name: string; kingdom: Kingdom; group: string; features: string[] }> = {
  spirogyra: { name: 'Spirogyra', kingdom: 'Plantae', group: 'Thallophyta (algae)', features: ['Green, thread-like filaments', 'Spiral ribbon-shaped chloroplasts', 'No roots, stem or leaves', 'Lives in fresh water'] },
  mushroom: { name: 'Mushroom (Agaricus)', kingdom: 'Fungi', group: 'Fungi', features: ['No chlorophyll: feeds on dead matter (saprophyte)', 'Umbrella-shaped cap on a stalk', 'Gills under the cap bear spores', 'Body made of thread-like hyphae'] },
  moss: { name: 'Moss (Funaria)', kingdom: 'Plantae', group: 'Bryophyta', features: ['Small plant with stem-like and leaf-like parts', 'Root-like rhizoids, no true roots', 'No vascular tissue', 'A stalked capsule with spores'] },
  fern: { name: 'Fern', kingdom: 'Plantae', group: 'Pteridophyta', features: ['True roots, stem and feathery leaves (fronds)', 'Has vascular tissue', 'Brown sori with spores under the leaflets', 'No flowers or seeds'] },
  pine: { name: 'Pine cone', kingdom: 'Plantae', group: 'Gymnosperms', features: ['Woody cone of overlapping scales', 'Naked seeds on the scales, not inside a fruit', 'Needle-shaped leaves on the tree', 'No flowers'] },
  amoeba: { name: 'Amoeba', kingdom: 'Protista', group: 'Protozoa', features: ['A single cell', 'Changes shape with finger-like pseudopodia', 'A nucleus and a contractile vacuole', 'Lives in water'] },
  hydra: { name: 'Hydra', kingdom: 'Animalia', group: 'Coelenterata (Cnidaria)', features: ['Tube-shaped body with one opening', 'Tentacles round the mouth with stinging cells', 'Body wall of two layers of cells', 'Reproduces by budding'] },
  tapeworm: { name: 'Tapeworm (Taenia)', kingdom: 'Animalia', group: 'Platyhelminthes', features: ['Flat, ribbon-like body', 'Many segments (proglottids)', 'Head (scolex) with hooks and suckers', 'Parasite in the intestine'] },
  ascaris: { name: 'Ascaris (roundworm)', kingdom: 'Animalia', group: 'Nematoda', features: ['Long, round, unsegmented body', 'Pointed at both ends', 'Parasite in the intestine', 'Separate male and female'] },
  earthworm: { name: 'Earthworm', kingdom: 'Animalia', group: 'Annelida', features: ['Long body of ring-like segments', 'A thick band (clitellum)', 'Tiny bristles (setae) for moving', 'Lives in moist soil'] },
  butterfly: { name: 'Butterfly', kingdom: 'Animalia', group: 'Arthropoda', features: ['Three pairs of jointed legs', 'Body in head, thorax and abdomen', 'Hard outer covering (exoskeleton)', 'Two pairs of wings'] },
  snail: { name: 'Snail (Pila)', kingdom: 'Animalia', group: 'Mollusca', features: ['Soft, unsegmented body', 'A coiled hard shell', 'A muscular foot for creeping', 'Tentacles on the head'] },
  starfish: { name: 'Starfish', kingdom: 'Animalia', group: 'Echinodermata', features: ['Five arms round a central disc (radial symmetry)', 'Spiny skin', 'Tube feet for moving', 'Lives only in the sea'] },
};

export const FLOWER: Record<FlowerPart, { name: string; whorl: string; role: string }> = {
  sepal: { name: 'Sepal', whorl: 'Calyx', role: 'Green; protects the flower in the bud' },
  petal: { name: 'Petal', whorl: 'Corolla', role: 'Coloured; attracts insects for pollination' },
  anther: { name: 'Anther', whorl: 'Stamen (male part)', role: 'Makes the pollen grains' },
  filament: { name: 'Filament', whorl: 'Stamen (male part)', role: 'The stalk that holds up the anther' },
  stigma: { name: 'Stigma', whorl: 'Pistil (female part)', role: 'Sticky tip that receives pollen' },
  style: { name: 'Style', whorl: 'Pistil (female part)', role: 'The tube the pollen tube grows down' },
  ovary: { name: 'Ovary', whorl: 'Pistil (female part)', role: 'Holds the ovules; becomes the fruit after fertilisation' },
  thalamus: { name: 'Thalamus (receptacle)', whorl: 'Base of the flower', role: 'All the other parts are attached to it' },
};

export const SEED: Record<SeedPart, { name: string; role: string }> = {
  coat: { name: 'Seed coat (testa)', role: 'Protects the embryo inside' },
  hilum: { name: 'Hilum', role: 'The scar where the seed was attached to the fruit wall' },
  micropyle: { name: 'Micropyle', role: 'A tiny pore that lets water in when the seed germinates' },
  cotyledon: { name: 'Cotyledon (seed leaf)', role: 'Stores food for the growing embryo; a dicot seed has two' },
  plumule: { name: 'Plumule', role: 'The future shoot' },
  radicle: { name: 'Radicle', role: 'The future root; it comes out first' },
};

const KINGDOMS: Kingdom[] = ['Monera', 'Protista', 'Fungi', 'Plantae', 'Animalia'];

const predictions: PredictionTemplate<SpecimensParams>[] = [
  {
    id: 'kingdom', label: 'Which kingdom', topic: 'Five kingdoms and their key features with examples',
    applies: p => p.scenario === 'classify',
    build: p => {
      const s = SPECIMENS[p.specimen];
      const c = choices(s.kingdom, KINGDOMS, 381);
      return { prompt: `${s.name}: which kingdom does it belong to?`, ...c, explain: `${s.kingdom}. ${s.features.slice(0, 2).join('; ')}.` };
    },
  },
  {
    id: 'group', label: 'Which group', topic: 'Major divisions of animals and plants',
    applies: p => p.scenario === 'classify' && (SPECIMENS[p.specimen].kingdom === 'Plantae' || SPECIMENS[p.specimen].kingdom === 'Animalia'),
    build: p => {
      const s = SPECIMENS[p.specimen];
      const same = Object.values(SPECIMENS).filter(x => x.kingdom === s.kingdom).map(x => x.group);
      const c = choices(s.group, same, 382);
      return { prompt: `${s.name}: which ${s.kingdom === 'Plantae' ? 'plant division' : 'animal phylum'} is it in?`, ...c, explain: `${s.group}: ${s.features.join('; ').toLowerCase()}.` };
    },
  },
  {
    id: 'feature', label: 'Its identifying feature', topic: 'Major divisions of animals and plants',
    applies: p => p.scenario === 'classify',
    build: p => {
      const s = SPECIMENS[p.specimen];
      const others = Object.entries(SPECIMENS).filter(([k]) => k !== p.specimen).map(([, x]) => x.features[0]);
      const c = choices(s.features[0], others.slice(0, 6), 383);
      return { prompt: `Which of these describes ${s.name.toLowerCase()}?`, ...c, explain: `${s.name} (${s.group}): ${s.features.join('; ').toLowerCase()}.` };
    },
  },
  {
    id: 'flower-part', label: 'Name the part', chapter: 'Reproduction', topic: 'Sexual reproduction in flowering plants: flower and its parts, pollination, fertilisation, seed dispersal',
    applies: p => p.scenario === 'flower',
    build: p => {
      const f = FLOWER[p.flowerPart];
      const c = choices(f.name, Object.values(FLOWER).map(x => x.name), 384);
      return { prompt: 'The highlighted part of the flower is the…', ...c, explain: `${f.name}, part of the ${f.whorl.toLowerCase()}. ${f.role}.` };
    },
  },
  {
    id: 'becomes-fruit', label: 'What becomes the fruit', chapter: 'Reproduction', topic: 'Sexual reproduction in flowering plants: flower and its parts, pollination, fertilisation, seed dispersal',
    applies: p => p.scenario === 'flower',
    build: () => {
      const c = choices('The ovary; the ovules inside become the seeds', ['The petals', 'The anther; the pollen becomes the seeds', 'The stigma'], 385);
      return { prompt: 'After fertilisation, which part of the flower becomes the fruit?', ...c, explain: 'The ovary ripens into the fruit and the fertilised ovules inside it become seeds; petals, sepals and stamens usually wither and fall.' };
    },
  },
  {
    id: 'bisexual', label: 'Why it is bisexual', chapter: 'Reproduction', topic: 'Sexual reproduction in flowering plants: flower and its parts, pollination, fertilisation, seed dispersal',
    applies: p => p.scenario === 'flower',
    build: () => {
      const c = choices('It has both stamens and a pistil', ['It has both sepals and petals', 'It can be pollinated by two kinds of insects', 'It has two ovaries'], 386);
      return { prompt: 'This is a bisexual flower. What makes it bisexual?', ...c, explain: 'A bisexual flower has both the male part (stamens) and the female part (pistil), as in hibiscus and mustard. Papaya and watermelon flowers are unisexual.' };
    },
  },
  {
    id: 'seed-part', label: 'Name the seed part', chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)',
    applies: p => p.scenario === 'seed',
    build: p => {
      const s = SEED[p.seedPart];
      const c = choices(s.name, Object.values(SEED).map(x => x.name), 387);
      return { prompt: 'The soaked gram seed is opened. The highlighted part is the…', ...c, explain: `${s.name}: ${s.role.charAt(0).toLowerCase()}${s.role.slice(1)}.` };
    },
  },
  {
    id: 'becomes-root', label: 'What grows into the root', chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)',
    applies: p => p.scenario === 'seed',
    build: () => {
      const c = choices('The radicle', ['The plumule', 'The cotyledons', 'The hilum'], 388);
      return { prompt: 'When the seed germinates, which part grows into the root?', ...c, explain: 'The radicle becomes the root (it emerges first), the plumule becomes the shoot, and the two cotyledons feed them until the first leaves can make food.' };
    },
  },
];

const is = (s: SpecimensParams['scenario']) => (p: SpecimensParams) => p.scenario === s;

export const specimens: LabEngine<SpecimensParams> = {
  id: 'specimens',
  title: 'Specimen bench',
  blurb: 'Identify and classify the practical specimens, from Spirogyra to starfish, and name the parts of a flower and a dicot seed.',
  subject: 'Science',
  classes: [9, 10],
  chapters: ['Diversity', 'Reproduction', 'How do Organisms Reproduce?'],
  params: [
    { kind: 'choice', key: 'scenario', label: 'Bench', default: 'classify', options: [{ value: 'classify', label: 'Identify and classify specimens (Class 9 #8)' }, { value: 'flower', label: 'Parts of a bisexual flower (Class 9 #7)' }, { value: 'seed', label: 'Dicot seed embryo (Class 10 #14)' }] },
    { kind: 'choice', key: 'specimen', label: 'Specimen', default: 'fern', options: (Object.keys(SPECIMENS) as SpecimenKey[]).map(value => ({ value, label: SPECIMENS[value].name })), show: is('classify') },
    { kind: 'choice', key: 'flowerPart', label: 'Highlight', default: 'ovary', options: (Object.keys(FLOWER) as FlowerPart[]).map(value => ({ value, label: FLOWER[value].name })), show: is('flower') },
    { kind: 'choice', key: 'seedPart', label: 'Highlight', default: 'radicle', options: (Object.keys(SEED) as SeedPart[]).map(value => ({ value, label: SEED[value].name })), show: is('seed') },
  ],
  readouts: p => {
    if (p.scenario === 'classify') {
      const s = SPECIMENS[p.specimen];
      return [{ label: 'Kingdom', value: s.kingdom }, { label: 'Group', value: s.group }, ...s.features.map((f, i) => ({ label: `Feature ${i + 1}`, value: f }))];
    }
    if (p.scenario === 'flower') { const f = FLOWER[p.flowerPart]; return [{ label: 'Part', value: f.name }, { label: 'Whorl', value: f.whorl }, { label: 'Role', value: f.role }]; }
    const s = SEED[p.seedPart];
    return [{ label: 'Part', value: s.name }, { label: 'Role', value: s.role }];
  },
  predictions,
};
