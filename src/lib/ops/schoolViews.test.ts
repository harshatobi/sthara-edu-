import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionReasons, inSchoolView, sinceText } from './schoolViews';
import { schoolPolicy } from '../settings/registry';
import type { RegistrySchool } from './attention';

const NOW = Date.parse('2026-10-14T06:00:00Z'), DAY = 86_400_000;
function school(over: Partial<RegistrySchool> & { settings?: Record<string, unknown>; ends?: number | null; ownerId?: string | null } = {}) {
  const { settings, ends, ...rest } = over;
  const p = schoolPolicy({
    id: 's1', name: 'School', institution_type: 'school',
    trial_expires_at: ends === undefined || ends === null ? null : new Date(NOW + ends * DAY).toISOString(),
    settings: { code: 'SCH', plan: 'sthamba', curriculum: 'CBSE', ...settings },
  }, NOW);
  return {
    ...p, updatedAt: null, people: 500, schoolAdmins: 1, createdAt: null, roles: { student: 400 }, classes: 12, classesWithoutSubjects: 0,
    lastSignIn: new Date(NOW - DAY).toISOString(), ...rest,
  } as RegistrySchool & { ownerId?: string | null };
}

test('a healthy, used, live school needs nobody', () => {
  assert.deepEqual(attentionReasons(school(), NOW), []);
  assert.equal(inSchoolView(school(), 'attention', 'me', NOW), false);
});

test('reasons are named, most pressing first', () => {
  const r = attentionReasons(school({ lateCases: 2, overdueTasks: 1, schoolAdmins: 0, health: { score: 35, band: 'critical' } }), NOW);
  assert.deepEqual(r, ['2 cases past deadline', 'Health is critical', '1 follow-up overdue', 'No school admin']);
  assert.deepEqual(attentionReasons(school({ settings: { plan: 'pilot' }, ends: 5 }), NOW), ['Pilot ends in 5 days']);
  assert.deepEqual(attentionReasons(school({ settings: { plan: 'pilot' }, ends: -1 }), NOW), ['Pilot has ended']);
  assert.deepEqual(attentionReasons(school({ settings: { plan: 'pilot' }, ends: 60 }), NOW), []);
  assert.deepEqual(attentionReasons(school({ lastSignIn: new Date(NOW - 20 * DAY).toISOString() }), NOW), ['Nobody has signed in for two weeks']);
  assert.deepEqual(attentionReasons(school({ lastSignIn: null }), NOW), ['Nobody has ever signed in']);
  assert.deepEqual(attentionReasons(school({ people: 0, lastSignIn: null, classes: 0 }), NOW), ['No classes'], 'an empty school is not "unused"');
  assert.deepEqual(attentionReasons(school({ settings: { active: false }, lateCases: 3 }), NOW), ['Suspended']);
});

test('views', () => {
  const mine = school({ ownerId: 'me' }), loose = school({ ownerId: null }), pilot = school({ settings: { plan: 'pilot' }, ends: 40, ownerId: 'you' });
  const ending = school({ settings: { plan: 'pilot' }, ends: 3 }), off = school({ settings: { active: false } });
  assert.ok(inSchoolView(mine, 'mine', 'me', NOW) && !inSchoolView(pilot, 'mine', 'me', NOW) && !inSchoolView(loose, 'mine', 'me', NOW));
  assert.ok(inSchoolView(loose, 'unowned', 'me', NOW) && !inSchoolView(mine, 'unowned', 'me', NOW));
  assert.ok(inSchoolView(mine, 'live', 'me', NOW) && !inSchoolView(pilot, 'live', 'me', NOW) && !inSchoolView(off, 'live', 'me', NOW));
  assert.ok(inSchoolView(pilot, 'pilots', 'me', NOW) && inSchoolView(ending, 'pilots', 'me', NOW));
  assert.ok(inSchoolView(ending, 'ending', 'me', NOW) && !inSchoolView(pilot, 'ending', 'me', NOW));
  assert.ok(inSchoolView(off, 'suspended', 'me', NOW) && inSchoolView(off, 'attention', 'me', NOW) && inSchoolView(off, 'all', 'me', NOW));
});

test('how long ago reads naturally', () => {
  assert.deepEqual([sinceText(null, NOW), sinceText(new Date(NOW - 3600_000).toISOString(), NOW), sinceText(new Date(NOW - DAY).toISOString(), NOW),
    sinceText(new Date(NOW - 5 * DAY).toISOString(), NOW), sinceText(new Date(NOW - 35 * DAY).toISOString(), NOW), sinceText(new Date(NOW - 200 * DAY).toISOString(), NOW)],
  ['never', 'today', 'yesterday', '5 days ago', '5 weeks ago', '7 months ago']);
});
