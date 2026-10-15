import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validateParams } from './types';
import { stateAt, stopTime, motion, type MotionParams } from './engines/motion';
import { solvePush, solveCollide, forces, type ForcesParams } from './engines/forces';
import { dropAt, solveLever, energy, type EnergyParams } from './engines/energy';
import { solveSound, sound, type SoundParams } from './engines/sound';
import { correctingPower, traceColour, SPECTRUM, eyePrism, type EyeParams } from './engines/eyePrism';
import { wireField, solenoidPoles, motorForce, deflection, cross, magnetism, type MagParams } from './engines/magnetism';
import { balance, parseFormula, molarMass, solveReaction, REACTIONS, equationText, reactions, type ReactionParams } from './engines/reactions';
import { scenePredictions, enginesForChapter } from './registry';

const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const withDefaults = <P>(engine: Parameters<typeof defaults>[0], o: Partial<P>) => ({ ...(defaults(engine) as P), ...o });

// ── Motion ──────────────────────────────────────────────────────────────────

test('car from 18 km/h to 36 km/h in 5 s (NCERT example): a = 1 m/s², s = 37.5 m', () => {
  const p = withDefaults<MotionParams>(motion, { u: 5, a: 1, t: 5 });
  const end = stateAt(p, 5);
  close(end.v, 10, 1e-12); close(end.s, 37.5, 1e-12);
});

test('braking at −6 m/s² from 12 m/s (NCERT example): stops in 2 s after 12 m, then stays put', () => {
  const p = withDefaults<MotionParams>(motion, { u: 12, a: -6, t: 5 });
  close(stopTime(p)!, 2, 1e-12);
  const end = stateAt(p, 5);
  close(end.v, 0, 1e-12); close(end.s, 12, 1e-12);
});

test('v² = u² + 2as holds along the way', () => {
  const p = withDefaults<MotionParams>(motion, { u: 3, a: 2.5, t: 8 });
  for (const t of [0.5, 2, 7]) { const s = stateAt(p, t); close(s.v ** 2, p.u ** 2 + 2 * p.a * s.s, 1e-9); }
});

// ── Forces ──────────────────────────────────────────────────────────────────

test('100 kg from 5 to 8 m/s in 6 s needs 50 N net (NCERT example): F = ma on a smooth floor', () => {
  const r = solvePush(withDefaults<ForcesParams>(forces, { m1: 50, f: 25, mu: 0, t: 6 }));
  close(r.a, 0.5, 1e-12); close(r.v, 3, 1e-12);
});

test('friction holds the block until the push beats μmg', () => {
  const held = solvePush(withDefaults<ForcesParams>(forces, { m1: 10, f: 19.6, mu: 0.2 }));
  assert.equal(held.moves, false); close(held.friction, 19.6, 1e-12);
  const moves = solvePush(withDefaults<ForcesParams>(forces, { m1: 10, f: 50, mu: 0.2 }));
  assert.equal(moves.moves, true); close(moves.a, (50 - 19.6) / 10, 1e-12);
});

test('collisions conserve momentum; an elastic bounce also keeps kinetic energy; equal masses swap', () => {
  const stick = solveCollide(withDefaults<ForcesParams>(forces, { scenario: 'collide', m1: 2, u1: 3, m2: 1, u2: 0, joins: 'stick' }));
  close(stick.v1, 2, 1e-12); close(stick.pAfter, stick.pBefore, 1e-12);
  assert.ok(stick.keAfter < stick.keBefore);
  const bounce = solveCollide(withDefaults<ForcesParams>(forces, { scenario: 'collide', m1: 3, u1: 4, m2: 5, u2: -2, joins: 'bounce' }));
  close(bounce.pAfter, bounce.pBefore, 1e-12); close(bounce.keAfter, bounce.keBefore, 1e-9);
  const swap = solveCollide(withDefaults<ForcesParams>(forces, { scenario: 'collide', m1: 2, u1: 3, m2: 2, u2: 0, joins: 'bounce' }));
  close(swap.v1, 0, 1e-12); close(swap.v2, 3, 1e-12);
});

// ── Energy ──────────────────────────────────────────────────────────────────

test('10 kg at 6 m with g = 9.8 (NCERT example): PE = 588 J; half-way it is shared equally', () => {
  const p = withDefaults<EnergyParams>(energy, { m: 10, h: 6, g: '9.8' });
  close(dropAt(p, 6).pe, 588, 1e-9);
  const half = dropAt(p, 3);
  close(half.pe, 294, 1e-9); close(half.ke, 294, 1e-9);
  close(dropAt(p, 0).v, Math.sqrt(2 * 9.8 * 6), 1e-12);
});

