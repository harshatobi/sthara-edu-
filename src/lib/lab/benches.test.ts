import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REACTIONS } from './engines/reactions';
import { BENCHES } from './benches';

test('every bench scene belongs to a reaction on the bench and says what the class starts with', () => {
  for (const [key, b] of Object.entries(BENCHES)) {
    assert.ok(REACTIONS.some(r => r.key === key), `${key} is not a reaction`);
    assert.ok(b.before.length > 10 && b.before.endsWith('.'), `${key} needs a starting line`);
  }
});

test('colours are six-digit hex and a poured-in solution forms a precipitate', () => {
  const hex = /^#[0-9A-F]{6}$/i;
  for (const [key, b] of Object.entries(BENCHES)) {
    const colours = b.kind === 'beaker' ? [...b.liquid, b.coat, b.precipitate] : b.kind === 'tube' ? [...b.solid, b.fumes] : [];
    for (const c of colours) if (c !== undefined) assert.match(c, hex, `${key}: ${c}`);
    if (b.kind === 'beaker' && b.pour) assert.ok(b.precipitate, `${key} pours but nothing forms`);
  }
});
