import { pick, read, shuffled } from '../noise';
import { MATERIALS, resistanceOf } from '../engines/wire';
import { balanceAt } from '../engines/bridge';
import { halfDeflection, ig, N as SCALE_DIV, seriesFor, shuntFor } from '../engines/galvanometer';
import { G, lengthFor, MAINS, WIRES } from '../engines/sonometer';
import { COIL, FAULTS, household, impedance, LAMP_W, MAINS_V } from '../engines/components';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class XII Physics (042) practicals, 2026-27, Section A: experiments 1-6
 * (3 and 5 are "either/or" pairs, kept as two entries each) and activities 1-6
 * (Physics_SecP2_2026-27.pdf). Official wording kept as printed.
 */

const base = { cls: 12 as const, subject: 'Physics' as const, section: 'A' as const };
const id = (part: 'e' | 'a', no: number, b = '') => `p12-a${part}${String(no).padStart(2, '0')}${b}`;
const CURRENT = 'Current Electricity';
const WB = "Kirchhoff's rules; Wheatstone bridge";
const MCG = 'Moving coil galvanometer: current sensitivity, conversion to ammeter and voltmeter';

/** A metre bridge balance length (cm) for R and X, as a student reads it on the scale. */
const nullAt = (rng: () => number, R: number, X: number) => read(rng, balanceAt(R, X), 0.1, { abs: 0.12 });

function bridgeRows(rng: () => number, X: number) {
  const boxes = [1, 2, 3, 4, 5, 6, 8, 10].filter(R => { const l = balanceAt(R, X); return l > 30 && l < 70; }).slice(0, 3);
  return (boxes.length ? boxes : [Math.max(1, Math.round(X))]).map(R => { const l = nullAt(rng, R, X); return { R, l, rest: r(100 - l, 1), X: r((R * (100 - l)) / l, 3) }; });
}
const bridgeCols = [{ key: 'R', label: 'R (box)', unit: 'Ω' }, { key: 'l', label: 'Null point l', unit: 'cm' }, { key: 'rest', label: '100 − l', unit: 'cm' }, { key: 'X', label: 'X = R(100 − l)/l', unit: 'Ω' }];

