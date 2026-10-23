import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceHouses, ccSettings, checkKirti, placeOf, tcLines, type KirtiLite, type MemberLite } from './kirti';

test('a Kirti entry: real date not in the future, a typed position for Other, sane house points', () => {
  const ok = checkKirti({ title: '  District  athletics, 100 m ', category: 'sports', level: 'district', position: 'first', on_date: '2026-10-01', house_points: '10' }, '2026-10-23');
  assert.deepEqual(ok, { value: { title: 'District athletics, 100 m', category: 'sports', level: 'district', position: 'first', position_note: null, on_date: '2026-10-01', house_points: 10, notes: null } });
  assert.ok('error' in checkKirti({ title: 'x', category: 'sports', level: 'school', position: 'first', on_date: '2026-10-01' }, '2026-10-23'));
  assert.ok('error' in checkKirti({ title: 'Quiz', category: 'sports', level: 'school', position: 'other', on_date: '2026-10-01' }, '2026-10-23'), 'Other needs a note');
  assert.ok('error' in checkKirti({ title: 'Quiz', category: 'sports', level: 'school', position: 'first', on_date: '2026-11-01' }, '2026-10-23'), 'future');
  assert.ok('error' in checkKirti({ title: 'Quiz', category: 'sports', level: 'school', position: 'first', on_date: '2026-02-30' }, '2026-10-23'), 'not a day');
  assert.ok('error' in checkKirti({ title: 'Quiz', category: 'sports', level: 'moon', position: 'first', on_date: '2026-10-01' }, '2026-10-23'));
  assert.ok('error' in checkKirti({ title: 'Quiz', category: 'sports', level: 'school', position: 'first', on_date: '2026-10-01', house_points: 2.5 }, '2026-10-23'));
  assert.equal(placeOf('other', 'Best speaker'), 'Best speaker');
  assert.equal(placeOf('participant', null), 'Participated');
});

test('the TC: NCC and Scouts in field 16; the highest level of each event, then clubs, in field 17', () => {
  const m: MemberLite[] = [
    { kind: 'ncc', name: 'NCC Junior Division', role: 'Cadet', session: '2024-25' }, { kind: 'ncc', name: 'NCC Junior Division', role: 'Cadet', session: '2025-26' },
    { kind: 'team', name: 'Under-14 football', role: 'Captain', session: '2025-26' },
  ];
  const e: KirtiLite[] = [
    { title: 'Athletics 100 m', category: 'sports', level: 'school', position: 'first', position_note: null, on_date: '2025-08-01' },
    { title: 'Athletics 100 m', category: 'sports', level: 'district', position: 'second', position_note: null, on_date: '2025-09-01' },
    { title: 'Science fair', category: 'science', level: 'school', position: 'participant', position_note: null, on_date: '2025-10-01' },
  ];
  const t = tcLines(m, e);
  assert.equal(t.ncc, 'NCC Junior Division (Cadet), 2024-25 to 2025-26');
  assert.equal(t.activities, 'Athletics 100 m (district level, 2nd); Science fair (school level); Under-14 football (Captain)');
  assert.deepEqual(tcLines([], []), { ncc: '', activities: '' });
});

test('houses: fewest members first, ties by name, siblings follow when the school keeps them together', () => {
  const houses = [{ id: 'r', name: 'Raman' }, { id: 't', name: 'Tagore' }, { id: 'a', name: 'Ashoka' }];
  const counts = new Map([['r', 2], ['t', 2], ['a', 3]]);
  const out = balanceHouses(houses, counts, ['s1', 's2', 's3', 's4'], new Map([['s4', 'a']]), true);
  assert.deepEqual([...out], [['s1', 'r'], ['s2', 't'], ['s3', 'a'], ['s4', 'a']]);
  const off = balanceHouses(houses, new Map(), ['s4'], new Map([['s4', 't']]), false);
  assert.equal(off.get('s4'), 'a', 'without keeping siblings the balance decides');
  assert.deepEqual(ccSettings(null), { houseRule: 'lifelong', keepSiblings: true });
  assert.deepEqual(ccSettings({ cocurricular: { houseRule: 'session', keepSiblings: false } }), { houseRule: 'session', keepSiblings: false });
});
