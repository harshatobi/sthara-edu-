import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurriculum } from '@/lib/curriculum';
import { engineById } from './registry';
import { validateParams } from './types';
import { PRACTICALS, practicalsFor, practicalFits, readingsFor, refOf, resultOk, vivaFor } from './practicals';
import { markSchemeFor, partsProblem, partsTotal, onSheet, recordShortfall } from './practicals/marks';

test('all 27 official Science practicals: 13 in Class 9, 14 in Class 10, numbered in order', () => {
  for (const cls of [9, 10] as const) {
    const list = practicalsFor(`Class ${cls}-A`, 'Science');
    assert.equal(list.length, cls === 9 ? 13 : 14);
    assert.deepEqual(list.map(p => p.no), list.map((_, i) => i + 1));
    assert.deepEqual(list.map(p => p.id), list.map((_, i) => `c${cls}-${String(i + 1).padStart(2, '0')}`));
  }
});

test('the official Physics lists: XI 20 experiments + 14 activities, XII 15 + 13 (two OR pairs kept as both halves)', () => {
  const want = { 11: { A: [10, 7], B: [10, 7] }, 12: { A: [8, 6], B: [9, 7] } } as const;
  for (const cls of [11, 12] as const) {
    const list = practicalsFor(`Class ${cls}-A`, 'Physics');
    for (const sec of ['A', 'B'] as const) {
      const exps = list.filter(p => p.section === sec && p.part === 'experiment'), acts = list.filter(p => p.section === sec && p.part === 'activity');
      assert.equal(exps.length, want[cls][sec][0], `Class ${cls} ${sec} experiments`);
      assert.equal(acts.length, want[cls][sec][1], `Class ${cls} ${sec} activities`);
      for (const xs of [exps, acts]) {
        const nos = [...new Set(xs.map(p => p.no))];
        assert.deepEqual(nos, nos.map((_, i) => i + 1), `Class ${cls} ${sec}: numbered in order`);
      }
    }
    // An OR pair: same number, each names the other.
    for (const p of list.filter(x => x.orWith)) {
      const q = list.find(x => x.id === p.orWith);
      assert.ok(q && q.orWith === p.id && q.no === p.no && q.section === p.section, `${p.id}: OR pair`);
    }
  }
  assert.equal(PRACTICALS.length, 27 + 34 + 30);
  assert.equal(new Set(PRACTICALS.map(p => p.id)).size, PRACTICALS.length, 'ids are unique');
  assert.equal(practicalsFor('Class 11-A', 'Science').length, 0);
  assert.equal(practicalsFor('Class 9-A', 'Physics').length, 0);
  assert.ok(practicalFits(practicalsFor('Class 12-B', 'Physics')[0], 'Class 12-B', 'Physics'));
  assert.equal(refOf(practicalsFor('Class 12-A', 'Physics').find(p => p.part === 'activity')!), 'A activity 1');
});

test('each practical sits in a real chapter and topic of its class syllabus', () => {
  for (const p of PRACTICALS) {
    const cur = getCurriculum(`Class ${p.cls}`, p.subject)!;
    const ch = cur.units.flatMap(u => u.chapters).find(c => c.name === p.chapter);
    assert.ok(ch, `${p.id}: chapter "${p.chapter}"`);
    assert.ok((ch!.topics ?? []).includes(p.topic), `${p.id}: topic "${p.topic}"`);
    assert.ok(p.official.length > 20 && p.aim && p.apparatus.length && p.procedure.length >= 2 && p.precautions.length && p.conclusion, `${p.id} is complete`);
  }
});

test('Class 11-12 marks: the CBSE parts add up to 30 and are checked', () => {
  for (const sub of ['Physics', 'Chemistry'] as const) {
    const s = markSchemeFor(12, sub);
    assert.equal(s.parts!.reduce((a, p) => a + p.max, 0), 30, sub);
    const full = Object.fromEntries(s.parts!.map(p => [p.key, p.max]));
    assert.equal(partsProblem(s, full), null);
    assert.equal(partsTotal(full), 30);
    assert.match(partsProblem(s, { ...full, [s.parts![0].key]: s.parts![0].max + 1 })!, /out of/);
    assert.match(partsProblem(s, { ...full, [s.parts![0].key]: 2.3 })!, /half/);
    assert.match(partsProblem(s, { ...full, extra: 1 })!, /Unknown/);
  }
  assert.equal(markSchemeFor(10, 'Science').parts, null);
  assert.equal(onSheet(24, 30, 30), 24);
  assert.equal(onSheet(25, 30, 20), 16.5);
});

