import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveOptics, optics } from './engines/optics';
import { solveCircuit, circuits, type CircuitParams } from './engines/circuits';
import { phAt, equivalenceVolume, indicatorColour, maxVolume, acidBase, type TitrationParams } from './engines/acidBase';
import { defaults, validateParams, choices } from './types';
import { validateScene, scenePredictions, fittingPredictions, ENGINES, enginesForChapter } from './registry';

const close = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);

// ── Optics: NCERT Class 10 worked examples ──────────────────────────────────

test('convex lens, object 15 cm from a 10 cm lens (NCERT example): v = +30 cm, m = −2', () => {
  const r = solveOptics({ device: 'convex_lens', f: 10, u: 15, h: 2 });
  close(r.v, 30, 1e-9); close(r.m, -2, 1e-9); close(r.hi, -4, 1e-9);
  assert.equal(r.real, true); assert.equal(r.erect, false); assert.equal(r.size, 'Magnified');
  assert.equal(r.imageAt, 'Beyond 2F₂'); assert.equal(r.objectAt, 'Between F₁ and 2F₁');
  const q = optics.predictions[0].build({ device: 'convex_lens', f: 10, u: 15, h: 2 });
  assert.match(q.prompt, /between F₁ and 2F₁/, 'point labels keep their capitals');
});

test('concave mirror, 4 cm object at 25 cm, f 15 cm (NCERT example): v = −37.5 cm, h′ = −6 cm', () => {
  const r = solveOptics({ device: 'concave_mirror', f: 15, u: 25, h: 4 });
  close(r.v, -37.5, 1e-9); close(r.m, -1.5, 1e-9); close(r.hi, -6, 1e-9);
  assert.equal(r.real, true); assert.equal(r.imageAt, 'Beyond C');
});

test('convex mirror rear-view (NCERT example, scaled ×10): f 15, u 50 → v ≈ +11.5, m ≈ 0.23', () => {
  const r = solveOptics({ device: 'convex_mirror', f: 15, u: 50, h: 2 });
  close(r.v, 11.538, 1e-3); close(r.m, 0.2308, 1e-4);
  assert.equal(r.real, false); assert.equal(r.erect, true); assert.equal(r.size, 'Diminished');
});

test('concave lens, f 15, image at 10 cm (NCERT example) means object at 30 cm', () => {
  const r = solveOptics({ device: 'concave_lens', f: 15, u: 30, h: 2 });
  close(r.v, -10, 1e-9); close(r.m, 1 / 3, 1e-9);
  assert.equal(r.real, false); assert.equal(r.erect, true);
});

test('object at 2F gives a same-size image at 2F; object at F gives no image', () => {
  const at2f = solveOptics({ device: 'convex_lens', f: 10, u: 20, h: 2 });
  close(at2f.v, 20, 1e-9); assert.equal(at2f.size, 'Same size'); assert.equal(at2f.imageAt, 'At 2F₂');
  const atF = solveOptics({ device: 'concave_mirror', f: 10, u: 10, h: 2 });
  assert.equal(atF.atInfinity, true); assert.equal(atF.imageAt, 'At infinity');
  // The two outgoing rays are parallel.
  const out = atF.rays.filter(s => s.out);
  const slope = (s: typeof out[0]) => (s.to[1] - s.from[1]) / (s.to[0] - s.from[0]);
  close(slope(out[0]), slope(out[1]), 1e-9, 'parallel rays');
});

test('object inside F of a convex lens: virtual, erect, magnified, drawn with a dashed back-ray', () => {
  const r = solveOptics({ device: 'convex_lens', f: 10, u: 5, h: 2 });
  close(r.v, -10, 1e-9); close(r.m, 2, 1e-9);
  assert.equal(r.real, false); assert.ok(r.rays.some(s => s.virtual));
  // Every real outgoing ray, traced back, passes through the virtual image top.
  for (const s of r.rays.filter(s => s.virtual)) assert.deepEqual(s.to, [r.v, r.hi]);
});

test('real image: both outgoing rays pass through the image top', () => {
  const r = solveOptics({ device: 'convex_lens', f: 12, u: 30, h: 3 });
  const outgoing = r.rays.filter(s => s.out);
  assert.equal(outgoing.length, 2);
  for (const s of outgoing) {
    const t = (r.v - s.from[0]) / (s.to[0] - s.from[0]);
    close(s.from[1] + t * (s.to[1] - s.from[1]), r.hi, 1e-9, 'ray meets image');
  }
});

// ── Circuits: NCERT Class 10 "Electricity" ─────────────────────────────────

const circuit = (o: Partial<CircuitParams>): CircuitParams => ({ ...(defaults(circuits) as CircuitParams), ...o });

