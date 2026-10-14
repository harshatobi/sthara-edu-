import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow } from './Pager';

test('200 rows a page, last page holds the remainder', () => {
  assert.deepEqual(pageWindow(1000, 0), { page: 0, pages: 5, from: 0, to: 200 });
  assert.deepEqual(pageWindow(1001, 5), { page: 5, pages: 6, from: 1000, to: 1001 });
});

test('the page stays in range when the list shrinks or is empty', () => {
  assert.deepEqual(pageWindow(150, 3), { page: 0, pages: 1, from: 0, to: 150 });
  assert.deepEqual(pageWindow(0, 2), { page: 0, pages: 1, from: 0, to: 0 });
  assert.deepEqual(pageWindow(450, -1), { page: 0, pages: 3, from: 0, to: 200 });
});