test('the record minimum: 8 experiments (4 per section) and 6 activities (3 per section); an OR pair counts once', () => {
  const list = practicalsFor('Class 12-A', 'Physics');
  const pickN = (sec: string, part: string, n: number) => list.filter(p => p.section === sec && p.part === part && !(p.orWith && p.id > p.orWith)).slice(0, n).map(p => p.id);
  const enough = new Set([...pickN('A', 'experiment', 4), ...pickN('B', 'experiment', 4), ...pickN('A', 'activity', 3), ...pickN('B', 'activity', 3)]);
  assert.equal(recordShortfall(list, enough), null);
  const pair = list.find(p => p.orWith)!;
  const both = new Set([...pickN('A', 'experiment', 3).filter(x => x !== pair.id && x !== pair.orWith), pair.id, pair.orWith!, ...pickN('B', 'experiment', 4), ...pickN('A', 'activity', 3), ...pickN('B', 'activity', 3)]);
  assert.match(recordShortfall(list, both) ?? '', /experiments/);
  assert.equal(recordShortfall(practicalsFor('Class 10-A', 'Science'), new Set()), null);
});

test('every set-up is one its engine accepts', () => {
  for (const p of PRACTICALS) {
    assert.ok(p.setups.length > 0, `${p.id} has a set-up`);
    for (const s of p.setups) {
      const e = engineById(s.engine);
      assert.ok(e, `${p.id}: engine ${s.engine}`);
      assert.ok(validateParams(e!, s.params), `${p.id}: ${s.label} params ${JSON.stringify(s.params)}`);
    }
  }
});

test('readings: complete tables, the same for the same seed, different between students', () => {
  for (const p of PRACTICALS) {
    const a = readingsFor(p, 'student-1'), again = readingsFor(p, 'student-1');
    assert.deepEqual(a, again, `${p.id} repeats exactly`);
    assert.ok(a.rows.length > 0, `${p.id} has rows`);
    const keys = a.columns.map(c => c.key);
    for (const row of a.rows) for (const k of keys) assert.ok(k in row, `${p.id}: row has ${k}`);
    for (const b of a.blanks) assert.ok(keys.includes(b), `${p.id}: blank ${b} is a column`);
    for (const row of a.rows) for (const v of Object.values(row)) assert.ok(typeof v === 'string' || Number.isFinite(v), `${p.id}: ${v} is a number`);
    if (p.kind === 'numeric') {
      assert.ok(a.results.length > 0, `${p.id} has a result`);
      const many = Array.from({ length: 12 }, (_, i) => JSON.stringify(readingsFor(p, `student-${i}`).rows));
      assert.ok(new Set(many).size > 1, `${p.id}: students get different readings`);
    }
  }
});

test('results are worked from the readings, and land near the accepted value for 200 students', () => {
  for (const p of PRACTICALS.filter(x => x.kind === 'numeric')) {
    for (let i = 0; i < 200; i++) {
      for (const res of readingsFor(p, `s${i}`).results) {
        assert.ok(Number.isFinite(res.value) && res.tolerance > 0, `${p.id}: ${res.label}`);
        assert.ok(resultOk(res, res.value) && resultOk(res, res.value + res.tolerance * 0.9) && !resultOk(res, res.value + res.tolerance * 1.5), `${p.id}: tolerance`);
        const accepted = Number(/^([\d.]+)/.exec(res.accepted ?? '')?.[1]);
        if (Number.isFinite(accepted) && accepted > 0) {
          assert.ok(Math.abs(res.value - accepted) / accepted < 0.1, `${p.id} seed ${i}: ${res.label} ${res.value} vs accepted ${accepted}`);
        }
      }
    }
  }
});

test('every practical has a viva of at least four questions, engine-worked ones included where a set-up allows', () => {
  for (const p of PRACTICALS) {
    const v = vivaFor(p);
    assert.ok(v.length >= 4, `${p.id}: ${v.length} viva questions`);
    assert.ok(v.every(x => x.q && x.a), `${p.id}: questions have answers`);
  }
});

test('every photo a practical names is credited and on disk', async () => {
  const fs = await import('node:fs');
  const { PHOTOS } = await import('./photos');
  for (const p of PRACTICALS) for (const id of p.photos ?? []) {
    const ph = PHOTOS[id];
    assert.ok(ph, `${p.id}: photo ${id} in the credits`);
    assert.ok(ph.author && ph.licence && /commons\.wikimedia\.org/.test(ph.page), `${id}: credit complete`);
    assert.ok(!/NC|ND/.test(ph.licence), `${id}: licence allows reuse`);
    assert.ok(fs.existsSync(`public${ph.src}`), `${id}: file ${ph.src}`);
  }
});
