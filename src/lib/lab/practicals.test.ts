import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCurriculum } from '@/lib/curriculum';
import { engineById } from './registry';
import { validateParams } from './types';
import { PRACTICALS, practicalsForClass, readingsFor, resultOk, vivaFor } from './practicals';

test('all 27 official practicals: 13 in Class 9, 14 in Class 10, numbered in order', () => {
  assert.equal(PRACTICALS.length, 27);
  for (const cls of [9, 10] as const) {
    const list = practicalsForClass(`Class ${cls}-A`);
    assert.equal(list.length, cls === 9 ? 13 : 14);
    assert.deepEqual(list.map(p => p.no), list.map((_, i) => i + 1));
    assert.deepEqual(list.map(p => p.id), list.map((_, i) => `c${cls}-${String(i + 1).padStart(2, '0')}`));
  }
});

test('each practical sits in a real chapter and topic of its class syllabus', () => {
  for (const p of PRACTICALS) {
    const cur = getCurriculum(`Class ${p.cls}`, 'Science')!;
    const ch = cur.units.flatMap(u => u.chapters).find(c => c.name === p.chapter);
    assert.ok(ch, `${p.id}: chapter "${p.chapter}"`);
    assert.ok((ch!.topics ?? []).includes(p.topic), `${p.id}: topic "${p.topic}"`);
    assert.ok(p.official.length > 20 && p.aim && p.apparatus.length && p.procedure.length >= 2 && p.precautions.length && p.conclusion, `${p.id} is complete`);
  }
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
