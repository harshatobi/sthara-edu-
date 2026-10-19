import { pick, read } from '../noise';
import { depressionMm, extensionMm, G, MATERIALS as WIRES } from '../engines/elastic';
import { extension } from '../engines/shm';
import { columnAt } from '../engines/boyle';
import { bernoulli, LIQUIDS, MARKS, riseCm, STEEL, T_DETERGENT, T_WATER, terminal } from '../engines/fluids';
import { C_WATER, CALORIMETER, coolAt, COVERS, HOT, mixFinal, SOLIDS, specificHeat, WAX_MP, waxAt } from '../engines/thermal';
import { FORKS, lengthFor, WIRES as SONO } from '../engines/sonometer';
import { FORKS as TUBE_FORKS, solveResonance, speedAt } from '../engines/resonance';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class XI Physics (042) practicals, 2026-27, Section B: experiments 1-10
 * and activities 1-7 (Physics_SecP2_2026-27.pdf). Official wording kept as printed.
 */

const base = { cls: 11 as const, subject: 'Physics' as const, section: 'B' as const };
const id = (part: 'e' | 'a', no: number) => `p11-b${part}${String(no).padStart(2, '0')}`;
const FLUIDS = 'Mechanical Properties of Fluids';
const HEAT = 'Thermal Properties of Matter';

