import { intIn, pick, read, shuffled } from '../noise';
import { outcome, SAMPLES, TESTS, type Sample, type Test } from '../engines/acidProps';
import { REACTIONS } from '../engines/reactions';
import { METALS, ORDER, result as displacement } from '../engines/reactivity';
import { solveSoap } from '../engines/soap';
import { solveSlab } from '../engines/slab';
import { PRISM_A, SPECTRUM, traceColour } from '../engines/eyePrism';
import { SLIDES } from '../engines/microscope';
import { SEED } from '../engines/specimens';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class X Science (086) practicals, 2026-27: "List of experiments",
 * Science_SecP1_2026-27.pdf p.7-8 (cbseacademic.nic.in). Official wording is
 * kept as printed (numbering tidied).
 */

export const CLASS10: Practical[] = [
  {
    id: 'c10-01', cls: 10, no: 1, kind: 'observation',
    official: 'A. Finding the pH of the following samples by using pH paper/universal indicator: a) Dilute Hydrochloric Acid b) Dilute NaOH solution c) Dilute Ethanoic Acid solution d) Lemon juice e) Water f) Dilute Hydrogen Carbonate solution. B. Studying the properties of acids and bases (HCl & NaOH) on the basis of their reaction with: a) Litmus solution (Blue/Red) b) Zinc metal c) Solid sodium carbonate',
    title: 'pH of samples; properties of HCl and NaOH',
    chapter: 'Acids, Bases and Salts', topic: 'pH scale and the importance of pH in everyday life',
    aim: 'To find the pH of common samples with pH paper or universal indicator, and to study how dilute HCl and NaOH react with litmus, zinc and sodium carbonate.',
    apparatus: ['Test tubes and stand', 'pH paper / universal indicator and its colour chart', 'Dropper and glass rod', 'Red and blue litmus', 'Zinc granules', 'Solid sodium carbonate', 'Lime water', 'Burner (for warming NaOH with zinc)', 'The six samples: dilute HCl, dilute NaOH, dilute ethanoic acid, lemon juice, water, dilute NaHCO₃'],
    procedure: [
      'Label six test tubes and put 2 mL of each sample in one.',
      'Touch a clean glass rod dipped in each sample onto a strip of pH paper; compare the colour with the chart and note the pH.',
      'Put a drop of dilute HCl and of dilute NaOH on blue and on red litmus; note any change.',
      'Add a few zinc granules to 2 mL of dilute HCl; bring a burning splint to the mouth of the tube. Repeat with dilute NaOH, warming gently.',
      'Add a pinch of solid sodium carbonate to 2 mL of dilute HCl; pass the gas through lime water. Repeat with NaOH.',
    ],
    precautions: ['Use dilute acids and bases only, and handle them carefully.', 'Use a clean glass rod for each sample.', 'Compare pH colours in good daylight.', 'Never smell or taste the chemicals; keep the burning splint away from your face.'],
    setups: [
      { engine: 'acid-props', params: { sample: 'hcl', test: 'universal' }, label: 'pH paper' },
      { engine: 'acid-props', params: { sample: 'hcl', test: 'zinc' }, label: 'HCl with zinc' },
      { engine: 'acid-props', params: { sample: 'hcl', test: 'na2co3' }, label: 'HCl with sodium carbonate' },
    ],
    readings: rng => {
      const samples = shuffled(rng, Object.keys(SAMPLES) as Sample[]);
      const ph = samples.map((s, i) => {
        const o = outcome({ sample: s, test: 'universal' });
        return { no: i + 1, sample: SAMPLES[s].label, colour: o.seen.split(':')[0].replace('Turns ', ''), ph: SAMPLES[s].ph, nature: SAMPLES[s].kind === 'acid' ? 'Acidic' : SAMPLES[s].kind === 'base' ? 'Basic' : 'Neutral' };
      });
      const tests: Test[] = ['blue-litmus', 'red-litmus', 'zinc', 'na2co3'];
      const props = (['hcl', 'naoh'] as Sample[]).flatMap(s => tests.map(t => ({ no: '', sample: `${SAMPLES[s].formula} + ${TESTS[t].toLowerCase()}`, colour: outcome({ sample: s, test: t }).seen, ph: '', nature: '' })));
      return observation(['Part A: six samples, in the order on your sheet', 'Part B: dilute HCl and NaOH with litmus, zinc and sodium carbonate'],
        [{ key: 'no', label: 'S.No.' }, { key: 'sample', label: 'Sample / test' }, { key: 'colour', label: 'Colour / observation' }, { key: 'ph', label: 'pH' }, { key: 'nature', label: 'Acidic / basic / neutral' }],
        [...ph, ...props], ['colour', 'ph', 'nature']);
    },
    viva: [
      { q: 'What is the pH of a neutral solution?', a: '7. Below 7 is acidic, above 7 is basic.', source: 'authored' },
      { q: 'Which gas is given off when zinc reacts with dilute HCl, and how is it tested?', a: 'Hydrogen; it burns with a pop when a burning splint is brought near.', source: 'authored' },
      { q: 'Why does lime water turn milky?', a: 'Carbon dioxide reacts with calcium hydroxide to form insoluble calcium carbonate: Ca(OH)₂ + CO₂ → CaCO₃ + H₂O.', source: 'authored' },
      { q: 'Which of the samples is the strongest acid?', a: 'Dilute hydrochloric acid (pH about 1): it ionises completely.', source: 'authored' },
    ],
    conclusion: 'Acids have pH below 7 and turn blue litmus red; they give hydrogen with zinc and carbon dioxide with carbonates. Bases have pH above 7 and turn red litmus blue.',
  },
  {
    id: 'c10-02', cls: 10, no: 2, kind: 'observation',
    official: 'Performing and observing the following reactions and classifying them into: a) Combination reaction b) Decomposition reaction c) Displacement reaction d) Double displacement reaction: Action of water on quicklime; Action of heat on ferrous sulphate crystals; Iron nails kept in copper sulphate solution; Reaction between sodium sulphate and barium chloride solutions',
    title: 'Types of chemical reactions',
    chapter: 'Chemical Reactions and Equations', topic: 'Types of reactions: combination, decomposition, displacement, double displacement, precipitation',
    aim: 'To perform four reactions and classify each as combination, decomposition, displacement or double displacement.',
    apparatus: ['Beaker and test tubes', 'Boiling tube and holder', 'Burner', 'Quicklime (CaO)', 'Ferrous sulphate crystals', 'Iron nails and sandpaper', 'Copper sulphate solution', 'Sodium sulphate and barium chloride solutions', 'Thread'],
    procedure: [
      'Add water slowly to a little quicklime in a beaker; touch the beaker.',
      'Heat a few ferrous sulphate crystals in a dry boiling tube; note the colour change and the smell.',
      'Clean two iron nails with sandpaper; dip one in copper sulphate solution for 20 minutes and keep the other aside; compare.',
      'Mix 3 mL of sodium sulphate solution with 3 mL of barium chloride solution.',
      'Write the balanced equation for each and decide its type.',
    ],
    precautions: ['Add water to quicklime slowly: it gets very hot.', 'Point the boiling tube away from everyone while heating; do not inhale the gas.', 'Clean the iron nails well before dipping them.', 'Barium chloride is poisonous: wash your hands after use.'],
    setups: (['cao-h2o', 'feso4', 'fe-cuso4', 'na2so4-bacl2'] as const).map(k => ({ engine: 'reactions', params: { reaction: k, given: 'r0', mass: 10 }, label: REACTIONS.find(x => x.key === k)!.label })),
    readings: rng => {
      const keys = shuffled(rng, ['cao-h2o', 'feso4', 'fe-cuso4', 'na2so4-bacl2'] as const);
      const rows = keys.map((k, i) => { const rx = REACTIONS.find(x => x.key === k)!; return { no: i + 1, reaction: rx.label, seen: rx.observe, type: rx.type }; });
      return observation(['Four reactions, in the order on your sheet'], [{ key: 'no', label: 'S.No.' }, { key: 'reaction', label: 'Reaction' }, { key: 'seen', label: 'Observation' }, { key: 'type', label: 'Type of reaction' }], rows, ['seen', 'type']);
    },
    viva: [
      { q: 'Why does the beaker get hot when water is added to quicklime?', a: 'The combination of CaO and water to form slaked lime is exothermic: it gives out heat.', source: 'authored' },
      { q: 'What is the white precipitate when sodium sulphate and barium chloride are mixed?', a: 'Barium sulphate, which is insoluble in water.', source: 'authored' },
      { q: 'Why does the blue copper sulphate solution turn green with iron nails?', a: 'Iron is more reactive than copper, so it displaces copper and forms green ferrous sulphate.', source: 'authored' },
    ],
    conclusion: 'Quicklime with water is combination; heating ferrous sulphate is decomposition; iron in copper sulphate is displacement; sodium sulphate with barium chloride is double displacement.',
  },
  {
    id: 'c10-03', cls: 10, no: 3, kind: 'observation',
    official: 'Observing the action of Zn, Fe, Cu and Al metals on the following salt solutions: a) ZnSO₄(aq) b) FeSO₄(aq) c) CuSO₄(aq) d) Al₂(SO₄)₃(aq). Arranging Zn, Fe, Cu and Al (metals) in the decreasing order of reactivity based on the above result.',
    title: 'Reactivity of Zn, Fe, Cu and Al',
    chapter: 'Metals and Non-metals', topic: 'Reactivity series',
    aim: 'To observe the action of Zn, Fe, Cu and Al on the sulphate solutions of these metals and arrange them in decreasing order of reactivity.',
    apparatus: ['16 test tubes in a stand', 'Clean strips of zinc, iron, copper and aluminium', 'Sandpaper', 'ZnSO₄, FeSO₄, CuSO₄ and Al₂(SO₄)₃ solutions', 'Labels'],
    procedure: [
      'Clean each metal strip with sandpaper.',
      'Pour each salt solution into four test tubes (16 in all) and label them.',
      'Put one strip of each metal into the four tubes of each solution.',
      'Leave for 20 to 30 minutes; note any change in the colour of the solution and any coating on the metal.',
      'Count how many metals each metal displaces and arrange them in order.',
    ],
    precautions: ['Clean the strips well: an oxide layer stops the reaction (especially on aluminium).', 'Use equal volumes of solution in each tube.', 'Do not disturb the tubes while waiting.'],
    setups: [{ engine: 'reactivity', params: { metal: 'Zn', salt: 'Cu' }, label: 'Zinc in copper sulphate' }, { engine: 'reactivity', params: { metal: 'Cu', salt: 'Fe' }, label: 'Copper in ferrous sulphate' }],
    readings: rng => {
      const metals = shuffled(rng, ORDER);
      const rows = metals.flatMap(m => ORDER.filter(s => s !== m).map(s => {
        const res = displacement({ metal: m, salt: s });
        return { metal: METALS[m].name, salt: METALS[s].salt, seen: res.seen, reacts: res.reacts ? 'Yes' : 'No' };
      }));
      return observation(['Each metal in the three other salt solutions'], [{ key: 'metal', label: 'Metal' }, { key: 'salt', label: 'Solution' }, { key: 'seen', label: 'Observation' }, { key: 'reacts', label: 'Displacement? (Yes/No)' }], rows, ['seen', 'reacts']);
    },
    viva: [
      { q: 'Why is aluminium sometimes slow to react in the lab?', a: 'It is covered by a thin protective layer of aluminium oxide; cleaning with sandpaper removes it.', source: 'authored' },
      { q: 'Can copper displace iron from ferrous sulphate?', a: 'No: copper is less reactive than iron.', source: 'authored' },
      { q: 'What is the decreasing order of reactivity?', a: 'Al > Zn > Fe > Cu.', source: 'authored' },
    ],
    conclusion: 'A metal displaces another only if it is more reactive. The decreasing order of reactivity is Al > Zn > Fe > Cu.',
  },
  {
    id: 'c10-04', cls: 10, no: 4, kind: 'numeric',
    official: 'Studying the dependence of potential difference (V) across a resistor on the current (I) passing through it and determine its resistance. Also plotting a graph between V and I.',
    title: "Ohm's law: V-I graph",
    chapter: 'Electricity', topic: "Ohm's law",
    aim: 'To study how the potential difference across a resistor depends on the current through it, find its resistance and plot a V-I graph.',
    apparatus: ['Resistor (about 5 Ω)', 'Ammeter (0-1.5 A, least count 0.01 A)', 'Voltmeter (0-5 V, least count 0.1 V)', 'Battery of 1.5 V cells or battery eliminator', 'Rheostat', 'Plug key', 'Connecting wires and sandpaper', 'Graph paper'],
    procedure: [
      'Note the range and least count of the ammeter and voltmeter.',
      'Connect the battery, key, rheostat, ammeter and resistor in series, and the voltmeter across the resistor (+ to +).',
      'Close the key and adjust the rheostat for a small current; note the ammeter and voltmeter readings.',
      'Increase the current in steps with the rheostat; take at least five readings.',
      'Work out V/I for each reading, and plot V (y-axis) against I (x-axis).',
    ],
    precautions: ['Clean the ends of the wires with sandpaper.', 'Connect the ammeter in series and the voltmeter in parallel, + terminals to the + side of the battery.', 'Close the key only while taking readings so the resistor does not heat up.', 'Read the meters with your eye straight above the pointer.'],
    setups: [{ engine: 'ohm', params: { r: 5, cells: 4, rheo: 6 }, label: "Ohm's law bench" }],
    readings: rng => {
      const marked = pick(rng, [4, 5, 6, 8]);
      const R = marked * (1 + (rng() - 0.5) * 0.04);
      const rows = [0.2, 0.3, 0.4, 0.5, 0.6].map((frac, i) => {
        const I = read(rng, frac * (4 / marked) * 1.5, 0.01, { abs: 0.004 });
        const V = read(rng, I * R, 0.1, { abs: 0.04 });
        return { no: i + 1, i: I, v: V, ratio: r(V / I, 2) };
      });
      const value = mean(rows.map(x => x.ratio));
      return numeric([`Resistor marked ${marked} Ω`, 'Ammeter least count 0.01 A, voltmeter least count 0.1 V'],
        [{ key: 'no', label: 'S.No.' }, { key: 'i', label: 'Current I', unit: 'A' }, { key: 'v', label: 'Potential difference V', unit: 'V' }, { key: 'ratio', label: 'R = V/I', unit: 'Ω' }],
        rows, ['ratio'],
        [{ label: 'Resistance (mean of V/I)', unit: 'Ω', value: r(value, 2), tolerance: tol(value, 0.03, 0.1), working: `Mean of ${rows.map(x => x.ratio).join(', ')} = ${r(value, 2)} Ω.`, accepted: `${marked} Ω (marked)` }]);
    },
    viva: [
      { q: "State Ohm's law.", a: 'The current through a conductor is directly proportional to the potential difference across it, at constant temperature: V = IR.', source: 'authored' },
      { q: 'Why is the voltmeter connected in parallel?', a: 'It must measure the potential difference across the resistor; it has a high resistance so it draws very little current.', source: 'authored' },
      { q: 'What does the slope of the V-I graph give?', a: 'The resistance R.', source: 'authored' },
      { q: 'What is the SI unit of resistance?', a: 'The ohm (Ω): 1 Ω = 1 V/A.', source: 'authored' },
    ],
    conclusion: 'V/I is constant, so V is directly proportional to I (Ohm\'s law). The V-I graph is a straight line through the origin; its slope gives the resistance.',
  },
  {
    id: 'c10-05', cls: 10, no: 5, kind: 'numeric',
    official: 'Determination of the equivalent resistance of two resistors when connected in series and parallel.',
    title: 'Resistors in series and parallel',
    chapter: 'Electricity', topic: 'Series and parallel combination of resistors and daily-life applications',
    aim: 'To find the equivalent resistance of two resistors connected in series and in parallel.',
    apparatus: ['Two resistors', 'Ammeter', 'Voltmeter', 'Battery', 'Plug key', 'Rheostat', 'Connecting wires'],
    procedure: [
      'Find the resistance of each resistor alone: measure V across it and I through it, R = V/I.',
      'Connect the two in series; measure V across the pair and I; Rs = V/I.',
      'Connect the two in parallel; measure V across the pair and I; Rp = V/I.',
      'Compare Rs with R₁ + R₂, and 1/Rp with 1/R₁ + 1/R₂.',
    ],
    precautions: ['Make tight connections.', 'Use the same voltmeter and ammeter for every reading.', 'Pass current only while reading.'],
    setups: [{ engine: 'circuits', params: { topology: 'series', count: '2', v: 6, r1: 4, r2: 6, r3: 30, t: 60 }, label: 'Series' }, { engine: 'circuits', params: { topology: 'parallel', count: '2', v: 6, r1: 4, r2: 6, r3: 30, t: 60 }, label: 'Parallel' }],
    readings: rng => {
      const r1 = pick(rng, [2, 3, 4, 5]), r2 = pick(rng, [6, 8, 10]);
      const combos = [{ name: 'R₁ alone', R: r1 }, { name: 'R₂ alone', R: r2 }, { name: 'Series', R: r1 + r2 }, { name: 'Parallel', R: (r1 * r2) / (r1 + r2) }];
      const rows = combos.map(c => {
        const I = read(rng, 2.4 / Math.max(c.R, 2), 0.01, { abs: 0.004 });
        const V = read(rng, I * c.R, 0.1, { abs: 0.04 });
        return { combo: c.name, v: V, i: I, res: r(V / I, 2) };
      });
      const rs = rows[2].res as number, rp = rows[3].res as number;
      return numeric([`R₁ marked ${r1} Ω, R₂ marked ${r2} Ω`], [{ key: 'combo', label: 'Connection' }, { key: 'v', label: 'V', unit: 'V' }, { key: 'i', label: 'I', unit: 'A' }, { key: 'res', label: 'R = V/I', unit: 'Ω' }], rows, ['res'], [
        { label: 'Equivalent resistance in series', unit: 'Ω', value: rs, tolerance: tol(rs, 0.03, 0.1), working: `Rs = ${rows[2].v}/${rows[2].i} = ${rs} Ω; R₁ + R₂ = ${rows[0].res} + ${rows[1].res} = ${r((rows[0].res as number) + (rows[1].res as number), 2)} Ω.`, accepted: `${r1 + r2} Ω` },
        { label: 'Equivalent resistance in parallel', unit: 'Ω', value: rp, tolerance: tol(rp, 0.04, 0.08), working: `Rp = ${rows[3].v}/${rows[3].i} = ${rp} Ω.`, accepted: `${r((r1 * r2) / (r1 + r2), 2)} Ω` },
      ]);
    },
    viva: [
      { q: 'Which is larger, the series or the parallel combination?', a: 'Series: Rs = R₁ + R₂ is bigger than either; Rp is smaller than the smallest.', source: 'authored' },
      { q: 'Why are household appliances connected in parallel?', a: 'Each gets the full mains voltage, and each can be switched on or off without affecting the others.', source: 'authored' },
    ],
    conclusion: 'In series the equivalent resistance is the sum, Rs = R₁ + R₂; in parallel 1/Rp = 1/R₁ + 1/R₂, so Rp is less than either resistor.',
  },
  {
    id: 'c10-06', cls: 10, no: 6, kind: 'observation',
    official: 'Preparing a temporary mount of a leaf peel to show stomata.',
    title: 'Leaf peel: stomata',
    chapter: 'Life Processes', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    aim: 'To prepare a temporary mount of a leaf peel and observe stomata.',
    apparatus: ['Fresh leaf (e.g. Bryophyllum, Tradescantia or petunia)', 'Forceps and needle', 'Watch glass', 'Safranin', 'Glycerine', 'Slide and coverslip', 'Brush and blotting paper', 'Compound microscope'],
    procedure: [
      'Fold the leaf and pull off a thin transparent peel from its lower surface with forceps.',
      'Put the peel in a watch glass of water, then stain it with a drop of safranin for a minute.',
      'Wash off extra stain, place the peel on a slide in a drop of glycerine and lower a coverslip with a needle, avoiding air bubbles.',
      'Remove extra glycerine with blotting paper and observe first under low, then high power.',
    ],
    precautions: ['Take the peel from the lower surface, where stomata are more numerous.', 'Do not over-stain.', 'Lower the coverslip gently to avoid air bubbles.', 'The peel must not dry: keep it in water till mounted.'],
    setups: [{ engine: 'microscope', params: { slide: 'stomata', objective: '40' }, label: 'Leaf peel under high power' }],
    photos: ['stomata'],
    readings: rng => {
      const count = intIn(rng, 7, 14);
      return observation([`Stomata you counted in one field of view (high power): ${count}`], [{ key: 'part', label: 'Feature' }, { key: 'seen', label: 'What you observe' }],
        [...['Epidermal cells', 'Guard cells', 'Stoma', 'Chloroplasts'].map((part, k) => ({ part, seen: SLIDES.stomata.features[k] })), { part: 'Number in the field', seen: `${count}` }], ['seen']);
    },
    viva: [
      { q: 'What are guard cells?', a: 'The pair of bean-shaped cells around each stoma that open and close it.', source: 'authored' },
      { q: 'Why are guard cells the only epidermal cells with chloroplasts?', a: 'They photosynthesise a little, which helps them take up water and swell to open the stoma.', source: 'authored' },
      { q: 'Why is glycerine used in mounting?', a: 'It keeps the peel from drying out.', source: 'authored' },
    ],
    conclusion: 'The leaf peel shows many stomata, each a pore bounded by two bean-shaped guard cells with chloroplasts, among irregular epidermal cells.',
  },
  {
    id: 'c10-07', cls: 10, no: 7, kind: 'numeric',
    official: 'Experimentally show that carbon dioxide is given out during respiration.',
    title: 'CO₂ in respiration',
    chapter: 'Life Processes', topic: 'Basic concept of nutrition, respiration, transport and excretion in plants and animals',
    aim: 'To show experimentally that carbon dioxide is given out during respiration.',
    apparatus: ['Conical flask', 'Germinating seeds (gram or moong)', 'Small test tube of freshly prepared KOH solution', 'Thread', 'Cork with one hole', 'Bent delivery tube', 'Beaker of water', 'Vaseline', 'Second set-up with boiled seeds (control)'],
    procedure: [
      'Put the germinating seeds in the conical flask.',
      'Hang a small test tube of KOH solution inside the flask with a thread.',
      'Fit the cork with the bent delivery tube; dip the other end into water in a beaker and seal all joints with vaseline.',
      'Mark the water level in the delivery tube; note it every 10 minutes. Set up the boiled seeds the same way.',
    ],
    precautions: ['The apparatus must be airtight.', 'Do not let the KOH touch the seeds.', 'Use freshly germinating seeds.'],
    setups: [{ engine: 'respiration', params: { seeds: 'germinating', koh: 'yes', minutes: 30 }, label: 'Germinating seeds with KOH' }, { engine: 'respiration', params: { seeds: 'boiled', koh: 'yes', minutes: 30 }, label: 'Boiled seeds (control)' }],
    readings: rng => {
      const rate = 0.25 * (0.8 + rng() * 0.4);
      const rows = [10, 20, 30, 40].map(t => ({ t, live: read(rng, rate * t, 0.1, { abs: 0.1 }), dead: read(rng, 0, 0.1, { abs: 0.05 }) }));
      const rise = (rows[2].live as number) - 0;
      return numeric(['Water level in the delivery tube, measured up from the starting mark'], [{ key: 't', label: 'Time', unit: 'min' }, { key: 'live', label: 'Germinating seeds', unit: 'cm' }, { key: 'dead', label: 'Boiled seeds', unit: 'cm' }], rows, [],
        [{ label: 'Rise in 30 minutes with germinating seeds', unit: 'cm', value: r(rise, 1), tolerance: 0.15, working: `Read off at 30 minutes: ${r(rise, 1)} cm (the boiled seeds: about 0).` }]);
    },
    viva: [
      { q: 'Why does the water rise in the delivery tube?', a: 'The CO₂ the seeds give out is absorbed by KOH, so the pressure inside falls and water is pushed up the tube.', source: 'authored' },
      { q: 'Why are germinating seeds used?', a: 'They respire actively, giving out a lot of CO₂.', source: 'authored' },
    ],
    conclusion: 'Water rises only with the live seeds: they give out carbon dioxide (absorbed by KOH) in respiration.',
  },
  {
    id: 'c10-08', cls: 10, no: 8, kind: 'observation',
    official: 'Study of the following properties of acetic acid (ethanoic acid): a) Odour b) solubility in water c) effect on litmus d) reaction with Sodium Hydrogen Carbonate',
    title: 'Properties of ethanoic acid',
    chapter: 'Carbon and its Compounds', topic: 'Ethanol and ethanoic acid (properties and uses only)',
    aim: 'To study the odour, solubility in water, effect on litmus and reaction with sodium hydrogen carbonate of ethanoic acid.',
    apparatus: ['Dilute ethanoic acid', 'Test tubes', 'Blue and red litmus', 'Sodium hydrogen carbonate', 'Lime water', 'Delivery tube with cork', 'Dropper'],
    procedure: [
      'Waft the vapour of ethanoic acid gently towards your nose and note the smell.',
      'Add 1 mL of ethanoic acid to 2 mL of water and shake; note whether it mixes.',
      'Put a drop on blue litmus and on red litmus.',
      'Add a pinch of sodium hydrogen carbonate to 2 mL of the acid and pass the gas through lime water.',
    ],
    precautions: ['Never smell directly: waft the vapour.', 'Ethanoic acid is corrosive: handle it carefully.', 'Fit the cork tightly when collecting the gas.'],
    setups: (['odour', 'water-mix', 'blue-litmus', 'nahco3'] as Test[]).map(t => ({ engine: 'acid-props', params: { sample: 'ethanoic', test: t }, label: TESTS[t] })),
    readings: () => observation(['Dilute ethanoic acid'], [{ key: 'test', label: 'Test' }, { key: 'seen', label: 'Observation' }],
      (['odour', 'water-mix', 'blue-litmus', 'red-litmus', 'nahco3'] as Test[]).map(t => ({ test: TESTS[t], seen: outcome({ sample: 'ethanoic', test: t }).seen })), ['seen']),
    viva: [
      { q: 'What is vinegar?', a: 'A 5-8% solution of ethanoic acid in water.', source: 'authored' },
      { q: 'Write the reaction of ethanoic acid with sodium hydrogen carbonate.', a: 'CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂', source: 'authored' },
      { q: 'Is ethanoic acid a strong or weak acid?', a: 'A weak acid: it ionises only partly in water.', source: 'authored' },
    ],
    conclusion: 'Ethanoic acid has a vinegar smell, mixes completely with water, turns blue litmus red, and gives carbon dioxide with sodium hydrogen carbonate.',
  },
  {
    id: 'c10-09', cls: 10, no: 9, kind: 'observation',
    official: 'Study of the comparative cleaning capacity of a sample of soap in soft and hard water.',
    title: 'Soap in soft and hard water',
    chapter: 'Carbon and its Compounds', topic: 'Soaps and detergents',
    aim: 'To compare the cleaning capacity of a sample of soap in soft water and hard water.',
    apparatus: ['Three test tubes with stand', 'Distilled water, tap water and hard water (with CaCl₂ or MgSO₄)', 'Soap solution', 'Dropper', 'Measuring cylinder', 'Scale'],
    procedure: [
      'Take 10 mL each of distilled, tap and hard water in three labelled test tubes.',
      'Add the same amount (say 5 mL) of soap solution to each.',
      'Shake each tube the same number of times (say 10).',
      'Measure the height of lather in each and note any scum.',
    ],
    precautions: ['Use equal volumes of water and soap solution in each tube.', 'Shake each tube equally.', 'Measure the lather straight after shaking.'],
    setups: [{ engine: 'soap', params: { hardness: 300, soap: 5, cleaner: 'soap' }, label: 'Soap in hard water' }],
    readings: rng => {
      const samples = [{ name: 'Distilled water', ppm: 0 }, { name: 'Tap water', ppm: pick(rng, [80, 120, 150]) }, { name: 'Hard water', ppm: pick(rng, [300, 350, 400]) }];
      const rows = samples.map(s => { const x = solveSoap({ hardness: s.ppm, soap: 5, cleaner: 'soap' }); return { water: s.name, lather: read(rng, x.lather, 0.1, { abs: 0.1 }), scum: x.scum ? 'Yes' : 'No' }; });
      return observation(['5 mL soap solution in 10 mL of each water, shaken 10 times'], [{ key: 'water', label: 'Water' }, { key: 'lather', label: 'Height of lather', unit: 'cm' }, { key: 'scum', label: 'Scum?' }], rows, ['scum']);
    },
    viva: [
      { q: 'What makes water hard?', a: 'Dissolved calcium and magnesium salts (bicarbonates, chlorides, sulphates).', source: 'authored' },
      { q: 'What is scum?', a: 'An insoluble precipitate of calcium and magnesium salts of fatty acids, formed when soap reacts with hard water.', source: 'authored' },
      { q: 'Why are detergents better in hard water?', a: 'Their calcium and magnesium salts are soluble, so they do not form scum.', source: 'authored' },
    ],
    conclusion: 'The soap gives the most lather in distilled (soft) water and the least in hard water, where scum forms: soap cleans better in soft water.',
  },
  {
    id: 'c10-10', cls: 10, no: 10, kind: 'numeric',
    official: 'Determination of the focal length of: a) Concave mirror b) Convex lens by obtaining the image of a distant object.',
    title: 'Focal length of a concave mirror and a convex lens',
    chapter: 'Light - Reflection and Refraction', topic: 'Lens formula; magnification; power of a lens',
    aim: 'To find the approximate focal length of a concave mirror and of a convex lens by obtaining the image of a distant object.',
    apparatus: ['Concave mirror and convex lens with stands', 'Screen', 'Metre scale (least count 0.1 cm)', 'A distant object (a tree or building seen through the window)'],
    procedure: [
      'Face the concave mirror towards a distant object; move the screen until a sharp, inverted image forms on it.',
      'Measure the distance between the mirror and the screen.',
      'Repeat twice more and take the mean: this is the approximate focal length.',
      'Repeat with the convex lens, with the screen on the far side of the lens.',
    ],
    precautions: ['The object must be far away (over 20 m) so its rays are nearly parallel.', 'Mirror, lens and screen should be vertical and their centres in a line.', 'Get the image as sharp as possible before measuring.'],
    setups: [{ engine: 'optics', params: { device: 'concave_mirror', f: 15, u: 100, h: 2 }, label: 'Concave mirror, far object' }, { engine: 'optics', params: { device: 'convex_lens', f: 15, u: 100, h: 2 }, label: 'Convex lens, far object' }],
    readings: rng => {
      const fm = pick(rng, [10, 12, 15, 20]), fl = pick(rng, [10, 15, 20, 25]), u = 2000;
      const v = (f: number) => (f * u) / (u - f);
      const rows = [1, 2, 3].map(n => ({ trial: n, mirror: read(rng, v(fm), 0.1, { abs: 0.3 }), lens: read(rng, v(fl), 0.1, { abs: 0.3 }) }));
      const mm = r(mean(rows.map(x => x.mirror as number)), 1), ml = r(mean(rows.map(x => x.lens as number)), 1);
      return numeric(['Object: a tree about 20 m away'], [{ key: 'trial', label: 'Trial' }, { key: 'mirror', label: 'Mirror to screen', unit: 'cm' }, { key: 'lens', label: 'Lens to screen', unit: 'cm' }], rows, [], [
        { label: 'Focal length of the concave mirror', unit: 'cm', value: mm, tolerance: 0.2, working: `Mean of ${rows.map(x => x.mirror).join(', ')} = ${mm} cm.`, accepted: `${fm} cm` },
        { label: 'Focal length of the convex lens', unit: 'cm', value: ml, tolerance: 0.2, working: `Mean of ${rows.map(x => x.lens).join(', ')} = ${ml} cm.`, accepted: `${fl} cm` },
      ]);
    },
    viva: [
      { q: 'Why does the image of a distant object form at the focus?', a: 'Rays from a very distant object are nearly parallel; parallel rays converge at the principal focus.', source: 'authored' },
      { q: 'Why is this only an approximate focal length?', a: 'The object is far but not at infinity, so the image forms just beyond F.', source: 'authored' },
      { q: 'What kind of image is formed on the screen?', a: 'Real, inverted and highly diminished.', source: 'authored' },
    ],
    conclusion: 'The image of a distant object forms at the focus, so the mirror-to-screen and lens-to-screen distances give the approximate focal lengths.',
  },
  {
    id: 'c10-11', cls: 10, no: 11, kind: 'numeric',
    official: 'Tracing the path of a ray of light passing through a rectangular glass slab for different angles of incidence. Measure the angle of incidence, angle of refraction, angle of emergence and interpret the result.',
    title: 'Ray through a glass slab',
    chapter: 'Light - Reflection and Refraction', topic: 'Refraction; laws of refraction; refractive index',
    aim: 'To trace the path of a ray through a rectangular glass slab for different angles of incidence, measure i, r and e, and interpret the result.',
    apparatus: ['Rectangular glass slab', 'Drawing board and white sheet', 'Drawing pins and 4 office pins', 'Protractor (least count 1°)', 'Sharp pencil and scale'],
    procedure: [
      'Place the slab on the sheet and draw its outline; remove it and draw a normal at a point O on one face.',
      'Draw a line at the chosen angle of incidence to the normal, put the slab back and fix two pins on that line.',
      'Looking through the opposite face, fix two more pins in line with the images of the first two.',
      'Remove the slab, join the pin marks to the outline to get the emergent ray and the ray inside the glass.',
      'Measure r and e; repeat for two more angles of incidence.',
    ],
    precautions: ['Fix the pins vertically, at least 5 cm apart.', 'Do not move the slab while fixing the pins.', 'Look at the feet of the pins when lining them up.'],
    setups: [{ engine: 'slab', params: { i: 40, n: 1.5, t: 5 }, label: 'Slab, i = 40°' }],
    readings: rng => {
      const n = 1.5 + (rng() - 0.5) * 0.06;
      const angles = shuffled(rng, [30, 40, 45, 50, 60]).slice(0, 3).sort((a, b) => a - b);
      const rows = angles.map(i => { const s = solveSlab({ i, n, t: 5 }); return { i, r: read(rng, s.r, 1, { abs: 0.7 }), e: read(rng, s.e, 1, { abs: 0.7 }) }; })
        .map(x => ({ ...x, ratio: r(Math.sin((x.i * Math.PI) / 180) / Math.sin(((x.r as number) * Math.PI) / 180), 2) }));
      const value = r(mean(rows.map(x => x.ratio)), 2);
      return numeric(['Rectangular glass slab'], [{ key: 'i', label: '∠i', unit: '°' }, { key: 'r', label: '∠r', unit: '°' }, { key: 'e', label: '∠e', unit: '°' }, { key: 'ratio', label: 'sin i / sin r' }], rows, ['ratio'],
        [{ label: 'Refractive index of the glass (mean sin i / sin r)', unit: '', value, tolerance: 0.04, working: `Mean of ${rows.map(x => x.ratio).join(', ')} = ${value}.`, accepted: 'about 1.5 for ordinary glass' }]);
    },
    viva: [
      { q: 'Why is the emergent ray parallel to the incident ray?', a: 'The two faces of the slab are parallel, so the bending at the second face exactly undoes the bending at the first: e = i.', source: 'authored' },
      { q: 'What is lateral displacement?', a: 'The sideways shift between the incident ray (continued) and the emergent ray.', source: 'authored' },
      { q: 'What is the refractive index?', a: 'For light going from air into a medium, sin i / sin r; it also equals the speed of light in air divided by its speed in the medium.', source: 'authored' },
    ],
    conclusion: 'The ray bends towards the normal on entering the glass and away from it on leaving; the angle of emergence equals the angle of incidence, and sin i / sin r is nearly constant (the refractive index).',
  },
  {
    id: 'c10-12', cls: 10, no: 12, kind: 'observation',
    official: 'Studying (a) binary fission in Amoeba, and (b) budding in yeast and Hydra with the help of prepared slides.',
    title: 'Binary fission and budding',
    chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)',
    aim: 'To study binary fission in Amoeba and budding in yeast and Hydra with prepared slides.',
    apparatus: ['Prepared slides of Amoeba (binary fission), yeast (budding) and Hydra (budding)', 'Compound microscope'],
    procedure: ['Place each slide on the stage and focus under low power, then high power (Hydra under low power only).', 'Observe and draw labelled diagrams of the stages.'],
    precautions: ['Focus with the coarse adjustment under low power first.', 'Handle the prepared slides carefully.'],
    setups: [{ engine: 'microscope', params: { slide: 'amoeba', objective: '10' }, label: 'Amoeba' }, { engine: 'microscope', params: { slide: 'yeast', objective: '40' }, label: 'Yeast' }, { engine: 'microscope', params: { slide: 'hydra', objective: '4' }, label: 'Hydra' }],
    photos: ['amoeba', 'yeast', 'hydra'],
    readings: rng => observation(['Three prepared slides, in the order on your sheet'], [{ key: 'slide', label: 'Slide' }, { key: 'seen', label: 'What you observe' }, { key: 'kind', label: 'Kind of reproduction' }],
      shuffled(rng, ['amoeba', 'yeast', 'hydra'] as const).map(k => ({ slide: SLIDES[k].label.split(':')[0], seen: SLIDES[k].features.join('; '), kind: k === 'amoeba' ? 'Binary fission' : 'Budding' })), ['seen', 'kind']),
    viva: [
      { q: 'What is binary fission?', a: 'A single cell divides into two equal daughter cells (the nucleus divides first).', source: 'authored' },
      { q: 'How is budding different from binary fission?', a: 'In budding a small outgrowth forms on the parent and grows before separating; the parent remains.', source: 'authored' },
    ],
    conclusion: 'Amoeba reproduces by binary fission; yeast and Hydra reproduce by budding. Both are asexual.',
  },
  {
    id: 'c10-13', cls: 10, no: 13, kind: 'numeric',
    official: 'Tracing the path of the rays of light through a glass prism.',
    title: 'Ray through a glass prism',
    chapter: 'The Human Eye and the Colourful World', topic: 'Refraction of light through a prism',
    aim: 'To trace the path of a ray of light through a glass prism and measure the angles of incidence, emergence and deviation.',
    apparatus: ['Glass prism (60°)', 'Drawing board and white sheet', 'Drawing pins and office pins', 'Protractor', 'Pencil and scale'],
    procedure: [
      'Draw the outline of the prism; draw a normal on one face and an incident ray at the chosen angle.',
      'Fix two pins on the incident ray; looking through the other face, fix two pins in line with their images.',
      'Remove the prism and complete the ray path; draw the normal at the second face.',
      'Measure the angle of emergence e and the angle of deviation δ (between the incident ray produced and the emergent ray). Repeat for other angles.',
    ],
    precautions: ['Pins vertical and well apart.', 'Do not move the prism while fixing pins.', 'Extend the incident and emergent rays to measure δ.'],
    setups: [{ engine: 'eye-prism', params: { scenario: 'prism', far: 1.2, near: 1, corrected: 'no', i: 50 }, label: 'Prism, i = 50°' }],
    readings: rng => {
      const n = SPECTRUM[3].n + (rng() - 0.5) * 0.02;
      const angles = shuffled(rng, [40, 45, 50, 55, 60]).slice(0, 3).sort((a, b) => a - b);
      const rows = angles.map(i => { const t = traceColour(n, i)!; return { i, e: read(rng, t.e, 1, { abs: 0.7 }) }; }).map(x => ({ ...x, dev: (x.i as number) + (x.e as number) - PRISM_A }));
      return numeric([`Prism angle A = ${PRISM_A}°`], [{ key: 'i', label: '∠i', unit: '°' }, { key: 'e', label: '∠e', unit: '°' }, { key: 'dev', label: '∠δ = i + e − A', unit: '°' }], rows, ['dev'],
        [{ label: `Angle of deviation at i = ${rows[0].i}°`, unit: '°', value: rows[0].dev, tolerance: 0.5, working: `δ = ${rows[0].i} + ${rows[0].e} − ${PRISM_A} = ${rows[0].dev}°.` }]);
    },
    viva: [
      { q: 'Why does a prism deviate light towards its base?', a: 'Light bends towards the normal entering the glass and away from it leaving; because the faces are inclined, both bends turn the ray towards the base.', source: 'authored' },
      { q: 'Why does white light split into colours in a prism?', a: 'Each colour has a slightly different refractive index, so each bends by a different angle (dispersion); violet bends most, red least.', source: 'authored' },
    ],
    conclusion: 'The ray is deviated towards the base of the prism; the angle of deviation depends on the angle of incidence (δ = i + e − A).',
  },
  {
    id: 'c10-14', cls: 10, no: 14, kind: 'observation',
    official: 'Identification of the different parts of an embryo of a dicot seed (pea, gram or red kidney bean).',
    title: 'Parts of a dicot seed',
    chapter: 'How do Organisms Reproduce?', topic: 'Reproduction in animals and plants (asexual and sexual)',
    aim: 'To identify the parts of the embryo of a dicot seed.',
    apparatus: ['Gram, pea or red kidney bean seeds soaked overnight', 'Petri dish', 'Forceps and needle', 'Magnifying lens'],
    procedure: ['Take a soaked seed and look for the hilum and micropyle on its surface.', 'Remove the seed coat gently.', 'Separate the two cotyledons and find the embryo axis between them: plumule and radicle.', 'Draw a labelled diagram.'],
    precautions: ['Soak the seeds overnight so the coat comes off easily.', 'Separate the cotyledons gently so the embryo axis is not damaged.'],
    setups: [{ engine: 'specimens', params: { scenario: 'seed', specimen: 'fern', flowerPart: 'ovary', seedPart: 'radicle' }, label: 'Dicot seed' }],
    photos: ['gram-seed'],
    readings: rng => observation(['A soaked gram seed'], [{ key: 'part', label: 'Part' }, { key: 'role', label: 'What it does' }],
      shuffled(rng, Object.values(SEED)).map(s => ({ part: s.name, role: s.role })), ['role']),
    viva: [
      { q: 'Why is it called a dicot seed?', a: 'It has two cotyledons.', source: 'authored' },
      { q: 'Which part comes out first on germination?', a: 'The radicle, which becomes the root.', source: 'authored' },
    ],
    conclusion: 'A dicot seed has a seed coat with hilum and micropyle, two cotyledons storing food, and an embryo axis of plumule (future shoot) and radicle (future root).',
  },
];
