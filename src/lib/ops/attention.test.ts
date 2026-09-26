import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention, setupChecklist, type RegistrySchool } from './attention';
import { schoolPolicy } from '../settings/registry';
import type { InventoryItem } from '../settings/inventory';

const NOW = new Date('2026-09-26T10:00:00+05:30').getTime();
const DAY = 86_400_000;

function school(over: { settings?: Record<string, unknown>; ends?: number | null } & Partial<RegistrySchool> = {}): RegistrySchool {
  const { settings, ends, ...rest } = over;
  const p = schoolPolicy({
    id: rest.id ?? 's1', name: rest.name ?? 'Test School', institution_type: 'school',
    trial_expires_at: ends === null ? null : new Date(NOW + (ends ?? 60) * DAY).toISOString(),
    settings: { code: 'TST', plan: 'pilot', curriculum: 'CBSE', ...settings },
  }, NOW);
  return {
    ...p, updatedAt: null, people: 20, schoolAdmins: 1, createdAt: null,
    roles: { admin: 1, teacher: 3, student: 14, parent: 2 }, classes: 2, classesWithoutSubjects: 0, ...rest,
  };
}
const ids = (xs: { id: string }[]) => xs.map(x => x.id);

test('a fully set-up school on a long pilot needs nothing', () => {
  assert.deepEqual(buildAttention({ schools: [school()], health: [], newEnquiries: 0 }), []);
});

test('ended and ending pilots, with an extend action', () => {
  const out = buildAttention({ schools: [school({ id: 'a', ends: -2 }), school({ id: 'b', ends: 5 })], health: [], newEnquiries: 0 });
  assert.deepEqual(ids(out), ['trial-expired:a', 'trial-ending:b']);
  assert.equal(out[0].severity, 'crit');
  assert.deepEqual(out[0].actions[0], { kind: 'extend-trial', schoolId: 'a', days: 30 });
  // Paid tiers never raise pilot items.
  assert.deepEqual(buildAttention({ schools: [school({ settings: { plan: 'shikhara' }, ends: -2 })], health: [], newEnquiries: 0 }), []);
});

test('setup gaps: code, curriculum, admin, classes, subjects', () => {
  const out = buildAttention({
    schools: [school({ settings: { code: '', curriculum: null }, schoolAdmins: 0, classes: 3, classesWithoutSubjects: 2 })],
    health: [], newEnquiries: 0,
  });
  assert.deepEqual(ids(out).sort(), ['no-admin:s1', 'no-code:s1', 'no-curriculum:s1', 'no-subjects:s1']);
  assert.equal(out[0].id, 'no-code:s1'); // critical first
  assert.deepEqual(buildAttention({ schools: [school({ classes: 0 })], health: [], newEnquiries: 0 }).map(a => a.id), ['no-classes:s1']);
});

test('a suspended school shows once, with reactivate, and no setup noise', () => {
  const out = buildAttention({ schools: [school({ settings: { active: false, curriculum: null }, ends: -3 })], health: [], newEnquiries: 0 });
  assert.deepEqual(ids(out), ['suspended:s1']);
  assert.equal(out[0].actions[0].kind, 'reactivate');
});

test('enquiries and platform health, but not per-school health rows', () => {
  const h = (id: string, status: InventoryItem['status'], source: InventoryItem['source']): InventoryItem =>
    ({ id, group: 'g', label: id, source, value: 'v', status, detail: 'd' });
  const out = buildAttention({
    schools: [], newEnquiries: 3,
    health: [h('env.gemini', 'crit', 'environment'), h('schools.expired', 'warn', 'school'), h('rate', 'info', 'code'), h('db', 'ok', 'database')],
  });
  assert.deepEqual(ids(out), ['health:env.gemini', 'enquiries']);
  assert.match(out[1].title, /3 new website enquiries/);
});

test('setup checklist follows the onboarding order', () => {
  const c = setupChecklist(school({ roles: { admin: 1, teacher: 2 }, classesWithoutSubjects: 1 }), { total: 10, covered: 10 });
  assert.deepEqual(c.map(x => x.key), ['code', 'curriculum', 'classes', 'subjects', 'admin', 'teachers', 'coverage', 'students', 'parents']);
  assert.deepEqual(c.filter(x => !x.done).map(x => x.key), ['subjects', 'students', 'parents']);
  assert.equal(setupChecklist(school(), { total: 0, covered: 0 }).find(x => x.key === 'coverage')?.done, false);
});