export const PHYSICS12_A: Practical[] = [
  {
    ...base, id: id('e', 1), no: 1, part: 'experiment', kind: 'numeric',
    official: 'To determine resistivity of two / three wires by plotting a graph for potential difference versus current.',
    title: 'Resistivity of wires from V-I graphs',
    chapter: CURRENT, topic: 'Electrical energy and power; resistivity and conductivity; temperature dependence of resistance',
    aim: 'To find the resistivity of the material of two wires from graphs of potential difference against current.',
    apparatus: ['Two wires of different metals', 'Battery eliminator or cells', 'Rheostat', 'Ammeter (0-1 A)', 'Voltmeter (0-3 V)', 'Plug key', 'Screw gauge', 'Metre scale'],
    procedure: [
      'Measure the length of the wire between the terminals and its diameter at several places with the screw gauge.',
      'Connect the wire, ammeter, rheostat, key and battery in series, with the voltmeter across the wire.',
      'Set the rheostat for a small current; read I and V. Take five readings, increasing the current.',
      'Plot V against I; the slope is R. ρ = Rπd²/4L. Repeat for the second wire.',
    ],
    precautions: ['Keep the current small and close the key only while reading, so the wire does not heat up.', 'Connect the meters with the right polarity.', 'Measure the diameter in two perpendicular directions.'],
    setups: [{ engine: 'wire', params: { mode: 'vi', material: 'nichrome', L: 50, d: 0.36, I: 0.4 }, label: 'V-I for a wire' }],
    readings: rng => {
      const mats = shuffled(rng, Object.keys(MATERIALS)).slice(0, 2);
      const wires = mats.map(m => ({ m, L: pick(rng, [50, 60, 75, 100]), d: pick(rng, [0.3, 0.32, 0.36, 0.4]) }));
      const rows = wires.flatMap((w, k) => [0.1, 0.2, 0.3, 0.4, 0.5].map(I => { const R = resistanceOf({ material: w.m, L: w.L, d: w.d }).R; return { wire: `Wire ${k + 1}`, I, V: read(rng, I * R, 0.01, { sd: 0.01, abs: 0.01 }) }; }));
      const results = wires.map((w, k) => {
        const mine = rows.filter(x => x.wire === `Wire ${k + 1}`), R = mean(mine.map(x => (x.V as number) / (x.I as number)));
        const rho = (R * Math.PI * (w.d / 1000) ** 2) / 4 / (w.L / 100);
        return { label: `Resistivity of wire ${k + 1} (× 10⁻⁶)`, unit: 'Ω m', value: r(rho * 1e6, 3), tolerance: tol(rho * 1e6, 0.04, 0.02), working: `R = slope = ${r(R, 3)} Ω; ρ = Rπd²/4L = ${r(rho * 1e6, 3)} × 10⁻⁶ Ω m.`, accepted: `${r(MATERIALS[w.m].rho * 1e6, 3)} × 10⁻⁶ Ω m (${MATERIALS[w.m].label.toLowerCase()})` };
      });
      return numeric(wires.map((w, k) => `Wire ${k + 1}: L = ${w.L} cm, diameter ${w.d} mm`), [{ key: 'wire', label: 'Wire' }, { key: 'I', label: 'Current', unit: 'A' }, { key: 'V', label: 'Potential difference', unit: 'V' }], rows, [], results);
    },
    viva: [
      { q: 'On what does resistivity depend?', a: 'Only on the material and its temperature, not on the length or thickness of the wire.', source: 'authored' },
      { q: 'Why is the key closed only while reading?', a: 'A steady current heats the wire, which changes its resistance.', source: 'authored' },
    ],
    conclusion: 'V against I is a straight line for each wire; the resistivities are as found and match the metals.',
  },
  {
    ...base, id: id('e', 2), no: 2, part: 'experiment', kind: 'numeric',
    official: 'To find resistance of a given wire / standard resistor using metre bridge.',
    title: 'Metre bridge: an unknown resistance',
    chapter: CURRENT, topic: WB,
    aim: 'To find the resistance of a given wire with a metre bridge.',
    apparatus: ['Metre bridge', 'Resistance box', 'The wire', 'Galvanometer', 'Jockey', 'Cell and key', 'Connecting wires'],
    procedure: [
      'Put the resistance box in the left gap and the wire in the right gap; connect the galvanometer between the middle strip and the jockey.',
      'Take out a plug from the box. Touch the jockey near each end: the galvanometer should deflect opposite ways.',
      'Slide the jockey to find the null point l. X = R(100 − l)/l.',
      'Repeat for three values of R, then interchange R and X and repeat.',
    ],
    precautions: ['Press the jockey gently and do not slide it while pressed.', 'Choose R so the null point is between 30 and 70 cm.', 'Close the key only while reading.'],
    setups: [{ engine: 'bridge', params: { mode: 'single', R: 4, X1: 3.6, X2: 5.2 }, label: 'Finding the null point' }],
    readings: rng => {
      const X = r(1.5 + rng() * 6, 1);
      const rows = bridgeRows(rng, X);
      const Xm = r(mean(rows.map(x => x.X)), 2);
      return numeric(['Resistance box in the left gap, the wire in the right'], bridgeCols, rows, ['rest', 'X'], [
        { label: 'Resistance of the wire', unit: 'Ω', value: Xm, tolerance: tol(Xm, 0.02, 0.03), working: `Mean of ${rows.map(x => x.X).join(', ')} = ${Xm} Ω.`, accepted: `${X} Ω` },
      ]);
    },
    viva: [
      { q: 'On what principle does the metre bridge work?', a: 'The Wheatstone bridge: at balance P/Q = R/S and no current flows through the galvanometer.', source: 'authored' },
      { q: 'Why are thick copper strips used?', a: 'Their resistance is negligible, so only the wire and the resistors count.', source: 'authored' },
    ],
    photos: ['metre-bridge'],
    conclusion: 'The resistance of the wire, by the metre bridge, is as found.',
  },
  {
    ...base, id: id('e', 3), no: 3, part: 'experiment', kind: 'numeric', orWith: id('e', 3, 'b'),
    official: 'To verify the laws of combination (series) of resistances using a metre bridge.',
    title: 'Metre bridge: resistances in series',
    chapter: CURRENT, topic: WB,
    aim: 'To verify that resistances in series add, using a metre bridge.',
    apparatus: ['Metre bridge', 'Two resistance wires', 'Resistance box', 'Galvanometer', 'Jockey', 'Cell and key'],
    procedure: ['Find X₁ and then X₂ alone, as in the metre bridge experiment.', 'Join them in series in the right gap and find the combination X.', 'Compare X with X₁ + X₂.'],
    precautions: ['Use thick connecting wires and tighten every terminal.', 'Keep the null point near the middle.'],
    setups: [{ engine: 'bridge', params: { mode: 'series', R: 8, X1: 3.6, X2: 5.2 }, label: 'Two wires in series' }],
    readings: rng => {
      const X1 = r(1.5 + rng() * 3, 1), X2 = r(2 + rng() * 4, 1);
      const rows = [{ which: 'X₁', X: X1 }, { which: 'X₂', X: X2 }, { which: 'In series', X: X1 + X2 }].flatMap(s => bridgeRows(rng, s.X).slice(0, 2).map(x => ({ which: s.which, ...x })));
      const m = (w: string) => r(mean(rows.filter(x => x.which === w).map(x => x.X)), 2);
      const s = m('In series');
      return numeric([], [{ key: 'which', label: 'In the right gap' }, ...bridgeCols], rows, ['rest', 'X'], [
        { label: 'Measured series resistance', unit: 'Ω', value: s, tolerance: tol(s, 0.02, 0.05), working: `Measured ${s} Ω; X₁ + X₂ = ${m('X₁')} + ${m('X₂')} = ${r(m('X₁') + m('X₂'), 2)} Ω.`, accepted: `${r(X1 + X2, 2)} Ω` },
      ]);
    },
    viva: [{ q: 'Why does the series resistance add up?', a: 'The same current flows through both, and the voltages add: V = I(R₁ + R₂).', source: 'authored' }],
    conclusion: 'The resistance of the series combination equals X₁ + X₂.',
  },
  {
    ...base, id: id('e', 3, 'b'), no: 3, part: 'experiment', kind: 'numeric', orWith: id('e', 3),
    official: 'To verify the laws of combination (parallel) of resistances using a metre bridge.',
    title: 'Metre bridge: resistances in parallel',
    chapter: CURRENT, topic: WB,
    aim: 'To verify the law for resistances in parallel, using a metre bridge.',
    apparatus: ['Metre bridge', 'Two resistance wires', 'Resistance box', 'Galvanometer', 'Jockey', 'Cell and key'],
    procedure: ['Find X₁ and X₂ alone.', 'Join them in parallel in the right gap and find the combination X.', 'Compare X with X₁X₂/(X₁ + X₂).'],
    precautions: ['Use thick connecting wires and tighten every terminal.', 'Keep the null point near the middle.'],
    setups: [{ engine: 'bridge', params: { mode: 'parallel', R: 2, X1: 3.6, X2: 5.2 }, label: 'Two wires in parallel' }],
    readings: rng => {
      const X1 = r(2 + rng() * 4, 1), X2 = r(3 + rng() * 5, 1), Xp = (X1 * X2) / (X1 + X2);
      const rows = [{ which: 'X₁', X: X1 }, { which: 'X₂', X: X2 }, { which: 'In parallel', X: Xp }].flatMap(s => bridgeRows(rng, s.X).slice(0, 2).map(x => ({ which: s.which, ...x })));
      const m = (w: string) => r(mean(rows.filter(x => x.which === w).map(x => x.X)), 2);
      const p = m('In parallel');
      return numeric([], [{ key: 'which', label: 'In the right gap' }, ...bridgeCols], rows, ['rest', 'X'], [
        { label: 'Measured parallel resistance', unit: 'Ω', value: p, tolerance: tol(p, 0.03, 0.04), working: `Measured ${p} Ω; X₁X₂/(X₁ + X₂) = ${r((m('X₁') * m('X₂')) / (m('X₁') + m('X₂')), 2)} Ω.`, accepted: `${r(Xp, 2)} Ω` },
      ]);
    },
    viva: [{ q: 'Why is the parallel resistance less than either?', a: 'The current has two paths; the conductances add: 1/R = 1/R₁ + 1/R₂.', source: 'authored' }],
    conclusion: 'The resistance of the parallel combination equals X₁X₂/(X₁ + X₂).',
  },
  {
    ...base, id: id('e', 4), no: 4, part: 'experiment', kind: 'numeric',
    official: 'To determine resistance of a galvanometer by half-deflection method and to find its figure of merit.',
    title: 'Galvanometer: half deflection and figure of merit',
    chapter: 'Moving Charges and Magnetism', topic: MCG,
    aim: 'To find the resistance of a galvanometer by half deflection, and its figure of merit.',
    apparatus: ['Galvanometer (30-0-30)', 'Two resistance boxes (high R, and a shunt S)', 'Cell (2 V)', 'Two plug keys', 'Voltmeter', 'Connecting wires'],
    procedure: [
      'Connect the cell, the high resistance box R, the galvanometer and key K₁ in series; the shunt box S across the galvanometer through key K₂.',
      'With K₂ open, choose R for an even deflection θ near full scale.',
      'Close K₂ and adjust S until the deflection is θ/2. Then G = RS/(R − S).',
      'Repeat for other θ. Figure of merit k = E/((R + G)θ).',
    ],
    precautions: ['Take a high R out of the box before closing K₁, to protect the galvanometer.', 'Choose even deflections so θ/2 is a whole division.', 'Measure the cell\'s emf with the voltmeter.'],
    setups: [{ engine: 'galvanometer', params: { mode: 'half', G: 60, k: 25, E: 2, theta: 30, volts: 3, amps: 1 }, label: 'Half deflection' }],
    readings: rng => {
      const G = pick(rng, [40, 60, 80, 100]), k = pick(rng, [20, 25, 30, 40]), E = read(rng, 2, 0.01, { abs: 0.02 });
      const rows = [30, 26, 22].map(theta => {
        const h = halfDeflection({ mode: 'half', G, k, E, theta, volts: 3, amps: 1 });
        const R = Math.round(h.R / 10) * 10, S = r(read(rng, (R * G) / (R + G), 1, { abs: 0.6 }), 0);
        return { theta, R, half: theta / 2, S, G: r((R * S) / (R - S), 1), k: r((E / ((R + (R * S) / (R - S)) * theta)) * 1e6, 2) };
      });
      const Gm = r(mean(rows.map(x => x.G)), 1), km = r(mean(rows.map(x => x.k)), 2);
      return numeric([`Cell emf E = ${E} V (voltmeter)`], [{ key: 'theta', label: 'θ', unit: 'div' }, { key: 'R', label: 'R', unit: 'Ω' }, { key: 'half', label: 'θ/2', unit: 'div' }, { key: 'S', label: 'S', unit: 'Ω' }, { key: 'G', label: 'G = RS/(R − S)', unit: 'Ω' }, { key: 'k', label: 'k = E/(R + G)θ', unit: 'μA/div' }], rows, ['G', 'k'], [
        { label: 'Resistance of the galvanometer', unit: 'Ω', value: Gm, tolerance: tol(Gm, 0.04, 1.5), working: `Mean of ${rows.map(x => x.G).join(', ')} = ${Gm} Ω.`, accepted: `${G} Ω` },
        { label: 'Figure of merit', unit: 'μA/div', value: km, tolerance: tol(km, 0.04, 0.5), working: `Mean k = ${km} μA per division.`, accepted: `${k} μA/div` },
      ]);
    },
    viva: [
      { q: 'What is the figure of merit of a galvanometer?', a: 'The current that gives a deflection of one division.', source: 'authored' },
      { q: 'Why is G ≈ S when R is very large?', a: 'The shunt hardly changes the total current, so half the current flows in each: then S = G.', source: 'authored' },
    ],
    conclusion: 'The resistance and the figure of merit of the galvanometer are as found.',
  },
  {
    ...base, id: id('e', 5), no: 5, part: 'experiment', kind: 'numeric', orWith: id('e', 5, 'b'),
    official: 'To convert the given galvanometer (of known resistance and figure of merit) into a voltmeter of desired range and to verify the same.',
    title: 'Galvanometer into a voltmeter',
    chapter: 'Moving Charges and Magnetism', topic: MCG,
    aim: 'To convert a galvanometer of known resistance and figure of merit into a voltmeter of a chosen range, and check it.',
    apparatus: ['Galvanometer (known G and k)', 'High resistance box', 'Standard voltmeter', 'Battery, rheostat and key'],
    procedure: [
      'Work out I_g = kN and the series resistance R = V₀/I_g − G for the range V₀.',
      'Take out R from the box in series with the galvanometer: this is the converted voltmeter.',
      'Connect it in parallel with the standard voltmeter across part of a potential divider; compare readings at several settings.',
    ],
    precautions: ['Take out R from the box before connecting.', 'The converted meter reads V₀ × (divisions / 30).'],
    setups: [{ engine: 'galvanometer', params: { mode: 'volt', G: 60, k: 25, E: 2, theta: 30, volts: 3, amps: 1 }, label: 'Into a voltmeter' }],
    readings: rng => {
      const G = pick(rng, [50, 60, 80, 100]), k = pick(rng, [20, 25, 30]), V0 = pick(rng, [2, 3, 5]);
      const p = { mode: 'volt', G, k, E: 2, theta: 30, volts: V0, amps: 1 }, R = r(seriesFor(p), 0);
      const rows = [0.25, 0.5, 0.75, 1].map(f => { const V = f * V0; const div = Math.round(read(rng, (f * SCALE_DIV), 1, { abs: 0.4 })); const conv = r((div / SCALE_DIV) * V0, 2); return { std: read(rng, V, 0.05, { abs: 0.02 }), div, conv, diff: 0 }; }).map(x => ({ ...x, diff: r(x.conv - (x.std as number), 2) }));
      return numeric([`G = ${G} Ω, figure of merit ${k} μA/div, ${SCALE_DIV} divisions: I_g = ${r(ig(p) * 1000, 2)} mA`], [{ key: 'std', label: 'Standard voltmeter', unit: 'V' }, { key: 'div', label: 'Galvanometer divisions' }, { key: 'conv', label: 'Converted reading', unit: 'V' }, { key: 'diff', label: 'Difference', unit: 'V' }], rows, ['conv', 'diff'], [
        { label: 'Series resistance needed', unit: 'Ω', value: R, tolerance: tol(R, 0.01, 5), working: `R = V₀/I_g − G = ${V0}/${r(ig(p), 6)} − ${G} = ${R} Ω.`, accepted: `${R} Ω` },
      ]);
    },
    viva: [{ q: 'Why must a voltmeter have a high resistance?', a: 'It is connected in parallel and must draw almost no current, or it would change the voltage it measures.', source: 'authored' }, { q: 'Why is the resistance put in series and not in parallel?', a: 'In series it limits the current to the galvanometer\'s full-scale current at the full voltage of the range.', source: 'authored' }, { q: 'How is the converted voltmeter checked?', a: 'Against a standard voltmeter connected in parallel with it: both should read the same at every point.', source: 'authored' }],
    conclusion: 'With the calculated high resistance in series, the galvanometer reads voltages that agree with the standard voltmeter.',
  },
  {
    ...base, id: id('e', 5, 'b'), no: 5, part: 'experiment', kind: 'numeric', orWith: id('e', 5),
    official: 'To convert the given galvanometer (of known resistance and figure of merit) into an ammeter of desired range and to verify the same.',
    title: 'Galvanometer into an ammeter',
    chapter: 'Moving Charges and Magnetism', topic: MCG,
    aim: 'To convert a galvanometer of known resistance and figure of merit into an ammeter of a chosen range, and check it.',
    apparatus: ['Galvanometer (known G and k)', 'Shunt wire (or a low resistance box)', 'Standard ammeter', 'Battery, rheostat and key', 'Screw gauge and metre scale'],
    procedure: [
      'Work out I_g = kN and the shunt S = I_g G/(I₀ − I_g).',
      'Cut a length of shunt wire of resistance S (from its resistance per cm) and join it across the galvanometer.',
      'Put the converted ammeter in series with a standard ammeter and compare readings at several currents.',
    ],
    precautions: ['Join the shunt with thick, short leads.', 'Start with a high rheostat resistance.'],
    setups: [{ engine: 'galvanometer', params: { mode: 'amm', G: 60, k: 25, E: 2, theta: 30, volts: 3, amps: 1 }, label: 'Into an ammeter' }],
    readings: rng => {
      const G = pick(rng, [50, 60, 80, 100]), k = pick(rng, [20, 25, 30]), I0 = pick(rng, [0.5, 1, 1.5]);
      const p = { mode: 'amm', G, k, E: 2, theta: 30, volts: 3, amps: I0 }, S = r(shuntFor(p), 4);
      const rows = [0.25, 0.5, 0.75, 1].map(f => { const div = Math.round(read(rng, f * SCALE_DIV, 1, { abs: 0.4 })); return { std: read(rng, f * I0, 0.01, { abs: 0.01 }), div, conv: r((div / SCALE_DIV) * I0, 2) }; });
      return numeric([`G = ${G} Ω, figure of merit ${k} μA/div: I_g = ${r(ig(p) * 1000, 2)} mA; range wanted 0-${I0} A`], [{ key: 'std', label: 'Standard ammeter', unit: 'A' }, { key: 'div', label: 'Galvanometer divisions' }, { key: 'conv', label: 'Converted reading', unit: 'A' }], rows, ['conv'], [
        { label: 'Shunt resistance needed', unit: 'Ω', value: S, tolerance: tol(S, 0.01, 0.0005), working: `S = I_g G/(I₀ − I_g) = ${r(ig(p), 6)} × ${G}/(${I0} − ${r(ig(p), 6)}) = ${S} Ω.`, accepted: `${S} Ω` },
      ]);
    },
    viva: [{ q: 'Why must an ammeter have a low resistance?', a: 'It goes in series and must not reduce the current it measures.', source: 'authored' }, { q: 'Why is the shunt put in parallel?', a: 'So most of the current bypasses the galvanometer, which carries only its full-scale current at the full range.', source: 'authored' }, { q: 'What is the resistance of the converted ammeter?', a: 'The galvanometer and shunt in parallel: GS/(G + S), smaller than the shunt itself.', source: 'authored' }],
    conclusion: 'With the calculated shunt, the galvanometer reads currents that agree with the standard ammeter.',
  },
  {
    ...base, id: id('e', 6), no: 6, part: 'experiment', kind: 'numeric',
    official: 'To find the frequency of AC mains with a sonometer.',
    title: 'Frequency of the AC mains (sonometer)',
    chapter: 'Alternating Current', topic: 'Peak and RMS value of alternating current/voltage',
    aim: 'To find the frequency of the AC mains with a sonometer and an electromagnet.',
    apparatus: ['Sonometer with a soft iron wire', 'Electromagnet on a step-down transformer from the mains', 'Hanger and weights', 'Paper rider', 'Metre scale'],
    procedure: [
      'Put the electromagnet just above the middle of the iron wire and switch on.',
      'With a load on the hanger, move the bridges until the wire vibrates with the largest amplitude (the rider flies off). Note l.',
      'Repeat for several loads. The wire vibrates at 2ν, so ν = (1/4l)√(T/μ).',
    ],
    precautions: ['Use a step-down transformer: never connect the mains directly.', 'Keep the electromagnet close to but not touching the wire.'],
    setups: [{ engine: 'sonometer', params: { mode: 'mains', f: '320', M: 2, wire: 'thick' }, label: 'Wire driven by the mains' }],
    readings: rng => {
      const wire = 'thick', mu = WIRES[wire].mu;
      const rows = [1.5, 2, 2.5, 3].map(M => { const l = read(rng, lengthFor(2 * MAINS, M, wire), 0.1, { abs: 0.2 }); const nu = r((1 / (4 * l / 100)) * Math.sqrt((M * G) / mu), 1); return { M, T: r(M * G, 1), l, nu }; });
      const nu = r(mean(rows.map(x => x.nu)), 1);
      return numeric([`Iron wire, μ = ${r(mu * 1000, 3)} g/m`], [{ key: 'M', label: 'Load', unit: 'kg' }, { key: 'T', label: 'Tension', unit: 'N' }, { key: 'l', label: 'Resonant length', unit: 'cm' }, { key: 'nu', label: 'ν = (1/4l)√(T/μ)', unit: 'Hz' }], rows, ['nu'], [
        { label: 'Frequency of the mains', unit: 'Hz', value: nu, tolerance: tol(nu, 0.02, 0.6), working: `Mean of ${rows.map(x => x.nu).join(', ')} = ${nu} Hz.`, accepted: `${MAINS} Hz` },
      ]);
    },
    viva: [{ q: 'Why does the wire vibrate at twice the mains frequency?', a: 'The electromagnet attracts the iron wire whichever way the current flows, so it pulls twice in every cycle.', source: 'authored' }, { q: 'Why is a non-magnetic wire used with a permanent magnet instead?', a: 'With a permanent magnet the AC through the wire makes it vibrate at the mains frequency itself, not twice it.', source: 'authored' }, { q: 'How does the resonant length change if the tension is increased?', a: 'It increases: the frequency is (1/2l)√(T/m), so for the same frequency l rises as √T.', source: 'authored' }],
    conclusion: 'The frequency of the AC mains is about 50 Hz.',
  },
  // ── Section A activities ─────────────────────────────────────────────────
  {
    ...base, id: id('a', 1), no: 1, part: 'activity', kind: 'numeric',
    official: 'To measure the resistance and impedance of an inductor with or without iron core.',
    title: 'Resistance and impedance of an inductor',
    chapter: 'Alternating Current', topic: 'Reactance and impedance',
    aim: 'To measure the DC resistance and the AC impedance of a coil, with and without an iron core.',
    apparatus: ['Coil with a removable iron core', 'DC supply and step-down AC supply (50 Hz)', 'AC/DC ammeter and voltmeter (or a multimeter)'],
    procedure: ['On DC, read V and I: R = V/I.', 'On AC, read V and I: Z = V/I.', 'Push in the iron core and repeat both.'],
    precautions: ['Use low voltages.', 'Use the AC ranges for AC.'],
    setups: [{ engine: 'components', params: { mode: 'inductor', core: 'iron', bulbs: 2, heater: 'off', item: 'diode', fault: 'ammeter-parallel' }, label: 'Coil on AC and DC' }],
    readings: rng => {
      const V = 6;
      const rows = ['none', 'iron'].flatMap(core => [{ supply: 'DC', Z: COIL.R }, { supply: 'AC 50 Hz', Z: impedance(core).Z }].map(s => { const I = read(rng, V / s.Z, 0.001, { sd: 0.01 }); return { core: core === 'iron' ? 'Iron core' : 'No core', supply: s.supply, V, I, Z: r(V / I, 1) }; }));
      const zi = rows.find(x => x.core === 'Iron core' && x.supply !== 'DC')!.Z;
      return numeric([`${V} V supply`], [{ key: 'core', label: 'Core' }, { key: 'supply', label: 'Supply' }, { key: 'V', label: 'V', unit: 'V' }, { key: 'I', label: 'I', unit: 'A' }, { key: 'Z', label: 'V/I', unit: 'Ω' }], rows, ['Z'], [
        { label: 'AC impedance with the iron core', unit: 'Ω', value: zi as number, tolerance: tol(zi as number, 0.03, 2), working: `Z = V/I = ${zi} Ω; the DC resistance stays about ${COIL.R} Ω.`, accepted: `${r(impedance('iron').Z, 0)} Ω` },
      ]);
    },
    viva: [{ q: 'Why does the iron core raise the impedance but not the resistance?', a: 'It multiplies the inductance, and so the reactance 2πfL; the copper wire\'s resistance is unchanged.', source: 'authored' }, { q: 'What is the impedance of a coil of resistance R and inductance L?', a: 'Z = √(R² + (2πfL)²).', source: 'authored' }, { q: 'Why is the coil not connected to DC for long at high voltage?', a: 'On DC only the small resistance limits the current, so it would be large and heat the coil.', source: 'authored' }],
    conclusion: 'The DC resistance is the same with or without the core; the AC impedance is larger and rises sharply with the iron core.',
  },
  {
    ...base, id: id('a', 2), no: 2, part: 'activity', kind: 'observation',
    official: 'To measure resistance, voltage (AC/DC), current (AC) and check continuity of a given circuit using multimeter.',
    title: 'Using a multimeter',
    chapter: CURRENT, topic: "Ohm's law; V-I characteristics (linear and non-linear)",
    aim: 'To use a multimeter to measure resistance, AC and DC voltage and AC current, and to check continuity.',
    apparatus: ['Multimeter', 'Resistors', 'Cell and step-down AC supply', 'A circuit with a lamp', 'Connecting wires'],
    procedure: ['Set the selector to Ω and read each resistor.', 'Set DCV and read the cell; ACV for the AC supply (in parallel).', 'Set ACA and put the meter in series with the lamp.', 'Use the continuity (beep) range across each wire of the circuit.'],
    precautions: ['Choose the function and range before connecting.', 'Never measure resistance in a live circuit.', 'Start on the highest range when unsure.'],
    setups: [{ engine: 'components', params: { mode: 'faulty', core: 'none', bulbs: 2, heater: 'off', item: 'resistor', fault: 'ammeter-parallel' }, label: 'Meters in a circuit' }],
    readings: rng => {
      const res = pick(rng, [47, 100, 220, 470]), cell = read(rng, 1.5, 0.01, { abs: 0.03 }), ac = read(rng, 12, 0.1, { abs: 0.2 });
      return observation([], [{ key: 'measure', label: 'Measuring' }, { key: 'setting', label: 'Selector setting' }, { key: 'how', label: 'Connected' }, { key: 'reading', label: 'Reading' }], [
        { measure: 'A resistor', setting: 'Ω', how: 'Across it, out of the circuit', reading: `${read(rng, res, 1, { sd: 0.02 })} Ω` },
        { measure: 'A cell', setting: 'DCV (2 V or 20 V)', how: 'In parallel, red lead to +', reading: `${cell} V` },
        { measure: 'Step-down AC', setting: 'ACV (20 V)', how: 'In parallel', reading: `${ac} V` },
        { measure: 'Current in the lamp', setting: 'ACA', how: 'In series', reading: `${read(rng, 0.25, 0.01, { abs: 0.01 })} A` },
        { measure: 'A connecting wire', setting: 'Continuity (beep)', how: 'Across its ends', reading: 'Beeps: unbroken' },
      ], ['setting', 'how']);
    },
    viva: [{ q: 'Why must the circuit be switched off when measuring resistance?', a: 'The ohmmeter uses its own battery; an outside voltage gives a wrong reading and can damage the meter.', source: 'authored' }, { q: 'Why should the highest range be chosen first?', a: 'So a larger-than-expected voltage or current does not overload the meter; then step down for a precise reading.', source: 'authored' }, { q: 'How is a multimeter connected to measure current?', a: 'In series, so the current flows through it, on the current (A) function.', source: 'authored' }],
    conclusion: 'A multimeter measures resistance, AC and DC voltage and current, and checks continuity, with the right function, range and connection.',
  },
  {
    ...base, id: id('a', 3), no: 3, part: 'activity', kind: 'observation',
    official: 'To assemble a household circuit comprising three bulbs, three (on/off) switches, a fuse and a power source.',
    title: 'A household circuit',
    chapter: CURRENT, topic: 'Electrical energy and power; resistivity and conductivity; temperature dependence of resistance',
    aim: 'To wire three lamps with their own switches, a fuse and a supply, as in a house.',
    apparatus: ['Three lamps with holders', 'Three switches', 'Fuse', 'Low-voltage AC supply (as the mains)', 'Board and wires'],
    procedure: ['Put the fuse in the live wire from the supply.', 'Connect each lamp with its switch in the live side, all three in parallel across live and neutral.', 'Switch the lamps on and off in turn.'],
    precautions: ['Work with a low-voltage supply only.', 'Switches and fuse always go in the live wire.'],
    setups: [{ engine: 'components', params: { mode: 'household', core: 'none', bulbs: 3, heater: 'off', item: 'diode', fault: 'ammeter-parallel' }, label: 'Three lamps in parallel' }],
    readings: rng => {
      const order = shuffled(rng, [1, 2, 3]);
      const rows = [0, 1, 2, 3].map(n => { const h = household({ bulbs: n, heater: 'off' }); return { on: n === 0 ? 'None' : order.slice(0, n).map(i => `S${i}`).join(', '), lit: n === 0 ? 'None' : order.slice(0, n).map(i => `L${i}`).join(', '), I: `${r(h.I, 2)} A` }; });
      return observation([`${LAMP_W} W lamps on ${MAINS_V} V`], [{ key: 'on', label: 'Switches on' }, { key: 'lit', label: 'Lamps lit' }, { key: 'I', label: 'Current in the fuse' }], rows, ['lit', 'I']);
    },
    viva: [{ q: 'Why are household lamps in parallel?', a: 'Each gets the full mains voltage and can be switched on its own; one failing does not put out the others.', source: 'authored' }, { q: 'Why are the switch and the fuse placed in the live wire?', a: 'So that when it is off or blown, the lamp is disconnected from the high voltage, and touching it is safe.', source: 'authored' }],
    conclusion: 'Each lamp, on its own switch in parallel, works independently; the fuse current is the sum of the lamp currents.',
  },
  {
    ...base, id: id('a', 4), no: 4, part: 'activity', kind: 'observation',
    official: 'To assemble the components of a given electrical circuit.',
    title: 'Assembling a circuit',
    chapter: CURRENT, topic: "Ohm's law; V-I characteristics (linear and non-linear)",
    aim: 'To assemble a circuit of a battery, key, rheostat, resistor, ammeter and voltmeter from its diagram.',
    apparatus: ['Battery', 'Plug key', 'Rheostat', 'Resistor', 'Ammeter', 'Voltmeter', 'Connecting wires'],
    procedure: ['Follow the diagram from the + terminal of the battery round to the − terminal.', 'Connect the voltmeter last, across the resistor.', 'Check every connection and polarity before closing the key.'],
    precautions: ['Clean the ends of the connecting wires.', 'Tighten the terminals.'],
    setups: [{ engine: 'components', params: { mode: 'faulty', core: 'none', bulbs: 2, heater: 'off', item: 'resistor', fault: 'key-missing' }, label: 'The circuit, assembled' }],
    readings: rng => observation([], [{ key: 'part', label: 'Component' }, { key: 'how', label: 'How it is connected' }], shuffled(rng, [
      { part: 'Ammeter', how: 'In series, + towards the battery +' },
      { part: 'Voltmeter', how: 'In parallel across the resistor' },
      { part: 'Rheostat', how: 'In series, to change the current' },
      { part: 'Plug key', how: 'In series with the battery' },
      { part: 'Resistor', how: 'In series in the main circuit' },
    ]), ['how']),
    viva: [{ q: 'Why is the voltmeter connected last?', a: 'The main series loop is built first; the voltmeter is then added across the part whose voltage is wanted.', source: 'authored' }, { q: 'Why must the + terminal of the ammeter face the + terminal of the battery?', a: 'Current must enter the meter at its + terminal, or the needle deflects the wrong way.', source: 'authored' }, { q: 'What does the rheostat do in the circuit?', a: 'It changes the resistance in series, and so the current.', source: 'authored' }],
    conclusion: 'The circuit is assembled with the ammeter, rheostat, key and resistor in series and the voltmeter in parallel.',
  },
  {
    ...base, id: id('a', 5), no: 5, part: 'activity', kind: 'numeric',
    official: 'To study the variation in potential drop with length of a wire for a steady current.',
    title: 'Potential drop along a wire',
    chapter: CURRENT, topic: WB,
    aim: 'To study how the potential drop along a uniform wire depends on its length, for a steady current.',
    apparatus: ['Uniform wire on a metre scale (potentiometer wire)', 'Battery, rheostat, ammeter and key', 'Voltmeter', 'Jockey'],
    procedure: ['Pass a steady current through the wire.', 'Connect the voltmeter from one end of the wire to the jockey.', 'Read the voltage at 10 cm steps.', 'Plot V against length.'],
    precautions: ['Keep the current steady (check the ammeter).', 'Press the jockey gently.'],
    setups: [{ engine: 'wire', params: { mode: 'drop', material: 'manganin', L: 100, d: 0.3, I: 0.4 }, label: 'Potential along the wire' }],
    readings: rng => {
      const I = pick(rng, [0.2, 0.3, 0.4]), material = 'manganin', d = pick(rng, [0.25, 0.3]), R = resistanceOf({ material, L: 100, d }).R;
      const rows = [20, 40, 60, 80, 100].map(l => ({ l, V: read(rng, (I * R * l) / 100, 0.01, { abs: 0.008 }) }));
      const k = r(mean(rows.map(x => (x.V as number) / x.l)) * 100, 3);
      return numeric([`Steady current ${I} A`], [{ key: 'l', label: 'Length', unit: 'cm' }, { key: 'V', label: 'Potential drop', unit: 'V' }], rows, [], [
        { label: 'Potential gradient', unit: 'V/m', value: k, tolerance: tol(k, 0.03, 0.01), working: `Mean V/l = ${k} V/m.`, accepted: `${r(I * R, 3)} V/m` },
      ]);
    },
    viva: [{ q: 'Why is the drop proportional to length?', a: 'With a steady current the wire is uniform, so each cm has the same resistance and the same drop IR.', source: 'authored' }, { q: 'What would happen to the graph if the current were doubled?', a: 'Still a straight line through the origin, with twice the slope (potential gradient).', source: 'authored' }, { q: 'Why must the wire be uniform?', a: 'Only then is the resistance per cm, and so the drop per cm, the same all along it.', source: 'authored' }],
    conclusion: 'The potential drop is proportional to the length of the wire: a constant potential gradient.',
  },
  {
    ...base, id: id('a', 6), no: 6, part: 'activity', kind: 'observation',
    official: 'To draw the diagram of a given open circuit comprising at least a battery, resistor/rheostat, key, ammeter and voltmeter. Mark the components that are not connected in proper order and correct the circuit and also the circuit diagram.',
    title: 'Correcting a wrongly connected circuit',
    chapter: CURRENT, topic: "Ohm's law; V-I characteristics (linear and non-linear)",
    aim: 'To draw the diagram of a given open circuit, find the components connected wrongly, and correct them.',
    apparatus: ['A given open circuit: battery, rheostat, resistor, key, ammeter, voltmeter'],
    procedure: ['Draw the circuit exactly as it is connected.', 'Mark each mistake on the diagram.', 'Draw the corrected diagram and correct the circuit.'],
    precautions: ['Trace every wire from end to end before drawing.'],
    setups: [{ engine: 'components', params: { mode: 'faulty', core: 'none', bulbs: 2, heater: 'off', item: 'resistor', fault: 'voltmeter-series' }, label: 'A faulty circuit' }],
    readings: rng => {
      const faults = shuffled(rng, Object.keys(FAULTS)).slice(0, 3);
      return observation(['Each sheet has three faults'], [{ key: 'fault', label: 'Fault found' }, { key: 'fix', label: 'Correction' }], faults.map(f => ({ fault: FAULTS[f].label, fix: FAULTS[f].fix })), ['fix']);
    },
    viva: [{ q: 'What happens if an ammeter is connected in parallel with a resistor?', a: 'Its very low resistance short-circuits the resistor; a large current may damage the ammeter.', source: 'authored' }, { q: 'What happens if a voltmeter is connected in series?', a: 'Its very high resistance cuts the current almost to zero; it reads nearly the battery voltage.', source: 'authored' }, { q: 'Why must the key be in the battery circuit?', a: 'So the current can be switched off between readings, keeping the wires and battery from heating up.', source: 'authored' }],
    conclusion: 'An ammeter goes in series, a voltmeter in parallel, meters + to +, and a key in the battery circuit.',
  },
];

