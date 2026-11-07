import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionsFor, homeNeedsFull } from '../../components/admin/home/RoleHome';

test('each office role gets its own sections; several roles get one combined home in order', () => {
  assert.deepEqual(sectionsFor(['cashier']), ['counter', 'daybook']);
  assert.deepEqual(sectionsFor(['accountant', 'registrar']), ['dues', 'daybook', 'counter', 'register']);
  assert.deepEqual(sectionsFor(['registrar']), ['register']);
  assert.equal(homeNeedsFull(['registrar']), false, 'the registrar opens on the light core');
  assert.equal(homeNeedsFull(['health_officer']), false);
  assert.equal(homeNeedsFull(['cashier']), true, 'the counter shows receipts from the whole-school data');
});
