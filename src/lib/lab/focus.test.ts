import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COARSE, FINE, FOCUS, MAX_BLUR, blurOf, touching } from './focus';

const OBJECTIVES = ['4', '10', '40'] as const;

test('each objective is sharp at its own height and blurred away from it', () => {
  for (const o of OBJECTIVES) {
    assert.equal(blurOf(o, FOCUS[o].sharpAt), 0);
    assert.ok(blurOf(o, FOCUS[o].sharpAt + FOCUS[o].depth * 4) > 0);
    assert.ok(blurOf(o, 3) <= MAX_BLUR);
  }
});

test('it opens sharp at 10×, stays sharp at 4×, and needs fine focus at 40×', () => {
  assert.equal(blurOf('10', 0), 0);
  assert.equal(blurOf('4', 0), 0);
  assert.ok(blurOf('40', 0) > 8);
  // The fine knob alone can bring 40× into focus.
  assert.ok(FOCUS['40'].sharpAt <= FINE.max && FOCUS['40'].sharpAt >= FINE.min);
  const steps = Math.round(FOCUS['40'].sharpAt / FINE.step);
  assert.equal(blurOf('40', steps * FINE.step), 0);
});

test('the coarse knob cannot focus at 40×: one step jumps right across the depth of field', () => {
  assert.ok(COARSE.step > FOCUS['40'].depth * 2);
  assert.ok(blurOf('40', FOCUS['40'].sharpAt + COARSE.step) > 0 && blurOf('40', FOCUS['40'].sharpAt - COARSE.step) > 0);
});

test('only the 40× objective can be driven into the slide', () => {
  assert.equal(touching('4', COARSE.max + FINE.max), false);
  assert.equal(touching('10', COARSE.max + FINE.max), false);
  assert.equal(touching('40', 1), true);
  assert.equal(touching('40', 0.3), false);
});
