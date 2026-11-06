import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowanceFrom, CAP_SHARE, lowestListPrice } from './allowance';

test('cap is 50% of the price per student', () => {
  assert.equal(CAP_SHARE, 0.5);
  assert.equal(allowanceFrom(2500, 0).capInr, 1250);
  assert.equal(allowanceFrom(3500, 0).capInr, 1750);
});

test('levels: normal below 70%, economy to 100%, paused at the cap', () => {
  // Sthamba cap Rs 1,250 at Rs 100 a dollar.
  assert.equal(allowanceFrom(2500, 8, 100).level, 'normal'); // Rs 800 = 64%
  assert.equal(allowanceFrom(2500, 8.75, 100).level, 'economy'); // 70%
  assert.equal(allowanceFrom(2500, 12.49, 100).level, 'economy');
  assert.equal(allowanceFrom(2500, 12.5, 100).level, 'paused');
});

test('no price falls back to the lowest list price', () => {
  assert.equal(lowestListPrice(), 2000);
  assert.equal(allowanceFrom(null, 0).capInr, 1000);
  assert.equal(allowanceFrom(0, 0).capInr, 1000);
});

test('negative spend reads as zero', () => {
  assert.equal(allowanceFrom(2500, -5).spentInr, 0);
});
