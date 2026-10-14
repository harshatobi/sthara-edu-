import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, GRANTABLE_ROLES, OPERATOR_ROLES, ROLE_INFO, can, managerProblem, reachOf, reportsOf } from './roles';
import {
  canonicalState, cleanDistrict, defaultOwner, matchTerritory, sees, subtree, territoryPath, territoryProblem, type Sight, type Territory,
} from './territories';

test('a director can do everything; no other role can manage operators, settings or delete a school', () => {
  for (const c of CAPABILITIES) assert.ok(can('director', c), c);
  for (const r of OPERATOR_ROLES.filter(r => r !== 'director')) {
    for (const c of ['operators.manage', 'settings.manage', 'schools.delete'] as const) assert.equal(can(r, c), false, `${r} ${c}`);
  }
  assert.ok(!GRANTABLE_ROLES.includes('director' as never));
});

test('roles keep to their job', () => {
  assert.ok(can('sales_rep', 'enquiries.manage') && !can('sales_rep', 'schools.manage') && !can('sales_rep', 'breakglass'));
  assert.ok(can('finance', 'schools.policy') && !can('finance', 'schools.manage') && !can('finance', 'people.search'));
  assert.ok(can('engineer', 'errors.manage') && !can('engineer', 'schools.manage') && !can('engineer', 'schools.policy'));
  assert.ok(can('support_agent', 'schools.manage') && !can('support_agent', 'schools.policy'));
  assert.equal(reachOf('regional_lead'), 'territory');
  assert.equal(reachOf('support_agent'), 'all');
  // Every capability a role lists is a real one.
  for (const r of OPERATOR_ROLES) for (const c of ROLE_INFO[r].can) assert.ok(CAPABILITIES.includes(c));
});

const team = [
  { id: 'dir', managerId: null }, { id: 'lead', managerId: 'dir' }, { id: 'rep1', managerId: 'lead' },
  { id: 'rep2', managerId: 'lead' }, { id: 'other', managerId: 'dir' },
];

test('reporting line: everyone below, never the manager, and loops do not hang', () => {
  assert.deepEqual([...reportsOf(team, 'lead')].sort(), ['rep1', 'rep2']);
  assert.deepEqual([...reportsOf(team, 'dir')].sort(), ['lead', 'other', 'rep1', 'rep2']);
  assert.equal(reportsOf(team, 'rep1').size, 0);
  const loop = [{ id: 'a', managerId: 'b' }, { id: 'b', managerId: 'a' }];
  assert.deepEqual([...reportsOf(loop, 'a')], ['b']);
});

test('a manager change that would make a loop is refused', () => {
  assert.equal(managerProblem(team, 'rep1', 'lead'), null);
  assert.equal(managerProblem(team, 'rep1', null), null);
  assert.match(managerProblem(team, 'lead', 'lead')!, /themself/);
  assert.match(managerProblem(team, 'lead', 'rep1')!, /loop/);
  assert.match(managerProblem(team, 'lead', 'ghost')!, /not an operator/);
});

const T = (id: string, level: Territory['level'], parentId: string | null, state: string | null, district: string | null, defaultOwnerId: string | null = null): Territory =>
  ({ id, name: district ?? state ?? id, level, parentId, state, district, defaultOwnerId });
const land = [
  T('south', 'region', null, null, null, 'lead'),
  T('tn', 'state', 'south', 'Tamil Nadu', null),
  T('cbe', 'district', 'tn', 'Tamil Nadu', 'Coimbatore', 'rep1'),
  T('ap', 'state', 'south', 'Andhra Pradesh', null),
  T('mh', 'state', null, 'Maharashtra', null),
];

test('an address lands in its district, else its state, else nowhere', () => {
  assert.equal(matchTerritory(land, 'tamil nadu', ' COIMBATORE ')?.id, 'cbe');
  assert.equal(matchTerritory(land, 'Tamil Nadu', 'Madurai')?.id, 'tn');
  assert.equal(matchTerritory(land, 'Tamil Nadu', null)?.id, 'tn');
  assert.equal(matchTerritory(land, 'Kerala', 'Kochi'), null);
  assert.equal(matchTerritory(land, null, 'Coimbatore'), null);
});

test('the default owner comes from the nearest territory that names one', () => {
  assert.equal(defaultOwner(land, 'cbe'), 'rep1');
  assert.equal(defaultOwner(land, 'tn'), 'lead');
  assert.equal(defaultOwner(land, 'mh'), null);
  assert.equal(territoryPath(land, 'cbe'), 'south > Tamil Nadu > Coimbatore');
});

test('sight: a lead sees the whole region, a rep their district and what they own', () => {
  const lead: Sight = { all: false, territories: subtree(land, ['south']), owners: new Set(['lead', 'rep1', 'rep2']) };
  const rep: Sight = { all: false, territories: subtree(land, ['cbe']), owners: new Set(['rep1']) };
  assert.ok(sees(lead, { territoryId: 'cbe', ownerId: null }) && sees(lead, { territoryId: 'ap', ownerId: null }));
  assert.equal(sees(lead, { territoryId: 'mh', ownerId: null }), false);
  assert.ok(sees(lead, { territoryId: 'mh', ownerId: 'rep2' }), 'owned by a report');
  assert.ok(sees(rep, { territoryId: 'cbe', ownerId: 'someone' }));
  assert.equal(sees(rep, { territoryId: 'tn', ownerId: null }), false);
  assert.ok(sees(rep, { territoryId: 'tn', ownerId: 'rep1' }));
  assert.equal(sees(rep, { territoryId: null, ownerId: null }), false, 'unplaced records are for those who see everything');
  assert.ok(sees({ all: true }, { territoryId: null, ownerId: null }));
});

test('states and districts are tidied; unknown states are refused', () => {
  assert.equal(canonicalState('  andhra   pradesh'), 'Andhra Pradesh');
  assert.equal(canonicalState('Atlantis'), null);
  assert.equal(cleanDistrict('  East   Godavari '), 'East Godavari');
  assert.equal(cleanDistrict('   '), null);
});

test('territory rules: levels nest properly and nothing is covered twice', () => {
  const ok = { name: 'Madurai', level: 'district' as const, parentId: 'tn', state: 'Tamil Nadu', district: 'Madurai' };
  assert.equal(territoryProblem(land, ok), null);
  assert.match(territoryProblem(land, { ...ok, parentId: 'ap' })!, /own state/);
  assert.match(territoryProblem(land, { ...ok, district: 'coimbatore' })!, /already covers/);
  assert.match(territoryProblem(land, { name: 'TN again', level: 'state', parentId: null, state: 'Tamil Nadu', district: null })!, /already covers/);
  assert.match(territoryProblem(land, { name: 'North', level: 'region', parentId: 'south', state: null, district: null })!, /no parent/);
  assert.match(territoryProblem(land, { name: 'Kerala', level: 'state', parentId: 'tn', state: 'Kerala', district: null })!, /under a region/);
  assert.equal(territoryProblem(land, { id: 'mh', name: 'Maharashtra', level: 'state', parentId: 'south', state: 'Maharashtra', district: null }), null);
});
