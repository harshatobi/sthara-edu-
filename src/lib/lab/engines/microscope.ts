import { choices, fmt, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Compound microscope with the slides of the CBSE Class 9-10 practicals:
 * onion peel and cheek cells (Class 9 #4), plant and animal tissues (#5),
 * budding and spores (#6), leaf-peel stomata (Class 10 #6), binary fission in
 * Amoeba and budding in yeast and Hydra (Class 10 #12).
 *
 * Optics: total magnification = eyepiece × objective; the field of view
 * (diameter, mm) = field number / objective magnification, with a field
 * number of 18 mm for a 10× school eyepiece. Specimens are drawn at their
 * real size, so the field shows exactly as many cells as it would.
 */

export type SlideKey =
  | 'onion' | 'cheek' | 'parenchyma' | 'collenchyma' | 'sclerenchyma'
  | 'striated' | 'smooth' | 'cardiac' | 'stomata' | 'amoeba' | 'yeast' | 'hydra' | 'mould';

export type MicroscopeParams = { slide: SlideKey; objective: '4' | '10' | '40' };

export const EYEPIECE = 10;
export const FIELD_NUMBER = 18; // mm

export interface Slide {
  label: string;
  /** Class and practical number in the official list. */
  practical: string;
  kingdom: 'Plant' | 'Animal' | 'Fungus' | 'Protist';
  /** Typical size of one unit (cell, organism) in micrometres, for the "how many fit" question. */
  unitUm: number;
  unit: string;
  stain: string | null;
  features: string[];
  /** One feature that identifies it, for the "what is this" question. */
  tell: string;
  chapter: string;
  topic: string;
}

export const SLIDES: Record<SlideKey, Slide> = {
  onion: { label: 'Onion peel (stained)', practical: 'Class 9 #4', kingdom: 'Plant', unitUm: 250, unit: 'cell', stain: 'Safranin (or iodine)', features: ['Brick-shaped cells packed with no gaps', 'A thick cell wall around each cell', 'A darkly stained nucleus near the edge', 'A large central vacuole'], tell: 'Rectangular cells with cell walls, no chloroplasts', chapter: 'Cell', topic: 'Plant and animal cells' },
  cheek: { label: 'Human cheek cells (stained)', practical: 'Class 9 #4', kingdom: 'Animal', unitUm: 60, unit: 'cell', stain: 'Methylene blue', features: ['Flat, irregular cells, often loose or folded', 'No cell wall: only a thin cell membrane', 'A small, central, darkly stained nucleus', 'No large vacuole'], tell: 'Irregular flat cells with a central nucleus and no cell wall', chapter: 'Cell', topic: 'Plant and animal cells' },
  parenchyma: { label: 'Parenchyma', practical: 'Class 9 #5', kingdom: 'Plant', unitUm: 60, unit: 'cell', stain: 'Safranin', features: ['Round or oval living cells', 'Thin cell walls', 'Spaces between the cells (intercellular spaces)'], tell: 'Thin-walled round cells loosely packed with intercellular spaces', chapter: 'Tissues', topic: 'Plant tissues: meristematic (types, function) and permanent (types, structure, function)' },
  collenchyma: { label: 'Collenchyma', practical: 'Class 9 #5', kingdom: 'Plant', unitUm: 40, unit: 'cell', stain: 'Safranin', features: ['Living, elongated cells', 'Walls thickened at the corners', 'Little or no space between cells'], tell: 'Cells with walls thickened at the corners', chapter: 'Tissues', topic: 'Plant tissues: meristematic (types, function) and permanent (types, structure, function)' },
  sclerenchyma: { label: 'Sclerenchyma', practical: 'Class 9 #5', kingdom: 'Plant', unitUm: 25, unit: 'cell', stain: 'Safranin (lignin stains red)', features: ['Dead cells', 'Very thick walls of lignin', 'A narrow space (lumen) inside each cell', 'No intercellular spaces'], tell: 'Dead cells with very thick lignified walls and a narrow lumen', chapter: 'Tissues', topic: 'Plant tissues: meristematic (types, function) and permanent (types, structure, function)' },
  striated: { label: 'Striated (skeletal) muscle', practical: 'Class 9 #5', kingdom: 'Animal', unitUm: 60, unit: 'fibre width', stain: null, features: ['Long, cylindrical, unbranched fibres', 'Light and dark bands (striations)', 'Many nuclei at the edge of each fibre'], tell: 'Long unbranched fibres with cross stripes and many nuclei', chapter: 'Tissues', topic: 'Animal tissues: epithelial, connective, muscular and nervous' },
  smooth: { label: 'Smooth (unstriated) muscle', practical: 'Class 9 #5', kingdom: 'Animal', unitUm: 150, unit: 'fibre length', stain: null, features: ['Spindle-shaped cells, pointed at both ends', 'No stripes', 'One central nucleus in each cell'], tell: 'Spindle-shaped cells with one nucleus and no stripes', chapter: 'Tissues', topic: 'Animal tissues: epithelial, connective, muscular and nervous' },
  cardiac: { label: 'Cardiac muscle', practical: 'Class 9 #5', kingdom: 'Animal', unitUm: 100, unit: 'cell length', stain: null, features: ['Cylindrical, branched fibres', 'Faint stripes', 'One or two central nuclei per cell', 'Dark lines where cells join (intercalated discs)'], tell: 'Branched striped fibres joined by intercalated discs', chapter: 'Tissues', topic: 'Animal tissues: epithelial, connective, muscular and nervous' },
  stomata: { label: 'Leaf peel with stomata', practical: 'Class 10 #6', kingdom: 'Plant', unitUm: 40, unit: 'stoma', stain: 'Safranin', features: ['Wavy-edged epidermal cells', 'Pairs of bean-shaped guard cells', 'A pore (stoma) between each pair', 'Chloroplasts in the guard cells only'], tell: 'Bean-shaped guard cells around a pore among wavy epidermal cells', chapter: 'Life Processes', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals' },
  amoeba: { label: 'Amoeba: binary fission', practical: 'Class 10 #12', kingdom: 'Protist', unitUm: 400, unit: 'cell', stain: null, features: ['One irregular cell with pseudopodia', 'The nucleus divides first', 'The cytoplasm then splits into two daughter cells'], tell: 'An irregular single cell dividing into two equal halves', chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)' },
  yeast: { label: 'Yeast: budding', practical: 'Class 10 #12 / Class 9 #6', kingdom: 'Fungus', unitUm: 7, unit: 'cell', stain: null, features: ['Tiny oval cells', 'Small buds growing out of the parent cells', 'Buds may stay attached, forming short chains'], tell: 'Tiny oval cells with smaller buds attached', chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)' },
  hydra: { label: 'Hydra: budding', practical: 'Class 10 #12 / Class 9 #6', kingdom: 'Animal', unitUm: 3000, unit: 'body length (as mounted)', stain: null, features: ['A tube-shaped body with tentacles round the mouth', 'A bud growing from the side of the body', 'The bud grows its own tentacles, then breaks away'], tell: 'A tubular animal with tentacles and a bud on its side', chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)' },
  mould: { label: 'Bread mould (Rhizopus): spores', practical: 'Class 9 #6', kingdom: 'Fungus', unitUm: 100, unit: 'sporangium', stain: null, features: ['Thread-like hyphae', 'Upright stalks (sporangiophores)', 'Round black sporangia at the tips, full of spores'], tell: 'Threads with round black knobs (sporangia) on upright stalks', chapter: 'Reproduction', topic: 'Forms of reproduction: sexual and asexual; types of asexual reproduction' },
};

/** Field of view diameter (mm) and total magnification. */
export function optics(p: MicroscopeParams) {
  const obj = Number(p.objective);
  return { total: EYEPIECE * obj, fov: FIELD_NUMBER / obj };
}

/** About how many units fit across the field. */
export const acrossField = (p: MicroscopeParams) => (optics(p).fov * 1000) / SLIDES[p.slide].unitUm;

/** Whether the slide is worth looking at with this objective (too big, or too small to make out). */
export function suits(p: MicroscopeParams): 'too-big' | 'too-small' | 'good' {
  const n = acrossField(p);
  return n < 0.4 ? 'too-big' : SLIDES[p.slide].unitUm * optics(p).total < 1500 ? 'too-small' : 'good';
}

const predictions: PredictionTemplate<MicroscopeParams>[] = [
  {
    id: 'magnification', label: 'Total magnification', topic: 'Discovery of cell', chapter: 'Cell',
    build: p => {
      const o = optics(p), x = (n: number) => `${n}×`;
      const c = choices(x(o.total), [x(EYEPIECE + Number(p.objective)), x(Number(p.objective)), x(o.total * 10)], 371);
      return { prompt: `With the ${EYEPIECE}× eyepiece and the ${p.objective}× objective, what is the total magnification?`, ...c, explain: `Total magnification = eyepiece × objective = ${EYEPIECE} × ${p.objective} = ${o.total}×.` };
    },
  },
  {
    id: 'how-many', label: 'How many fit across the field', topic: 'Discovery of cell', chapter: 'Cell',
    applies: p => suits(p) === 'good' && acrossField(p) >= 1.5,
    build: p => {
      const n = Math.round(acrossField(p)), s = SLIDES[p.slide];
      const c = choices(`About ${n}`, [`About ${Math.max(1, Math.round(n / 4))}`, `About ${n * 4}`, `About ${n * 10}`], 372);
      return { prompt: `The field of view is ${fmt(optics(p).fov, 2)} mm across. Each ${s.unit} of ${s.label.toLowerCase()} is about ${s.unitUm} µm. About how many fit across the field?`, ...c, explain: `${fmt(optics(p).fov, 2)} mm = ${fmt(optics(p).fov * 1000, 0)} µm; ${fmt(optics(p).fov * 1000, 0)} ÷ ${s.unitUm} ≈ ${n}. Switching to a stronger objective makes the field smaller and each ${s.unit} bigger.` };
    },
  },
  {
    id: 'identify', label: 'What is on the slide', topic: p => SLIDES[p.slide].topic, chapter: p => SLIDES[p.slide].chapter,
    build: p => {
      const s = SLIDES[p.slide];
      const same = (Object.values(SLIDES) as Slide[]).filter(x => x.chapter === s.chapter && x.label !== s.label).map(x => x.label);
      const pool = same.length >= 2 ? same : (Object.values(SLIDES) as Slide[]).filter(x => x.label !== s.label).map(x => x.label);
      const c = choices(s.label, pool.slice(0, 3), 373);
      return { prompt: `You see: ${s.tell.charAt(0).toLowerCase()}${s.tell.slice(1)}. What is on the slide?`, ...c, explain: `${s.label}. ${s.features.join('; ')}.` };
    },
  },
  {
    id: 'plant-or-animal', label: 'Plant cell or animal cell?', topic: 'Plant and animal cells', chapter: 'Cell',
    applies: p => p.slide === 'onion' || p.slide === 'cheek',
    build: p => {
      const plant = p.slide === 'onion';
      const c = choices(plant ? 'Plant cells: each has a cell wall and a large vacuole' : 'Animal cells: no cell wall, no large vacuole', ['Plant cells: each has a cell wall and a large vacuole', 'Animal cells: no cell wall, no large vacuole', 'Bacteria: no nucleus'], 374);
      return { prompt: `${SLIDES[p.slide].label}: plant cells or animal cells, and how can you tell?`, ...c, explain: plant ? 'Onion cells are plant cells: a rigid cell wall gives them a fixed brick shape, and a large central vacuole pushes the nucleus to the side.' : 'Cheek cells are animal cells: only a thin membrane, so their shape is irregular; the nucleus is central.' };
    },
  },
  {
    id: 'tissue-feature', label: 'The tell-tale feature', topic: p => SLIDES[p.slide].topic, chapter: 'Tissues',
    applies: p => ['striated', 'smooth', 'cardiac', 'parenchyma', 'collenchyma', 'sclerenchyma'].includes(p.slide),
    build: p => {
      const s = SLIDES[p.slide];
      const group = ['striated', 'smooth', 'cardiac'].includes(p.slide) ? (['striated', 'smooth', 'cardiac'] as SlideKey[]) : (['parenchyma', 'collenchyma', 'sclerenchyma'] as SlideKey[]);
      const c = choices(s.tell, group.map(k => SLIDES[k].tell), 375);
      return { prompt: `How do you recognise ${s.label.toLowerCase()} under the microscope?`, ...c, explain: `${s.label}: ${s.features.join('; ').toLowerCase()}.` };
    },
  },
  {
    id: 'stomata-role', label: 'What stomata do', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals', chapter: 'Life Processes',
    applies: p => p.slide === 'stomata',
    build: () => {
      const c = choices('Let carbon dioxide in and oxygen and water vapour out; the guard cells open and close the pore', ['Absorb water from the soil', 'Make food in the dark', 'Store starch'], 376);
      return { prompt: 'What are stomata for?', ...c, explain: 'Gases for photosynthesis and respiration are exchanged through the stomata, and water is lost through them (transpiration). Guard cells swell to open the pore and go limp to close it.' };
    },
  },
  {
    id: 'asexual-kind', label: 'Which kind of asexual reproduction', topic: 'Reproduction in animals and plants (asexual and sexual)', chapter: 'How do Organisms Reproduce?',
    applies: p => ['amoeba', 'yeast', 'hydra'].includes(p.slide),
    build: p => {
      const right = p.slide === 'amoeba' ? 'Binary fission' : 'Budding';
      const c = choices(right, ['Binary fission', 'Budding', 'Spore formation', 'Fragmentation'], 377);
      return { prompt: `${SLIDES[p.slide].label.split(':')[0]}: which kind of asexual reproduction is this?`, ...c, explain: p.slide === 'amoeba' ? 'Binary fission: the nucleus divides, then the cell splits into two equal daughter cells.' : `Budding: a small outgrowth (bud) grows on the parent${p.slide === 'hydra' ? ', develops tentacles,' : ''} and separates to live on its own.` };
    },
  },
  {
    id: 'spores', label: 'Spore formation', topic: 'Forms of reproduction: sexual and asexual; types of asexual reproduction', chapter: 'Reproduction',
    applies: p => p.slide === 'mould',
    build: () => {
      const c = choices('In the round sporangia at the tips of the upright stalks', ['In the thread-like hyphae on the bread', 'In the bread itself', 'In buds on the side of the threads'], 378);
      return { prompt: 'Where does bread mould make its spores?', ...c, explain: 'Rhizopus grows upright sporangiophores; the sporangium at each tip fills with spores, bursts, and the light spores spread to grow new mould wherever they land in moist conditions.' };
    },
  },
];

export const microscope: LabEngine<MicroscopeParams> = {
  id: 'microscope',
  title: 'Virtual microscope',
  blurb: 'The slides of the Class 9 and 10 practicals at true scale: cells, tissues, stomata, fission and budding. Switch objectives and count.',
  subject: 'Science',
  classes: [9, 10],
  chapters: ['Cell', 'Tissues', 'Reproduction', 'Life Processes', 'How do Organisms Reproduce?'],
  params: [
    { kind: 'choice', key: 'slide', label: 'Slide', default: 'onion', options: (Object.keys(SLIDES) as SlideKey[]).map(value => ({ value, label: `${SLIDES[value].label} · ${SLIDES[value].practical}` })) },
    { kind: 'choice', key: 'objective', label: 'Objective', default: '10', options: [{ value: '4', label: '4× (low power)' }, { value: '10', label: '10×' }, { value: '40', label: '40× (high power)' }] },
  ],
  readouts: p => {
    const o = optics(p), s = SLIDES[p.slide];
    return [
      { label: 'Magnification', value: `${EYEPIECE}× × ${p.objective}× = ${o.total}×` },
      { label: 'Field of view', value: `${fmt(o.fov, 2)} mm (${fmt(o.fov * 1000, 0)} µm)` },
      { label: `${s.unit.charAt(0).toUpperCase()}${s.unit.slice(1)} size`, value: `about ${s.unitUm >= 1000 ? `${fmt(s.unitUm / 1000, 1)} mm` : `${s.unitUm} µm`}` },
      { label: 'Stain', value: s.stain ?? 'Prepared slide' },
      ...(suits(p) === 'good' ? [] : [{ label: 'Tip', value: suits(p) === 'too-big' ? 'Too big for this objective: use low power' : 'Too small to make out: use a stronger objective' }]),
    ];
  },
  predictions,
};