export const PHYSICS11_B: Practical[] = [
  {
    ...base, id: id('e', 1), no: 1, part: 'experiment', kind: 'numeric',
    official: "To determine Young's modulus of elasticity of the material of a given wire.",
    title: "Young's modulus (Searle's apparatus)",
    chapter: 'Mechanical Properties of Solids', topic: "Young's modulus, bulk modulus, shear modulus of rigidity, Poisson's ratio",
    aim: "To find the Young's modulus of the material of a wire with Searle's apparatus.",
    apparatus: ["Searle's apparatus with two identical wires", 'Micrometer screw (LC 0.01 mm) and spirit level', 'Slotted half-kilogram weights', 'Screw gauge', 'Metre scale'],
    procedure: [
      'Hang a dead load on both wires to keep them straight. Measure the length L of the experimental wire and its diameter with the screw gauge at several places.',
      'Level the spirit level with the micrometer; note the reading.',
      'Add 0.5 kg at a time, up to 3 kg; after each, wait a minute, relevel and read the micrometer.',
      'Remove the weights in the same steps and read again; take the mean extension for each load.',
      'Plot load against extension; Y = gL/(πr² × slope).',
    ],
    precautions: ['Do not load beyond the elastic limit.', 'Wait a minute after each change before reading.', 'Both wires should be of the same material and hang from the same support (so temperature and sagging cancel).'],
    setups: [{ engine: 'elastic', params: { mode: 'searle', material: 'steel', L: 2, d: 0.5, M: 3, support: 'end', W: 200, span: 70 }, label: "Searle's apparatus" }],
    readings: rng => {
      const material = pick(rng, Object.keys(WIRES)), L = pick(rng, [1.8, 2, 2.2, 2.5]), d = r(0.45 + rng() * 0.2, 2);
      const rows = [0.5, 1, 1.5, 2, 2.5, 3].map(M => {
        const x = extensionMm({ material, L, d, M });
        const up = read(rng, x, 0.01, { abs: 0.012 }), down = read(rng, x, 0.01, { abs: 0.012 });
        return { M, up, down, mean: r((up + down) / 2, 3) };
      });
      const slope = mean(rows.map(x => x.M / (x.mean as number))); // kg per mm
      const Y = r((G * L) / (Math.PI * (d / 2000) ** 2 * (1 / (slope * 1000))) / 1e11, 2);
      return numeric([`${WIRES[material].label} wire, L = ${L} m, diameter ${d} mm (screw gauge)`], [{ key: 'M', label: 'Load', unit: 'kg' }, { key: 'up', label: 'Extension, loading', unit: 'mm' }, { key: 'down', label: 'Extension, unloading', unit: 'mm' }, { key: 'mean', label: 'Mean extension', unit: 'mm' }], rows, ['mean'], [
        { label: "Young's modulus (× 10¹¹)", unit: 'N/m²', value: Y, tolerance: tol(Y, 0.05, 0.05), working: `Slope = ${r(slope, 3)} kg/mm. Y = gL/(πr² × Δl/M) = ${G} × ${L} / (π × (${r(d / 2000, 6)})² × ${r(1 / (slope * 1000), 6)}) = ${Y} × 10¹¹ N/m².`, accepted: `${r(WIRES[material].Y / 1e11, 2)} × 10¹¹ N/m²` },
      ]);
    },
    viva: [
      { q: 'Why are two wires used?', a: 'The reference wire carries a constant load; changes in temperature or sagging of the support affect both, so they cancel.', source: 'authored' },
      { q: 'Why are readings taken while unloading too?', a: 'To check the wire was not stretched beyond its elastic limit: the readings should agree.', source: 'authored' },
    ],
    conclusion: "Within the elastic limit extension is proportional to load; the Young's modulus of the wire is as found.",
  },
  {
    ...base, id: id('e', 2), no: 2, part: 'experiment', kind: 'numeric',
    official: 'To find the force constant of a helical spring by plotting a graph between load and extension.',
    title: 'Force constant of a spring',
    chapter: 'Oscillations', topic: 'Oscillations of a loaded spring: restoring force and force constant',
    aim: 'To find the force constant of a helical spring from a graph of load against extension.',
    apparatus: ['Helical spring with a pointer and hanger', 'Clamp stand', 'Slotted 50 g weights', 'Vertical metre scale'],
    procedure: [
      'Hang the spring with the empty hanger; note the pointer reading.',
      'Add 50 g at a time up to 250 g; note the pointer after each.',
      'Remove the weights in steps and read again; take the mean extension.',
      'Plot load (in N) against extension; the slope is k.',
    ],
    precautions: ['Do not overload the spring.', 'Let the pointer come to rest before reading; read without parallax.'],
    setups: [{ engine: 'shm', params: { mode: 'spring', L: 80, m: 100, k: 20 }, label: 'Loaded spring' }],
    readings: rng => {
      const k = pick(rng, [10, 12, 15, 18, 20, 25]);
      const rows = [50, 100, 150, 200, 250].map(m => { const x = read(rng, extension(m, k), 0.1, { abs: 0.1 }); return { m, F: r((m / 1000) * G, 3), x, ratio: r(((m / 1000) * G) / (x / 100), 1) }; });
      const kk = r(mean(rows.map(x => x.ratio)), 1);
      return numeric(['Pointer read on a vertical metre scale (0.1 cm)'], [{ key: 'm', label: 'Load', unit: 'g' }, { key: 'F', label: 'F = mg', unit: 'N' }, { key: 'x', label: 'Extension', unit: 'cm' }, { key: 'ratio', label: 'F/x', unit: 'N/m' }], rows, ['F', 'ratio'], [
        { label: 'Force constant', unit: 'N/m', value: kk, tolerance: tol(kk, 0.04, 0.4), working: `Mean F/x (the slope) = ${kk} N/m.`, accepted: `${k} N/m` },
      ]);
    },
    viva: [
      { q: 'What is the force constant of a spring?', a: 'The force needed per unit extension: k = F/x, in N/m.', source: 'authored' },
      { q: 'What happens past the elastic limit?', a: 'The spring is permanently stretched and the graph is no longer a straight line.', source: 'authored' },
    ],
    conclusion: 'Load is proportional to extension (Hooke\'s law); the slope gives the force constant.',
  },
  {
    ...base, id: id('e', 3), no: 3, part: 'experiment', kind: 'numeric',
    official: 'To study the variation in volume with pressure for a sample of air at constant temperature by plotting graphs between P and V, and between P and 1/V.',
    title: "Boyle's law: P against V and 1/V",
    chapter: 'Kinetic Theory', topic: 'Equation of state of a perfect gas; work done in compressing a gas',
    aim: 'To study how the volume of trapped air changes with pressure at constant temperature, by plotting P against V and against 1/V.',
    apparatus: ["Boyle's law apparatus (closed and open tubes joined by rubber tubing, with mercury)", 'Fortin\'s barometer', 'Thermometer', 'Set square'],
    procedure: [
      'Note the atmospheric pressure H from the barometer.',
      'Set the open tube level with the closed one; read the air column length l.',
      'Raise the open tube in steps: note the level difference h and l each time. Then lower it below.',
      'P = H + h (h negative below). Plot P against l (V) and P against 1/l.',
    ],
    precautions: ['Move the open tube slowly and wait for the temperature to settle.', 'Read the mercury levels at the top of the meniscus, eye level with it.', 'The closed tube must be airtight.'],
    setups: [{ engine: 'boyle', params: { H: 76, l0: 20, h: 10 }, label: "Boyle's law apparatus" }],
    readings: rng => {
      const H = r(74.5 + rng() * 2, 1), l0 = pick(rng, [16, 18, 20, 22, 24]);
      const rows = [-20, -10, 0, 10, 20, 30].map(h => { const l = read(rng, columnAt({ H, l0 }, h), 0.1, { abs: 0.06 }); return { h, P: r(H + h, 1), l, inv: r(1 / l, 4), Pl: r((H + h) * l, 0) }; });
      const PV = r(mean(rows.map(x => x.Pl)), 0);
      return numeric([`Barometer H = ${H} cm of mercury; room temperature constant`], [{ key: 'h', label: 'Level difference h', unit: 'cm' }, { key: 'P', label: 'P = H + h', unit: 'cm Hg' }, { key: 'l', label: 'Air column l', unit: 'cm' }, { key: 'inv', label: '1/l', unit: 'cm⁻¹' }, { key: 'Pl', label: 'P × l', unit: 'cm² Hg' }], rows, ['P', 'inv', 'Pl'], [
        { label: 'P × V (constant)', unit: 'cm Hg × cm', value: PV, tolerance: tol(PV, 0.015, 5), working: `P × l stays the same within error: mean ${PV}.`, accepted: `${r(H * l0, 0)} cm Hg × cm` },
      ]);
    },
    viva: [
      { q: "State Boyle's law.", a: 'At constant temperature, the volume of a fixed mass of gas is inversely proportional to its pressure: PV = constant.', source: 'authored' },
      { q: 'Why can the length of the air column stand for its volume?', a: 'The tube has a uniform bore, so V = (area) × l ∝ l.', source: 'authored' },
    ],
    conclusion: 'P × V is constant; P against 1/V is a straight line through the origin and P against V a hyperbola.',
  },
  {
    ...base, id: id('e', 4), no: 4, part: 'experiment', kind: 'numeric',
    official: 'To determine the surface tension of water by capillary rise method.',
    title: 'Surface tension by capillary rise',
    chapter: FLUIDS, topic: 'Surface tension applied to drops, bubbles and capillary rise',
    aim: 'To find the surface tension of water from its rise in a capillary tube.',
    apparatus: ['Clean capillary tube', 'Beaker of water on an adjustable stand', 'Travelling microscope (LC 0.001 cm)', 'Pointer (pin) and clamp', 'Thermometer'],
    procedure: [
      'Clamp the capillary tube vertically in the water, with a pin just touching the water surface beside it.',
      'Focus the travelling microscope on the bottom of the meniscus in the tube; read.',
      'Lower the beaker carefully, focus on the pin tip (the old water level); read. The difference is h.',
      'Measure the internal diameter of the tube at its top end with the microscope, in two perpendicular directions.',
      'T = rhρg/2.',
    ],
    precautions: ['Clean the tube with caustic soda and water so the angle of contact is zero.', 'Keep the tube vertical.', 'Focus on the lowest point of the meniscus.'],
    setups: [{ engine: 'fluids', params: { mode: 'capillary', r: 0.4, detergent: 'no', ball: 1, liquid: 'glycerine', v1: 0.5, ratio: 2 }, label: 'Capillary rise' }],
    readings: rng => {
      const rad = r(0.25 + rng() * 0.3, 3); // mm
      const rows = [1, 2, 3].map(t => { const dia = read(rng, 2 * rad / 10, 0.001, { abs: 0.0015 }); const h = read(rng, riseCm(rad, T_WATER), 0.001, { abs: 0.03 }); return { trial: t, dia, h, T: r(((dia / 2 / 100) * (h / 100) * 1000 * G) / 2, 4) }; });
      const Tm = r(mean(rows.map(x => x.T)), 4);
      return numeric(['Clean glass, angle of contact ≈ 0; water at room temperature'], [{ key: 'trial', label: 'Trial' }, { key: 'dia', label: 'Internal diameter', unit: 'cm' }, { key: 'h', label: 'Capillary rise h', unit: 'cm' }, { key: 'T', label: 'T = rhρg/2', unit: 'N/m' }], rows, ['T'], [
        { label: 'Surface tension of water', unit: 'N/m', value: Tm, tolerance: tol(Tm, 0.04, 0.002), working: `Mean of ${rows.map(x => x.T).join(', ')} = ${Tm} N/m.`, accepted: `${T_WATER} N/m` },
      ]);
    },
    viva: [
      { q: 'Why does water rise in a capillary tube?', a: 'Adhesion between water and glass is stronger than cohesion; the surface tension along the curved surface pulls the water up.', source: 'authored' },
      { q: 'Why does mercury fall in a capillary?', a: 'Its angle of contact with glass is more than 90° (cos θ negative).', source: 'authored' },
    ],
    conclusion: 'The surface tension of water, from T = rhρg/2, is about 0.07 N/m.',
  },
  {
    ...base, id: id('e', 5), no: 5, part: 'experiment', kind: 'numeric',
    official: 'To determine the coefficient of viscosity of a given viscous liquid by measuring terminal velocity of a given spherical body.',
    title: 'Viscosity from terminal velocity',
    chapter: FLUIDS, topic: "Viscosity, Stokes' law, terminal velocity",
    aim: 'To find the coefficient of viscosity of a liquid from the terminal velocity of steel balls falling through it.',
    apparatus: ['Tall glass jar of glycerine with two marks 20 cm apart', 'Steel balls of different radii', 'Screw gauge', 'Stop watch', 'Thermometer'],
    procedure: [
      'Measure the diameter of each ball with the screw gauge.',
      'Wet a ball with the liquid and drop it gently at the centre of the jar.',
      'Start the watch as it passes the upper mark (by then at terminal velocity) and stop it at the lower mark.',
      'v = 20 cm / t; η = 2r²(ρ − σ)g / 9v. Repeat with other balls.',
    ],
    precautions: ['Drop the balls at the centre, away from the walls.', 'The upper mark must be well below the surface, so the ball has reached terminal velocity.', 'Wet the balls with the liquid first, so no air bubbles cling to them.'],
    setups: [{ engine: 'fluids', params: { mode: 'viscosity', r: 0.4, detergent: 'no', ball: 1, liquid: 'glycerine', v1: 0.5, ratio: 2 }, label: 'Ball falling through glycerine' }],
    readings: rng => {
      const liquid = pick(rng, Object.keys(LIQUIDS)), L = LIQUIDS[liquid];
      const rows = [0.75, 1, 1.25].map(rr => { const dia = read(rng, 2 * rr, 0.01, { abs: 0.008 }); const t = read(rng, MARKS / terminal(dia / 2, liquid), 0.01, { abs: 0.05 }); const v = (MARKS / t) / 100; return { dia, t, v: r(v * 100, 3), eta: r((2 * (dia / 2000) ** 2 * (STEEL - L.rho) * G) / (9 * v), 3) }; });
      const em = r(mean(rows.map(x => x.eta)), 3);
      return numeric([`${L.label} (density ${L.rho} kg/m³); steel balls (${STEEL} kg/m³); marks ${MARKS} cm apart`], [{ key: 'dia', label: 'Ball diameter', unit: 'mm' }, { key: 't', label: 'Time between the marks', unit: 's' }, { key: 'v', label: 'Terminal velocity', unit: 'cm/s' }, { key: 'eta', label: 'η', unit: 'Pa s' }], rows, ['v', 'eta'], [
        { label: 'Coefficient of viscosity', unit: 'Pa s', value: em, tolerance: tol(em, 0.05, 0.02), working: `η = 2r²(ρ − σ)g/9v for each ball; mean ${em} Pa s.`, accepted: `${L.eta} Pa s` },
      ]);
    },
    viva: [
      { q: 'What is terminal velocity?', a: 'The constant speed a body reaches when the viscous drag plus upthrust balance its weight.', source: 'authored' },
      { q: 'How does viscosity change with temperature?', a: 'For liquids it falls sharply as the temperature rises; that is why the temperature is noted.', source: 'authored' },
    ],
    conclusion: 'The coefficient of viscosity of the liquid, from Stokes\' law, is as found.',
  },
  {
    ...base, id: id('e', 6), no: 6, part: 'experiment', kind: 'numeric',
    official: 'To study the relationship between the temperature of a hot body and time by plotting a cooling curve.',
    title: 'Cooling curve of hot water',
    chapter: HEAT, topic: 'Heat transfer: conduction, convection and radiation; thermal conductivity',
    aim: 'To plot the cooling curve of hot water and study how its rate of cooling depends on its temperature above the room.',
    apparatus: ['Copper calorimeter with stirrer, in a wooden box', 'Two thermometers (0.5 °C)', 'Stop watch', 'Hot water'],
    procedure: [
      'Note the room temperature.',
      'Fill the calorimeter two-thirds with water at about 80 °C.',
      'Stirring gently, read the temperature every minute for 20 minutes.',
      'Plot temperature against time.',
    ],
    precautions: ['Stir gently and continuously.', 'Keep the calorimeter away from draughts and sunlight.', 'Read the thermometer at eye level.'],
    setups: [{ engine: 'thermal', params: { mode: 'cooling', T0: 85, room: 28, cover: 'open', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 100 }, label: 'Cooling curve' }],
    readings: rng => {
      const T0 = pick(rng, [75, 80, 85]), room = pick(rng, [24, 27, 30, 32]);
      const p = { T0, room, cover: 'open' };
      const rows = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map(t => ({ t, T: read(rng, coolAt(p, t), 0.5, { abs: 0.25 }), excess: 0 })).map(x => ({ ...x, excess: r(x.T - room, 1) }));
      const first = r(((rows[0].T as number) - (rows[1].T as number)) / 2, 2), last = r(((rows[9].T as number) - (rows[10].T as number)) / 2, 2);
      const k = r(Math.log((rows[0].excess as number) / (rows[5].excess as number)) / 10, 3);
      return numeric([`Room temperature ${room} °C`], [{ key: 't', label: 'Time', unit: 'min' }, { key: 'T', label: 'Temperature', unit: '°C' }, { key: 'excess', label: 'Above room', unit: '°C' }], rows, ['excess'], [
        { label: 'Cooling constant k (from 0 to 10 min)', unit: 'per min', value: k, tolerance: tol(k, 0.1, 0.004), working: `k = ln(${rows[0].excess}/${rows[5].excess}) / 10 = ${k} per min. It cooled ${first} °C/min at first but only ${last} °C/min near the end.`, accepted: `${COVERS.open.k} per min` },
      ]);
    },
    viva: [
      { q: "State Newton's law of cooling.", a: 'The rate of loss of heat of a body is proportional to the difference between its temperature and that of its surroundings (for small differences).', source: 'authored' },
      { q: 'Why is the curve steep at first?', a: 'The water is much hotter than the room then, so it loses heat fastest.', source: 'authored' },
    ],
    conclusion: 'The water cools fastest when hottest; the cooling curve flattens as it nears room temperature.',
  },
  {
    ...base, id: id('e', 7), no: 7, part: 'experiment', kind: 'numeric',
    official: 'To determine specific heat capacity of a given solid by method of mixtures.',
    title: 'Specific heat of a solid by mixtures',
    chapter: HEAT, topic: 'Specific heat capacity; Cp, Cv; calorimetry',
    aim: 'To find the specific heat capacity of a solid by the method of mixtures.',
    apparatus: ['Copper calorimeter with stirrer, in a wooden box', 'Solid (metal block) with thread', 'Steam or boiling-water heater', 'Two thermometers (0.1 °C)', 'Physical balance'],
    procedure: [
      'Weigh the empty calorimeter with stirrer, then with water about half full.',
      'Heat the solid in boiling water until it is at that temperature (note it).',
      'Note the water temperature, then quickly transfer the solid into the calorimeter.',
      'Stir and note the highest temperature reached.',
      'Heat lost by the solid = heat gained by water and calorimeter; work out cₛ.',
    ],
    precautions: ['Transfer the solid quickly, without splashing.', 'Shield the calorimeter from the heater.', 'Stir continuously and read the maximum temperature.'],
    setups: [{ engine: 'thermal', params: { mode: 'mixtures', T0: 85, room: 28, cover: 'open', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 100 }, label: 'Method of mixtures' }],
    readings: rng => {
      const solid = pick(rng, Object.keys(SOLIDS)), ms = pick(rng, [80, 100, 120, 150]), mw = pick(rng, [80, 100, 120]), Tw = pick(rng, [24, 26, 28, 30]);
      const Tf = read(rng, mixFinal({ solid, ms, mw, Tw }), 0.1, { abs: 0.05 });
      const cs = r(specificHeat(ms, mw, Tw, Tf), 3);
      const rows = [
        { q: 'Mass of the calorimeter + stirrer', v: CALORIMETER.m, u: 'g' }, { q: 'Mass of calorimeter + water', v: CALORIMETER.m + mw, u: 'g' }, { q: 'Mass of the solid', v: ms, u: 'g' },
        { q: 'Temperature of the solid', v: HOT, u: '°C' }, { q: 'Temperature of the water', v: Tw, u: '°C' }, { q: 'Final temperature', v: Tf, u: '°C' },
      ];
      return numeric([`Calorimeter: copper, ${CALORIMETER.c} J/g K; water ${C_WATER} J/g K`], [{ key: 'q', label: 'Quantity' }, { key: 'v', label: 'Reading' }, { key: 'u', label: 'Unit' }], rows, [], [
        { label: 'Specific heat of the solid', unit: 'J/g K', value: cs, tolerance: tol(cs, 0.08, 0.02), working: `cₛ = (${mw} × ${C_WATER} + ${CALORIMETER.m} × ${CALORIMETER.c}) × (${Tf} − ${Tw}) / (${ms} × (${HOT} − ${Tf})) = ${cs} J/g K.`, accepted: `${SOLIDS[solid].c} J/g K` },
      ]);
    },
    viva: [
      { q: 'What is the principle of mixtures?', a: 'Heat lost by the hot body = heat gained by the cold bodies, if no heat is lost to the surroundings.', source: 'authored' },
      { q: 'Why is the calorimeter made of copper?', a: 'Copper is a good conductor with a low specific heat, so it quickly takes the temperature of its contents and needs little heat itself.', source: 'authored' },
    ],
    conclusion: 'The specific heat capacity of the solid, by the method of mixtures, is as found.',
  },
  {
    ...base, id: id('e', 8), no: 8, part: 'experiment', kind: 'numeric',
    official: 'To study the relation between frequency and length of a given wire under constant tension using sonometer.',
    title: 'Sonometer: frequency and length',
    chapter: 'Waves', topic: 'Standing waves in strings and organ pipes; fundamental mode and harmonics',
    aim: 'To find how the resonant length of a sonometer wire depends on the frequency, at constant tension.',
    apparatus: ['Sonometer with hanger and weights', 'Set of tuning forks', 'Rubber pad', 'Paper rider', 'Metre scale'],
    procedure: [
      'Put a fixed load on the hanger.',
      'Strike a fork on the rubber pad and hold its stem on the sonometer box.',
      'Move the bridge until the paper rider on the middle of the wire flies off: note the length l.',
      'Repeat for each fork. Find f·l and plot f against 1/l.',
    ],
    precautions: ['Strike the fork on a rubber pad, never on a hard surface.', 'Make fine adjustments of the bridge near resonance.', 'Keep the load the same throughout.'],
    setups: [{ engine: 'sonometer', params: { mode: 'fork', f: '320', M: 4, wire: 'thin' }, label: 'Resonance with a fork' }],
    readings: rng => {
      const M = pick(rng, [3, 4, 5]), wire = 'thin';
      const rows = [256, 320, 384, 480, 512].map(f => { const l = read(rng, lengthFor(f, M, wire), 0.1, { abs: 0.15 }); return { f, l, inv: r(1 / l, 4), fl: r((f * l) / 100, 1) }; });
      const fl = r(mean(rows.map(x => x.fl)), 1);
      return numeric([`Load ${M} kg on the hanger; ${SONO.thin.label.toLowerCase()} wire`], [{ key: 'f', label: 'Frequency', unit: 'Hz' }, { key: 'l', label: 'Resonant length', unit: 'cm' }, { key: 'inv', label: '1/l', unit: 'cm⁻¹' }, { key: 'fl', label: 'f × l', unit: 'Hz m' }], rows, ['inv', 'fl'], [
        { label: 'f × l (constant)', unit: 'Hz m', value: fl, tolerance: tol(fl, 0.015, 0.5), working: `f·l is the same for every fork: mean ${fl} Hz m (= v/2).`, accepted: `${r((256 * lengthFor(256, M, wire)) / 100, 1)} Hz m` },
      ]);
    },
    viva: [
      { q: 'Why does the paper rider fly off?', a: 'At resonance the wire vibrates with its largest amplitude; the rider sits at the antinode in the middle.', source: 'authored' },
      { q: 'Why is the fork pressed on the box?', a: 'The box (sound board) carries the vibrations to the wire through the bridges.', source: 'authored' },
    ],
    conclusion: 'At constant tension f × l is constant: the frequency is inversely proportional to the resonant length.',
  },
  {
    ...base, id: id('e', 9), no: 9, part: 'experiment', kind: 'numeric',
    official: 'To study the relation between the length of a given wire and tension for constant frequency using sonometer.',
    title: 'Sonometer: length and tension',
    chapter: 'Waves', topic: 'Transverse and longitudinal waves; speed of a travelling wave',
    aim: 'To find how the resonant length depends on the tension, for a fixed frequency.',
    apparatus: ['Sonometer with hanger and weights', 'One tuning fork', 'Rubber pad', 'Paper rider', 'Metre scale'],
    procedure: [
      'Put 2 kg on the hanger and find the resonant length for the fork.',
      'Increase the load in 1 kg steps up to 6 kg, finding the length each time.',
      'Work out l²/T and plot l² against T.',
    ],
    precautions: ['Keep the same fork throughout.', 'Add loads gently so the wire does not snap.'],
    setups: [{ engine: 'sonometer', params: { mode: 'tension', f: '320', M: 4, wire: 'thin' }, label: 'Length and tension' }],
    readings: rng => {
      const f = pick(rng, [320, 384, 426.7]), wire = 'thin';
      const rows = [2, 3, 4, 5, 6].map(M => { const l = read(rng, lengthFor(f, M, wire), 0.1, { abs: 0.15 }); const T = r(M * G, 1); return { M, T, l, l2T: r((l * l) / T, 1) }; });
      const k = r(mean(rows.map(x => x.l2T)), 1);
      return numeric([`Tuning fork ${f} Hz`], [{ key: 'M', label: 'Load', unit: 'kg' }, { key: 'T', label: 'Tension T', unit: 'N' }, { key: 'l', label: 'Resonant length', unit: 'cm' }, { key: 'l2T', label: 'l²/T', unit: 'cm²/N' }], rows, ['l2T'], [
        { label: 'l²/T (constant)', unit: 'cm²/N', value: k, tolerance: tol(k, 0.03, 0.5), working: `l²/T is the same for every load: mean ${k} cm²/N, so l ∝ √T.`, accepted: `${r(lengthFor(f, 4, wire) ** 2 / (4 * G), 1)} cm²/N` },
      ]);
    },
    viva: [
      { q: 'How does the wave speed on the wire depend on tension?', a: 'v = √(T/μ): four times the tension doubles the speed.', source: 'authored' },
      { q: 'What is μ?', a: 'The mass per unit length of the wire.', source: 'authored' },
    ],
    conclusion: 'For a fixed frequency l² is proportional to T: the resonant length is proportional to the square root of the tension.',
  },
  {
    ...base, id: id('e', 10), no: 10, part: 'experiment', kind: 'numeric',
    official: 'To find the speed of sound in air at room temperature using a resonance tube by two resonance positions.',
    title: 'Speed of sound with a resonance tube',
    chapter: 'Waves', topic: 'Standing waves in strings and organ pipes; fundamental mode and harmonics',
    aim: 'To find the speed of sound in air at room temperature from the two resonance positions of a resonance tube.',
    apparatus: ['Resonance tube with reservoir', 'Tuning fork', 'Rubber pad', 'Thermometer', 'Set square'],
    procedure: [
      'Fill the tube nearly to the top. Strike the fork and hold it over the mouth, prongs vertical.',
      'Lower the water slowly until the sound is loudest: note l₁. Repeat, approaching from below.',
      'Lower further to the second loud position: note l₂.',
      'v = 2f(l₂ − l₁). Note the room temperature.',
    ],
    precautions: ['Hold the fork just above the mouth without touching it.', 'Approach each resonance from both sides and take the mean.', 'The tube should be vertical.'],
    setups: [{ engine: 'resonance', params: { f: '480', t: 30, D: 3.4 }, label: 'Two resonances' }],
    readings: rng => {
      const f = pick(rng, TUBE_FORKS), t = pick(rng, [24, 28, 30, 32, 35]), D = pick(rng, [3, 3.4, 4]);
      const s = solveResonance({ f: String(f), t, D });
      const rows = [1, 2, 3].map(k => ({ trial: k, l1: read(rng, s.l1, 0.1, { abs: 0.15 }), l2: read(rng, s.l2, 0.1, { abs: 0.2 }) }));
      const l1 = mean(rows.map(x => x.l1)), l2 = mean(rows.map(x => x.l2));
      const v = r((2 * f * (l2 - l1)) / 100, 0), e = r((l2 - 3 * l1) / 2, 1);
      return numeric([`Fork ${f} Hz; room ${t} °C; tube diameter ${D} cm`], [{ key: 'trial', label: 'Trial' }, { key: 'l1', label: 'First resonance l₁', unit: 'cm' }, { key: 'l2', label: 'Second resonance l₂', unit: 'cm' }], rows, [], [
        { label: 'Speed of sound', unit: 'm/s', value: v, tolerance: tol(v, 0.015, 3), working: `v = 2f(l₂ − l₁) = 2 × ${f} × ${r((l2 - l1) / 100, 4)} = ${v} m/s.`, accepted: `${r(speedAt(t), 0)} m/s` },
        { label: 'End correction', unit: 'cm', value: e, tolerance: 0.5, working: `e = (l₂ − 3l₁)/2 = ${e} cm (≈ 0.3D).`, accepted: `≈ 0.3D = ${r(0.3 * D, 1)} cm` },
      ]);
    },
    viva: [
      { q: 'What is the end correction?', a: 'The antinode forms a little above the open end (about 0.3 times the diameter), so the vibrating column is longer than the tube.', source: 'authored' },
      { q: 'Why use two resonances?', a: 'Subtracting l₁ from l₂ removes the end correction.', source: 'authored' },
    ],
    conclusion: 'The speed of sound in air at room temperature is as found; it agrees with 331 + 0.61t m/s.',
  },
  // ── Section B activities ─────────────────────────────────────────────────
  {
    ...base, id: id('a', 1), no: 1, part: 'activity', kind: 'numeric',
    official: 'To observe change of state and plot a cooling curve for molten wax.',
    title: 'Cooling curve of molten wax',
    chapter: HEAT, topic: 'Change of state: latent heat capacity',
    aim: 'To plot the cooling curve of molten wax and observe the change of state.',
    apparatus: ['Boiling tube of wax', 'Beaker of water and burner', 'Thermometer', 'Stop watch'],
    procedure: ['Melt the wax in hot water and heat it to about 80 °C.', 'Take it out and read its temperature every minute as it cools and solidifies.', 'Plot temperature against time.'],
    precautions: ['Keep the thermometer bulb in the middle of the wax.', 'Do not disturb the tube as it cools.'],
    setups: [{ engine: 'thermal', params: { mode: 'wax', T0: 85, room: 28, cover: 'open', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 100 }, label: 'Molten wax cooling' }],
    readings: rng => {
      const room = pick(rng, [26, 28, 30]), T0 = pick(rng, [78, 80, 85]);
      const rows = Array.from({ length: 16 }, (_, i) => i * 2).map(t => ({ t, T: read(rng, waxAt({ T0, room }, t), 0.5, { abs: 0.2 }) }));
      const flat = rows.filter(x => Math.abs((x.T as number) - WAX_MP) <= 1);
      const mp = r(mean((flat.length ? flat : rows).map(x => x.T as number)), 1);
      return numeric([`Room ${room} °C`], [{ key: 't', label: 'Time', unit: 'min' }, { key: 'T', label: 'Temperature', unit: '°C' }], rows, [], [
        { label: 'Melting point (the flat part)', unit: '°C', value: mp, tolerance: 1.5, working: `The temperature stays near ${mp} °C while the wax solidifies.`, accepted: `${WAX_MP} °C` },
      ]);
    },
    viva: [{ q: 'Why does the temperature stay steady for a while?', a: 'The wax gives out latent heat as it solidifies, making up for what it loses to the room.', source: 'authored' }, { q: 'What does the slope of the cooling curve show?', a: 'The rate of cooling: it is steep while the wax is much hotter than the room and flattens as the difference falls (Newton\'s law of cooling).', source: 'authored' }, { q: 'Why is the wax stirred while it cools?', a: 'So the whole sample is at one temperature and the thermometer reads it fairly.', source: 'authored' }],
    conclusion: 'The cooling curve has a flat part at the melting point, where the wax solidifies.',
  },
  {
    ...base, id: id('a', 2), no: 2, part: 'activity', kind: 'observation',
    official: 'To observe and explain the effect of heating on a bi-metallic strip.',
    title: 'Heating a bimetallic strip',
    chapter: HEAT, topic: 'Heat, temperature; thermal expansion of solids, liquids and gases; anomalous expansion of water',
    aim: 'To observe and explain how a bimetallic strip bends when heated and cooled.',
    apparatus: ['Bimetallic strip (brass and iron) with a handle', 'Burner', 'Ice'],
    procedure: ['Note which side is brass.', 'Heat the strip in the flame and watch which way it bends.', 'Cool it with ice and watch again.'],
    precautions: ['Hold it by the insulated handle.', 'Heat it evenly along its length.'],
    setups: [{ engine: 'thermal', params: { mode: 'bimetal', T0: 85, room: 28, cover: 'open', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 100 }, label: 'Bimetallic strip heated' }],
    readings: () => observation(['Brass expands about 1.5 times as much as iron'], [{ key: 'step', label: 'Done' }, { key: 'seen', label: 'Observation' }, { key: 'why', label: 'Reason' }], [
      { step: 'Heated', seen: 'Bends towards the iron side (brass outside)', why: 'Brass expands more, so it becomes the longer, outer side' },
      { step: 'Cooled', seen: 'Bends towards the brass side (iron outside)', why: 'Brass contracts more, so it becomes the shorter, inner side' },
    ], ['seen', 'why']),
    viva: [{ q: 'Where are bimetallic strips used?', a: 'Thermostats in irons and heaters, fire alarms, and dial thermometers.', source: 'authored' }, { q: 'Why does a bimetallic strip bend instead of just getting longer?', a: 'The two metals are joined, and one expands more than the other; the strip curves with the more-expanding metal on the outside.', source: 'authored' }, { q: 'Which way does it bend when cooled below room temperature?', a: 'The other way: the metal that expands more also contracts more, so it is now on the inside of the curve.', source: 'authored' }],
    conclusion: 'A bimetallic strip bends on heating with the metal that expands more on the outside.',
  },
  {
    ...base, id: id('a', 3), no: 3, part: 'activity', kind: 'observation',
    official: 'To note the change in level of liquid in a container on heating and interpret the observations.',
    title: 'Level of a liquid on heating',
    chapter: HEAT, topic: 'Heat, temperature; thermal expansion of solids, liquids and gases; anomalous expansion of water',
    aim: 'To observe how the level of a liquid in a flask with a fine tube changes when the flask is heated.',
    apparatus: ['Round-bottom flask with a cork and a fine glass tube', 'Coloured water', 'Trough of hot water'],
    procedure: ['Fill the flask with coloured water so the level stands partly up the tube; mark it.', 'Put the flask in hot water and watch the level closely from the first moment.'],
    precautions: ['There must be no air bubble in the flask.', 'Watch the level right from the start.'],
    setups: [{ engine: 'thermal', params: { mode: 'expansion', T0: 85, room: 28, cover: 'open', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 50 }, label: 'Flask in hot water' }],
    readings: () => observation([], [{ key: 'when', label: 'When' }, { key: 'seen', label: 'Level' }, { key: 'why', label: 'Reason' }], [
      { when: 'First few seconds', seen: 'Falls a little', why: 'The glass is heated first and expands, so the flask holds more' },
      { when: 'Then', seen: 'Rises well above the mark', why: 'The water warms and expands much more than the glass' },
    ], ['seen', 'why']),
    viva: [{ q: 'What is apparent expansion?', a: 'The expansion of a liquid as seen in its container: real expansion minus the container\'s expansion.', source: 'authored' }, { q: 'Why does the level first fall a little when the flask is put into hot water?', a: 'The glass is heated first and expands, so the flask holds more before the liquid has warmed.', source: 'authored' }, { q: 'How is real expansion related to apparent expansion?', a: 'Real expansion = apparent expansion + expansion of the vessel; γ_real = γ_apparent + γ_vessel.', source: 'authored' }],
    conclusion: 'The level first dips (the glass expands) and then rises (the liquid expands more): we see the apparent expansion.',
  },
  {
    ...base, id: id('a', 4), no: 4, part: 'activity', kind: 'numeric',
    official: 'To study the effect of detergent on surface tension of water by observing capillary rise.',
    title: 'Detergent and capillary rise',
    chapter: FLUIDS, topic: 'Surface energy and surface tension, angle of contact, excess pressure across a curved surface',
    aim: 'To observe how detergent changes the capillary rise of water, and so its surface tension.',
    apparatus: ['Two identical capillary tubes', 'Two beakers: water, and water with a little detergent', 'Scale'],
    procedure: ['Stand one tube in each beaker.', 'Measure the rise in each.', 'Compare.'],
    precautions: ['Use clean tubes of the same bore.', 'Read the bottom of the meniscus.'],
    setups: [{ engine: 'fluids', params: { mode: 'capillary', r: 0.4, detergent: 'yes', ball: 1, liquid: 'glycerine', v1: 0.5, ratio: 2 }, label: 'Water with detergent' }],
    readings: rng => {
      const rad = pick(rng, [0.2, 0.25, 0.3]);
      const rows = [{ liquid: 'Pure water', T: T_WATER }, { liquid: 'Water with detergent', T: T_DETERGENT }].map(x => ({ liquid: x.liquid, h: read(rng, riseCm(rad, x.T), 0.1, { abs: 0.04 }) }));
      const ratio = r((rows[1].h as number) / (rows[0].h as number), 3);
      return numeric([`Tubes of radius ${rad} mm`], [{ key: 'liquid', label: 'Liquid' }, { key: 'h', label: 'Rise', unit: 'cm' }], rows, [], [
        { label: 'Rise with detergent ÷ rise in pure water', unit: '', value: ratio, tolerance: 0.05, working: `${rows[1].h} ÷ ${rows[0].h} = ${ratio}: the surface tension fell in the same ratio.`, accepted: `${r(T_DETERGENT / T_WATER, 3)}` },
      ]);
    },
    viva: [{ q: 'How does detergent lower the surface tension?', a: 'Its molecules collect at the surface and weaken the pull between the water molecules there.', source: 'authored' }],
    conclusion: 'Detergent lowers the surface tension of water, so it rises less in a capillary.',
  },
  {
    ...base, id: id('a', 5), no: 5, part: 'activity', kind: 'numeric',
    official: 'To study the factors affecting the rate of loss of heat of a liquid.',
    title: 'What affects the rate of heat loss',
    chapter: HEAT, topic: 'Heat transfer: conduction, convection and radiation; thermal conductivity',
    aim: 'To compare how fast hot water cools with a lid, open in still air, and with a fan blowing.',
    apparatus: ['Three identical calorimeters', 'Lid', 'Table fan', 'Thermometers', 'Stop watch', 'Hot water'],
    procedure: ['Pour the same amount of water at the same temperature into each.', 'Cover one, leave one open, put one in front of the fan.', 'Read each after 10 minutes.'],
    precautions: ['Start all three at the same temperature.', 'Use the same amount of water in each.'],
    setups: [{ engine: 'thermal', params: { mode: 'cooling', T0: 85, room: 28, cover: 'fan', solid: 'aluminium', ms: 100, mw: 100, Tw: 25, dT: 100 }, label: 'Cooling with a fan' }],
    readings: rng => {
      const room = pick(rng, [26, 28, 30]), T0 = 80;
      const rows = Object.entries(COVERS).map(([cover, c]) => ({ how: c.label, T: read(rng, coolAt({ T0, room, cover }, 10), 0.5, { abs: 0.25 }) })).map(x => ({ ...x, fall: r(T0 - (x.T as number), 1) }));
      const fan = rows.find(x => x.how === COVERS.fan.label)!, lid = rows.find(x => x.how === COVERS.lid.label)!;
      const ratio = r((fan.fall as number) / (lid.fall as number), 1);
      return numeric([`All three start at ${T0} °C; room ${room} °C`], [{ key: 'how', label: 'Condition' }, { key: 'T', label: 'After 10 min', unit: '°C' }, { key: 'fall', label: 'Fall', unit: '°C' }], rows, ['fall'], [
        { label: 'Fall with the fan ÷ fall with a lid', unit: '', value: ratio, tolerance: 0.4, working: `${fan.fall} ÷ ${lid.fall} = ${ratio}: moving air carries heat away much faster.`, accepted: `${r((T0 - coolAt({ T0, room: 28, cover: 'fan' }, 10)) / (T0 - coolAt({ T0, room: 28, cover: 'lid' }, 10)), 1)}` },
      ]);
    },
    viva: [{ q: 'Name three factors that affect how fast a liquid loses heat.', a: 'Its temperature above the surroundings, the area of its surface, and the movement of the air (and evaporation).', source: 'authored' }],
    conclusion: 'A lid slows the loss of heat; moving air speeds it up.',
  },
  {
    ...base, id: id('a', 6), no: 6, part: 'activity', kind: 'numeric',
    official: 'To study the effect of load on depression of a suitably clamped metre scale loaded at (i) its end (ii) in the middle.',
    title: 'Depression of a loaded metre scale',
    chapter: 'Mechanical Properties of Solids', topic: 'Applications of elastic behaviour of materials',
    aim: 'To study how the depression of a metre scale depends on the load, clamped at one end and supported at both ends.',
    apparatus: ['Wooden metre scale', 'Clamp', 'Two knife edges', 'Hanger and 50 g weights', 'Pointer and vertical scale'],
    procedure: ['Clamp the scale at one end with 70 cm free; hang loads at the free end and read the depression.', 'Rest the scale on two knife edges 70 cm apart; hang the loads in the middle and read again.', 'Plot depression against load for each.'],
    precautions: ['Keep the span the same.', 'Remove the load between readings to check the scale returns to zero.'],
    setups: [{ engine: 'elastic', params: { mode: 'beam', material: 'steel', L: 2, d: 0.5, M: 3, support: 'end', W: 200, span: 70 }, label: 'Scale clamped at one end' }],
    readings: rng => {
      const span = pick(rng, [60, 70, 80]);
      const rows = [100, 200, 300, 400].map(W => ({ W, end: read(rng, depressionMm('end', W, span), 0.5, { sd: 0.02 }), middle: read(rng, depressionMm('middle', W, span), 0.1, { sd: 0.03, abs: 0.05 }) }));
      const ratio = r(mean(rows.map(x => (x.end as number) / (x.middle as number))), 1);
      return numeric([`Span ${span} cm`], [{ key: 'W', label: 'Load', unit: 'g' }, { key: 'end', label: 'Clamped, load at the end', unit: 'mm' }, { key: 'middle', label: 'On two edges, load in the middle', unit: 'mm' }], rows, [], [
        { label: 'End depression ÷ middle depression', unit: '', value: ratio, tolerance: 1.2, working: `Mean ratio ${ratio} (theory: 48/3 = 16).`, accepted: '16' },
      ]);
    },
    viva: [{ q: 'Why are beams in buildings made deep rather than wide?', a: 'The depression ∝ 1/(bd³): increasing the depth d stiffens a beam far more than increasing the width.', source: 'authored' }, { q: 'How does the depression depend on the length of the loaded part?', a: 'As the cube of the length: δ = WL³/(3YI) for a cantilever, so doubling the span gives eight times the sag.', source: 'authored' }],
    conclusion: 'The depression is proportional to the load in both cases, and far larger for the scale clamped at one end.',
  },
  {
    ...base, id: id('a', 7), no: 7, part: 'activity', kind: 'numeric',
    official: 'To observe the decrease in pressure with increase in velocity of a fluid.',
    title: 'Pressure falls where a fluid speeds up',
    chapter: FLUIDS, topic: "Bernoulli's theorem and simple applications (Torricelli's law, dynamic lift)",
    aim: 'To observe that the pressure of flowing water is lower where it flows faster.',
    apparatus: ['Glass tube with a narrow middle section, with vertical side tubes', 'Water supply with a tap', 'Scale'],
    procedure: ['Let water flow steadily through the tube.', 'Read the water levels in the side tubes at the wide and the narrow parts.', 'Repeat for a faster flow.'],
    precautions: ['Keep the flow steady.', 'Remove air bubbles from the side tubes.'],
    setups: [{ engine: 'fluids', params: { mode: 'bernoulli', r: 0.4, detergent: 'no', ball: 1, liquid: 'glycerine', v1: 0.5, ratio: 2 }, label: 'Flow through the narrow part' }],
    readings: rng => {
      const ratio = pick(rng, [2, 2.5, 3]);
      const rows = [0.3, 0.4, 0.5].map(v1 => { const b = bernoulli(v1, ratio); return { v1, wide: 30, narrow: r(30 - read(rng, b.dh, 0.1, { abs: 0.08 }), 1), drop: 0 }; }).map(x => ({ ...x, drop: r(x.wide - x.narrow, 1) }));
      const last = bernoulli(0.5, ratio).dh;
      return numeric([`The narrow part has 1/${ratio} of the area`], [{ key: 'v1', label: 'Speed in the wide part', unit: 'm/s' }, { key: 'wide', label: 'Level at the wide part', unit: 'cm' }, { key: 'narrow', label: 'Level at the narrow part', unit: 'cm' }, { key: 'drop', label: 'Drop', unit: 'cm' }], rows, ['drop'], [
        { label: 'Level drop at the fastest flow', unit: 'cm', value: rows[2].drop as number, tolerance: 0.4, working: `½ρ(v₂² − v₁²)/ρg = ${r(last, 1)} cm; measured ${rows[2].drop} cm.`, accepted: `${r(last, 1)} cm` },
      ]);
    },
    viva: [{ q: 'State Bernoulli\'s theorem.', a: 'Along a streamline of steady flow, P + ½ρv² + ρgh is constant: where the speed rises, the pressure falls.', source: 'authored' }, { q: 'Why does a fast-moving stream of air over a sheet of paper lift it?', a: 'The pressure in the fast-moving air above is lower than in the still air below.', source: 'authored' }, { q: 'Give two uses of Bernoulli\'s principle.', a: 'An aeroplane wing gets lift; a sprayer or a Venturi meter draws or measures liquid where the flow narrows.', source: 'authored' }],
    conclusion: 'Where the tube narrows the water flows faster and its pressure is lower.',
  },
];
