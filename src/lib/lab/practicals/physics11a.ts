import { intIn, pick, read, shuffled, toLeastCount, type Rng } from '../noise';
import { LEG, radiusFrom, sagitta, scaleReading, SCREW_LC, VERNIER_LC } from '../engines/instruments';
import { weightsFor } from '../engines/balance';
import { resultant, solveVectors } from '../engines/vectors';
import { G, periodPendulum, SECONDS_L, tauOf } from '../engines/shm';
import { downForce, KEEP, limitingFriction, rollingPull, SURFACES } from '../engines/friction';
import { rangeAt } from '../engines/projectile';
import { mean, numeric, observation, r, tol } from './helpers';
import type { Practical } from './types';

/**
 * CBSE Class XI Physics (042) practicals, 2026-27, Section A: experiments 1-10
 * and activities 1-7 (Physics_SecP2_2026-27.pdf, cbseacademic.nic.in). Official
 * wording kept as printed.
 */

const base = { cls: 11 as const, subject: 'Physics' as const, section: 'A' as const };
const id = (part: 'e' | 'a', no: number) => `p11-a${part}${String(no).padStart(2, '0')}`;
const MEASURE = 'Units and Measurements';

/** One vernier or screw gauge reading of a true size, with the instrument's zero error, as the student records it. */
function gaugeRow(rng: Rng, truth: number, kind: 'vernier' | 'screw', zero: number) {
  const lc = kind === 'vernier' ? VERNIER_LC : SCREW_LC, ze = zero * lc;
  const observed = read(rng, truth + ze, lc, { abs: lc * 0.8 });
  const s = scaleReading(observed, lc, kind === 'vernier' ? 0.1 : 1, kind === 'vernier' ? 10 : 100, ze, kind === 'vernier' ? 'cm' : 'mm');
  return { main: kind === 'vernier' ? r(s.main, 1) : r(s.main, 0), div: s.div, observed: r(s.observed, 2), corrected: r(s.corrected, 2) };
}
const gaugeCols = (unit: string, mainLabel: string, divLabel: string) => [
  { key: 'obj', label: 'Measurement' }, { key: 'trial', label: 'Trial' }, { key: 'main', label: mainLabel, unit }, { key: 'div', label: divLabel },
  { key: 'observed', label: 'Observed', unit }, { key: 'corrected', label: 'Corrected', unit },
];

