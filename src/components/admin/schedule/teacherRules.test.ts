import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTimesOff, parseTimesOff } from './TeacherRules';

test('times off: days, clock windows and period numbers', () => {
  assert.deepEqual(parseTimesOff('Sat; Wed 9:00-11:30; Fri 1,2'), [
    { weekday: 6, periods: [] }, { weekday: 3, periods: [], from: '09:00', to: '11:30' }, { weekday: 5, periods: [1, 2] },
  ]);
  assert.equal(formatTimesOff(parseTimesOff('Sat; Wed 9:00-11:30; Fri 1,2') as never), 'Sat; Wed 9:00-11:30; Fri 1,2');
  assert.match(parseTimesOff('Wed 11:30-9:00') as string, /start before end/);
  assert.match(parseTimesOff('Fri 1,2', false) as string, /different times/, 'period numbers refused when wings ring differently');
  assert.deepEqual(parseTimesOff('Wed 9.00 to 10.15', false), [{ weekday: 3, periods: [], from: '09:00', to: '10:15' }]);
});
