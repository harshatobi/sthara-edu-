import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurriculum } from '@/lib/curriculum';
import { buildPrediction, defaults, validateParams, type LabEngine, type Params } from './types';
import { ENGINES } from './registry';

/** Defaults, then every choice option and every number's ends, one value at a time (skipping set-ups the engine refuses). */
function samples(engine: LabEngine<any>): Params[] {
  const base = defaults(engine);
  const out: Params[] = [base];
  for (const s of engine.params) {
    const values = s.kind === 'choice' ? s.options.map(o => o.value) : [s.min, s.max];
    for (const v of values) {
      const p = validateParams(engine, { ...base, [s.key]: v });
      if (p) out.push(p);
    }
  }
  return out;
}

test('every lab question is tagged with a real syllabus topic in one of its engine’s chapters', () => {
  for (const engine of ENGINES) {
    const syllabus = new Map<string, string[]>();
    for (const cls of engine.classes) {
      const cur = getCurriculum(`Class ${cls}`, engine.subject);
      assert.ok(cur, `${engine.id}: no curriculum for Class ${cls}`);
      for (const u of cur!.units) for (const c of u.chapters) syllabus.set(c.name, c.topics ?? []);
    }
    let built = 0;
    for (const p of samples(engine)) {
      for (const t of engine.predictions) {
        if (t.applies && !t.applies(p)) continue;
        const q = buildPrediction(engine, t, p);
        assert.ok(engine.chapters.includes(q.chapter), `${engine.id}/${t.id}: chapter "${q.chapter}" is not one of the engine's`);
        assert.ok(syllabus.has(q.chapter), `${engine.id}/${t.id}: "${q.chapter}" is not a chapter in the curriculum`);
        assert.ok(syllabus.get(q.chapter)!.includes(q.topic), `${engine.id}/${t.id}: "${q.topic}" is not a topic of "${q.chapter}"`);
        built++;
      }
    }
    assert.ok(built > 0, `${engine.id}: no question was built`);
  }
});