export const PHYSICS11_A: Practical[] = [
  {
    ...base, id: id('e', 1), no: 1, part: 'experiment', kind: 'numeric',
    official: 'To measure diameter of a small spherical/cylindrical body and to measure internal diameter and depth of a given beaker/calorimeter using Vernier Callipers and hence find its volume.',
    title: 'Vernier callipers: diameter, and the volume of a beaker',
    chapter: MEASURE, topic: 'Determining the uncertainty in a result',
    aim: 'To measure the diameter of a small sphere, and the internal diameter and depth of a beaker, with Vernier callipers, and find the beaker\'s volume.',
    apparatus: ['Vernier callipers', 'A small spherical bob', 'A beaker or calorimeter', 'Magnifying glass'],
    procedure: [
      'Find the least count: 10 vernier divisions = 9 main scale divisions, so LC = 1 MSD − 1 VSD = 0.01 cm.',
      'Close the jaws and note the zero error, with its sign.',
      'Hold the sphere between the outside jaws, gently. Read the main scale just before the vernier zero and the vernier division that coincides.',
      'Repeat at different positions on the sphere (three readings).',
      'Use the inside jaws for the internal diameter of the beaker and the depth strip for its depth, three readings each.',
      'Correct every reading for the zero error, take the means, and work out V = π(d/2)²h.',
    ],
    precautions: ['Hold the object gently between the jaws: do not press.', 'Read with the eye straight above the coinciding division.', 'Take readings at different places and average them.', 'Apply the zero correction with its sign.'],
    setups: [{ engine: 'instruments', params: { tool: 'vernier', len: 2.14, dia: 0.62, radius: 40, zero: 3 }, label: 'Vernier with a +3 zero error' }],
    readings: rng => {
      const zero = pick(rng, [-4, -3, -2, 2, 3, 4]);
      const D = r(1.6 + rng() * 0.8, 2), d = r(4.6 + rng() * 1.2, 2), h = r(5.4 + rng() * 1.4, 2);
      const rows = [
        ...[1, 2, 3].map(t => ({ obj: 'Sphere: diameter', trial: t, ...gaugeRow(rng, D, 'vernier', zero) })),
        ...[1, 2, 3].map(t => ({ obj: 'Beaker: internal diameter', trial: t, ...gaugeRow(rng, d, 'vernier', zero) })),
        ...[1, 2, 3].map(t => ({ obj: 'Beaker: depth', trial: t, ...gaugeRow(rng, h, 'vernier', zero) })),
      ];
      const m = (o: string) => r(mean(rows.filter(x => x.obj === o).map(x => x.corrected)), 2);
      const Dm = m('Sphere: diameter'), dm = m('Beaker: internal diameter'), hm = m('Beaker: depth');
      const V = r(Math.PI * (dm / 2) ** 2 * hm, 1);
      return numeric([`Least count 0.01 cm; zero error ${zero > 0 ? '+' : ''}${zero} divisions = ${r(zero * VERNIER_LC, 2)} cm`], gaugeCols('cm', 'Main scale', 'Vernier division'), rows, ['observed', 'corrected'], [
        { label: 'Diameter of the sphere', unit: 'cm', value: Dm, tolerance: 0.02, working: `Mean corrected diameter = ${Dm} cm.`, accepted: `${D} cm` },
        { label: 'Internal volume of the beaker', unit: 'cm³', value: V, tolerance: tol(V, 0.02, 1), working: `V = π(d/2)²h = π × (${dm}/2)² × ${hm} = ${V} cm³.`, accepted: `${r(Math.PI * (d / 2) ** 2 * h, 1)} cm³` },
      ]);
    },
    viva: [
      { q: 'What is the least count of Vernier callipers?', a: 'The smallest length it can measure: 1 MSD − 1 VSD, usually 0.01 cm.', source: 'authored' },
      { q: 'What is a negative zero error?', a: 'With the jaws closed the vernier zero lies to the left of the main scale zero; the correction is added.', source: 'authored' },
      { q: 'Why are readings taken at different places?', a: 'The object may not be perfectly round or even; averaging reduces the random error.', source: 'authored' },
    ],
    photos: ['vernier'],
    conclusion: 'The diameter of the sphere and the internal volume of the beaker are as found; the zero correction was applied to every reading.',
  },
  {
    ...base, id: id('e', 2), no: 2, part: 'experiment', kind: 'numeric',
    official: 'To measure diameter of a given wire and thickness of a given sheet using screw gauge.',
    title: 'Screw gauge: diameter of a wire, thickness of a sheet',
    chapter: MEASURE, topic: 'Determining the uncertainty in a result',
    aim: 'To measure the diameter of a wire and the thickness of a sheet with a screw gauge.',
    apparatus: ['Screw gauge', 'A wire', 'A thin metal sheet'],
    procedure: [
      'Find the pitch (distance moved in one rotation) and the least count = pitch / number of circular divisions.',
      'Close the gauge with the ratchet and note the zero error.',
      'Place the wire between the anvil and spindle; turn the ratchet until it clicks. Read the pitch scale and the circular scale.',
      'Turn the wire through 90° and read again; repeat at five places along the wire.',
      'Do the same for the sheet at three places.',
      'Correct each reading for the zero error and take the means.',
    ],
    precautions: ['Always use the ratchet, so the wire is not pressed.', 'Measure in two perpendicular directions at each place.', 'Allow for backlash: always turn the screw the same way before reading.'],
    setups: [{ engine: 'instruments', params: { tool: 'screw', len: 2.47, dia: 0.62, radius: 40, zero: -2 }, label: 'Screw gauge, wire with a −2 zero error' }],
    readings: rng => {
      const zero = pick(rng, [-3, -2, 2, 3, 4]);
      const dw = r(0.35 + rng() * 0.6, 2), ts = r(0.8 + rng() * 1.2, 2);
      const rows = [
        ...[1, 2, 3, 4, 5].map(t => ({ obj: 'Wire: diameter', trial: t, ...gaugeRow(rng, dw, 'screw', zero) })),
        ...[1, 2, 3].map(t => ({ obj: 'Sheet: thickness', trial: t, ...gaugeRow(rng, ts, 'screw', zero) })),
      ];
      const m = (o: string) => r(mean(rows.filter(x => x.obj === o).map(x => x.corrected)), 3);
      const a = m('Wire: diameter'), b = m('Sheet: thickness');
      return numeric([`Pitch 1 mm, 100 circular divisions: LC 0.01 mm; zero error ${zero > 0 ? '+' : ''}${zero} divisions = ${r(zero * SCREW_LC, 2)} mm`], gaugeCols('mm', 'Pitch scale', 'Circular scale'), rows, ['observed', 'corrected'], [
        { label: 'Diameter of the wire', unit: 'mm', value: a, tolerance: 0.01, working: `Mean of the corrected readings = ${a} mm.`, accepted: `${dw} mm` },
        { label: 'Thickness of the sheet', unit: 'mm', value: b, tolerance: 0.01, working: `Mean of the corrected readings = ${b} mm.`, accepted: `${ts} mm` },
      ]);
    },
    viva: [
      { q: 'What is the pitch of a screw gauge?', a: 'The distance the spindle moves forward in one complete rotation of the circular scale.', source: 'authored' },
      { q: 'What is backlash error?', a: 'A lag when the direction of rotation is reversed, due to wear between the screw and nut; avoided by always turning one way.', source: 'authored' },
      { q: 'Why is the ratchet used?', a: 'It slips once the spindle touches the object, so every reading is taken with the same gentle pressure.', source: 'authored' },
    ],
    photos: ['screw-gauge'],
    conclusion: 'The diameter of the wire and the thickness of the sheet are as found, to the least count of 0.01 mm.',
  },
  {
    ...base, id: id('e', 3), no: 3, part: 'experiment', kind: 'numeric',
    official: 'To determine volume of an irregular lamina using screw gauge.',
    title: 'Volume of an irregular lamina',
    chapter: MEASURE, topic: 'Determining the uncertainty in a result',
    aim: 'To find the volume of an irregular lamina from its thickness (screw gauge) and its area (graph paper).',
    apparatus: ['Screw gauge', 'An irregular lamina (thin sheet)', 'Graph paper (mm squares)', 'Sharp pencil'],
    procedure: [
      'Measure the thickness of the lamina with the screw gauge at five places, correcting for the zero error.',
      'Place the lamina on graph paper and trace its outline.',
      'Count the complete cm squares, then the mm squares inside the outline; count squares more than half inside as full and ignore those less than half.',
      'Area × mean thickness = volume.',
    ],
    precautions: ['Trace the outline with a sharp pencil held upright.', 'Measure the thickness at places spread over the lamina.', 'Use the ratchet for every screw gauge reading.'],
    setups: [{ engine: 'instruments', params: { tool: 'screw', len: 2.47, dia: 1.24, radius: 40, zero: 0 }, label: 'Thickness of the lamina' }],
    readings: rng => {
      const zero = pick(rng, [-2, 0, 2, 3]);
      const t = r(0.9 + rng() * 1.1, 2), area = r(28 + rng() * 30, 1);
      const rows = [1, 2, 3, 4, 5].map(k => ({ obj: 'Lamina: thickness', trial: k, ...gaugeRow(rng, t, 'screw', zero) }));
      const tm = r(mean(rows.map(x => x.corrected)), 3);
      const V = r((area * tm) / 10, 2);
      return numeric([`LC 0.01 mm; zero error ${zero > 0 ? '+' : ''}${zero} div`, `Area traced on graph paper: ${area} cm²`], gaugeCols('mm', 'Pitch scale', 'Circular scale'), rows, ['observed', 'corrected'], [
        { label: 'Volume of the lamina', unit: 'cm³', value: V, tolerance: tol(V, 0.02, 0.02), working: `V = area × thickness = ${area} cm² × ${tm} mm = ${area} × ${r(tm / 10, 4)} cm = ${V} cm³.`, accepted: `${r((area * t) / 10, 2)} cm³` },
      ]);
    },
    viva: [
      { q: 'How do you count the partly covered squares?', a: 'Squares more than half inside the outline count as full; those less than half are left out.', source: 'authored' },
      { q: 'Why measure the thickness at several places?', a: 'The sheet may not be perfectly uniform; the mean is closer to the true thickness.', source: 'authored' },
    ],
    conclusion: 'The volume of the lamina = area × mean thickness, as found.',
  },
  {
    ...base, id: id('e', 4), no: 4, part: 'experiment', kind: 'numeric',
    official: 'To determine radius of curvature of a given spherical surface by a spherometer.',
    title: 'Spherometer: radius of curvature',
    chapter: MEASURE, topic: 'Determining the uncertainty in a result',
    aim: 'To find the radius of curvature of a spherical surface with a spherometer.',
    apparatus: ['Spherometer', 'Convex surface (watch glass or lens)', 'Plane glass plate', 'Paper and pencil', 'Metre scale'],
    procedure: [
      'Find the pitch and least count of the spherometer.',
      'Press the legs on paper and measure the three distances between the marks; take the mean l.',
      'Set it on the plane glass and turn the screw until its tip just touches the glass; note the reading.',
      'Set it on the curved surface and turn until the tip just touches; note the reading.',
      'The difference is the sagitta h; R = l²/6h + h/2. Repeat three times.',
    ],
    precautions: ['Turn the screw slowly near contact and stop the moment the tip touches (its reflection just meets it).', 'Rotate the screw the same way each time (backlash).', 'Measure l from the leg marks on paper, not by eye.'],
    setups: [{ engine: 'instruments', params: { tool: 'spherometer', len: 2.47, dia: 0.62, radius: 40, zero: 0 }, label: 'Spherometer on a convex surface' }],
    readings: rng => {
      const R = intIn(rng, 20, 80), h = sagitta(R);
      const ls = [1, 2, 3].map(() => read(rng, LEG, 0.01, { abs: 0.015 }));
      const lm = r(mean(ls), 2);
      const rows = [1, 2, 3].map(t => {
        const plane = r(intIn(rng, 1, 4) + rng() * 0.6, 2), curved = r(plane + read(rng, h, 0.01, { abs: 0.008 }), 2);
        return { trial: t, plane, curved, h: r(curved - plane, 2) };
      });
      const hm = r(mean(rows.map(x => x.h)), 3);
      const Rc = r(((lm * 10) ** 2 / (6 * hm) + hm / 2) / 10, 1);
      return numeric([`Leg distances: ${ls.join(', ')} cm (mean l = ${lm} cm); LC 0.01 mm`], [{ key: 'trial', label: 'Trial' }, { key: 'plane', label: 'On the plane glass', unit: 'mm' }, { key: 'curved', label: 'On the curved surface', unit: 'mm' }, { key: 'h', label: 'h', unit: 'mm' }], rows, ['h'], [
        { label: 'Radius of curvature', unit: 'cm', value: Rc, tolerance: tol(Rc, 0.05, 0.5), working: `R = l²/6h + h/2 = (${r(lm * 10, 1)} mm)²/(6 × ${hm}) + ${hm}/2 = ${r(Rc * 10, 0)} mm = ${Rc} cm.`, accepted: `${R} cm` },
      ]);
    },
    viva: [
      { q: 'What is the sagitta?', a: 'The height of the curved surface above the plane of the three legs: the difference between the two readings.', source: 'authored' },
      { q: 'Why is the spherometer reading small for a large radius?', a: 'A flatter surface (large R) bulges less over the same leg distance: h ≈ l²/6R.', source: 'authored' },
      { q: 'How does a spherometer differ from a screw gauge?', a: 'Both use a screw and circular scale; the spherometer has three legs and measures small heights from a surface.', source: 'authored' },
    ],
    photos: ['spherometer'],
    conclusion: 'The radius of curvature of the surface is as found, from R = l²/6h + h/2.',
  },
  {
    ...base, id: id('e', 5), no: 5, part: 'experiment', kind: 'numeric',
    official: 'To determine the mass of two different objects using a beam balance.',
    title: 'Beam balance: mass of two objects',
    chapter: MEASURE, topic: 'Need for measurement: units of measurement, systems of units',
    aim: 'To find the masses of two objects with a beam balance.',
    apparatus: ['Beam balance', 'Weight box with forceps', 'Two objects'],
    procedure: [
      'Level the balance with its levelling screws and plumb line; check the pointer swings equally about the centre with the pans empty.',
      'Put the object on the left pan and weights on the right pan, heaviest first, using forceps.',
      'Raise the beam gently each time; add or remove weights until the pointer swings equally either side of zero.',
      'Add up the weights. Repeat for the second object.',
    ],
    precautions: ['Lift weights only with the forceps.', 'Lower the beam before changing weights.', 'Do not place hot or wet objects on the pan.', 'Close the balance case to keep out draughts.'],
    setups: [{ engine: 'balance', params: { mode: 'beam', m: 37.46, known: 100, d1: 30 }, label: 'Balancing an object' }],
    readings: rng => {
      const masses = [r(10 + rng() * 40, 2), r(50 + rng() * 80, 2)];
      const rows = masses.map((m, i) => ({ obj: `Object ${i + 1}`, weights: weightsFor(m).map(w => (w >= 1 ? `${w} g` : `${r(w * 1000, 0)} mg`)).join(' + '), total: r(weightsFor(m).reduce((s, x) => s + x, 0), 2) }));
      return numeric(['Weight box down to 10 mg'], [{ key: 'obj', label: 'Object' }, { key: 'weights', label: 'Weights in the right pan' }, { key: 'total', label: 'Mass', unit: 'g' }], rows, ['total'], rows.map(x => ({ label: `Mass of ${x.obj.toLowerCase()}`, unit: 'g', value: x.total as number, tolerance: 0.01, working: `${x.weights} = ${x.total} g.`, accepted: `${x.total} g` })));
    },
    viva: [
      { q: 'What does a beam balance actually compare?', a: 'Masses: equal arms balance equal weights, and since g is the same on both pans, equal masses.', source: 'authored' },
      { q: 'Why are weights handled with forceps?', a: 'Sweat and dirt from fingers change their mass and make them rust.', source: 'authored' },
    ],
    conclusion: 'The masses of the two objects are as found, to 10 mg.',
  },
  {
    ...base, id: id('e', 6), no: 6, part: 'experiment', kind: 'numeric',
    official: 'To find the weight of a given body using parallelogram law of vectors.',
    title: 'Parallelogram law: weight of a body',
    chapter: 'Laws of Motion', topic: 'Equilibrium of concurrent forces',
    aim: 'To find the weight of a body by the parallelogram law of vectors on Gravesand\'s apparatus.',
    apparatus: ['Gravesand\'s apparatus (vertical board with two pulleys)', 'Two weight hangers with slotted weights', 'The body (unknown weight)', 'Thread, drawing pins, white paper, mirror strip, protractor, set squares'],
    procedure: [
      'Fix white paper on the board. Hang P and Q over the pulleys and the body from the knot between them.',
      'When at rest, mark each thread on the paper with the mirror strip (two points per thread, avoiding parallax).',
      'Draw the three lines meeting at a point; on the P and Q lines mark lengths to a scale (say 1 cm = 25 g wt).',
      'Complete the parallelogram; its diagonal from the knot is the resultant R.',
      'The diagonal should be vertical; its length on the scale gives the weight of the body. Repeat with other P and Q.',
    ],
    precautions: ['The pulleys should turn freely (oil them).', 'The weights must not touch the board.', 'Mark the threads with the image of the thread hidden behind the thread itself in the mirror.'],
    setups: [{ engine: 'vectors', params: { P: 200, Q: 250, W: 350 }, label: 'P, Q and the body' }],
    readings: rng => {
      const W = pick(rng, [280, 300, 320, 340, 360]);
      const sets = [[150, 250], [200, 200], [250, 200]].map(([P, Q]) => {
        const s = solveVectors({ P, Q, W });
        const a = toLeastCount(read(rng, s.alpha, 0.5, { abs: 0.6 }), 0.5), b = toLeastCount(read(rng, s.beta, 0.5, { abs: 0.6 }), 0.5);
        return { P, Q, alpha: a, beta: b, R: r(resultant(P, Q, a + b), 0) };
      });
      const Wm = r(mean(sets.map(x => x.R)), 0);
      return numeric([`Body on the middle hanger; angles read with a protractor (0.5°)`], [{ key: 'P', label: 'P', unit: 'g wt' }, { key: 'Q', label: 'Q', unit: 'g wt' }, { key: 'alpha', label: 'α (P string)', unit: '°' }, { key: 'beta', label: 'β (Q string)', unit: '°' }, { key: 'R', label: 'Resultant R', unit: 'g wt' }], sets, ['R'], [
        { label: 'Weight of the body', unit: 'g wt', value: Wm, tolerance: tol(Wm, 0.03, 6), working: `R = √(P² + Q² + 2PQ cos(α + β)) for each set; mean ${Wm} g wt.`, accepted: `${W} g wt` },
      ]);
    },
    viva: [
      { q: 'State the parallelogram law of vectors.', a: 'If two vectors are represented by adjacent sides of a parallelogram from a point, their resultant is the diagonal from that point.', source: 'authored' },
      { q: 'Why should the diagonal be vertical?', a: 'It must balance the weight of the body, which acts vertically downward.', source: 'authored' },
    ],
    conclusion: 'The resultant of P and Q, by the parallelogram law, equals the weight of the body as found.',
  },
  {
    ...base, id: id('e', 7), no: 7, part: 'experiment', kind: 'numeric',
    official: 'Using a simple pendulum, plot its graph and use it to find the effective length of second\'s pendulum.',
    title: "Simple pendulum: L-T² graph and the second's pendulum",
    chapter: 'Oscillations', topic: 'Simple pendulum: derivation of the time period',
    aim: "To plot L against T² for a simple pendulum and find the effective length of the second's pendulum.",
    apparatus: ['Clamp stand with split cork', 'A heavy spherical bob and thread', 'Stop watch (0.1 s)', 'Metre scale', 'Vernier callipers (bob diameter)'],
    procedure: [
      'Measure the bob\'s diameter; effective length L = thread length (from the split cork) + radius of the bob.',
      'Set L = 50 cm. Displace the bob by a small angle (under 10°) and release.',
      'Time 20 oscillations twice; find T = t/20 and T².',
      'Repeat for L = 60, 70, 80, 90, 100 and 110 cm.',
      'Plot L against T²; read off L at T² = 4 s²: the second\'s pendulum.',
    ],
    precautions: ['Keep the amplitude small.', 'Start the watch as the bob passes its mean position.', 'The thread should be light and inextensible, and the bob should swing in one plane.'],
    setups: [{ engine: 'shm', params: { mode: 'pendulum', L: 80, m: 100, k: 20 }, label: 'Pendulum and the L-T² graph' }],
    readings: rng => {
      const rows = [50, 60, 70, 80, 90, 100, 110].map(L => {
        const t1 = read(rng, 20 * periodPendulum(L), 0.1, { abs: 0.12 }), t2 = read(rng, 20 * periodPendulum(L), 0.1, { abs: 0.12 });
        const T = r((t1 + t2) / 40, 3);
        return { L, t1, t2, T, T2: r(T * T, 3), ratio: r(L / (T * T), 1) };
      });
      const k = mean(rows.map(x => x.L / x.T2));
      const Ls = r(4 * k, 1);
      return numeric(['Effective length L = thread + radius of the bob'], [{ key: 'L', label: 'L', unit: 'cm' }, { key: 't1', label: 't (20 osc.) 1', unit: 's' }, { key: 't2', label: 't (20 osc.) 2', unit: 's' }, { key: 'T', label: 'T', unit: 's' }, { key: 'T2', label: 'T²', unit: 's²' }, { key: 'ratio', label: 'L/T²', unit: 'cm/s²' }], rows, ['T', 'T2', 'ratio'], [
        { label: "Length of the second's pendulum", unit: 'cm', value: Ls, tolerance: tol(Ls, 0.015, 1), working: `From the graph (or the mean L/T² = ${r(k, 2)} cm/s²), at T² = 4 s²: L = ${Ls} cm.`, accepted: `${r(SECONDS_L, 1)} cm` },
      ]);
    },
    viva: [
      { q: "What is a second's pendulum?", a: 'A pendulum whose period is 2 s (each swing takes 1 s); its length is about 99.3 cm on the earth.', source: 'authored' },
      { q: 'Why must the amplitude be small?', a: 'T = 2π√(L/g) holds only for small swings, where sin θ ≈ θ.', source: 'authored' },
      { q: 'Why time 20 oscillations rather than one?', a: 'The reaction-time error is shared over 20 oscillations, so the period is more accurate.', source: 'authored' },
    ],
    conclusion: "L against T² is a straight line through the origin; the second's pendulum is about 99 cm long.",
  },
  {
    ...base, id: id('e', 8), no: 8, part: 'experiment', kind: 'numeric',
    official: 'To study variation of time period of a simple pendulum of a given length by taking bobs of same size but different masses and interpret the result.',
    title: 'Pendulum: bobs of different mass',
    chapter: 'Oscillations', topic: 'Simple pendulum: derivation of the time period',
    aim: 'To show that the period of a simple pendulum of fixed length does not depend on the mass of the bob.',
    apparatus: ['Clamp stand and split cork', 'Three bobs of the same size (wood, aluminium, brass)', 'Thread', 'Stop watch', 'Metre scale'],
    procedure: [
      'Set the effective length to 100 cm with the first bob.',
      'Time 20 small oscillations twice and find T.',
      'Change the bob for one of the same size but different mass, keeping L the same, and repeat.',
      'Compare the periods.',
    ],
    precautions: ['Keep the effective length exactly the same for every bob.', 'Keep the amplitude small and the same.', 'Use bobs of the same size, so air resistance is similar.'],
    setups: [{ engine: 'shm', params: { mode: 'mass', L: 100, m: 100, k: 20 }, label: 'Same length, different bobs' }],
    readings: rng => {
      const L = pick(rng, [80, 90, 100]);
      const bobs = [{ bob: 'Wood', m: 20 }, { bob: 'Aluminium', m: 60 }, { bob: 'Brass', m: 180 }];
      const rows = bobs.map(b => { const t1 = read(rng, 20 * periodPendulum(L), 0.1, { abs: 0.12 }), t2 = read(rng, 20 * periodPendulum(L), 0.1, { abs: 0.12 }); return { bob: b.bob, m: b.m, t1, t2, T: r((t1 + t2) / 40, 3) }; });
      const Tm = r(mean(rows.map(x => x.T)), 3);
      return numeric([`Effective length ${L} cm for every bob`], [{ key: 'bob', label: 'Bob' }, { key: 'm', label: 'Mass', unit: 'g' }, { key: 't1', label: 't (20 osc.) 1', unit: 's' }, { key: 't2', label: 't (20 osc.) 2', unit: 's' }, { key: 'T', label: 'T', unit: 's' }], rows, ['T'], [
        { label: 'Period (the same for each bob)', unit: 's', value: Tm, tolerance: 0.02, working: `Periods ${rows.map(x => x.T).join(', ')} s agree within the timing error; mean ${Tm} s.`, accepted: `${r(periodPendulum(L), 3)} s` },
      ]);
    },
    viva: [
      { q: 'Why does the mass not affect the period?', a: 'A heavier bob has a larger restoring force but also more inertia in the same ratio; T = 2π√(L/g) has no mass in it.', source: 'authored' },
      { q: 'Why must the bobs be of the same size?', a: 'A different size changes the effective length (to the centre of the bob) and the air resistance.', source: 'authored' },
    ],
    conclusion: 'The period is the same for bobs of different mass: it does not depend on the mass of the bob.',
  },
  {
    ...base, id: id('e', 9), no: 9, part: 'experiment', kind: 'numeric',
    official: 'To study the relationship between force of limiting friction and normal reaction and to find the co- efficient of friction between a block and a horizontal surface.',
    title: 'Limiting friction and normal reaction',
    chapter: 'Laws of Motion', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    aim: 'To find how limiting friction depends on the normal reaction, and the coefficient of static friction between a block and a horizontal board.',
    apparatus: ['Horizontal board with a frictionless pulley', 'Wooden block with a hook', 'Pan and slotted weights', 'Thread', 'Spring balance', 'Spirit level'],
    procedure: [
      'Level the board. Weigh the block and the pan.',
      'Tie the block to the pan over the pulley so the thread is horizontal.',
      'Add weights to the pan until the block just starts to slide when the board is tapped lightly.',
      'Limiting friction F = (pan + weights) g; normal reaction R = block (+ load) g.',
      'Put loads of 200, 400, 600 and 800 g on the block and repeat. Plot F against R.',
    ],
    precautions: ['The thread must be horizontal.', 'Clean the surfaces and keep them dry.', 'Add the last weights in small steps and tap gently.'],
    setups: [{ engine: 'friction', params: { mode: 'slide', m: 200, load: 200, surface: 'wood-wood', angle: 30 }, label: 'Block pulled by the pan' }],
    readings: rng => {
      const surface = pick(rng, Object.keys(SURFACES)), m = pick(rng, [150, 200, 250]);
      const rows = [0, 200, 400, 600, 800].map(load => {
        const s = limitingFriction({ mode: 'slide', m, load, surface, angle: 0 });
        const pan = read(rng, s.pull, 1, { sd: 0.02, abs: 1 });
        return { load, R: r(((m + load) / 1000) * G, 2), pan, F: r((pan / 1000) * G, 2), ratio: r(pan / (m + load), 3) };
      });
      const mu = r(mean(rows.map(x => x.ratio)), 2);
      return numeric([`Block ${m} g on ${SURFACES[surface].label.toLowerCase()}; pan + weights read to 1 g`], [{ key: 'load', label: 'Load on the block', unit: 'g' }, { key: 'R', label: 'Normal reaction R', unit: 'N' }, { key: 'pan', label: 'Pan + weights', unit: 'g' }, { key: 'F', label: 'Limiting friction F', unit: 'N' }, { key: 'ratio', label: 'F/R' }], rows, ['R', 'F', 'ratio'], [
        { label: 'Coefficient of static friction', unit: '', value: mu, tolerance: tol(mu, 0.06, 0.02), working: `Mean F/R (or the slope of F against R) = ${mu}.`, accepted: `${SURFACES[surface].mu}` },
      ]);
    },
    viva: [
      { q: 'What is limiting friction?', a: 'The largest static friction, just before the body starts to slide.', source: 'authored' },
      { q: 'Does μ depend on the area of contact?', a: 'No: for the same surfaces limiting friction depends only on the normal reaction.', source: 'authored' },
    ],
    conclusion: 'Limiting friction is proportional to the normal reaction; the F-R graph is a straight line through the origin whose slope is μₛ.',
  },
  {
    ...base, id: id('e', 10), no: 10, part: 'experiment', kind: 'numeric',
    official: 'To find the downward force, along an inclined plane, acting on a roller due to gravitational pull of the earth and study its relationship with the angle of inclination θ by plotting graph between force and Sinθ.',
    title: 'Roller on an inclined plane: F against sin θ',
    chapter: 'Motion in a Plane', topic: 'Unit vector; resolution of a vector in a plane, rectangular components',
    aim: 'To find the downward force along an inclined plane on a roller and study how it depends on sin θ.',
    apparatus: ['Inclined plane with a protractor and pulley', 'Roller (glass or metal) with a hook', 'Pan and slotted weights', 'Thread', 'Spring balance'],
    procedure: [
      'Weigh the roller (W = mg).',
      'Set the plane at 10°. Tie the roller to the pan over the pulley, the thread parallel to the plane.',
      'Adjust the weights until the roller stays at rest anywhere on the plane (no tendency to roll up or down).',
      'The pan + weights give the downward force F. Repeat at 20°, 30°, 40° and 50°.',
      'Plot F against sin θ.',
    ],
    precautions: ['Keep the thread parallel to the plane.', 'The pulley should be frictionless.', 'Read the angle carefully on the protractor.'],
    setups: [{ engine: 'friction', params: { mode: 'incline', m: 500, load: 0, surface: 'wood-wood', angle: 30 }, label: 'Roller held on the plane' }],
    readings: rng => {
      const m = pick(rng, [300, 400, 500, 600]);
      const rows = [10, 20, 30, 40, 50].map(a => { const pan = read(rng, (downForce(m, a) / G) * 1000, 1, { sd: 0.015, abs: 1 }); return { angle: a, sin: r(Math.sin((a * Math.PI) / 180), 3), pan, F: r((pan / 1000) * G, 3) }; });
      const slope = r(mean(rows.map(x => x.F / x.sin)), 2);
      return numeric([`Roller weighed on a spring balance: ${m} g`], [{ key: 'angle', label: 'θ', unit: '°' }, { key: 'sin', label: 'sin θ' }, { key: 'pan', label: 'Pan + weights', unit: 'g' }, { key: 'F', label: 'F', unit: 'N' }], rows, ['F'], [
        { label: 'Slope of F against sin θ (= the weight mg)', unit: 'N', value: slope, tolerance: tol(slope, 0.04, 0.05), working: `Mean F/sin θ = ${slope} N.`, accepted: `${r((m / 1000) * G, 2)} N` },
      ]);
    },
    viva: [
      { q: 'Why is a roller used and not a block?', a: 'A roller has very little rolling friction, so the force measured is just mg sin θ.', source: 'authored' },
      { q: 'What does the slope of F against sin θ give?', a: 'The weight mg of the roller.', source: 'authored' },
    ],
    conclusion: 'The downward force along the plane is proportional to sin θ: F = mg sin θ.',
  },
  // ── Section A activities ─────────────────────────────────────────────────
  {
    ...base, id: id('a', 1), no: 1, part: 'activity', kind: 'observation',
    official: 'To make a paper scale of given least count, e.g., 0.2cm, 0.5 cm.',
    title: 'A paper scale of a given least count',
    chapter: MEASURE, topic: 'Need for measurement: units of measurement, systems of units',
    aim: 'To make paper scales with least counts of 0.2 cm and 0.5 cm.',
    apparatus: ['Thick drawing paper', 'Metre scale', 'Sharp pencil', 'Fine pen'],
    procedure: [
      'Draw a straight line 10 cm long and mark 0 and 10 cm.',
      'For a least count of 0.2 cm, mark every 2 mm (5 divisions per cm); for 0.5 cm, every 5 mm (2 per cm).',
      'Draw longer lines at every cm and number them.',
      'Check the scale against the metre scale.',
    ],
    precautions: ['Use a sharp pencil and draw fine lines.', 'Hold the metre scale firmly while marking.'],
    setups: [{ engine: 'instruments', params: { tool: 'vernier', len: 2.47, dia: 0.62, radius: 40, zero: 0 }, label: 'Least count on a scale' }],
    readings: rng => {
      const lcs = shuffled(rng, [0.2, 0.5, 0.25, 0.1]).slice(0, 3);
      const rows = lcs.map(lc => ({ lc, per: r(1 / lc, 0), mm: r(lc * 10, 1), on10: r(10 / lc, 0) }));
      return observation(['Three scales, 10 cm each'], [{ key: 'lc', label: 'Least count', unit: 'cm' }, { key: 'per', label: 'Divisions per cm' }, { key: 'mm', label: 'Gap between marks', unit: 'mm' }, { key: 'on10', label: 'Divisions in 10 cm' }], rows, ['per', 'mm', 'on10']);
    },
    viva: [
      { q: 'What is the least count of a scale?', a: 'The smallest length it can measure directly: the gap between two neighbouring marks.', source: 'authored' },
      { q: 'Can a scale with LC 0.2 cm read 1.3 cm exactly?', a: 'No: only 1.2 or 1.4 cm; the reading is uncertain by about one least count.', source: 'authored' },
    ],
    conclusion: 'A scale of least count x cm has 1/x divisions per cm.',
  },
  {
    ...base, id: id('a', 2), no: 2, part: 'activity', kind: 'numeric',
    official: 'To determine mass of a given body using a metre scale by principle of moments.',
    title: 'Mass of a body by the principle of moments',
    chapter: 'System of Particles and Rotational Motion', topic: 'Moment of a force, torque, angular momentum; conservation of angular momentum and applications',
    aim: 'To find the mass of a body with a metre scale balanced on a knife edge, by the principle of moments.',
    apparatus: ['Metre scale', 'Knife edge', 'Known mass (100 g)', 'Body of unknown mass', 'Thread'],
    procedure: [
      'Balance the scale alone on the knife edge (its centre of gravity, about 50 cm).',
      'Hang the unknown body on one side at d₁ from the edge and the known mass on the other side; slide it until the scale balances; note d₂.',
      'm = M d₂ / d₁. Repeat for three positions.',
    ],
    precautions: ['Balance the empty scale first and keep the knife edge at that point.', 'Hang the loops of thread thin, and read distances to their centres.'],
    setups: [{ engine: 'balance', params: { mode: 'moments', m: 60, known: 100, d1: 30 }, label: 'Metre scale balanced by moments' }],
    readings: rng => {
      const m = intIn(rng, 40, 140), M = 100;
      const rows = [20, 30, 40].map(d1 => { const d2 = read(rng, (m * d1) / M, 0.1, { abs: 0.15 }); return { d1, d2, m: r((M * d2) / d1, 1) }; });
      const mm = r(mean(rows.map(x => x.m)), 1);
      return numeric(['Known mass M = 100 g; knife edge at the scale\'s centre of gravity'], [{ key: 'd1', label: 'Body at d₁', unit: 'cm' }, { key: 'd2', label: 'Known mass at d₂', unit: 'cm' }, { key: 'm', label: 'm = Md₂/d₁', unit: 'g' }], rows, ['m'], [
        { label: 'Mass of the body', unit: 'g', value: mm, tolerance: tol(mm, 0.02, 1), working: `Mean of ${rows.map(x => x.m).join(', ')} = ${mm} g.`, accepted: `${m} g` },
      ]);
    },
    viva: [
      { q: 'State the principle of moments.', a: 'For a body in equilibrium, the sum of clockwise moments about a point equals the sum of anticlockwise moments.', source: 'authored' },
      { q: 'Why balance the empty scale first?', a: 'So its own weight acts through the knife edge and has no moment.', source: 'authored' },
    ],
    conclusion: 'By the principle of moments, the mass of the body is as found.',
  },
  {
    ...base, id: id('a', 3), no: 3, part: 'activity', kind: 'numeric',
    official: 'To plot a graph for a given set of data, with proper choice of scales and error bars.',
    title: 'A graph with error bars',
    chapter: MEASURE, topic: 'Determining the uncertainty in a result',
    aim: 'To plot L against T² for pendulum data, choosing scales and drawing error bars.',
    apparatus: ['Graph paper', 'Sharp pencil and scale', 'The given data'],
    procedure: [
      'Choose scales so the points fill most of the sheet, with simple steps (1, 2 or 5 units per cm).',
      'Plot each point. Draw a vertical bar of ±ΔT² about each point (ΔT² = 2T·ΔT).',
      'Draw the best straight line through the points, passing within the error bars.',
      'Find the slope from a large triangle.',
    ],
    precautions: ['Label both axes with the quantity and unit.', 'Do not join the points dot to dot: draw the best-fit line.'],
    setups: [{ engine: 'shm', params: { mode: 'pendulum', L: 80, m: 100, k: 20 }, label: 'L-T² data' }],
    readings: rng => {
      const dT = 0.005;
      const rows = [40, 60, 80, 100, 120].map(L => { const T = read(rng, periodPendulum(L), 0.001, { abs: 0.004 }); return { L, T, T2: r(T * T, 3), err: r(2 * T * dT, 3) }; });
      const slope = r(mean(rows.map(x => x.L / x.T2)), 1);
      return numeric(['Each T is uncertain by ±0.005 s'], [{ key: 'L', label: 'L', unit: 'cm' }, { key: 'T', label: 'T', unit: 's' }, { key: 'T2', label: 'T²', unit: 's²' }, { key: 'err', label: 'Error bar ±ΔT²', unit: 's²' }], rows, ['T2', 'err'], [
        { label: 'Slope of L against T²', unit: 'cm/s²', value: slope, tolerance: tol(slope, 0.02, 0.4), working: `Slope = mean L/T² = ${slope} cm/s² (= g/4π²).`, accepted: `${r((G / (4 * Math.PI ** 2)) * 100, 1)} cm/s²` },
      ]);
    },
    viva: [
      { q: 'What does an error bar show?', a: 'The range within which the true value of that point probably lies.', source: 'authored' },
      { q: 'Why is ΔT² = 2T·ΔT?', a: 'The relative error of a square is twice the relative error of the quantity: ΔT²/T² = 2ΔT/T.', source: 'authored' },
    ],
    conclusion: 'The best straight line passes through every error bar; its slope gives g/4π².',
  },
  {
    ...base, id: id('a', 4), no: 4, part: 'activity', kind: 'numeric',
    official: 'To measure the force of limiting friction for rolling of a roller on a horizontal plane.',
    title: 'Rolling friction of a roller',
    chapter: 'Laws of Motion', topic: 'Static and kinetic friction, laws of friction, rolling friction, lubrication',
    aim: 'To measure the limiting force of rolling friction for a roller on a horizontal plane, and compare it with sliding friction.',
    apparatus: ['Horizontal board with pulley', 'Roller with a frame and hook', 'Pan and weights (to 1 g)', 'Thread'],
    procedure: [
      'Tie the roller frame to the pan over the pulley, thread horizontal.',
      'Add small weights until the roller just keeps rolling slowly once started.',
      'Repeat with loads on the roller. Compare with the force to slide the same weight.',
    ],
    precautions: ['Level the board carefully.', 'Add the last weights in 1 g steps.'],
    setups: [{ engine: 'friction', params: { mode: 'roll', m: 300, load: 200, surface: 'wood-wood', angle: 30 }, label: 'Roller kept rolling' }],
    readings: rng => {
      const m = pick(rng, [400, 500]), surface = 'wood-wood';
      const rows = [200, 400, 600].map(load => { const p = { mode: 'roll', m, load, surface, angle: 0 }; return { load, R: r(((m + load) / 1000) * G, 2), roll: read(rng, rollingPull(p), 1, { abs: 1 }), slide: read(rng, limitingFriction(p).pull, 1, { abs: 2 }) }; });
      const ratio = r(mean(rows.map(x => (x.roll as number) / (x.slide as number))), 3);
      return numeric([`Roller ${m} g on a wooden board`], [{ key: 'load', label: 'Load', unit: 'g' }, { key: 'R', label: 'R', unit: 'N' }, { key: 'roll', label: 'Pan to keep rolling', unit: 'g' }, { key: 'slide', label: 'Pan to slide (same weight)', unit: 'g' }], rows, [], [
        { label: 'Rolling friction as a fraction of sliding', unit: '', value: ratio, tolerance: 0.02, working: `Mean of roll/slide = ${ratio}: rolling friction is a small fraction of sliding friction.`, accepted: `${r(1 / 15, 3)}` },
      ]);
    },
    viva: [
      { q: 'Why is rolling friction smaller than sliding friction?', a: 'The surfaces do not rub across each other; only the small deformation at the line of contact resists the motion.', source: 'authored' },
      { q: 'Give two uses of rolling friction.', a: 'Wheels, and ball bearings in fans and cycles.', source: 'authored' },
      { q: 'Why does a roller need a much smaller pan load to keep it rolling than a block of the same weight needs to slide?', a: 'Rolling friction comes only from the small deformation where the roller touches the board, not from surfaces dragging over each other.', source: 'authored' },
    ],
    conclusion: 'The force of rolling friction is far smaller than the force of sliding friction for the same normal reaction.',
  },
  {
    ...base, id: id('a', 5), no: 5, part: 'activity', kind: 'numeric',
    official: 'To study the variation in range of a projectile with angle of projection.',
    title: 'Range of a projectile and the angle',
    chapter: 'Motion in a Plane', topic: 'Motion in a plane with uniform velocity and uniform acceleration: projectile motion',
    aim: 'To find how the range of a projectile depends on the angle of projection, at a fixed speed.',
    apparatus: ['Projectile launcher (spring gun or inclined groove) with a protractor', 'Steel ball', 'Metre tape', 'Carbon paper on white paper'],
    procedure: [
      'Set the launcher at 15° and fire the ball; mark where it lands on the carbon paper.',
      'Measure the range; repeat three times and average.',
      'Repeat at 30°, 45°, 60° and 75°.',
      'Plot range against angle.',
    ],
    precautions: ['Use the same launching speed (same spring compression) every time.', 'Launch and land at the same level.'],
    setups: [{ engine: 'projectile', params: { u: 6, angle: 30 }, label: 'Range at different angles' }],
    readings: rng => {
      const u = pick(rng, [4, 5, 6]);
      const rows = [15, 30, 45, 60, 75].map(a => { const R = rangeAt(u, a) * 100; const rs = [1, 2, 3].map(() => read(rng, R, 1, { sd: 0.025 })); return { angle: a, r1: rs[0], r2: rs[1], r3: rs[2], mean: r(mean(rs), 0) }; });
      const best = rows.reduce((a, b) => ((b.mean as number) > (a.mean as number) ? b : a)).angle;
      return numeric([`The same launch speed each time`], [{ key: 'angle', label: 'Angle', unit: '°' }, { key: 'r1', label: 'Range 1', unit: 'cm' }, { key: 'r2', label: 'Range 2', unit: 'cm' }, { key: 'r3', label: 'Range 3', unit: 'cm' }, { key: 'mean', label: 'Mean range', unit: 'cm' }], rows, ['mean'], [
        { label: 'Angle for the greatest range', unit: '°', value: best as number, tolerance: 15, working: `The greatest mean range is at ${best}°; 30° and 60° (and 15° and 75°) give nearly equal ranges.`, accepted: '45°' },
      ]);
    },
    viva: [
      { q: 'At what angle is the range greatest?', a: '45°, where sin 2θ = 1 (on level ground, ignoring air resistance).', source: 'authored' },
      { q: 'Why do 30° and 60° give the same range?', a: 'sin 2θ is the same for θ and 90° − θ.', source: 'authored' },
    ],
    conclusion: 'The range is greatest at 45°, and complementary angles give equal ranges.',
  },
  {
    ...base, id: id('a', 6), no: 6, part: 'activity', kind: 'numeric',
    official: 'To study the conservation of energy of a ball rolling down on an inclined plane (using a double inclined plane).',
    title: 'Ball on a double inclined plane',
    chapter: 'Work, Energy and Power', topic: 'Conservative and non-conservative forces',
    aim: 'To show that a ball rolling down one side of a double inclined plane rises to nearly the same height on the other.',
    apparatus: ['Double inclined plane (V-shaped track)', 'Steel ball', 'Metre scale'],
    procedure: [
      'Release the ball from rest at a measured height on one side.',
      'Note the highest point it reaches on the other side; measure its height.',
      'Repeat for several release heights.',
    ],
    precautions: ['Release the ball without pushing it.', 'Keep the track clean and dry.'],
    setups: [{ engine: 'friction', params: { mode: 'double', m: 200, load: 0, surface: 'wood-wood', angle: 30 }, label: 'Ball on the double incline' }],
    readings: rng => {
      const rows = [10, 15, 20, 25].map(h => { const up = read(rng, h * KEEP, 0.1, { abs: 0.2 }); return { h, up, ratio: r(up / h, 2) }; });
      const kept = r(mean(rows.map(x => x.ratio)), 2);
      return numeric(['Release heights measured from the bottom of the V'], [{ key: 'h', label: 'Released at', unit: 'cm' }, { key: 'up', label: 'Rises to', unit: 'cm' }, { key: 'ratio', label: 'Fraction of the height' }], rows, ['ratio'], [
        { label: 'Fraction of the energy kept', unit: '', value: kept, tolerance: 0.03, working: `Mean of h₂/h₁ = ${kept}: mgh₂/mgh₁.`, accepted: `${KEEP}` },
      ]);
    },
    viva: [
      { q: 'Why does the ball not reach quite the same height?', a: 'A little energy goes to rolling friction, air resistance and sound: non-conservative forces.', source: 'authored' },
      { q: 'What would happen with no friction at all?', a: 'It would rise to exactly the same height (Galileo\'s argument).', source: 'authored' },
      { q: 'Which law of motion does the double inclined plane illustrate?', a: 'Galileo\'s idea behind the first law: with no friction the ball would keep moving until it regained its height, and on a level track it would never stop.', source: 'authored' },
    ],
    conclusion: 'The ball rises almost to its release height: mechanical energy is conserved apart from small losses.',
  },
  {
    ...base, id: id('a', 7), no: 7, part: 'activity', kind: 'numeric',
    official: 'To study dissipation of energy of a simple pendulum by plotting a graph between square of amplitude and time.',
    title: 'Damping of a pendulum',
    chapter: 'Oscillations', topic: 'Energy in SHM: kinetic and potential energies',
    aim: 'To study how a pendulum loses energy by plotting the square of its amplitude against time.',
    apparatus: ['Simple pendulum', 'Stop watch', 'A scale fixed behind the bob to read the amplitude'],
    procedure: [
      'Pull the bob 10 cm aside and release.',
      'Read the amplitude every 30 s for 3 minutes.',
      'Plot A² (proportional to the energy) against time.',
    ],
    precautions: ['Read the amplitude at the same end of the swing each time.', 'Avoid draughts.'],
    setups: [{ engine: 'shm', params: { mode: 'damped', L: 100, m: 100, k: 20 }, label: 'Damped pendulum' }],
    readings: rng => {
      const m = pick(rng, [50, 100, 200]), tau = tauOf(m);
      const rows = [0, 30, 60, 90, 120, 150, 180].map(t => { const A = read(rng, 10 * Math.exp(-t / (2 * tau)), 0.1, { abs: 0.08 }); return { t, A, A2: r(A * A, 1) }; });
      const half = r(tau * Math.LN2, 0);
      const est = r(mean(rows.slice(1).map(x => (x.t * Math.LN2) / Math.log(100 / Math.max(1, x.A2)))), 0);
      return numeric([`Bob of ${m} g, released at 10 cm`], [{ key: 't', label: 'Time', unit: 's' }, { key: 'A', label: 'Amplitude', unit: 'cm' }, { key: 'A2', label: 'A²', unit: 'cm²' }], rows, ['A2'], [
        { label: 'Time for the energy (A²) to halve', unit: 's', value: est, tolerance: tol(est, 0.12, 4), working: `A² = 100 e^(−t/τ); from the readings τ ln 2 ≈ ${est} s.`, accepted: `${half} s` },
      ]);
    },
    viva: [
      { q: 'Why plot A² and not A?', a: 'The energy of an oscillation is proportional to the square of its amplitude.', source: 'authored' },
      { q: 'Where does the energy go?', a: 'To the air (as heat and sound) and to friction at the support.', source: 'authored' },
      { q: 'Does the time period change as the swings die away?', a: 'Hardly at all: for small swings the period depends on the length and g, not on the amplitude.', source: 'authored' },
    ],
    conclusion: 'A² falls with time, steeply at first and then more slowly: the energy of the pendulum is dissipated.',
  },
];
