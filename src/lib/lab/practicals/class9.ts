import { pick, read, shuffled } from '../noise';
import { BEHAVIOUR, PROPERTIES, SUBSTANCES, TECHNIQUES, type Kind, type Property, type Substance, type Technique } from '../engines/mixtures';
import { SLIDES, type SlideKey } from '../engines/microscope';
import { FLOWER, SPECIMENS, type FlowerPart, type SpecimenKey } from '../engines/specimens';
import { heightAt } from '../engines/pendulum';
import { G as g9 } from '../engines/trolley';
import { accel } from '../engines/incline';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class IX Science (086) practicals, 2026-27: "List of experiments",
 * ScienceSt_SecP1_2026-27.pdf p.19 (cbseacademic.nic.in). Official wording is
 * kept as printed (numbering tidied).
 */

export const CLASS9: Practical[] = [
  {
    id: 'c9-01', cls: 9, subject: 'Science', no: 1, kind: 'observation',
    official: 'Preparation of: a) a true solution of common salt, sugar and alum b) a suspension of soil, chalk powder and fine sand in water c) a colloidal solution of starch in water and egg albumin/milk in water and distinguish between these on the basis of transparency, filtration criterion, stability, Tyndall effect',
    title: 'True solutions, suspensions and colloids',
    chapter: 'Exploring Mixtures and their Separation', topic: 'Solutions, suspensions, colloids and their properties',
    aim: 'To prepare a true solution, a suspension and a colloid, and tell them apart by transparency, filtration, stability and the Tyndall effect.',
    apparatus: ['Beakers', 'Glass rod', 'Funnel and filter paper', 'Torch', 'Common salt, sugar, alum', 'Soil, chalk powder, fine sand', 'Starch, egg albumin or milk', 'Water'],
    procedure: [
      'Stir a spoonful of each substance into 50 mL of water in separate beakers (boil the starch in water).',
      'Look through each beaker at a printed word: is it transparent, translucent or opaque?',
      'Filter a little of each and look for residue on the filter paper.',
      'Leave the beakers undisturbed for 15 minutes and note whether anything settles.',
      'In a dark room, shine a torch beam through each and note whether its path is visible.',
    ],
    precautions: ['Stir each mixture well.', 'Use clean beakers and fresh filter paper for each.', 'Do the Tyndall test in a darkened room.'],
    setups: [
      { engine: 'mixtures', params: { scenario: 'classify', substance: 'starch', property: 'tyndall', technique: 'funnel' }, label: 'Starch: Tyndall effect' },
      { engine: 'mixtures', params: { scenario: 'classify', substance: 'chalk', property: 'filtration', technique: 'funnel' }, label: 'Chalk: filtration' },
    ],
    readings: rng => {
      const pickKind = (k: Kind) => pick(rng, (Object.keys(SUBSTANCES) as Substance[]).filter(x => SUBSTANCES[x].kind === k));
      const chosen = shuffled(rng, [pickKind('True solution'), pickKind('Suspension'), pickKind('Colloid')]);
      const rows = chosen.map(s => ({ mixture: SUBSTANCES[s].label, ...Object.fromEntries((Object.keys(PROPERTIES) as Property[]).map(p => [p, BEHAVIOUR[SUBSTANCES[s].kind][p].split(':')[0]])), kind: SUBSTANCES[s].kind }));
      return observation(['Three mixtures, in the order on your sheet'], [{ key: 'mixture', label: 'Mixture' }, ...(Object.keys(PROPERTIES) as Property[]).map(p => ({ key: p, label: PROPERTIES[p] })), { key: 'kind', label: 'Kind' }], rows, [...Object.keys(PROPERTIES), 'kind']);
    },
    viva: [
      { q: 'What is the Tyndall effect?', a: 'The scattering of a beam of light by particles in a mixture, which makes the path of the beam visible.', source: 'authored' },
      { q: 'Why does a colloid pass through filter paper?', a: 'Its particles are too small (1-1000 nm) to be held back by the pores of the paper.', source: 'authored' },
      { q: 'Give an everyday example of a colloid.', a: 'Milk, fog, butter, jelly, shaving cream.', source: 'authored' },
    ],
    conclusion: 'A true solution is transparent, filters completely, is stable and shows no Tyndall effect; a suspension is opaque, leaves a residue and settles; a colloid is translucent, filters through, is stable and shows the Tyndall effect.',
  },
  {
    id: 'c9-02', cls: 9, subject: 'Science', no: 2, kind: 'observation',
    official: 'Separation of components of mixtures using different techniques: a) Oil and water - Separating Funnel b) Colours in black ink - Paper Chromatography c) Ammonium chloride and common salt - Sublimation d) Muddy water using alum - Coagulation',
    title: 'Separating mixtures',
    chapter: 'Exploring Mixtures and their Separation', topic: 'Separation techniques: crystallisation, distillation, paper chromatography, sublimation, centrifugation, coagulation',
    aim: 'To separate oil from water, the colours in black ink, ammonium chloride from common salt, and mud from water.',
    apparatus: ['Separating funnel with stand', 'Filter paper strip and jar', 'China dish, funnel, cotton plug, tripod, wire gauze and burner', 'Beaker and glass rod', 'Oil, black ink, ammonium chloride, common salt, muddy water, alum'],
    procedure: [
      'Shake oil and water in the separating funnel, let the layers settle, and run off the lower layer.',
      'Put a spot of black ink 3 cm from the end of a filter paper strip; dip the end in water (ink spot above the water) and wait.',
      'Heat the mixture of ammonium chloride and salt in a china dish under an inverted funnel plugged with cotton.',
      'Stir alum into muddy water and leave it to stand.',
    ],
    precautions: ['Let the oil and water separate fully before opening the stopcock.', 'Keep the ink spot above the water level.', 'Heat the china dish gently; do not inhale the fumes.', 'Leave the muddy water undisturbed while it settles.'],
    setups: (Object.keys(TECHNIQUES) as Technique[]).map(t => ({ engine: 'mixtures', params: { scenario: 'separate', substance: 'starch', property: 'tyndall', technique: t }, label: TECHNIQUES[t].label })),
    readings: rng => observation(['Four mixtures, in the order on your sheet'], [{ key: 'mixture', label: 'Mixture' }, { key: 'method', label: 'Method' }, { key: 'result', label: 'What you see' }],
      shuffled(rng, Object.values(TECHNIQUES)).map(t => ({ mixture: t.mixture, method: t.label, result: t.result })), ['method', 'result']),
    viva: [
      { q: 'What is sublimation?', a: 'A solid turning straight into vapour on heating, and back to solid on cooling, without melting.', source: 'authored' },
      { q: 'Why do the dyes in ink separate on paper?', a: 'They dissolve in the solvent to different extents and are held by the paper differently, so they move up at different speeds.', source: 'authored' },
      { q: 'How does alum clear muddy water?', a: 'It makes the fine clay particles clump together (coagulate) so they settle.', source: 'authored' },
    ],
    conclusion: 'Immiscible liquids separate in a separating funnel, dyes by chromatography, a sublimable solid by sublimation, and fine mud by coagulation with alum.',
  },
  {
    id: 'c9-03', cls: 9, subject: 'Science', no: 3, kind: 'numeric',
    official: 'Verification of the law of conservation of mass in a chemical reaction.',
    title: 'Conservation of mass',
    chapter: 'Atoms and Molecules', topic: 'Law of conservation of mass',
    aim: 'To verify the law of conservation of mass in a chemical reaction.',
    apparatus: ['Conical flask with cork', 'Small test tube with thread', 'Barium chloride solution', 'Sodium sulphate solution', 'Physical balance (least count 0.01 g)'],
    procedure: [
      'Put sodium sulphate solution in the conical flask and barium chloride solution in the small test tube.',
      'Hang the test tube inside the flask with a thread so the solutions do not mix; cork the flask and weigh it.',
      'Tilt the flask so the solutions mix; a white precipitate forms.',
      'Weigh the corked flask again.',
    ],
    precautions: ['Keep the flask corked so nothing escapes.', 'Do not let the solutions mix before the first weighing.', 'Use the same balance for both weighings.'],
    setups: [{ engine: 'reactions', params: { reaction: 'na2so4-bacl2', given: 'r0', mass: 1.42 }, label: 'Sodium sulphate + barium chloride' }],
    readings: rng => {
      const start = read(rng, 140 + rng() * 40, 0.01, { abs: 0 });
      const rows = [1, 2].map(n => ({ trial: n, before: start, after: read(rng, start, 0.01, { abs: 0.006 }) }));
      const diff = r(mean(rows.map(x => (x.after as number) - (x.before as number))), 2);
      return numeric(['Corked flask with both solutions, kept apart, then mixed'], [{ key: 'trial', label: 'Weighing' }, { key: 'before', label: 'Mass before mixing', unit: 'g' }, { key: 'after', label: 'Mass after mixing', unit: 'g' }], rows, [],
        [{ label: 'Change in mass', unit: 'g', value: diff, tolerance: 0.01, working: `After − before: ${rows.map(x => r((x.after as number) - (x.before as number), 2)).join(', ')} g; mean ${diff} g, within the balance's least count.` }]);
    },
    viva: [
      { q: 'State the law of conservation of mass.', a: 'Mass can neither be created nor destroyed in a chemical reaction: the total mass of the products equals the total mass of the reactants.', source: 'authored' },
      { q: 'Why is the flask corked?', a: 'So that nothing (gas or spray) escapes or enters during the reaction.', source: 'authored' },
      { q: 'What is the white precipitate?', a: 'Barium sulphate: Na₂SO₄ + BaCl₂ → BaSO₄ + 2NaCl.', source: 'authored' },
    ],
    conclusion: 'The mass before and after the reaction is the same within the least count of the balance: mass is conserved.',
  },
  {
    id: 'c9-04', cls: 9, subject: 'Science', no: 4, kind: 'observation',
    official: 'Preparation of stained temporary mounts of (a) onion peel/ Rhoeo leaf (b) human cheek cells to record observations and draw their labeled diagrams.',
    title: 'Onion peel and cheek cells',
    chapter: 'Cell', topic: 'Plant and animal cells',
    aim: 'To prepare stained temporary mounts of onion peel and human cheek cells and record observations.',
    apparatus: ['Onion', 'Clean toothpick or spatula', 'Safranin or iodine', 'Methylene blue', 'Glycerine', 'Slides, coverslips, watch glass, needle, forceps, brush, blotting paper', 'Compound microscope'],
    procedure: [
      'Peel the thin membrane from the inner side of an onion scale; stain it with safranin, wash and mount in glycerine under a coverslip.',
      'Gently scrape the inside of your cheek with a clean toothpick; spread the scraping on a slide in a drop of water.',
      'Add a drop of methylene blue, then glycerine, and lower a coverslip.',
      'Observe both under low and then high power and draw labelled diagrams.',
    ],
    precautions: ['Use a clean, blunt toothpick and do not scrape hard.', 'Avoid air bubbles under the coverslip.', 'Remove extra stain and glycerine with blotting paper.'],
    setups: [{ engine: 'microscope', params: { slide: 'onion', objective: '40' }, label: 'Onion peel' }, { engine: 'microscope', params: { slide: 'cheek', objective: '40' }, label: 'Cheek cells' }],
    photos: ['onion-peel', 'cheek-cells'],
    readings: () => observation(['Onion peel and cheek cells, both under high power'], [{ key: 'feature', label: 'Feature' }, { key: 'onion', label: 'Onion peel' }, { key: 'cheek', label: 'Cheek cells' }], [
      { feature: 'Shape', onion: 'Regular, brick-shaped', cheek: 'Irregular, flat' },
      { feature: 'Cell wall', onion: 'Present', cheek: 'Absent (only a cell membrane)' },
      { feature: 'Nucleus', onion: 'At the side', cheek: 'In the centre' },
      { feature: 'Vacuole', onion: 'Large, central', cheek: 'Absent or small' },
      { feature: 'Stain used', onion: 'Safranin / iodine', cheek: 'Methylene blue' },
    ], ['onion', 'cheek']),
    viva: [
      { q: 'Why is glycerine added?', a: 'It keeps the specimen from drying.', source: 'authored' },
      { q: 'Why are stains used?', a: 'To colour the cell parts, especially the nucleus, so they can be seen.', source: 'authored' },
      { q: 'Name one structure found in plant cells but not in animal cells.', a: 'The cell wall (also plastids and a large central vacuole).', source: 'authored' },
    ],
    conclusion: 'Onion cells are plant cells: regular, with a cell wall and a large vacuole. Cheek cells are animal cells: irregular, with only a membrane and a central nucleus.',
  },
  {
    id: 'c9-05', cls: 9, subject: 'Science', no: 5, kind: 'observation',
    official: 'To study and identify tissues in plants (Parenchyma, Collenchyma and Sclerenchyma) and animals (striped, smooth and cardiac muscle fibers) from prepared slides. Draw their labeled diagrams.',
    title: 'Plant and animal tissues',
    chapter: 'Tissues', topic: 'Plant tissues: meristematic (types, function) and permanent (types, structure, function)',
    aim: 'To identify parenchyma, collenchyma and sclerenchyma, and striped, smooth and cardiac muscle fibres, from prepared slides.',
    apparatus: ['Prepared slides of the six tissues', 'Compound microscope'],
    procedure: ['Focus each slide first under low and then under high power.', 'Note the shape of the cells, the cell walls, nuclei and any stripes.', 'Identify each tissue and draw a labelled diagram.'],
    precautions: ['Start with low power.', 'Handle prepared slides carefully.'],
    setups: (['parenchyma', 'collenchyma', 'sclerenchyma', 'striated', 'smooth', 'cardiac'] as SlideKey[]).map(k => ({ engine: 'microscope', params: { slide: k, objective: '40' }, label: SLIDES[k].label })),
    photos: ['striated-muscle'],
    readings: rng => {
      const order = shuffled(rng, ['parenchyma', 'collenchyma', 'sclerenchyma', 'striated', 'smooth', 'cardiac'] as SlideKey[]);
      return observation(['Six prepared slides, labelled A to F'], [{ key: 'slide', label: 'Slide' }, { key: 'seen', label: 'What you see' }, { key: 'name', label: 'Tissue' }],
        order.map((k, i) => ({ slide: 'ABCDEF'[i], seen: SLIDES[k].tell, name: SLIDES[k].label })), ['name']);
    },
    viva: [
      { q: 'Which plant tissue gives flexibility to young stems?', a: 'Collenchyma (walls thickened at the corners).', source: 'authored' },
      { q: 'Which muscle never tires?', a: 'Cardiac muscle: it contracts rhythmically all through life.', source: 'authored' },
      { q: 'Why are sclerenchyma cells dead?', a: 'Their walls are thickened with lignin so much that the living contents are lost; they give strength (e.g. the husk of coconut).', source: 'authored' },
    ],
    conclusion: 'The six tissues are told apart by cell shape, wall thickening, the number and position of nuclei, and stripes.',
  },
  {
    id: 'c9-06', cls: 9, subject: 'Science', no: 6, kind: 'observation',
    official: 'To study (a) budding in yeast and Hydra (b) spore formation in bread mold with the help of prepared slides',
    title: 'Budding and spore formation',
    chapter: 'Reproduction', topic: 'Forms of reproduction: sexual and asexual; types of asexual reproduction',
    aim: 'To study budding in yeast and Hydra, and spore formation in bread mould, with prepared slides.',
    apparatus: ['Prepared slides of yeast, Hydra and bread mould (Rhizopus)', 'Compound microscope'],
    procedure: ['Observe each slide under low power (and yeast under high power).', 'Note how the new individual forms.', 'Draw labelled diagrams.'],
    precautions: ['Start with low power.', 'Handle the slides carefully.'],
    setups: [{ engine: 'microscope', params: { slide: 'yeast', objective: '40' }, label: 'Yeast' }, { engine: 'microscope', params: { slide: 'hydra', objective: '4' }, label: 'Hydra' }, { engine: 'microscope', params: { slide: 'mould', objective: '10' }, label: 'Bread mould' }],
    photos: ['yeast', 'hydra', 'bread-mould'],
    readings: rng => observation(['Three prepared slides, in the order on your sheet'], [{ key: 'slide', label: 'Slide' }, { key: 'seen', label: 'What you observe' }, { key: 'kind', label: 'Kind of reproduction' }],
      shuffled(rng, ['yeast', 'hydra', 'mould'] as SlideKey[]).map(k => ({ slide: SLIDES[k].label.split(':')[0], seen: SLIDES[k].features.join('; '), kind: k === 'mould' ? 'Spore formation' : 'Budding' })), ['seen', 'kind']),
    viva: [
      { q: 'What is a sporangium?', a: 'The round structure at the tip of a stalk in bread mould in which spores are made.', source: 'authored' },
      { q: 'Why does bread mould grow on moist bread?', a: 'Spores in the air land on it and need moisture and food (starch) to germinate.', source: 'authored' },
    ],
    conclusion: 'Yeast and Hydra reproduce by budding; bread mould reproduces by spores formed in sporangia.',
  },
  {
    id: 'c9-07', cls: 9, subject: 'Science', no: 7, kind: 'observation',
    official: 'To study and identify different parts of a typical bisexual flower. Draw labeled diagrams.',
    title: 'Parts of a bisexual flower',
    chapter: 'Reproduction', topic: 'Sexual reproduction in flowering plants: flower and its parts, pollination, fertilisation, seed dispersal',
    aim: 'To study and identify the parts of a typical bisexual flower.',
    apparatus: ['Fresh flower (Hibiscus, Datura or mustard)', 'Blade', 'Forceps and needle', 'Magnifying lens', 'White sheet'],
    procedure: ['Remove the sepals one by one, then the petals, and count them.', 'Look at the stamens: anther and filament.', 'Cut the pistil lengthwise to see the ovary with ovules, the style and the stigma.', 'Arrange the parts on the sheet and draw a labelled diagram.'],
    precautions: ['Use a fresh flower.', 'Cut the ovary carefully with a sharp blade.', 'Handle the blade carefully.'],
    setups: [{ engine: 'specimens', params: { scenario: 'flower', specimen: 'fern', flowerPart: 'ovary', seedPart: 'radicle' }, label: 'Flower, cut lengthwise' }],
    photos: ['hibiscus'],
    readings: rng => observation(['A bisexual flower'], [{ key: 'part', label: 'Part' }, { key: 'whorl', label: 'Whorl' }, { key: 'role', label: 'Function' }],
      shuffled(rng, Object.keys(FLOWER) as FlowerPart[]).map(k => ({ part: FLOWER[k].name, whorl: FLOWER[k].whorl, role: FLOWER[k].role })), ['whorl', 'role']),
    viva: [
      { q: 'Which part of the flower becomes the fruit?', a: 'The ovary; the ovules become seeds.', source: 'authored' },
      { q: 'What is pollination?', a: 'The transfer of pollen from the anther to the stigma.', source: 'authored' },
    ],
    conclusion: 'A bisexual flower has four whorls: calyx (sepals), corolla (petals), androecium (stamens: anther and filament) and gynoecium (pistil: stigma, style and ovary).',
  },
  {
    id: 'c9-08', cls: 9, subject: 'Science', no: 8, kind: 'observation',
    official: 'To study the Specimens/virtual specimens/slides/models for identification: (a) Spirogyra, mushroom, moss, fern, pine cone (b) Amoeba, Hydra, tapeworm, Ascaris, earthworm, butterfly, snail, starfish',
    title: 'Identifying specimens',
    chapter: 'Diversity', topic: 'Major divisions of animals and plants',
    aim: 'To identify the given specimens and classify them with their characteristic features.',
    apparatus: ['Specimens, slides, models or virtual specimens of the 13 organisms', 'Magnifying lens', 'Compound microscope (for Spirogyra and Amoeba)'],
    procedure: ['Observe each specimen carefully.', 'Note two or three characteristic features.', 'Identify its kingdom and its division or phylum.'],
    precautions: ['Do not take preserved specimens out of their jars.', 'Note features you can actually see.'],
    setups: (['spirogyra', 'fern', 'earthworm', 'starfish'] as SpecimenKey[]).map(k => ({ engine: 'specimens', params: { scenario: 'classify', specimen: k, flowerPart: 'ovary', seedPart: 'radicle' }, label: SPECIMENS[k].name })),
    photos: ['spirogyra', 'fern', 'earthworm', 'starfish'],
    readings: rng => {
      const plants: SpecimenKey[] = ['spirogyra', 'mushroom', 'moss', 'fern', 'pine'], animals: SpecimenKey[] = ['amoeba', 'hydra', 'tapeworm', 'ascaris', 'earthworm', 'butterfly', 'snail', 'starfish'];
      const chosen = [...shuffled(rng, plants).slice(0, 3), ...shuffled(rng, animals).slice(0, 4)];
      return observation(['Seven specimens, numbered as on your sheet'], [{ key: 'no', label: 'No.' }, { key: 'name', label: 'Specimen' }, { key: 'kingdom', label: 'Kingdom' }, { key: 'group', label: 'Division / phylum' }, { key: 'feature', label: 'Two features' }],
        shuffled(rng, chosen).map((k, i) => ({ no: i + 1, name: SPECIMENS[k].name, kingdom: SPECIMENS[k].kingdom, group: SPECIMENS[k].group, feature: SPECIMENS[k].features.slice(0, 2).join('; ') })), ['kingdom', 'group', 'feature']);
    },
    viva: [
      { q: 'Why is the mushroom not a plant?', a: 'It has no chlorophyll and cannot make its own food; it is a fungus.', source: 'authored' },
      { q: 'Which phylum has jointed legs?', a: 'Arthropoda (e.g. butterfly).', source: 'authored' },
      { q: 'What is special about the symmetry of a starfish?', a: 'Its body is in five parts arranged round a centre: radial symmetry.', source: 'authored' },
    ],
    conclusion: 'Each specimen is placed in its kingdom and group by features such as cell number, chlorophyll, body segmentation, symmetry and appendages.',
  },
  {
    id: 'c9-09', cls: 9, subject: 'Science', no: 9, kind: 'numeric',
    official: 'Verification of law of conservation of energy using a simple pendulum.',
    title: 'Conservation of energy: simple pendulum',
    chapter: 'Work, Energy and Simple Machines', topic: 'Conservation of energy',
    aim: 'To verify the law of conservation of energy using a simple pendulum.',
    apparatus: ['Simple pendulum (bob on a thread) on a stand', 'Metre scale (least count 0.1 cm)', 'Protractor', 'Chalk'],
    procedure: [
      'Mark the lowest position of the bob and measure its height above the table.',
      'Pull the bob aside and note its height h₁ above the lowest point.',
      'Release it and mark the highest point it reaches on the other side; measure that height h₂.',
      'Repeat three times and compare h₂ with h₁.',
    ],
    precautions: ['Release the bob without pushing it.', 'Keep the swing in one plane.', 'Measure heights from the same reference level.'],
    setups: [{ engine: 'pendulum', params: { len: 80, angle: 30, m: 100 }, label: 'Simple pendulum' }],
    readings: rng => {
      const len = pick(rng, [60, 70, 80, 90, 100]), angle = pick(rng, [25, 30, 35]);
      const h = heightAt({ len, angle, m: 100 }, angle) * 100;
      const rows = [1, 2, 3].map(n => { const h1 = read(rng, h, 0.1, { abs: 0.1 }); return { trial: n, h1, h2: read(rng, h1 * (0.975 + rng() * 0.015), 0.1, { abs: 0.05 }) }; })
        .map(x => ({ ...x, pct: r(((x.h2 as number) / (x.h1 as number)) * 100, 1) }));
      const value = r(mean(rows.map(x => x.pct)), 1);
      return numeric([`String length ${len} cm, released at about ${angle}°`], [{ key: 'trial', label: 'Trial' }, { key: 'h1', label: 'Height released from, h₁', unit: 'cm' }, { key: 'h2', label: 'Height reached, h₂', unit: 'cm' }, { key: 'pct', label: 'h₂ / h₁ × 100', unit: '%' }], rows, ['pct'],
        [{ label: 'Energy kept from one side to the other (mean h₂/h₁)', unit: '%', value, tolerance: 0.6, working: `Mean of ${rows.map(x => x.pct).join(', ')} = ${value}%.`, accepted: 'close to 100%; the small loss is due to air resistance' }]);
    },
    viva: [
      { q: 'Why does the bob not quite reach the same height?', a: 'A little energy is lost to air resistance and friction at the support.', source: 'authored' },
      { q: 'At which point is the kinetic energy greatest?', a: 'At the lowest point, where the speed is greatest.', source: 'authored' },
    ],
    conclusion: 'The bob rises almost to the same height on the other side, so its total mechanical energy is conserved (the small difference is lost to air resistance).',
  },
  {
    id: 'c9-10', cls: 9, subject: 'Science', no: 10, kind: 'numeric',
    official: 'Determination of speed of a pulse propagated through a stretched string/ slinky (helical spring).',
    title: 'Speed of a pulse on a slinky',
    chapter: 'Sound', topic: 'Characteristics: wavelength, frequency, time period, amplitude, intensity, speed',
    aim: 'To find the speed of a pulse travelling along a stretched slinky.',
    apparatus: ['Slinky', 'Stopwatch (least count 0.01 s)', 'Measuring tape', 'A smooth floor or long table'],
    procedure: [
      'Stretch the slinky on the floor with a partner holding the far end fixed; measure its length L.',
      'Give a sharp sideways jerk at your end; start the stopwatch.',
      'Stop it when the pulse has gone to the far end and back three times (6L).',
      'Repeat three times; speed = distance / mean time.',
    ],
    precautions: ['Keep the slinky stretched to the same length throughout.', 'Give one sharp jerk only.', 'Time several trips to reduce timing error.'],
    setups: [{ engine: 'pulse', params: { len: 4, tension: 0.8, kind: 'side' }, label: 'Pulse on a slinky' }],
    readings: rng => {
      const L = read(rng, pick(rng, [3, 3.5, 4, 4.5, 5]), 0.01, { abs: 0 });
      const v = pick(rng, [3, 3.5, 4, 4.5]);
      const rows = [1, 2, 3].map(n => ({ trial: n, t: read(rng, (6 * L) / v, 0.01, { abs: 0.12 }) }));
      const value = r((6 * L) / mean(rows.map(x => x.t as number)), 2);
      return numeric([`Stretched length L = ${L} m; time for three round trips (6L = ${r(6 * L, 2)} m)`], [{ key: 'trial', label: 'Trial' }, { key: 't', label: 'Time for 6L', unit: 's' }], rows, [],
        [{ label: 'Speed of the pulse', unit: 'm/s', value, tolerance: tol(value, 0.02, 0.05), working: `v = 6L / mean t = ${r(6 * L, 2)} / ${r(mean(rows.map(x => x.t as number)), 2)} = ${value} m/s.` }]);
    },
    viva: [
      { q: 'Why time several round trips?', a: 'Starting and stopping the stopwatch has a reaction-time error; timing a longer interval makes that error a smaller share.', source: 'authored' },
      { q: 'What happens to the pulse at a fixed end?', a: 'It is reflected and inverted.', source: 'authored' },
    ],
    conclusion: 'The pulse travels along the slinky at a steady speed, found as distance travelled divided by time.',
  },
  {
    id: 'c9-11', cls: 9, subject: 'Science', no: 11, kind: 'numeric',
    official: 'Calculation of Mechanical Advantage of a lever using the formula M.A= Load /Effort.',
    title: 'Mechanical advantage of a lever',
    chapter: 'Work, Energy and Simple Machines', topic: 'Simple machines and mechanical advantage (pulley, inclined plane, lever)',
    aim: 'To find the mechanical advantage of a lever, M.A. = Load / Effort.',
    apparatus: ['Metre rule as lever', 'Knife-edge fulcrum', 'Slotted masses with hanger (load)', 'Spring balance (least count 0.1 N)', 'Thread'],
    procedure: [
      'Balance the metre rule on the fulcrum.',
      'Hang a known load at a measured distance from the fulcrum.',
      'Pull with the spring balance on the other side at a measured distance until the rule balances; read the effort.',
      'Repeat for three positions; M.A. = load / effort.',
    ],
    precautions: ['Keep the rule horizontal when reading.', 'Pull the spring balance vertically.', 'Check the spring balance reads zero before use.'],
    setups: [{ engine: 'energy', params: { scenario: 'lever', m: 10, h: 6, g: '9.8', lever: '1', load: 200, loadArm: 0.5, effortArm: 1.5 }, label: 'Lever' }],
    readings: rng => {
      const load = pick(rng, [2, 3, 4, 5]);
      const sets = shuffled(rng, [[0.1, 0.3], [0.15, 0.3], [0.2, 0.4], [0.25, 0.25], [0.3, 0.2]]).slice(0, 3);
      const rows = sets.map(([la, ea], k) => { const e = read(rng, (load * la) / ea, 0.1, { abs: 0.05 }); return { no: k + 1, load, la: la * 100, ea: ea * 100, effort: e, ma: r(load / e, 2) }; });
      return numeric([`Load ${load} N`], [{ key: 'no', label: 'S.No.' }, { key: 'load', label: 'Load', unit: 'N' }, { key: 'la', label: 'Load arm', unit: 'cm' }, { key: 'ea', label: 'Effort arm', unit: 'cm' }, { key: 'effort', label: 'Effort', unit: 'N' }, { key: 'ma', label: 'M.A. = Load / Effort' }], rows, ['ma'],
        rows.map(x => ({ label: `M.A. with load arm ${x.la} cm, effort arm ${x.ea} cm`, unit: '', value: x.ma as number, tolerance: tol(x.ma as number, 0.03, 0.05), working: `${x.load} / ${x.effort} = ${x.ma}; compare effort arm / load arm = ${r(x.ea / x.la, 2)}.` })));
    },
    viva: [
      { q: 'When is the mechanical advantage of a lever more than 1?', a: 'When the effort arm is longer than the load arm.', source: 'authored' },
      { q: 'Give an example of a class 2 lever.', a: 'A nutcracker or a wheelbarrow (load between fulcrum and effort).', source: 'authored' },
    ],
    conclusion: 'M.A. = Load / Effort, and it equals effort arm / load arm: a longer effort arm gives a bigger mechanical advantage.',
  },
  {
    id: 'c9-12', cls: 9, subject: 'Science', no: 12, kind: 'numeric',
    official: "Verification of Newton's Second Law of Motion using a trolley, pulley and hanging masses.",
    title: "Newton's second law: trolley and pulley",
    chapter: 'Force and Laws of Motion', topic: "Newton's first, second and third laws of motion",
    aim: "To verify Newton's second law of motion using a trolley, a pulley and hanging masses.",
    apparatus: ['Trolley', 'Smooth runway', 'Pulley clamped at the edge', 'Thread', 'Slotted masses with hanger', 'Stopwatch', 'Metre scale', 'Wooden block (to tilt the runway and compensate friction)'],
    procedure: [
      'Tilt the runway slightly until the trolley, given a push, moves at a steady speed (friction compensated).',
      'Tie the trolley to the hanger over the pulley; keep the total mass (trolley + all slotted masses) the same throughout by moving masses from the trolley to the hanger.',
      'Release the trolley from rest and time it over a fixed distance d.',
      'Repeat with different hanging masses; work out a = 2d/t² and F = mg.',
      'Plot a against F.',
    ],
    precautions: ['Compensate friction before starting.', 'Keep the total mass constant by moving masses, not adding them.', 'Release the trolley from rest, without a push.'],
    setups: [{ engine: 'trolley', params: { trolley: 500, hang: 50, dist: 1 }, label: 'Trolley and pulley' }],
    readings: rng => {
      const total = pick(rng, [0.6, 0.8, 1.0]), d = 1;
      const rows = [0.02, 0.04, 0.06, 0.08].map(m => {
        const a = (m * g9) / total;
        const t = read(rng, Math.sqrt((2 * d) / a), 0.01, { abs: 0.03 });
        return { m: m * 1000, F: r(m * g9, 3), t, a: r((2 * d) / ((t as number) ** 2), 3) };
      });
      const slope = rows.reduce((s, x) => s + (x.F as number) * (x.a as number), 0) / rows.reduce((s, x) => s + (x.F as number) ** 2, 0);
      const value = r(1 / slope, 2);
      return numeric([`Total mass kept at ${total} kg; distance d = ${d} m`], [{ key: 'm', label: 'Hanging mass', unit: 'g' }, { key: 'F', label: 'Force F = mg', unit: 'N' }, { key: 't', label: 'Time t', unit: 's' }, { key: 'a', label: 'a = 2d/t²', unit: 'm/s²' }], rows, ['F', 'a'],
        [{ label: 'Mass from the graph (F ÷ a, the inverse of the slope)', unit: 'kg', value, tolerance: tol(value, 0.05, 0.03), working: `The a-F line through the origin has slope ${r(slope, 3)} per kg, so m = 1/slope = ${value} kg.`, accepted: `${total} kg` }]);
    },
    viva: [
      { q: "State Newton's second law.", a: 'The rate of change of momentum is proportional to the applied force, so F = ma for constant mass.', source: 'authored' },
      { q: 'Why is the total mass kept constant?', a: 'So that only the force changes; then a is proportional to F.', source: 'authored' },
    ],
    conclusion: "The acceleration is directly proportional to the applied force for a constant mass (a ∝ F): Newton's second law.",
  },
  {
    id: 'c9-13', cls: 9, subject: 'Science', no: 13, kind: 'numeric',
    official: 'Plotting of distance-time and velocity time graphs using an inclined plane.',
    title: 'Distance-time and velocity-time graphs on an incline',
    chapter: 'Motion', topic: 'Graphical representation of straight-line motion (constant velocity and constant acceleration)',
    aim: 'To plot distance-time and velocity-time graphs for a trolley rolling down an inclined plane.',
    apparatus: ['Inclined plane (plank on a block)', 'Trolley or ball', 'Stopwatch', 'Metre scale', 'Chalk'],
    procedure: [
      'Mark the plane at 20 cm intervals from the top.',
      'Release the trolley from rest at the top and time it to each mark (or with several partners, one per mark).',
      'Repeat and take the mean time for each distance.',
      'Plot distance against time; find the average speed over each interval and plot velocity against time.',
    ],
    precautions: ['Release from rest, without a push.', 'Keep the slope small so the times are long enough to measure.', 'Start the stopwatch exactly at release.'],
    setups: [{ engine: 'incline', params: { angle: 3, len: 1.5 }, label: 'Inclined plane' }],
    readings: rng => {
      const angle = pick(rng, [2, 2.5, 3, 4]);
      const a = accel({ angle, len: 1 });
      const rows = [0.2, 0.4, 0.6, 0.8, 1.0].map(s => ({ s: s * 100, t: read(rng, Math.sqrt((2 * s) / a), 0.01, { abs: 0.02 }) }));
      const each = rows.map(x => (2 * (x.s / 100)) / ((x.t as number) ** 2));
      const value = r(mean(each), 2);
      return numeric([`Plane sloped at about ${angle}°; trolley released from rest`], [{ key: 's', label: 'Distance s', unit: 'cm' }, { key: 't', label: 'Time t', unit: 's' }], rows, [],
        [{ label: 'Acceleration (mean of 2s/t²)', unit: 'm/s²', value, tolerance: tol(value, 0.05, 0.01), working: `2s/t² for each row: ${each.map(x => r(x, 2)).join(', ')}; mean ${value} m/s².`, accepted: `g sin θ = ${r(a, 2)} m/s² with no friction` }]);
    },
    viva: [
      { q: 'What does the slope of a distance-time graph give?', a: 'The speed.', source: 'authored' },
      { q: 'What does the area under a velocity-time graph give?', a: 'The distance travelled.', source: 'authored' },
      { q: 'What kind of motion is this?', a: 'Uniformly accelerated motion: the s-t graph is a curve, the v-t graph a straight line.', source: 'authored' },
    ],
    conclusion: 'The distance-time graph is a curve getting steeper and the velocity-time graph is a straight line through the origin: the trolley moves with uniform acceleration.',
  },
];