test('lever: moments balance; class 2 and 3 arms are enforced', () => {
  const p = withDefaults<EnergyParams>(energy, { scenario: 'lever', lever: '1', load: 200, loadArm: 0.5, effortArm: 1.5 });
  const r = solveLever(p);
  close(r.effort * p.effortArm, p.load * p.loadArm, 1e-9); close(r.ma, 3, 1e-12);
  assert.equal(validateParams(energy, { ...p, lever: '3' }), null, 'class 3 needs the shorter effort arm');
  assert.ok(validateParams(energy, { ...p, lever: '3', loadArm: 1.5, effortArm: 0.5 }));
});

// ── Sound ───────────────────────────────────────────────────────────────────

test('clap 346 m from a cliff in air at 25 °C: echo after 2 s (NCERT example)', () => {
  const r = solveSound(withDefaults<SoundParams>(sound, { medium: 'air25', d: 346 }));
  close(r.echo, 2, 1e-12);
});

test('v = fλ, and a distinct echo needs about 17 m in air', () => {
  const r = solveSound(withDefaults<SoundParams>(sound, { medium: 'air25', f: 440, d: 10 }));
  close(r.lambda * 440, 346, 1e-9);
  assert.equal(r.distinct, false); close(r.minDistance, 17.3, 1e-9);
  assert.equal(solveSound(withDefaults<SoundParams>(sound, { medium: 'air25', d: 18 })).distinct, true);
});

// ── Eye and prism ───────────────────────────────────────────────────────────

test('myopic far point 1.2 m needs −0.83 D; hypermetropic near point 1 m needs +3 D (NCERT)', () => {
  close(correctingPower(withDefaults<EyeParams>(eyePrism, { scenario: 'myopia', far: 1.2 })), -0.8333, 1e-4);
  close(correctingPower(withDefaults<EyeParams>(eyePrism, { scenario: 'hypermetropia', near: 1 })), 3, 1e-12);
});

test('prism: violet deviates most, red least, in spectrum order, at every allowed angle', () => {
  for (const i of [40, 50, 60, 75]) {
    const devs = SPECTRUM.map(c => traceColour(c.n, i));
    assert.ok(devs.every(Boolean), `all colours emerge at ${i}°`);
    for (let k = 1; k < devs.length; k++) assert.ok(devs[k]!.deviation > devs[k - 1]!.deviation, `${SPECTRUM[k].name} beyond ${SPECTRUM[k - 1].name}`);
    // Snell at the second face: n sin r2 = sin e.
    const v = traceColour(SPECTRUM[6].n, i)!;
    close(SPECTRUM[6].n * Math.sin((v.r2 * Math.PI) / 180), Math.sin((v.e * Math.PI) / 180), 1e-12);
  }
});

// ── Magnetism ───────────────────────────────────────────────────────────────

test('cross product and the right-hand thumb rule', () => {
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  const out = withDefaults<MagParams>(magnetism, { scenario: 'wire', flow: 'out', current: 4, r: 2 });
  assert.equal(wireField(out).sense, 'anticlockwise');
  assert.equal(wireField({ ...out, flow: 'in' }).sense, 'clockwise');
  close(wireField(out).B, 4e-5, 1e-12); // μ0 I / 2πr = 2e-7 × 4 / 0.02
  close(wireField({ ...out, r: 4 }).B, wireField(out).B / 2, 1e-15);
});

test('solenoid clock rule, Fleming\'s left hand, and induction directions', () => {
  const base = defaults(magnetism) as MagParams;
  assert.deepEqual(solenoidPoles({ ...base, wind: 'cw' }), { left: 'S', right: 'N' });
  assert.equal(motorForce({ ...base, dirI: 'lr', field: 'down' }).word, 'Into the magnet, away from you');
  assert.equal(motorForce({ ...base, dirI: 'rl', field: 'down' }).word, 'Out of the magnet, towards you');
  close(motorForce({ ...base, b: 0.5, current: 2, len: 0.1 }).size, 0.1, 1e-12);
  assert.equal(deflection({ ...base, pole: 'N', move: 'in' }), 1);
  assert.equal(deflection({ ...base, pole: 'N', move: 'out' }), -1);
  assert.equal(deflection({ ...base, pole: 'S', move: 'in', speed: 'fast' }), -2);
  assert.equal(deflection({ ...base, move: 'still' }), 0);
});

// ── Reactions ───────────────────────────────────────────────────────────────