test('5, 10 and 30 Ω in parallel on 12 V (NCERT example): R = 3 Ω, I = 4 A, 2.4/1.2/0.4 A', () => {
  const r = solveCircuit(circuit({ topology: 'parallel', count: '3', v: 12, r1: 5, r2: 10, r3: 30 }));
  close(r.req, 3, 1e-9); close(r.i, 4, 1e-9);
  assert.deepEqual(r.branches.map(b => Math.round(b.i * 100) / 100), [2.4, 1.2, 0.4]);
});

test('20 Ω lamp and 4 Ω conductor in series on 6 V (NCERT example): 24 Ω, 0.25 A', () => {
  const r = solveCircuit(circuit({ topology: 'series', count: '2', v: 6, r1: 20, r2: 4 }));
  close(r.req, 24, 1e-9); close(r.i, 0.25, 1e-9);
  close(r.branches[0].v + r.branches[1].v, 6, 1e-9, 'voltages add to the cell');
});

test('mixed circuit conserves current at the junction and voltage round the loop', () => {
  const r = solveCircuit(circuit({ topology: 'mixed', count: '3', v: 9, r1: 4, r2: 6, r3: 12 }));
  close(r.req, 8, 1e-9); close(r.i, 1.125, 1e-9);
  close(r.branches[1].i + r.branches[2].i, r.i, 1e-9);
  close(r.branches[0].v + r.branches[1].v, 9, 1e-9);
  close(r.branches[1].v, r.branches[2].v, 1e-9);
});

test('heating: H = I²Rt; total power equals the sum over resistors', () => {
  const p = circuit({ topology: 'series', count: '2', v: 10, r1: 3, r2: 2, t: 30 });
  const r = solveCircuit(p);
  close(r.branches[0].heat, 4 * 3 * 30, 1e-9);
  close(r.p, r.branches.reduce((s, b) => s + b.p, 0), 1e-9);
});

test('the mixed circuit refuses two resistors', () => {
  assert.equal(validateParams(circuits, { ...defaults(circuits), topology: 'mixed', count: '2' }), null);
});

// ── Titration ──────────────────────────────────────────────────────────────

const titration = (o: Partial<TitrationParams>): TitrationParams => ({ ...(defaults(acidBase) as TitrationParams), ...o });

test('strong acid with strong base: pH 1 at the start, 1.48 halfway, 7 at neutralisation', () => {
  const p = titration({ analyte: 'hcl', ca: 0.1, va: 25, ct: 0.1 });
  close(equivalenceVolume(p), 25, 1e-9);
  close(phAt(p, 0), 1, 0.01); close(phAt(p, 12.5), 1.477, 0.01); close(phAt(p, 25), 7, 0.01);
  close(phAt(p, 50), 12.52, 0.02);
});

test('acetic acid with NaOH: start ≈ 2.87, half-way = pKa 4.74, end point ≈ 8.72', () => {
  const p = titration({ analyte: 'ch3cooh', ca: 0.1, va: 25, ct: 0.1 });
  close(phAt(p, 0), 2.87, 0.02); close(phAt(p, 12.5), 4.74, 0.02); close(phAt(p, 25), 8.72, 0.03);
});

test('ammonia with HCl: end point is acidic (≈ 5.28)', () => {
  const p = titration({ analyte: 'nh3', ca: 0.1, va: 25, ct: 0.1 });
  close(phAt(p, 0), 11.13, 0.02); close(phAt(p, 25), 5.28, 0.03);
});

test('pH rises steadily as base is added to an acid', () => {
  const p = titration({ analyte: 'ch3cooh' });
  let last = -1;
  for (let v = 0; v <= 50; v += 0.5) { const ph = phAt(p, v); assert.ok(ph >= last - 1e-9); last = ph; }
});

test('indicator colours follow their school ranges', () => {
  assert.equal(indicatorColour('phenolphthalein', 7).name, 'Colourless');
  assert.equal(indicatorColour('phenolphthalein', 9).name, 'Pink');
  assert.equal(indicatorColour('methyl_orange', 2).name, 'Red');
  assert.equal(indicatorColour('methyl_orange', 6).name, 'Yellow');
  assert.equal(indicatorColour('litmus', 12).name, 'Blue');
  assert.equal(indicatorColour('universal', 7).name, 'Green');
});

test('a setup one 50 mL burette cannot take well past neutralisation is refused', () => {
  assert.equal(validateParams(acidBase, { ...defaults(acidBase), ca: 1, va: 50, ct: 0.1 }), null);
  assert.equal(validateParams(acidBase, { ...defaults(acidBase), ca: 0.1, va: 45, ct: 0.1 }), null, '45 mL to neutralise');
  assert.ok(validateParams(acidBase, { ...defaults(acidBase), ca: 0.1, va: 40, ct: 0.1 }));
  assert.equal(maxVolume({ ...(defaults(acidBase) as TitrationParams), va: 40 }), 50, 'capped at the burette');
});

// ── Validation, scenes and questions ─────────────────────────────────────────