test('formulas parse with brackets; molar masses use NCERT atomic masses', () => {
  assert.deepEqual(parseFormula('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(parseFormula('Pb(NO3)2'), { Pb: 1, N: 2, O: 6 });
  close(molarMass('CaCO3'), 100, 1e-12); close(molarMass('H2O'), 18, 1e-12); close(molarMass('NaCl'), 58.5, 1e-12);
});

test('every textbook reaction balances, atom for atom, to the smallest whole numbers', () => {
  const expect: Record<string, number[]> = {
    'h2-o2': [2, 1, 2], 'mg-o2': [2, 1, 2], 'pbno3': [2, 2, 4, 1], 'agcl': [2, 2, 1], 'ch4-o2': [1, 2, 1, 2], 'na2so4-bacl2': [1, 1, 1, 2], 'h2o-elec': [2, 2, 1],
  };
  for (const rx of REACTIONS) {
    const c = balance(rx.reactants, rx.products);
    if (expect[rx.key]) assert.deepEqual(c, expect[rx.key], rx.key);
    const side = (fs: string[], off: number) => {
      const t: Record<string, number> = {};
      fs.forEach((f, k) => { for (const [el, n] of Object.entries(parseFormula(f))) t[el] = (t[el] ?? 0) + n * c[k + off]; });
      return t;
    };
    assert.deepEqual(side(rx.reactants, 0), side(rx.products, rx.reactants.length), `${rx.key} balances`);
  }
});

test('4.8 g magnesium burns to 8.0 g magnesium oxide; 100 g limestone gives 56 g quicklime + 44 g CO₂', () => {
  const mg = solveReaction(withDefaults<ReactionParams>(reactions, { reaction: 'mg-o2', mass: 4.8 }));
  close(mg.products[0].mass, 8, 1e-9); close(mg.reactants[1].mass, 3.2, 1e-9);
  const lime = solveReaction(withDefaults<ReactionParams>(reactions, { reaction: 'caco3', mass: 100 }));
  close(lime.products[0].mass, 56, 1e-9); close(lime.products[1].mass, 44, 1e-9);
  assert.equal(equationText({ reaction: 'mg-o2', given: 'r0', mass: 1 }), '2Mg + O₂ → 2MgO');
});

test('mass given for a second reactant that does not exist falls back to the first', () => {
  const r = solveReaction({ reaction: 'caco3', given: 'r1', mass: 50 });
  assert.equal(r.given.formula, 'CaCO3');
});

// ── Across the new engines ──────────────────────────────────────────────────

test('every scenario of every new engine asks answerable questions', () => {
  const cases: [Parameters<typeof defaults>[0], Record<string, unknown>[]][] = [
    [motion, [{}, { u: 12, a: -6, t: 5 }, { u: 0, a: 0 }, { u: 0, a: -3 }]],
    [forces, [{}, { f: 0 }, { scenario: 'collide' }, { scenario: 'collide', joins: 'bounce', m1: 1, m2: 5 }, { scenario: 'collide', u1: 0, u2: 2 }]],
    [energy, [{}, { scenario: 'lever' }, { scenario: 'lever', lever: '2', loadArm: 0.3, effortArm: 1.2 }]],
    [sound, [{}, { medium: 'steel', d: 2 }]],
    [eyePrism, [{}, { scenario: 'hypermetropia' }, { scenario: 'prism' }]],
    [magnetism, [{}, { scenario: 'solenoid' }, { scenario: 'motor' }, { scenario: 'induction', move: 'still' }]],
    [reactions, [...REACTIONS.map(r => ({ reaction: r.key }) as Record<string, unknown>), { reaction: 'fe-cuso4', given: 'r1', mass: 16 }]],
  ];
  for (const [engine, overrides] of cases) {
    for (const o of overrides) {
      const params = validateParams(engine, { ...defaults(engine), ...o });
      assert.ok(params, `${engine.id} accepts ${JSON.stringify(o)}`);
      const qs = scenePredictions({ engine: engine.id, params: params!, title: '', predictions: [], answer: 'hands' });
      assert.ok(qs.length > 0, `${engine.id} ${JSON.stringify(o)} has questions`);
      for (const q of qs) {
        assert.ok(q.options.length >= 2 && q.correct >= 0 && q.correct < q.options.length, `${engine.id}/${q.id} ok`);
        assert.equal(new Set(q.options).size, q.options.length, `${engine.id}/${q.id} distinct: ${q.options}`);
        assert.ok(!q.options.some(x => /NaN|Infinity|undefined/.test(x)) && !/NaN|Infinity|undefined/.test(q.explain), `${engine.id}/${q.id} finite`);
      }
      assert.ok(engine.readouts(params as any).every(r => !/NaN|Infinity|undefined/.test(r.value)), `${engine.id} readouts finite`);
    }
  }
});

test('Class 9 and 10 science chapters each find their simulation', () => {
  for (const [ch, id] of [['Motion', 'motion'], ['Sound', 'sound'], ['Magnetic Effects of Electric Current', 'magnetism'], ['Motor, Electromagnetic Induction and Electric Generator', 'magnetism'], ['Atoms and Molecules', 'reactions'], ['The Human Eye and the Colourful World', 'eye-prism']]) {
    assert.ok(enginesForChapter(ch).some(e => e.id === id), ch);
  }
});