test('values outside range, unknown options and wrong types are refused, never clamped', () => {
  assert.equal(validateParams(optics, { device: 'convex_lens', f: 10, u: 500, h: 2 }), null);
  assert.equal(validateParams(optics, { device: 'prism', f: 10, u: 15, h: 2 }), null);
  assert.equal(validateParams(optics, { device: 'convex_lens', f: 'ten', u: 15, h: 2 }), null);
  assert.deepEqual(validateParams(optics, { device: 'convex_lens', f: '10', u: 15 }), { device: 'convex_lens', f: 10, u: 15, h: 2 });
});

test('validateScene rejects unknown engines and drops unknown or inapplicable questions', () => {
  assert.equal(validateScene({ engine: 'nuclear', params: {} }), null);
  const s = validateScene({ engine: 'optics', params: { device: 'concave_mirror', f: 10, u: 10 }, predictions: ['image-position', 'image-size', 'bogus', 'image-position'] });
  assert.ok(s);
  assert.deepEqual(s!.predictions.map(p => p.id), ['image-position'], 'no size question when the image is at infinity');
});

test('every question of every engine has its right answer among the options, at defaults and at the edges', () => {
  for (const e of ENGINES) {
    const settings = [defaults(e)];
    for (const spec of e.params) {
      if (spec.kind === 'number') for (const v of [spec.min, spec.max]) settings.push({ ...defaults(e), [spec.key]: v });
      else for (const o of spec.options) settings.push({ ...defaults(e), [spec.key]: o.value });
    }
    for (const raw of settings) {
      const params = validateParams(e, raw);
      if (!params) continue; // a combination the engine refuses
      const qs = fittingPredictions(e.id, params);
      assert.ok(qs.length > 0, `${e.id} has questions`);
      for (const q of qs) {
        assert.ok(q.options.length >= 2, `${e.id}/${q.id} has options`);
        assert.ok(q.correct >= 0 && q.correct < q.options.length, `${e.id}/${q.id} answer in range`);
        assert.equal(new Set(q.options).size, q.options.length, `${e.id}/${q.id} options distinct`);
        assert.ok(!q.options.some(o => /NaN|Infinity/.test(o)), `${e.id}/${q.id} options are numbers: ${q.options}`);
      }
    }
  }
});

test('the Copilot can re-word a question but never its options or answer', () => {
  const [q] = scenePredictions({ engine: 'optics', params: { device: 'convex_lens', f: 10, u: 15, h: 2 }, title: '', predictions: [{ id: 'image-distance', prompt: 'Where does the screen go?' }], answer: 'hands' });
  assert.equal(q.prompt, 'Where does the screen go?');
  assert.equal(q.options[q.correct], 'v = +30 cm');
});

test('choices keeps the right answer, drops duplicates and does not always put it first', () => {
  const c = choices('A', ['B', 'A', 'C', 'C', 'D', 'E']);
  assert.equal(c.options[c.correct], 'A');
  assert.equal(c.options.length, 4);
  const firsts = ['p', 'q', 'r', 's', 't', 'u', 'v', 'w'].map(x => choices(x, ['1', '2', '3']).correct);
  assert.ok(firsts.some(i => i !== 0));
});

test('engines are found by their official chapter names', () => {
  assert.deepEqual(enginesForChapter('Light - Reflection and Refraction').map(e => e.id), ['optics']);
  assert.deepEqual(enginesForChapter('Electricity').map(e => e.id), ['circuits']);
});

test('a scene survives the URL round trip, and a tampered link is refused', async () => {
  const { encodeScene, decodeScene } = await import('./url');
  const scene = validateScene({ engine: 'acid-base', params: { analyte: 'ch3cooh' }, title: 'Vinegar — how strong?', predictions: ['equivalence-ph'] })!;
  assert.deepEqual(decodeScene(encodeScene(scene)), scene);
  const bad = encodeScene({ ...scene, params: { ...scene.params, ca: 9 } });
  assert.equal(decodeScene(bad), null);
  assert.equal(decodeScene('not base64 at all!'), null);
});

test('the answering mode is the teacher\'s: kept when valid, counting hands when missing or unknown', () => {
  const base = { engine: 'circuits', params: {} };
  assert.equal(validateScene({ ...base, answer: 'class' })!.answer, 'class');
  assert.equal(validateScene({ ...base, answer: 'think' })!.answer, 'think');
  assert.equal(validateScene(base)!.answer, 'hands');
  assert.equal(validateScene({ ...base, answer: 'phones' })!.answer, 'hands');
});

test('a scene that names no questions has none: a pure demo is not "ask everything"', () => {
  const scene = validateScene({ engine: 'optics', params: { device: 'convex_lens', f: 10, u: 15, h: 2 }, predictions: [] })!;
  assert.deepEqual(scenePredictions(scene), []);
  assert.ok(fittingPredictions('optics', scene.params).length > 0);
});
